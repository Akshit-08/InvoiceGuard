"""Dashboard analytics and KPI summary endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from backend.app.deps import get_db
from backend.app.models.entities import Invoice, InvoiceFinding, Vendor

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(days: int = 30, db: Session = Depends(get_db)):
    """Fetch high-level KPIs, risk distribution, category anomalies, and recent invoices."""
    total_invoices = db.query(Invoice).count()
    analyzed_count = db.query(Invoice).filter(Invoice.status == "analyzed").count()
    needs_review_count = db.query(Invoice).filter(Invoice.review_status.in_(["needs_review", "pending"])).count()
    high_critical_count = (
        db.query(Invoice)
        .filter(Invoice.risk_level.in_(["high", "critical"]))
        .count()
    )
    value_at_risk = (
        db.query(func.sum(Invoice.grand_total))
        .filter(Invoice.risk_level.in_(["high", "critical"]))
        .scalar()
    ) or 0.0

    duplicate_alerts = (
        db.query(InvoiceFinding)
        .filter(InvoiceFinding.type.in_(["EXACT_FILE_DUPLICATE", "NEAR_DUPLICATE", "MODIFIED_DUPLICATE"]))
        .count()
    )

    # Risk distribution (store as lowercase)
    low_count = db.query(Invoice).filter(Invoice.risk_level == "low").count()
    medium_count = db.query(Invoice).filter(Invoice.risk_level == "medium").count()
    high_count = db.query(Invoice).filter(Invoice.risk_level == "high").count()
    critical_count = db.query(Invoice).filter(Invoice.risk_level == "critical").count()

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

    # Review queue (for Dashboard needs review list)
    needs_review_invoices = (
        db.query(Invoice)
        .filter(Invoice.review_status.in_(["needs_review", "pending"]))
        .order_by(desc(Invoice.overall_score), desc(Invoice.created_at))
        .limit(5)
        .all()
    )
    review_queue_list = [
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
        for inv in needs_review_invoices
    ]

    # Generate basic trend based on actual created_at
    from datetime import datetime, timedelta
    now = datetime.now()
    trend = []
    
    # Query for daily anomalies (count of invoices with high/critical or count of anomalies)
    # We will count invoices analysed per day for the trend, grouped by risk_level
    daily_stats = (
        db.query(
            func.date(Invoice.created_at).label("d"),
            Invoice.risk_level,
            func.count(Invoice.id).label("c")
        )
        .filter(Invoice.created_at >= now - timedelta(days=days))
        .group_by(func.date(Invoice.created_at), Invoice.risk_level)
        .all()
    )
    
    daily_map = {}
    for d, r, c in daily_stats:
        d_str = str(d)
        if d_str not in daily_map:
            daily_map[d_str] = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        if r:
            r_key = r.lower()
            if r_key in daily_map[d_str]:
                daily_map[d_str][r_key] = c
    
    for i in range(days - 1, -1, -1):
        d_obj = now - timedelta(days=i)
        d_str = d_obj.strftime("%Y-%m-%d")
        d_disp = d_obj.strftime("%m-%d")
        counts = daily_map.get(d_str, {"low": 0, "medium": 0, "high": 0, "critical": 0})
        trend.append({
            "date": d_disp,
            "low": counts["low"],
            "medium": counts["medium"],
            "high": counts["high"],
            "critical": counts["critical"]
        })

    # Fetch top suspicious vendors
    top_vendors = (
        db.query(
            Invoice.vendor_id,
            func.count(Invoice.id).label("incidents"),
            func.avg(Invoice.overall_score).label("avg_score")
        )
        .filter(Invoice.risk_level.in_(["high", "critical"]))
        .filter(Invoice.vendor_id.isnot(None))
        .group_by(Invoice.vendor_id)
        .order_by(desc("avg_score"))
        .limit(5)
        .all()
    )

    top_vendors_list = []
    for tv in top_vendors:
        vendor_rec = db.query(Vendor).filter(Vendor.id == tv.vendor_id).first()
        if vendor_rec:
            top_vendors_list.append({
                "id": vendor_rec.id,
                "name": vendor_rec.name,
                "incidents": tv.incidents,
                "avg_score": tv.avg_score
            })
    # Fetch system status metrics
    from pathlib import Path
    import json
    
    # Resolve project root relative to this file
    # dashboard.py is in backend/app/api/v1
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
    
    system_status = {
        "model_loaded": False,
        "fusion_mode": "baseline",
        "roc_auc": None,
        "pr_auc": None,
        "engines_enabled": ["layoutlmv3", "financial", "tax_identity", "duplicate", "vendor", "bank_change", "identifiers", "visual"]
    }
    
    xgb_exists = (PROJECT_ROOT / "ml" / "artifacts" / "fusion_xgb.joblib").exists()
    if xgb_exists:
        system_status["model_loaded"] = True
        system_status["fusion_mode"] = "xgboost+baseline"
        
    metrics_path = PROJECT_ROOT / "reports" / "metrics.json"
    if metrics_path.exists():
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                mets = json.load(f)
                system_status["roc_auc"] = mets.get("roc_auc")
                system_status["pr_auc"] = mets.get("pr_auc")
        except Exception:
            pass

    return {
        "kpis": {
            "total_invoices": total_invoices,
            "analyzed_count": analyzed_count,
            "needs_review_count": needs_review_count,
            "high_critical_count": high_critical_count,
            "value_at_risk": value_at_risk,
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
        "needs_review_queue": review_queue_list,
        "trend": trend,
        "top_vendors": top_vendors_list,
        "system_status": system_status,
    }
