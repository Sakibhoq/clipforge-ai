from __future__ import annotations

import os
from typing import BinaryIO, Optional

import boto3
from botocore.exceptions import ClientError

from .base import Storage


class S3Storage(Storage):
    def __init__(self) -> None:
        self.bucket = os.environ["S3_BUCKET"]
        self.region = os.environ.get("AWS_REGION", "us-east-1")
        self.s3 = boto3.client("s3", region_name=self.region)

    def save(self, fileobj: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
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

    def upload(self, path: str, key: str, content_type: Optional[str] = None) -> None:
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type
        self.s3.upload_file(
            path,
            self.bucket,
            key,
            ExtraArgs=extra_args or None,
        )

    def open(self, key: str):
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"]  # StreamingBody
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                raise FileNotFoundError(f"S3 key not found: {key}") from e
            raise

    def delete(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

