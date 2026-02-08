import os
import tempfile
import subprocess
import json
import boto3
from botocore.exceptions import ClientError
from typing import BinaryIO, Optional

from .base import Storage


class S3Storage(Storage):
    def __init__(self):
        self.bucket = os.environ["S3_BUCKET"]
        self.region = os.environ.get("AWS_REGION", "us-east-1")

        self.s3 = boto3.client(
            "s3",
            region_name=self.region,
        )

    # ------------------------------------------------------------------
    # Uploads
    # ------------------------------------------------------------------

    def save(self, fileobj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        """
        Mostly for dev/internal use.
        In production, uploads usually happen via presigned URLs.
        """
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        self.s3.upload_fileobj(
            fileobj,
            self.bucket,
            key,
            ExtraArgs=extra_args or None,
        )
        return key

    def upload(self, path: str, key: str, content_type: Optional[str] = None):
        """
        Upload a file from disk (used by worker for clips).
        """
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        self.s3.upload_file(
            path,
            self.bucket,
            key,
            ExtraArgs=extra_args or None,
        )

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def open(self, key: str):
        """
        Return a streaming file-like object for reading.
        """
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"]  # StreamingBody
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                raise FileNotFoundError(f"S3 key not found: {key}") from e
            raise

    # ------------------------------------------------------------------
    # Deletes
    # ------------------------------------------------------------------

    def delete(self, key: str):
        """
        Safe even if the object does not exist.
        """
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    # ------------------------------------------------------------------
    # Existence check
    # ------------------------------------------------------------------

    def exists(self, key: str) -> bool:
        """
        Check existence.
        - Returns True if exists
        - Returns False if missing
        """
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    # ------------------------------------------------------------------
    # Duration (billing-critical)
    # ------------------------------------------------------------------

    def get_duration_seconds(self, key: str) -> float:
        """
        Determine video duration for billing.
        Strategy:
        - Download the object to a temp file (streaming)
        - Use ffprobe to read duration
        """
        key = (key or "").strip()
        if not key:
            raise ValueError("storage_key is required")

        # temp file with a stable extension helps some ffprobe builds
        fd, tmp_path = tempfile.mkstemp(prefix="orbito-src-", suffix=".mp4")
        os.close(fd)

        try:
            # Stream download to disk
            with open(tmp_path, "wb") as f:
                self.s3.download_fileobj(self.bucket, key, f)

            # ffprobe duration
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                tmp_path,
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.strip() or "ffprobe failed")

            data = json.loads(proc.stdout or "{}")

            # Prefer container duration if available
            fmt = data.get("format") or {}
            dur = fmt.get("duration")

            if dur is None:
                # Fallback: first video stream duration
                for s in data.get("streams") or []:
                    if (s.get("codec_type") or "").lower() == "video":
                        dur = s.get("duration")
                        break

            if dur is None:
                raise RuntimeError("Could not read duration from ffprobe output")

            return float(dur)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Presigned GET (used by /clips API)
    # ------------------------------------------------------------------

    def presign_get(
        self,
        key: str,
        expires_in: int = 3600,
        response_content_disposition: Optional[str] = None,
    ) -> str:
        """
        Generate a presigned GET URL for playback/download.
        """
        params = {
            "Bucket": self.bucket,
            "Key": key,
        }
        if response_content_disposition:
            params["ResponseContentDisposition"] = response_content_disposition
        try:
            return self.s3.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expires_in,
            )
        except ClientError as e:
            raise RuntimeError(f"Failed to presign GET for {key}") from e
