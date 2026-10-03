"""Dashboard analytics and KPI summary endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from backend.app.deps import get_db
from backend.app.models.entities import Invoice, InvoiceFinding

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Fetch high-level KPIs, risk distribution, category anomalies, and recent invoices."""
    total_invoices = db.query(Invoice).count()
    analyzed_count = db.query(Invoice).filter(Invoice.status == "analyzed").count()
    needs_review_count = db.query(Invoice).filter(Invoice.review_status == "needs_review").count()
    high_critical_count = (
        db.query(Invoice)
        .filter(Invoice.risk_level.in_(["HIGH", "CRITICAL"]))
        .count()
    )

    duplicate_alerts = (
        db.query(InvoiceFinding)
        .filter(InvoiceFinding.type.in_(["EXACT_FILE_DUPLICATE", "NEAR_DUPLICATE", "MODIFIED_DUPLICATE"]))
        .count()
    )

    # Risk distribution
    low_count = db.query(Invoice).filter(Invoice.risk_level == "LOW").count()
    medium_count = db.query(Invoice).filter(Invoice.risk_level == "MEDIUM").count()
    high_count = db.query(Invoice).filter(Invoice.risk_level == "HIGH").count()
    critical_count = db.query(Invoice).filter(Invoice.risk_level == "CRITICAL").count()

    # Category breakdown
    category_counts = (
        db.query(InvoiceFinding.category, func.count(InvoiceFinding.id))
        .group_by(InvoiceFinding.category)
        .all()
    )
    categories_dict = {cat or "other": count for cat, count in category_counts}

    # Recent invoices
    recent_invoices = (
        db.query(Invoice)
        .order_by(desc(Invoice.created_at))
        .limit(6)
        .all()
    )
    recent_list = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number or "N/A",
            "vendor_name": inv.vendor.name if inv.vendor else "Unknown",
            "grand_total": inv.grand_total,
            "status": inv.status,
            "risk_level": inv.risk_level,
            "overall_score": inv.overall_score,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in recent_invoices
    ]

    return {
        "kpis": {
            "total_invoices": total_invoices,
            "analyzed_count": analyzed_count,
            "needs_review_count": needs_review_count,
            "high_critical_count": high_critical_count,
            "duplicate_alerts": duplicate_alerts,
        },
        "risk_distribution": {
            "low": low_count,
            "medium": medium_count,
            "high": high_count,
            "critical": critical_count,
        },
        "anomaly_categories": categories_dict,
        "recent_analyses": recent_list,
    }
