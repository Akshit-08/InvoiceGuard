"""Invoice management, extraction, SSE streaming, analysis, and review endpoints."""

from pathlib import Path
from typing import Any, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from backend.app.core.events import event_bus
from backend.app.deps import get_db
from backend.app.models.entities import (
    AuditEvent,
    ExtractionEdit,
    Invoice,
    InvoiceDocument,
    InvoiceFinding,
    RiskScoreRecord,
)
from backend.app.schemas.contracts import ExtractionResponse, InvoiceData, UploadResponse
from backend.app.services.pipeline import pipeline

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_invoice(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Upload PDF or scanned invoice image. Initiates ingest, reading, and extraction."""
    upload_res, _ = await pipeline.process_upload(file, db)
    return upload_res


@router.get("/{invoice_id}/events")
async def invoice_events(invoice_id: str, request: Request):
    """Server-Sent Events (SSE) stream for real-time document processing stage events."""
    return EventSourceResponse(event_bus.event_generator(invoice_id, request))


@router.get("/{invoice_id}/extraction", response_model=ExtractionResponse)
def get_invoice_extraction(invoice_id: str, db: Session = Depends(get_db)):
    """Fetch structured extraction and field-level confidence scores."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.raw_extracted_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {invoice_id} not found or not yet extracted."},
        )

    data = InvoiceData.model_validate(inv.raw_extracted_json)
    confidences = {
        "invoice_number": data.invoice_number.conf,
        "invoice_date": data.invoice_date.conf,
        "grand_total": data.grand_total.conf,
        "vendor_name": data.vendor.name.conf,
    }
    missing_critical = []
    if not data.invoice_number.value:
        missing_critical.append("invoice_number")
    if not data.vendor.name.value:
        missing_critical.append("vendor.name")
    if not data.invoice_date.value:
        missing_critical.append("invoice_date")
    if not data.grand_total.value:
        missing_critical.append("grand_total")

    return ExtractionResponse(
        invoice_id=inv.id,
        data=data,
        confidences=confidences,
        missing_critical_fields=missing_critical,
        needs_manual_verification=inv.needs_manual_verification,
        read_quality=inv.read_quality,
    )


@router.put("/{invoice_id}/extraction")
def update_invoice_extraction(
    invoice_id: str,
    updates: dict[str, Any],
    db: Session = Depends(get_db),
):
    """Save reviewer corrections to extracted invoice entities and record audit log."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {invoice_id} not found."},
        )

    # Save edit audit log
    for k, v in updates.items():
        edit_rec = ExtractionEdit(
            invoice_id=invoice_id,
            field_path=str(k),
            original_value=str(inv.raw_extracted_json.get(k) if inv.raw_extracted_json else ""),
            corrected_value=str(v),
            edited_by="reviewer",
        )
        db.add(edit_rec)

    # Merge or overwrite raw extracted JSON
    if inv.raw_extracted_json:
        current_data = dict(inv.raw_extracted_json)
        current_data.update(updates)
        inv.raw_extracted_json = current_data
    else:
        inv.raw_extracted_json = updates

    # Record audit event
    audit = AuditEvent(
        invoice_id=invoice_id,
        actor="reviewer",
        action="extraction_edit",
        payload_json={"fields_updated": list(updates.keys())},
    )
    db.add(audit)
    db.commit()

    return {"status": "updated", "invoice_id": invoice_id, "updated_fields": list(updates.keys())}


@router.post("/{invoice_id}/analyze")
async def analyze_invoice(
    invoice_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    async_mode: bool = False,
):
    """Run all detection engines and multimodal fusion to produce explainable risk score."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {invoice_id} not found."},
        )

    if async_mode:
        async def run_analyze_task(inv_id: str):
            from backend.app.core.db import SessionLocal
            with SessionLocal() as db_session:
                try:
                    await pipeline.analyze_invoice(inv_id, db_session)
                except Exception as e:
                    inv_record = db_session.query(Invoice).filter(Invoice.id == inv_id).first()
                    if inv_record:
                        inv_record.status = "failed"
                        db_session.commit()
                    await event_bus.emit(inv_id, "analyze", "failed", str(e), 1.0)

        background_tasks.add_task(run_analyze_task, invoice_id)
        return {"invoice_id": invoice_id, "status": "analyzing"}

    try:
        result = await pipeline.analyze_invoice(invoice_id, db)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "ANALYSIS_FAILED", "message": str(e)},
        )


