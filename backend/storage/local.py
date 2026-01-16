import os
from typing import BinaryIO
from .base import Storage

BASE_STORAGE_PATH = os.getenv(
    "LOCAL_STORAGE_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "storage"),
)
BASE_STORAGE_PATH = os.path.abspath(BASE_STORAGE_PATH)


class LocalStorage(Storage):
    def __init__(self):
        os.makedirs(BASE_STORAGE_PATH, exist_ok=True)

    def _full_path(self, key: str) -> str:
        return os.path.join(BASE_STORAGE_PATH, key)

    def save(self, file: BinaryIO, key: str) -> str:
        path = self._full_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        try:
            file.seek(0)
        except Exception:
            pass

        with open(path, "wb") as f:
            while True:
                chunk = file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        return key

    def open(self, key: str) -> BinaryIO:
        return open(self._full_path(key), "rb")

    def delete(self, key: str) -> None:
        path = self._full_path(key)
        if os.path.exists(path):
            os.remove(path)
