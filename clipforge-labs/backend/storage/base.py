from abc import ABC, abstractmethod
from typing import BinaryIO, Optional


class Storage(ABC):
    @abstractmethod
    def save(self, file: BinaryIO, key: str, content_type: Optional[str] = None) -> str:
        pass

    @abstractmethod
    def open(self, key: str) -> BinaryIO:
        pass

    @abstractmethod
    def delete(self, key: str) -> None:
        pass
