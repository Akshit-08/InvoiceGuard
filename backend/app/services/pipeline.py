"""Document Processing Pipeline: orchestrates ingest -> read -> extract -> store."""

from fastapi import UploadFile
from sqlalchemy.orm import Session

from backend.app.core.events import event_bus
from backend.app.models.entities import (
    Invoice,
    InvoiceDocument,
    InvoiceItem,
    InvoiceToken,
)
from backend.app.schemas.contracts import ExtractionResponse, UploadResponse
from backend.app.services.extraction.chain import extractor_chain
from backend.app.services.ingest.storage import ingestion_service
from backend.app.services.reading.reader import auto_reader


class DocumentPipeline:
    async def process_upload(
        self,
        file: UploadFile,
        db: Session,
    ) -> tuple[UploadResponse, ExtractionResponse]:
        # Stage 1: Ingest (validate, store, render)
        ingest_res = await ingestion_service.ingest_upload(file)
        inv_id = ingest_res.invoice_id

        await event_bus.emit(
            invoice_id=inv_id,
            stage="ingest",
            status="completed",
            message=f"Uploaded and rendered {ingest_res.page_count} pages.",
            progress=0.33,
        )

        # Stage 2: Read (native PDF text layer or RapidOCR)
        pdf_path = ingest_res.file_path if ingest_res.is_pdf else None
        tokens, read_quality = auto_reader.read(pdf_path, ingest_res.page_image_paths)

        await event_bus.emit(
            invoice_id=inv_id,
            stage="read",
            status="completed",
            message=f"Read {len(tokens)} text tokens (quality: {read_quality:.2f}).",
            progress=0.66,
        )

        # Stage 3: Extract (Heuristic + Normalizer)
        extraction_res = extractor_chain.extract(tokens, inv_id, read_quality)

        await event_bus.emit(
            invoice_id=inv_id,
            stage="extract",
            status="completed",
            message="Extracted structured invoice entities and tables.",
            progress=1.0,
        )

        # Stage 4: Store in Database
        data = extraction_res.data
        inv_record = Invoice(
            id=inv_id,
            original_filename=ingest_res.original_filename,
            file_path=ingest_res.file_path,
            content_hash=ingest_res.content_hash,
            page_count=ingest_res.page_count,
            invoice_number=data.invoice_number.value,
            invoice_date=data.invoice_date.value,
            due_date=data.due_date.value if data.due_date else None,
            currency=data.currency.value or "INR",
            subtotal=data.subtotal.value,
            tax_total=data.tax.total.value,
            grand_total=data.grand_total.value,
            status="extracted",
            read_quality=read_quality,
            extraction_confidence=data.grand_total.conf,
            needs_manual_verification=extraction_res.needs_manual_verification,
            raw_extracted_json=data.model_dump(),
        )
        db.add(inv_record)

        # Add document page records
        for p_idx, p_path in enumerate(ingest_res.page_image_paths):
            doc_rec = InvoiceDocument(
                invoice_id=inv_id,
                page=p_idx,
                image_path=p_path,
                thumb_path=ingest_res.thumb_path if p_idx == 0 else None,
                width=0,
                height=0,
            )
            db.add(doc_rec)

        # Add tokens record
        tokens_json = [t.model_dump() for t in tokens]
        token_rec = InvoiceToken(
            invoice_id=inv_id,
            page=0,
            tokens_json=tokens_json,
        )
        db.add(token_rec)

        # Add line items
        for idx, item in enumerate(data.items):
            item_rec = InvoiceItem(
                invoice_id=inv_id,
                line_number=idx + 1,
                description=item.description.value or "",
                hsn_sac=item.hsn_sac.value if item.hsn_sac else None,
                quantity=item.quantity.value or 1.0,
                unit=item.unit.value if item.unit else None,
                unit_price=item.unit_price.value or 0.0,
                discount=item.discount.value if item.discount else None,
                tax_rate=item.tax_rate.value if item.tax_rate else None,
                tax_amount=item.tax_amount.value if item.tax_amount else None,
                line_total=item.line_total.value or 0.0,
            )
            db.add(item_rec)

        db.commit()

        upload_res = UploadResponse(
            invoice_id=inv_id,
            status="extracted",
            filename=ingest_res.original_filename,
            page_count=ingest_res.page_count,
            content_hash=ingest_res.content_hash,
        )

        return upload_res, extraction_res

    async def analyze_invoice(self, invoice_id: str, db: Session) -> dict:
        """Run all detection engines, fuse into a risk score, and save to DB."""
        from backend.app.models.entities import InvoiceFinding, RiskScoreRecord
        from backend.app.schemas.contracts import InvoiceData
        from backend.app.services.engines.bank import BankEngine
        from backend.app.services.engines.base import AnalysisContext
        from backend.app.services.engines.duplicate import DuplicateEngine
        from backend.app.services.engines.extraction import ExtractionConfidenceEngine
        from backend.app.services.engines.rules.financial import FinancialRulesEngine
        from backend.app.services.engines.rules.identifiers import IdentifiersRulesEngine
        from backend.app.services.engines.rules.tax_identity import TaxIdentityRulesEngine
        from backend.app.services.engines.vendor import VendorEngine
        from backend.app.services.engines.visual.forensics import VisualEngine
        from backend.app.services.fusion.fusion import fusion_engine

        inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not inv or not inv.raw_extracted_json:
            raise ValueError(f"Invoice {invoice_id} not found or not extracted.")

        data = InvoiceData.model_validate(inv.raw_extracted_json)

        # Load tokens if available (optional for rules)
        tokens = []
        # Populate vendor history and indices for ML engines
        vendor_history = []
        all_vendors = []
        vendor_accounts = []
        all_accounts = []
        duplicate_history = []
        embeddings = {}

        if inv.vendor_id:
            past_invs = db.query(Invoice).filter(Invoice.vendor_id == inv.vendor_id, Invoice.id != invoice_id).all()
            for pi in past_invs:
                if pi.raw_extracted_json:
                    vendor_history.append(pi.raw_extracted_json)

        from backend.app.models.entities import Vendor, VendorAccount
        vendors_db = db.query(Vendor).all()
        for v in vendors_db:
            all_vendors.append({"id": v.id, "name": v.name, "gstin": v.gstin})

        accounts_db = db.query(VendorAccount).all()
        for a in accounts_db:
            all_accounts.append({
                "account_hash": a.account_hash,
                "vendor_id": a.vendor_id,
                "vendor_name": a.vendor.name if a.vendor else "Unknown",
                "ifsc": a.ifsc
            })
            if a.vendor_id == inv.vendor_id:
                vendor_accounts.append({"account_hash": a.account_hash, "ifsc": a.ifsc})

        all_invoices = db.query(Invoice).all()
        for ci in all_invoices:
            if ci.raw_extracted_json:
                pi_data = ci.raw_extracted_json
                # Build canonical string
                vendor = pi_data.get("vendor", {}).get("name", {}).get("value", "").strip().lower()
                inv_num = pi_data.get("invoice_number", {}).get("value", "").strip().lower()
                date = pi_data.get("invoice_date", {}).get("value", "").strip().lower()
                total = str(pi_data.get("grand_total", {}).get("value", 0.0))
                items = sorted([str(i.get("description", {}).get("value", "")).strip().lower() for i in pi_data.get("items", [])])
                canonical_string = f"{vendor} | {inv_num} | {date} | {total} | {' | '.join(items)}"

                duplicate_history.append({
                    "id": ci.id,
                    "content_hash": ci.content_hash,
                    "phash": ci.phash,
                    "vendor_name": vendor,
                    "invoice_number": inv_num,
                    "invoice_date": date,
                    "grand_total": pi_data.get("grand_total", {}).get("value", 0.0),
                    "canonical_string": canonical_string,
                })

        indices = {
            "vendor_id": inv.vendor_id,
            "vendor_accounts": vendor_accounts,
            "all_accounts": all_accounts,
            "duplicate_history": duplicate_history,
            "embeddings": embeddings,
        }

        ctx = AnalysisContext(
            invoice_id=invoice_id,
            data=data,
            tokens=tokens,
            vendor_history=vendor_history,
            indices=indices,
            all_vendors=all_vendors,
            content_hash=inv.content_hash,
            phash=inv.phash,
        )

        engines = [
            FinancialRulesEngine(),
            TaxIdentityRulesEngine(),
            IdentifiersRulesEngine(),
            DuplicateEngine(),
            VendorEngine(),
            BankEngine(),
            VisualEngine(),
            ExtractionConfidenceEngine(),
        ]

        signals = []
        for engine in engines:
            sig = engine.analyze(ctx)
            signals.append(sig)

        # Fuse — pass extraction metadata so confidence band works correctly
        invoice_meta = {
            "grand_total": data.grand_total.value if data.grand_total else 0.0,
            "item_count": len(data.items),
            "extraction_confidence": inv.extraction_confidence or 0.0,
        }
        risk_result = fusion_engine.fuse(
            signals,
            invoice_meta=invoice_meta,
            extraction_confidence=float(inv.extraction_confidence or 0.0),
        )

        # Save findings
        db.query(InvoiceFinding).filter(InvoiceFinding.invoice_id == invoice_id).delete()
        for sig in signals:
            for f in sig.findings:
                finding_rec = InvoiceFinding(
                    invoice_id=invoice_id,
                    engine=f.engine,
                    category=f.category,
                    type=f.type,
                    severity=f.severity,
                    score=f.score,
                    confidence=f.confidence,
                    title=f.title,
                    summary=f.summary,
                    evidence_json=f.evidence,
                    field=f.field,
                    bbox_json=f.bbox,
                    recommended_action=f.recommended_action
                )
                db.add(finding_rec)

        # Save risk score
        db.query(RiskScoreRecord).filter(RiskScoreRecord.invoice_id == invoice_id).delete()
        risk_rec = RiskScoreRecord(
            invoice_id=invoice_id,
            overall_score=risk_result.overall_score,
            level=risk_result.level,
            probability=risk_result.probability,
            confidence=risk_result.confidence,
            baseline_score=risk_result.baseline_score,
            ml_score=risk_result.ml_score,
            signals_json=risk_result.signals,
            shap_json=risk_result.shap_top,
            escalations_json=risk_result.escalations,
            recommendation=risk_result.recommendation,
        )
        db.add(risk_rec)

        inv.status = "analyzed"
        inv.risk_level = risk_result.level
        inv.overall_score = risk_result.overall_score

        # Determine review status
        if risk_result.level in ("HIGH", "CRITICAL"):
            inv.review_status = "needs_review"

        db.commit()

        await event_bus.emit(
            invoice_id=invoice_id,
            stage="analyze",
            status="completed",
            message=f"Analysis complete. Score: {risk_result.overall_score} ({risk_result.level})",
            progress=1.0,
        )

        return risk_result.model_dump()


pipeline = DocumentPipeline()