@router.get("/{invoice_id}")
def get_full_result(invoice_id: str, db: Session = Depends(get_db)):
    """Fetch complete analysis: invoice metadata, risk score, signals, findings, SHAP, and recommendations."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {invoice_id} not found."},
        )

    risk_rec = db.query(RiskScoreRecord).filter(RiskScoreRecord.invoice_id == invoice_id).first()
    findings_db = db.query(InvoiceFinding).filter(InvoiceFinding.invoice_id == invoice_id).all()

    findings_list = [
        {
            "id": f.id,
            "engine": f.engine,
            "category": f.category,
            "type": f.type,
            "severity": f.severity,
            "score": f.score,
            "confidence": f.confidence,
            "title": f.title,
            "summary": f.summary,
            "evidence": f.evidence_json or {},
            "field": f.field,
            "bbox": f.bbox_json,
            "recommended_action": f.recommended_action,
        }
        for f in findings_db
    ]

    # Extract related matches from findings
    matches = []
    for f in findings_db:
        if f.evidence_json and "matches" in f.evidence_json:
            matches.extend(f.evidence_json["matches"])

    risk_payload = None
    if risk_rec:
        risk_payload = {
            "overall_score": risk_rec.overall_score,
            "level": risk_rec.level,
            "probability": risk_rec.probability,
            "confidence": risk_rec.confidence,
            "baseline_score": risk_rec.baseline_score,
            "ml_score": risk_rec.ml_score,
            "fusion_mode": getattr(risk_rec, "fusion_mode", "xgboost+baseline") or "xgboost+baseline",
            "signals": risk_rec.signals_json or {},
            "shap_top": risk_rec.shap_json or [],
            "escalations": risk_rec.escalations_json or [],
            "recommendation": risk_rec.recommendation,
            "disclaimer": "InvoiceGuard flags anomalies for human review. It does not determine fraud.",
        }

    vendor_summary = None
    if inv.vendor:
        vendor_summary = {
            "id": inv.vendor.id,
            "name": inv.vendor.name,
            "gstin": inv.vendor.gstin,
            "pan": inv.vendor.pan,
            "category": inv.vendor.category,
        }

    return {
        "id": inv.id,
        "original_filename": inv.original_filename,
        "page_count": inv.page_count,
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date,
        "due_date": inv.due_date,
        "currency": inv.currency,
        "subtotal": inv.subtotal,
        "tax_total": inv.tax_total,
        "grand_total": inv.grand_total,
        "status": inv.status,
        "risk_level": inv.risk_level,
        "overall_score": inv.overall_score,
        "review_status": inv.review_status,
        "review_note": inv.review_note,
        "read_quality": inv.read_quality,
        "extraction_confidence": inv.extraction_confidence,
        "needs_manual_verification": inv.needs_manual_verification,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "data": inv.raw_extracted_json,
        "risk": risk_payload,
        "signals": risk_rec.signals_json if risk_rec else {},
        "findings": findings_list,
        "matches": matches,
        "vendor": vendor_summary,
    }


@router.get("/{invoice_id}/pages/{page_idx}.png")
def get_invoice_page_image(invoice_id: str, page_idx: int, db: Session = Depends(get_db)):
    """Serve rendered 200 DPI PNG page image for document preview."""
    doc = (
        db.query(InvoiceDocument)
        .filter(InvoiceDocument.invoice_id == invoice_id, InvoiceDocument.page == page_idx)
        .first()
    )
    if not doc or not Path(doc.image_path).exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PAGE_NOT_FOUND", "message": f"Page image {page_idx} not found for invoice {invoice_id}."},
        )
    return FileResponse(doc.image_path, media_type="image/png")


@router.get("/{invoice_id}/thumb")
def get_invoice_thumbnail(invoice_id: str, db: Session = Depends(get_db)):
    """Serve invoice thumbnail image."""
    doc = (
        db.query(InvoiceDocument)
        .filter(InvoiceDocument.invoice_id == invoice_id, InvoiceDocument.page == 0)
        .first()
    )
    if not doc or not doc.thumb_path or not Path(doc.thumb_path).exists():
        if doc and Path(doc.image_path).exists():
            return FileResponse(doc.image_path, media_type="image/png")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "THUMB_NOT_FOUND", "message": "Thumbnail not found."},
        )
    return FileResponse(doc.thumb_path, media_type="image/png")


@router.get("")
def get_history(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    risk_level: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[str] = None,
):
    """Retrieve invoice processing history with filtering, searching, and pagination."""
    query = db.query(Invoice)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            (Invoice.invoice_number.ilike(search_fmt))
            | (Invoice.original_filename.ilike(search_fmt))
        )
    if risk_level:
        query = query.filter(Invoice.risk_level == risk_level.upper())
    if status_filter:
        if status_filter == "needs_review":
            query = query.filter(Invoice.review_status.in_(["needs_review", "pending"]))
        else:
            query = query.filter(Invoice.status == status_filter)
    if vendor_id:
        query = query.filter(Invoice.vendor_id == vendor_id)

    total_count = query.count()
    invoices = query.order_by(desc(Invoice.created_at)).offset(offset).limit(limit).all()

    items = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number or "N/A",
            "original_filename": inv.original_filename,
            "vendor_name": inv.vendor.name if inv.vendor else "Unknown",
            "invoice_date": inv.invoice_date,
            "grand_total": inv.grand_total,
            "currency": inv.currency,
            "status": inv.status,
            "risk_level": inv.risk_level,
            "overall_score": inv.overall_score,
            "review_status": inv.review_status,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


@router.get("/{invoice_id}/compare/{other_id}")
def compare_invoices(invoice_id: str, other_id: str, db: Session = Depends(get_db)):
    """Produce field-level diff between two invoices (for duplicate or historical comparison)."""
    inv_a = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    inv_b = db.query(Invoice).filter(Invoice.id == other_id).first()
    if not inv_a or not inv_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": "One or both invoices not found for comparison."},
        )

    diffs = []
    comparison_fields = ["invoice_number", "invoice_date", "subtotal", "tax_total", "grand_total"]
    for field_name in comparison_fields:
        val_a = getattr(inv_a, field_name, None)
        val_b = getattr(inv_b, field_name, None)
        if val_a != val_b:
            diffs.append({
                "field": field_name,
                "invoice_a_value": val_a,
                "invoice_b_value": val_b,
                "status": "changed",
            })
        else:
            diffs.append({
                "field": field_name,
                "invoice_a_value": val_a,
                "invoice_b_value": val_b,
                "status": "identical",
            })

    return {
        "invoice_a_id": invoice_id,
        "invoice_b_id": other_id,
        "differences": diffs,
    }


@router.patch("/{invoice_id}/review")
def review_invoice(
    invoice_id: str,
    review_data: dict[str, Any],
    db: Session = Depends(get_db),
):
    """Update human reviewer status and audit note."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {invoice_id} not found."},
        )

    new_status = review_data.get("status")
    note = review_data.get("note")

    valid_statuses = {"needs_review", "confirmed_issue", "false_positive", "approved"}
    if new_status and new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_REVIEW_STATUS", "message": f"Status must be one of {valid_statuses}"},
        )

    if new_status:
        inv.review_status = new_status
    if note is not None:
        inv.review_note = str(note)

    audit = AuditEvent(
        invoice_id=invoice_id,
        actor=review_data.get("reviewer", "compliance_officer"),
        action="review_status_updated",
        payload_json={"review_status": inv.review_status, "note": inv.review_note},
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "invoice_id": invoice_id,
        "review_status": inv.review_status,
        "review_note": inv.review_note,
    }


