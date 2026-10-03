from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.deps import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {"total_invoices": 0, "critical": 0, "high": 0}
