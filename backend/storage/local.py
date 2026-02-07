import os
import json
import tempfile
import subprocess
from typing import BinaryIO, Optional
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

    def upload(self, path: str, key: str, content_type: Optional[str] = None):
        """
        Upload a file from disk (worker output) into local storage.
        """
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
        if os.path.exists(path):
            os.remove(path)

    def exists(self, key: str) -> bool:
        return os.path.exists(self._full_path(key))

    def get_duration_seconds(self, key: str) -> float:
        path = self._full_path(key)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Local key not found: {key}")

        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "ffprobe failed")

        data = json.loads(proc.stdout or "{}")
        fmt = data.get("format") or {}
        dur = fmt.get("duration")
        if dur is None:
            for s in data.get("streams") or []:
                if (s.get("codec_type") or "").lower() == "video":
                    dur = s.get("duration")
                    break
        if dur is None:
            raise RuntimeError("Could not read duration from ffprobe output")

        return float(dur)

    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        """
        Local dev playback URL. Tokenized in storage router.
        """
        from routers.storage import _sign_storage_key

        token = _sign_storage_key(key)
        return f"/storage/local-get?key={key}&token={token}"