@router.get("/{invoice_id}/audit")
def get_invoice_audit_trail(invoice_id: str, db: Session = Depends(get_db)):
    """Fetch chronological audit trail for the invoice."""
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.invoice_id == invoice_id)
        .order_by(AuditEvent.created_at.asc())
        .all()
    )
    return [
        {
            "id": e.id,
            "invoice_id": e.invoice_id,
            "actor": e.actor,
            "action": e.action,
            "payload": e.payload_json,
            "timestamp": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@router.get("/{invoice_id}/report.pdf")
def get_invoice_pdf_report(invoice_id: str, db: Session = Depends(get_db)):
    """Generate a downloadable PDF audit report."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    risk_rec = db.query(RiskScoreRecord).filter(RiskScoreRecord.invoice_id == invoice_id).first()
    findings_db = db.query(InvoiceFinding).filter(InvoiceFinding.invoice_id == invoice_id).all()
    audit_events = db.query(AuditEvent).filter(AuditEvent.invoice_id == invoice_id).order_by(AuditEvent.created_at.asc()).all()

    doc = db.query(InvoiceDocument).filter(InvoiceDocument.invoice_id == invoice_id, InvoiceDocument.page == 0).first()
    thumb_path = doc.thumb_path if doc else None
    if not thumb_path and doc and doc.image_path:
        thumb_path = doc.image_path

    from backend.app.services.reporting.pdf_builder import build_pdf_report
    try:
        pdf_bytes = build_pdf_report(inv, findings_db, risk_rec, audit_events, thumb_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=InvoiceGuard_Report_{invoice_id}.pdf"},
    )
