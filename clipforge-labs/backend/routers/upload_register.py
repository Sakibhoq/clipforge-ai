from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, Literal, Any, Dict

from core.database import get_db
from models.user import User
from routers.auth import get_current_user
from services.upload_service import register_upload_for_user

router = APIRouter(prefix="/uploads", tags=["uploads"])

# ======================================================
# Types
# ======================================================

AspectRatio = Literal["9:16", "1:1", "4:5", "16:9", "4:3"]
SourceType = Literal["upload", "youtube"]

# ======================================================
# Schemas
# ======================================================

class RegisterUploadRequest(BaseModel):
    original_filename: str = Field(..., min_length=1)
    storage_key: str = Field(..., min_length=1)

    source_type: SourceType = Field(default="upload")
    source_url: Optional[str] = None
    source_id: Optional[str] = None

    aspect_ratio: AspectRatio = Field(default="9:16")
    captions_enabled: bool = True
    watermark_enabled: bool = True

    caption_style_json: Optional[Any] = None
    caption_style: Optional[Dict[str, Any]] = None

    create_new_job: bool = False

def _require_user_key_namespace(user_id: int, storage_key: str):
    prefix = f"users/{user_id}/videos/"
    if not storage_key.startswith(prefix):
        raise HTTPException(403, f"storage_key must start with {prefix}")

# ======================================================
# Route
# ======================================================

@router.post("/register")
def register_upload(
    req: RegisterUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_user_key_namespace(current_user.id, req.storage_key)
    return register_upload_for_user(
        db=db,
        user=current_user,
        storage_key=req.storage_key,
        original_filename=req.original_filename,
        source_type=req.source_type,
        source_url=req.source_url,
        source_id=req.source_id,
        aspect_ratio=req.aspect_ratio,
        captions_enabled=req.captions_enabled,
        watermark_enabled=req.watermark_enabled,
        caption_style_json=req.caption_style_json,
        caption_style=req.caption_style,
        create_new_job=req.create_new_job,
    )
