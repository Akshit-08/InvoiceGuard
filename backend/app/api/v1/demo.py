import json
import shutil
import sys
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from backend.app.deps import get_db
from backend.app.models.entities import (
    Invoice,
    InvoiceDocument,
    InvoiceFinding,
    InvoiceItem,
    InvoiceToken,
    RiskScoreRecord,
    Vendor,
    VendorAccount,
)
from backend.app.services.pipeline import pipeline

# Ensure we can import from scripts
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

router = APIRouter(prefix="/demo", tags=["demo"])

@router.post("/seed")
async def seed_demo(background_tasks: BackgroundTasks, db: Session = Depends(get_db), seed_invoices: bool = True):
    """Loads synthetic vendors and the 8 hero docs into the DB."""
    try:
        from scripts.seed_demo import build_hero_demo_samples
        expected_bands = build_hero_demo_samples("data/samples")

        from ml.synthetic.vendor_simulator import VendorSimulator
        vendor_sim = VendorSimulator(seed=101)
        vendors = vendor_sim.generate_vendors(10)

        for v in vendors:
            # Check if exists
            existing = db.query(Vendor).filter(Vendor.gstin == v.gstin).first()
            if not existing:
                vendor_rec = Vendor(
                    name=v.name,
                    gstin=v.gstin,
                    address=v.address,
                )
                db.add(vendor_rec)
                db.flush()
                if hasattr(v, "account_hash") and v.account_hash:
                    db.add(VendorAccount(
                        vendor_id=vendor_rec.id,
                        account_hash=v.account_hash,
                        last4=v.last4,
                        ifsc=v.ifsc,
                    ))
            else:
                has_acct = db.query(VendorAccount).filter(VendorAccount.vendor_id == existing.id).first()
                if not has_acct and hasattr(v, "account_hash") and v.account_hash:
                    db.add(VendorAccount(
                        vendor_id=existing.id,
                        account_hash=v.account_hash,
                        last4=v.last4,
                        ifsc=v.ifsc,
                    ))
        db.commit()

        # Upload and analyze the 8 hero samples if requested and not already in DB
        if seed_invoices:
            samples_dir = Path("data/samples")
            for key in expected_bands.keys():
                pdf_path = samples_dir / f"{key}.pdf"
                if not pdf_path.exists():
                    continue

                # Check if already seeded to make it idempotent
                existing_inv = db.query(Invoice).filter(Invoice.original_filename == f"{key}.pdf").first()
                if existing_inv:
                    continue

                with open(pdf_path, "rb") as f:
                    upload_file = UploadFile(
                        filename=f"{key}.pdf",
                        file=f,
                        headers=Headers({"content-type": "application/pdf"})
                    )
                    upload_res, _ = await pipeline.process_upload(upload_file, db)

                # Analyze immediately so it doesn't stay pending
                await pipeline.analyze_invoice(upload_res.invoice_id, db)

        return {"status": "success", "message": "Demo seeded successfully, generated 8 hero samples.", "samples": expected_bands}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset")
async def reset_demo(db: Session = Depends(get_db)):
    # Clear invoices and findings
    db.query(InvoiceFinding).delete()
    db.query(RiskScoreRecord).delete()
    db.query(InvoiceItem).delete()
    db.query(InvoiceToken).delete()
    db.query(InvoiceDocument).delete()
    db.query(Invoice).delete()
    db.query(VendorAccount).delete()
    db.query(Vendor).delete()
    db.commit()

    # Clean uploads directory
    uploads_dir = Path("data/uploads")
    if uploads_dir.exists():
        for item in uploads_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item)

    return {"status": "success", "message": "Demo reset successfully"}

@router.get("/samples")
async def list_samples():
    try:
        with open("data/samples/expected.json", "r") as f:
            data = json.load(f)

        samples = []
        for key, expected in data.items():
            samples.append({
                "key": key,
                "title": key.replace("_", " ").title(),
                "expected_level": expected,
                "thumbnail": f"/api/v1/demo/samples/{key}/thumb"
            })
        return samples
    except Exception:
        return []

@router.get("/samples/{key}/thumb")
async def get_sample_thumb(key: str):
    from fastapi.responses import FileResponse
    thumb_path = Path(f"data/samples/{key}_thumb.png")
    if thumb_path.exists():
        return FileResponse(str(thumb_path), media_type="image/png")
    # Fallback to pdf
    pdf_path = Path(f"data/samples/{key}.pdf")
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Sample not found")
    return FileResponse(str(pdf_path), media_type="application/pdf")

@router.post("/samples/{key}/run")
async def run_demo_sample(
    key: str,
    background_tasks: BackgroundTasks,
    analyze: bool = Query(True),
    db: Session = Depends(get_db)
):
    pdf_path = Path(f"data/samples/{key}.pdf")
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Sample not found")

    with open(pdf_path, "rb") as f:
        upload_file = UploadFile(
            filename=f"{key}.pdf",
            file=f,
            headers=Headers({"content-type": "application/pdf"})
        )
        upload_res, _ = await pipeline.process_upload(upload_file, db)

    invoice_id = upload_res.invoice_id

    if analyze:
        async def run_analyze_task(inv_id: str):
            from backend.app.core.db import SessionLocal
            with SessionLocal() as db_session:
                try:
                    await pipeline.analyze_invoice(inv_id, db_session)
                except Exception as e:
                    from backend.app.core.events import event_bus
                    inv_record = db_session.query(Invoice).filter(Invoice.id == inv_id).first()
                    if inv_record:
                        inv_record.status = "failed"
                        db_session.commit()
                    await event_bus.emit(inv_id, "analyze", "failed", str(e), 1.0)

        background_tasks.add_task(run_analyze_task, invoice_id)

    return {"invoice_id": invoice_id}
