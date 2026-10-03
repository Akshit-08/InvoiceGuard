"""FastAPI dependency injection utilities."""

from collections.abc import Generator

from sqlalchemy.orm import Session

from backend.app.core.db import get_db

__all__ = ["get_db", "Generator", "Session"]
