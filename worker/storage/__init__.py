import os

from .local import LocalStorage
from .s3 import S3Storage
from .s3_client import uses_object_storage_backend


def get_storage():
    backend = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
    if uses_object_storage_backend(backend):
        return S3Storage()
    return LocalStorage()
