from __future__ import annotations

from abc import ABC, abstractmethod
from typing import BinaryIO, Optional


class Storage(ABC):
    @abstractmethod
    def save(self, file: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        raise NotImplementedError

    @abstractmethod
    def upload(self, path: str, key: str, content_type: Optional[str] = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def open(self, key: str) -> BinaryIO:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def exists(self, key: str) -> bool:
        raise NotImplementedError

