from typing import List
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status, BackgroundTasks
from sqlalchemy.orm import Session
import uuid

from backend.app.deps import get_db
from backend.app.services.pipeline import pipeline

router = APIRouter(prefix="/batch", tags=["batch"])

# In-memory progress tracking for simplicity, or we could use the DB.
# For production, DB or Redis is better.
BATCH_STATUS = {}

@router.post("/upload")
async def batch_upload(
    files: List[UploadFile],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Batch upload multiple invoices (max 20). Returns a batch ID for polling."""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files allowed per batch.")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    batch_id = str(uuid.uuid4())
    
    BATCH_STATUS[batch_id] = {
        "status": "processing",
        "total": len(files),
        "completed": 0,
        "failed": 0,
        "results": []
    }

    async def process_batch(b_id: str, uploaded_files: List[UploadFile]):
        from backend.app.core.db import SessionLocal
        
        for file in uploaded_files:
            try:
                # We need a new session per file or manage it carefully
                with SessionLocal() as db_session:
                    # 1. Process Upload
                    upload_res, _ = await pipeline.process_upload(file, db_session)
                    inv_id = upload_res.invoice_id
                    
                    # 2. Analyze
                    result = await pipeline.analyze_invoice(inv_id, db_session)
                    
                    BATCH_STATUS[b_id]["results"].append({
                        "filename": file.filename,
                        "invoice_id": inv_id,
                        "status": "success",
                        "risk_level": result["risk"]["level"] if result.get("risk") else "UNKNOWN",
                        "overall_score": result["risk"]["overall_score"] if result.get("risk") else 0.0
                    })
                    BATCH_STATUS[b_id]["completed"] += 1
            except Exception as e:
                BATCH_STATUS[b_id]["results"].append({
                    "filename": file.filename,
                    "status": "failed",
                    "error": str(e)
                })
                BATCH_STATUS[b_id]["failed"] += 1
                BATCH_STATUS[b_id]["completed"] += 1

        BATCH_STATUS[b_id]["status"] = "completed"

    background_tasks.add_task(process_batch, batch_id, files)
    
    return {"batch_id": batch_id, "message": f"Started processing {len(files)} files."}

@router.get("/{batch_id}/status")
def get_batch_status(batch_id: str):
    """Poll batch processing status."""
    if batch_id not in BATCH_STATUS:
        raise HTTPException(status_code=404, detail="Batch ID not found.")
    return BATCH_STATUS[batch_id]
