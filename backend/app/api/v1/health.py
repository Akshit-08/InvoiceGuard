"""Health check endpoint."""

from fastapi import APIRouter

from backend.app.config import settings
from backend.app.schemas.contracts import HealthResponse

router = APIRouter(tags=["health"])


def check_optional_models() -> dict[str, bool]:
    """Inspect availability of optional ML and vision packages."""
    available = {
        "rapidocr": False,
        "fastembed": False,
        "xgboost": False,
        "shap": False,
        "layoutlmv3": False,
        "llm": bool(settings.LLM_API_KEY and settings.EXTRACTOR_LLM),
    }

    try:
        import rapidocr_onnxruntime  # noqa: F401
        available["rapidocr"] = True
    except ImportError:
        pass

    try:
        import fastembed  # noqa: F401
        available["fastembed"] = True
    except ImportError:
        pass

    try:
        import xgboost  # noqa: F401
        available["xgboost"] = True
    except ImportError:
        pass

    try:
        import shap  # noqa: F401
        available["shap"] = True
    except ImportError:
        pass

    try:
        from transformers import LayoutLMv3Processor  # noqa: F401
        available["layoutlmv3"] = bool(settings.LAYOUTLM_MODEL_ID)
    except ImportError:
        pass

    return available


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Return service status, API version, and loaded optional model capabilities."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        environment=settings.ENVIRONMENT,
        optional_models=check_optional_models(),
    )
