from fastapi import APIRouter
from backend.app.services.settings_service import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("")
def get_settings():
    return settings_service.settings

@router.put("")
def update_settings(updates: dict):
    for k, v in updates.items():
        settings_service.set(k, v)
    return settings_service.settings
