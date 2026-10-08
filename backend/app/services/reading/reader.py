"""Document Reading Service: native PDF text layer and RapidOCR readers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Tuple

import fitz  # PyMuPDF
from PIL import Image

from backend.app.schemas.contracts import Token


class BaseReader(ABC):
    @abstractmethod
    def read(
        self, pdf_path: Optional[str], page_image_paths: list[str]
    ) -> Tuple[list[Token], float]:
        """Read tokens from document. Returns (tokens, read_quality)."""
        pass


class PdfTextReader(BaseReader):
    """Extracts text tokens directly from digital PDF vector text layer with exact bounding boxes."""

    def read(
        self, pdf_path: Optional[str], page_image_paths: list[str]
    ) -> Tuple[list[Token], float]:
        if not pdf_path:
            return [], 0.0

        tokens: list[Token] = []
        doc = fitz.open(pdf_path)

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            pw = page.rect.width
            ph = page.rect.height
            if pw <= 0 or ph <= 0:
                continue

            # words format: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
            words = page.get_text("words")
            for w in words:
                text = str(w[4]).strip()
                if not text:
                    continue

                x0 = max(0.0, min(1.0, w[0] / pw))
                y0 = max(0.0, min(1.0, w[1] / ph))
                x1 = max(0.0, min(1.0, w[2] / pw))
                y1 = max(0.0, min(1.0, w[3] / ph))

                tokens.append(
                    Token(
                        text=text,
                        bbox=[round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                        page=page_idx,
                        conf=1.0,
                        source="pdf",
                    )
                )

        doc.close()
        read_quality = 1.0 if tokens else 0.0
        return tokens, read_quality


class RapidOcrReader(BaseReader):
    """OCR reader using RapidOCR (ONNX runtime) for scanned PDFs and raster images."""

    def __init__(self) -> None:
        self._engine = None

    def _get_engine(self):
        if self._engine is None:
            try:
                from rapidocr_onnxruntime import RapidOCR

                self._engine = RapidOCR()
            except Exception:
                self._engine = False
        return self._engine

    def read(
        self, pdf_path: Optional[str], page_image_paths: list[str]
    ) -> Tuple[list[Token], float]:
        tokens: list[Token] = []
        engine = self._get_engine()
        total_conf = 0.0
        token_count = 0

        for page_idx, img_path in enumerate(page_image_paths):
            with Image.open(img_path) as im:
                w, h = im.size

            if engine:
                try:
                    result, _ = engine(img_path)
                    if result:
                        for item in result:
                            # item: [box, text, score]
                            # box is [[x0,y0], [x1,y0], [x1,y1], [x0,y1]]
                            box = item[0]
                            text = str(item[1]).strip()
                            score = float(item[2])

                            xs = [pt[0] for pt in box]
                            ys = [pt[1] for pt in box]
                            x0 = max(0.0, min(1.0, min(xs) / w))
                            x1 = max(0.0, min(1.0, max(xs) / w))
                            y0 = max(0.0, min(1.0, min(ys) / h))
                            y1 = max(0.0, min(1.0, max(ys) / h))

                            # Split space-separated tokens in line for word-level precision
                            subwords = text.split()
                            if len(subwords) > 1:
                                char_width = (x1 - x0) / max(1, len(text))
                                cur_x = x0
                                for sw in subwords:
                                    sw_w = len(sw) * char_width
                                    tokens.append(
                                        Token(
                                            text=sw,
                                            bbox=[
                                                round(cur_x, 4),
                                                round(y0, 4),
                                                round(cur_x + sw_w, 4),
                                                round(y1, 4),
                                            ],
                                            page=page_idx,
                                            conf=round(score, 2),
                                            source="ocr",
                                        )
                                    )
                                    cur_x += (len(sw) + 1) * char_width
                            else:
                                tokens.append(
                                    Token(
                                        text=text,
                                        bbox=[
                                            round(x0, 4),
                                            round(y0, 4),
                                            round(x1, 4),
                                            round(y1, 4),
                                        ],
                                        page=page_idx,
                                        conf=round(score, 2),
                                        source="ocr",
                                    )
                                )

                            total_conf += score
                            token_count += 1
                except Exception:
                    pass

        avg_conf = (total_conf / max(1, token_count)) if token_count > 0 else 0.5
        return tokens, round(avg_conf, 2)


class AutoReader(BaseReader):
    """Automatically chooses PDF text layer reader if text layer exists (>= 30 words), else RapidOCR."""

    def __init__(self) -> None:
        self.pdf_reader = PdfTextReader()
        self.ocr_reader = RapidOcrReader()

    def read(
        self, pdf_path: Optional[str], page_image_paths: list[str]
    ) -> Tuple[list[Token], float]:
        if pdf_path:
            tokens, quality = self.pdf_reader.read(pdf_path, page_image_paths)
            if len(tokens) >= 30:
                return tokens, quality

        # Fallback to OCR for scans or raster-only PDFs
        return self.ocr_reader.read(pdf_path, page_image_paths)


auto_reader = AutoReader()
