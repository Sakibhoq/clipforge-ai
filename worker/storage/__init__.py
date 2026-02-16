import os

from .local import LocalStorage
from .s3 import S3Storage


def get_storage():
    backend = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
    if backend == "s3":
        return S3Storage()
    return LocalStorage()

