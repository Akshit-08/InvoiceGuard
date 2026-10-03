"""Application settings and environment configuration via pydantic-settings."""

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "InvoiceGuard"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = "sqlite:///./data/invoiceguard.db"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # File uploads and paths
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE_MB: int = 15
    MAX_PAGES_TO_PROCESS: int = 3

    # Extractor & Model configs
    LAYOUTLM_MODEL_ID: str = ""
    HF_TOKEN: str = ""
    EXTRACTOR_LLM: int = 0
    LLM_API_KEY: str = ""

    # Fusion Mode ("combined" | "baseline")
    FUSION_MODE: str = "combined"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def upload_path(self) -> Path:
        path = Path(self.UPLOAD_DIR)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
