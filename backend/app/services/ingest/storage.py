"""Document Ingestion Service: validation, safe storage, and page rendering."""

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
import numpy as np
from fastapi import HTTPException, UploadFile, status
from PIL import Image

from backend.app.config import settings
from backend.app.core.security import validate_file_upload


@dataclass
class IngestResult:
    invoice_id: str
    original_filename: str
    file_path: str
    content_hash: str
    page_count: int
    page_image_paths: list[str]
    thumb_path: str
    is_pdf: bool


def deskew_image_if_needed(image: Image.Image, max_angle_thresh: float = 0.5) -> Image.Image:
    """Light deskew using text bounding orientation if angle exceeds threshold."""
    try:
        import cv2

        np_img = np.array(image.convert("L"))
        # Threshold to get dark text on light background
        thresh = cv2.threshold(np_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 50:
            return image

        angle = cv2.minAreaRect(coords)[-1]
        # minAreaRect returns angle in [-90, 0)
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        if abs(angle) > max_angle_thresh and abs(angle) < 15.0:
            return image.rotate(angle, resample=Image.Resampling.BILINEAR, expand=False, fillcolor="white")
    except Exception:
        pass
    return image


class DocumentIngestionService:
    def __init__(self, upload_root: Optional[str] = None):
        self.upload_root = Path(upload_root or settings.UPLOAD_DIR)
        self.upload_root.mkdir(parents=True, exist_ok=True)

    async def ingest_upload(self, file: UploadFile) -> IngestResult:
        content = await file.read()
        sanitized_name, sha256 = validate_file_upload(file, content)

        invoice_id = str(uuid.uuid4())
        doc_dir = self.upload_root / invoice_id
        doc_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(sanitized_name).suffix.lower()
        original_path = doc_dir / f"original{ext}"

        with open(original_path, "wb") as f:
            f.write(content)

        page_paths: list[str] = []
        is_pdf = (ext == ".pdf")

        if is_pdf:
            # Render PDF pages with PyMuPDF
            try:
                doc = fitz.open(str(original_path))
                total_pages = len(doc)
                if total_pages > 10:
                    doc.close()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "EXCESSIVE_PAGES",
                            "message": f"Document has {total_pages} pages; maximum allowed is 10.",
                        },
                    )

                pages_to_process = min(total_pages, settings.MAX_PAGES_TO_PROCESS)
                for page_idx in range(pages_to_process):
                    page = doc[page_idx]
                    # 200 DPI: scale factor = 200 / 72.0
                    zoom = 200.0 / 72.0
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)

                    # Cap longest side to 2400 px
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    if max(img.width, img.height) > 2400:
                        scale = 2400.0 / max(img.width, img.height)
                        new_size = (int(img.width * scale), int(img.height * scale))
                        img = img.resize(new_size, Image.Resampling.LANCZOS)

                    img = deskew_image_if_needed(img)
                    page_path = doc_dir / f"page_{page_idx}.png"
                    img.save(page_path)
                    page_paths.append(str(page_path))

                doc.close()
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "PDF_RENDER_FAILED",
                        "message": f"Could not render PDF document pages: {str(e)}",
                    },
                )
        else:
            # Standalone image upload (PNG, JPG)
            try:
                img = Image.open(str(original_path)).convert("RGB")
                if max(img.width, img.height) > 2400:
                    scale = 2400.0 / max(img.width, img.height)
                    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
                img = deskew_image_if_needed(img)
                page_path = doc_dir / "page_0.png"
                img.save(page_path)
                page_paths.append(str(page_path))
                total_pages = 1
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "IMAGE_DECODE_FAILED",
                        "message": f"Could not decode image: {str(e)}",
                    },
                )

        # Generate 400px thumbnail from first page
        thumb_path = doc_dir / "thumb.png"
        first_page = Image.open(page_paths[0])
        thumb = first_page.copy()
        thumb.thumbnail((400, 560), Image.Resampling.LANCZOS)
        thumb.save(thumb_path)

        return IngestResult(
            invoice_id=invoice_id,
            original_filename=sanitized_name,
            file_path=str(original_path),
            content_hash=sha256,
            page_count=len(page_paths),
            page_image_paths=page_paths,
            thumb_path=str(thumb_path),
            is_pdf=is_pdf,
        )


ingestion_service = DocumentIngestionService()
