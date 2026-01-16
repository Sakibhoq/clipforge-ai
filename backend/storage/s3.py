import os
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
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )

    # ------------------------------------------------------------------
    # Uploads
    # ------------------------------------------------------------------

    def save(self, fileobj: BinaryIO, key: str, content_type: Optional[str] = None):
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
        - Raises FileNotFoundError if missing
        """
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                raise FileNotFoundError(f"S3 key not found: {key}") from e
            raise

    # ------------------------------------------------------------------
    # Presigned GET (used by /clips API)
    # ------------------------------------------------------------------

    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        """
        Generate a presigned GET URL for playback/download.
        """
        try:
            return self.s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                },
                ExpiresIn=expires_in,
            )
        except ClientError as e:
            raise RuntimeError(f"Failed to presign GET for {key}") from e
