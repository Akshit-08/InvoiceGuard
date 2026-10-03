"""Vendor profile and behavioral history endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.deps import get_db
from backend.app.models.entities import Invoice, Vendor, VendorAccount

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("")
def get_vendors(db: Session = Depends(get_db)):
    """List vendors with aggregate stats and transaction summaries."""
    vendors = db.query(Vendor).all()
    results = []
    for v in vendors:
        inv_count = db.query(Invoice).filter(Invoice.vendor_id == v.id).count()
        total_billed = (
            db.query(func.sum(Invoice.grand_total))
            .filter(Invoice.vendor_id == v.id)
            .scalar()
            or 0.0
        )
        avg_score = (
            db.query(func.avg(Invoice.overall_score))
            .filter(Invoice.vendor_id == v.id, Invoice.overall_score.isnot(None))
            .scalar()
            or 0.0
        )

        results.append({
            "id": v.id,
            "name": v.name,
            "gstin": v.gstin,
            "pan": v.pan,
            "category": v.category,
            "invoice_count": inv_count,
            "total_billed": round(float(total_billed), 2),
            "avg_risk_score": round(float(avg_score), 1),
        })

    return results


@router.get("/{vendor_id}")
def get_vendor_profile(vendor_id: str, db: Session = Depends(get_db)):
    """Fetch complete vendor profile with known bank accounts, invoice history, and stats."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VENDOR_NOT_FOUND", "message": f"Vendor {vendor_id} not found."},
        )

    accounts = (
        db.query(VendorAccount)
        .filter(VendorAccount.vendor_id == vendor_id)
        .all()
    )
    invoices = (
        db.query(Invoice)
        .filter(Invoice.vendor_id == vendor_id)
        .order_by(Invoice.created_at.desc())
        .limit(20)
        .all()
    )

    accounts_list = [
        {
            "id": a.id,
            "masked_account": f"XXXXXX{a.last4}",
            "bank_name": a.bank_name,
            "ifsc": a.ifsc,
            "invoice_count": a.invoice_count,
            "first_seen": a.first_seen.isoformat() if a.first_seen else None,
            "last_seen": a.last_seen.isoformat() if a.last_seen else None,
        }
        for a in accounts
    ]

    invoices_list = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number or "N/A",
            "invoice_date": inv.invoice_date,
            "grand_total": inv.grand_total,
            "status": inv.status,
            "risk_level": inv.risk_level,
            "overall_score": inv.overall_score,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]

    return {
        "id": vendor.id,
        "name": vendor.name,
        "gstin": vendor.gstin,
        "pan": vendor.pan,
        "address": vendor.address,
        "email": vendor.email,
        "phone": vendor.phone,
        "category": vendor.category,
        "known_accounts": accounts_list,
        "recent_invoices": invoices_list,
    }
