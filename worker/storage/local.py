from __future__ import annotations

import os
from typing import BinaryIO, Optional

from .base import Storage


BASE_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", "/data/storage")
BASE_STORAGE_PATH = os.path.abspath(BASE_STORAGE_PATH)


class LocalStorage(Storage):
    def __init__(self) -> None:
        os.makedirs(BASE_STORAGE_PATH, exist_ok=True)

    def _full_path(self, key: str) -> str:
        return os.path.join(BASE_STORAGE_PATH, key)

    def save(self, file: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
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

    def upload(self, path: str, key: str, content_type: Optional[str] = None) -> None:
        dest = self._full_path(key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(path, "rb") as src, open(dest, "wb") as out:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)

    def open(self, key: str) -> BinaryIO:
        return open(self._full_path(key), "rb")

    def delete(self, key: str) -> None:
        path = self._full_path(key)
        try:
            os.remove(path)
        except FileNotFoundError:
            return

    def exists(self, key: str) -> bool:
        return os.path.exists(self._full_path(key))

