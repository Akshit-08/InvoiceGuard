from fastapi import APIRouter

router = APIRouter(prefix="/models", tags=["models"])

@router.get("")
def get_models():
    return [{"name": "xgboost-fusion", "status": "active"}]

@router.get("/metrics")
def get_metrics():
    return {"roc_auc": 0.9}
