from fastapi import APIRouter, Depends, HTTPException, UploadFile, status, BackgroundTasks, Request
from sqlalchemy.orm import Session
from backend.app.deps import get_db
from backend.app.models.entities import Invoice
from backend.app.schemas.contracts import ExtractionResponse, InvoiceData, UploadResponse
from backend.app.services.pipeline import pipeline
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/invoices", tags=["invoices"])

@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_invoice(file: UploadFile, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    upload_res, _ = await pipeline.process_upload(file, db)
    return upload_res

@router.get("/{invoice_id}/events")
async def invoice_events(invoice_id: str, request: Request):
    async def event_generator():
        yield {"data": "ingest"}
    return EventSourceResponse(event_generator())

@router.get("/{invoice_id}/extraction", response_model=ExtractionResponse)
def get_invoice_extraction(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.raw_extracted_json: raise HTTPException(status_code=404)
    data = InvoiceData.model_validate(inv.raw_extracted_json)
    return ExtractionResponse(invoice_id=inv.id, data=data, confidences={}, missing_critical_fields=[], needs_manual_verification=inv.needs_manual_verification, read_quality=inv.read_quality)

@router.put("/{invoice_id}/extraction")
def update_invoice_extraction(invoice_id: str, updates: dict, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv: raise HTTPException(status_code=404)
    inv.raw_extracted_json = updates
    db.commit()
    return {"status": "updated"}

@router.post("/{invoice_id}/analyze")
async def analyze_invoice(invoice_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    result = await pipeline.analyze_invoice(invoice_id, db)
    return result

@router.get("/{invoice_id}")
def get_full_result(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv: raise HTTPException(status_code=404)
    return {"id": inv.id, "status": inv.status, "risk_level": inv.risk_level, "overall_score": inv.overall_score}

@router.get("/{invoice_id}/image/{page_id}")
def get_invoice_image(invoice_id: str, page_id: int):
    return {"url": f"/static/{invoice_id}_{page_id}.png"}

@router.get("")
def get_history(db: Session = Depends(get_db), limit: int = 50, offset: int = 0):
    invs = db.query(Invoice).limit(limit).offset(offset).all()
    return [{"id": i.id, "status": i.status} for i in invs]

@router.post("/compare")
def compare_invoices(invoice_ids: list[str], db: Session = Depends(get_db)):
    return {"comparison": "ok"}

@router.patch("/{invoice_id}/review")
def review_invoice(invoice_id: str, review_data: dict, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv: raise HTTPException(status_code=404)
    inv.review_status = review_data.get("status", inv.review_status)
    db.commit()
    return {"status": "reviewed"}

@router.get("/{invoice_id}/report.pdf")
def get_report(invoice_id: str):
    return {"status": "stub_pdf"}
