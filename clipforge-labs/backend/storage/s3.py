import os
import tempfile
import subprocess
import json
from botocore.exceptions import ClientError
from typing import BinaryIO, Optional, Sequence

from .base import Storage
from .s3_client import build_s3_client


class S3Storage(Storage):
    def __init__(self):
        self.bucket = os.environ["S3_BUCKET"]
        self.region = os.environ.get("AWS_REGION", "us-east-1")
        self.s3 = build_s3_client(region_name=self.region)

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

    @staticmethod
    def _extract_duration_from_ffprobe_json(stdout_text: str) -> float:
        data = json.loads(stdout_text or "{}")

        fmt = data.get("format") or {}
        dur = fmt.get("duration")

        if dur is None:
            for s in data.get("streams") or []:
                if (s.get("codec_type") or "").lower() == "video":
                    dur = s.get("duration")
                    if dur is not None:
                        break

        if dur is None:
            raise RuntimeError("Could not read duration from ffprobe output")

        duration = float(dur)
        if duration <= 0:
            raise RuntimeError("Invalid non-positive duration from ffprobe output")
        return duration

    def _ffprobe_duration(
        self,
        target: str,
        *,
        timeout_sec: int,
        extra_args: Optional[Sequence[str]] = None,
    ) -> float:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ]
        if extra_args:
            cmd.extend(list(extra_args))
        cmd.append(target)

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=max(5, int(timeout_sec)),
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "ffprobe failed")

        return self._extract_duration_from_ffprobe_json(proc.stdout or "{}")

    def get_duration_seconds(self, key: str) -> float:
        """
        Determine video duration for billing.
        Strategy:
        1) Try ffprobe directly on a presigned GET URL (usually faster; avoids full download).
        2) Fallback: download object to temp file, then ffprobe locally.
        """
        key = (key or "").strip()
        if not key:
            raise ValueError("storage_key is required")

        remote_probe_timeout_sec = int(os.getenv("STORAGE_REMOTE_FFPROBE_TIMEOUT_SEC", "25"))
        local_probe_timeout_sec = int(os.getenv("STORAGE_FFPROBE_TIMEOUT_SEC", "120"))

        try:
            presigned = self.s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=600,
            )
            # ffmpeg/ffprobe uses microseconds for -rw_timeout.
            remote_rw_timeout_us = max(5, remote_probe_timeout_sec) * 1_000_000
            return self._ffprobe_duration(
                presigned,
                timeout_sec=remote_probe_timeout_sec,
                extra_args=["-rw_timeout", str(remote_rw_timeout_us)],
            )
        except Exception:
            # Fall through to local download probe.
            pass

        # temp file with a stable extension helps some ffprobe builds
        fd, tmp_path = tempfile.mkstemp(prefix="orbito-src-", suffix=".mp4")
        os.close(fd)

        try:
            # Stream download to disk
            with open(tmp_path, "wb") as f:
                self.s3.download_fileobj(self.bucket, key, f)

            return self._ffprobe_duration(tmp_path, timeout_sec=local_probe_timeout_sec)
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
