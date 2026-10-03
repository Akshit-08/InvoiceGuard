from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.deps import get_db
from backend.app.models.entities import Vendor

router = APIRouter(prefix="/vendors", tags=["vendors"])

@router.get("")
def get_vendors(db: Session = Depends(get_db)):
    vendors = db.query(Vendor).all()
    return [{"id": v.id, "name": v.name, "gstin": v.gstin} for v in vendors]

@router.get("/{vendor_id}")
def get_vendor_profile(vendor_id: str, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor: return {"error": "not found"}
    return {"id": vendor.id, "name": vendor.name}
