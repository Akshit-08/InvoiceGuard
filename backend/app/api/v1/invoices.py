"""Invoices API router: upload and extraction endpoints."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.deps import get_db
from backend.app.models.entities import Invoice
from backend.app.schemas.contracts import (
    ExtractionResponse,
    InvoiceData,
    UploadResponse,
)
from backend.app.services.pipeline import pipeline

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_invoice(
    file: UploadFile,
    db: Session = Depends(get_db),
) -> UploadResponse:
    """Upload PDF/image, validate magic bytes, render pages, and extract structured invoice fields."""
    upload_res, _ = await pipeline.process_upload(file, db)
    return upload_res


@router.get("/{invoice_id}/extraction", response_model=ExtractionResponse)
def get_invoice_extraction(
    invoice_id: str,
    db: Session = Depends(get_db),
) -> ExtractionResponse:
    """Retrieve extracted InvoiceData contract, confidences, and manual verification audit flag."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INVOICE_NOT_FOUND",
                "message": f"No invoice found with ID '{invoice_id}'.",
                "details": {"invoice_id": invoice_id},
            },
        )

    if not inv.raw_extracted_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EXTRACTION_NOT_AVAILABLE",
                "message": "Invoice has not completed extraction stage.",
            },
        )

    data = InvoiceData.model_validate(inv.raw_extracted_json)

    missing_critical: list[str] = []
    if not data.invoice_number.value:
        missing_critical.append("invoice_number")
    if not data.vendor.name.value:
        missing_critical.append("vendor.name")
    if not data.invoice_date.value:
        missing_critical.append("invoice_date")
    if not data.grand_total.value:
        missing_critical.append("grand_total")

    confidences = {
        "invoice_number": data.invoice_number.conf,
        "vendor.name": data.vendor.name.conf,
        "invoice_date": data.invoice_date.conf,
        "grand_total": data.grand_total.conf,
        "subtotal": data.subtotal.conf,
        "tax.total": data.tax.total.conf,
    }

    return ExtractionResponse(
        invoice_id=inv.id,
        data=data,
        confidences=confidences,
        missing_critical_fields=missing_critical,
        needs_manual_verification=inv.needs_manual_verification,
        read_quality=inv.read_quality,
    )
