"""Models status and evaluation metrics endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
def get_models():
    """List available detection and fusion models and their readiness status."""
    xgb_exists = Path("ml/artifacts/fusion_xgb.joblib").exists()
    return [
        {
            "name": "xgboost-fusion",
            "type": "tabular-classifier",
            "status": "active" if xgb_exists else "fallback_baseline",
            "artifact": "ml/artifacts/fusion_xgb.joblib" if xgb_exists else None,
            "calibrated": True,
        },
        {
            "name": "fastembed-bge",
            "type": "text-embedding",
            "status": "active",
            "model_id": "BAAI/bge-small-en-v1.5",
        },
        {
            "name": "rapidocr",
            "type": "ocr-engine",
            "status": "active",
        },
    ]


@router.get("/metrics")
def get_metrics():
    """Fetch current evaluation benchmark metrics and curve data from reports/metrics.json."""
    metrics_path = Path("reports/metrics.json")
    if metrics_path.exists():
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "status": "pending",
        "message": "Evaluation report not yet generated. Run ml/evaluation/run.py.",
    }
