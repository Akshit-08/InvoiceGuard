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


pipeline = DocumentPipeline()
