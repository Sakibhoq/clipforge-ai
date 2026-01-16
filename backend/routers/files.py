from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from core.config import settings
import os

router = APIRouter(prefix="/files")

@router.get("/{filename}")
def serve_file(filename: str):
    path = os.path.join(settings.CLIP_DIR, filename)
    return FileResponse(path)
