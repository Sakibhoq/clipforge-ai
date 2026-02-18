from __future__ import annotations

import json
import re
from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from models.user import User
from models.storefront import Storefront
from routers.auth import get_current_user

router = APIRouter(prefix="/storefront", tags=["storefront"])


def _slugify_handle(value: str) -> str:
    v = (value or "").strip().lower()
    v = re.sub(r"[^a-z0-9-_]+", "-", v)
    v = re.sub(r"-+", "-", v).strip("-")
    return v[:32] or "creator"


def _default_handle(email: str) -> str:
    base = (email or "creator").split("@", 1)[0]
    return _slugify_handle(base)


class StorefrontUpdateRequest(BaseModel):
    handle: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    hero: Optional[str] = None
    pricing: Optional[Dict[str, Any]] = None
    published: Optional[bool] = None


class StorefrontResponse(BaseModel):
    handle: str
    display_name: Optional[str]
    bio: Optional[str]
    hero: Optional[str]
    pricing: Optional[Dict[str, Any]]
    published: bool


@router.get("/me", response_model=StorefrontResponse)
def get_my_storefront(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sf = db.query(Storefront).filter(Storefront.user_id == current_user.id).first()
    if not sf:
        handle = _default_handle(current_user.email)
        sf = Storefront(
            user_id=current_user.id,
            handle=handle,
            display_name=current_user.email.split("@", 1)[0].title(),
            bio=None,
            hero=None,
            pricing_json=json.dumps(
                {
                    "headline": "Clips, edits, and short-form packages",
                    "tiers": [
                        {"name": "Starter", "price": "$199", "desc": "4 clips / week"},
                        {"name": "Growth", "price": "$499", "desc": "12 clips / week"},
                    ],
                }
            ),
            published=False,
        )
        db.add(sf)
        db.commit()
        db.refresh(sf)

    return {
        "handle": sf.handle,
        "display_name": sf.display_name,
        "bio": sf.bio,
        "hero": sf.hero,
        "pricing": json.loads(sf.pricing_json) if sf.pricing_json else None,
        "published": bool(sf.published),
    }


@router.post("/me", response_model=StorefrontResponse)
def update_my_storefront(
    payload: StorefrontUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sf = db.query(Storefront).filter(Storefront.user_id == current_user.id).first()
    if not sf:
        sf = Storefront(
            user_id=current_user.id,
            handle=_default_handle(current_user.email),
        )
        db.add(sf)

    if payload.handle:
        handle = _slugify_handle(payload.handle)
        existing = db.query(Storefront).filter(Storefront.handle == handle, Storefront.user_id != current_user.id).first()
        if existing:
            raise HTTPException(409, "Handle already taken")
        sf.handle = handle

    if payload.display_name is not None:
        sf.display_name = payload.display_name
    if payload.bio is not None:
        sf.bio = payload.bio
    if payload.hero is not None:
        sf.hero = payload.hero
    if payload.pricing is not None:
        sf.pricing_json = json.dumps(payload.pricing)
    if payload.published is not None:
        sf.published = bool(payload.published)

    db.commit()
    db.refresh(sf)

    return {
        "handle": sf.handle,
        "display_name": sf.display_name,
        "bio": sf.bio,
        "hero": sf.hero,
        "pricing": json.loads(sf.pricing_json) if sf.pricing_json else None,
        "published": bool(sf.published),
    }


@router.get("/{handle}", response_model=StorefrontResponse)
def public_storefront(
    handle: str,
    db: Session = Depends(get_db),
):
    h = _slugify_handle(handle)
    sf = db.query(Storefront).filter(Storefront.handle == h, Storefront.published == True).first()
    if not sf:
        raise HTTPException(404, "Storefront not found")

    return {
        "handle": sf.handle,
        "display_name": sf.display_name,
        "bio": sf.bio,
        "hero": sf.hero,
        "pricing": json.loads(sf.pricing_json) if sf.pricing_json else None,
        "published": bool(sf.published),
    }
