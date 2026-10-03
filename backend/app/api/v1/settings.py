"""Settings management endpoints."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.deps import get_db
from backend.app.services.settings_service import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings():
    """Fetch current system thresholds, tolerances, engine toggles, and fusion weights."""
    return {
        "thresholds": settings_service.get_thresholds(),
        "tolerances": {
            "line_total_abs": settings_service.get_tolerance("line_total_abs"),
            "line_total_pct": settings_service.get_tolerance("line_total_pct"),
            "subtotal_abs": settings_service.get_tolerance("subtotal_abs"),
            "grand_total_abs": settings_service.get_tolerance("grand_total_abs"),
            "tax_amount_abs": settings_service.get_tolerance("tax_amount_abs"),
            "rounding_max_abs": settings_service.get_tolerance("rounding_max_abs"),
        },
        "engine_toggles": {
            "financial": settings_service.is_engine_enabled("financial"),
            "tax_identity": settings_service.is_engine_enabled("tax_identity"),
            "identifiers": settings_service.is_engine_enabled("identifiers"),
            "duplicate": settings_service.is_engine_enabled("duplicate"),
            "vendor": settings_service.is_engine_enabled("vendor"),
            "bank_change": settings_service.is_engine_enabled("bank_change"),
            "visual": settings_service.is_engine_enabled("visual"),
        },
        "fusion": settings_service.get_fusion_config(),
        "pdf_editors": settings_service.get_pdf_editors(),
    }


@router.put("")
def update_settings(updates: dict[str, Any], db: Session = Depends(get_db)):
    """Update settings in database and invalidate memory cache."""
    for section_key, val in updates.items():
        if isinstance(val, dict):
            settings_service.update_setting(db, section_key, val)
    return get_settings()
