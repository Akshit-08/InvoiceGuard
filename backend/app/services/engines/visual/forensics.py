"""Visual Forensics Engine for InvoiceGuard.

Implements Blueprint section 8.7:
- PDF_EDITOR_PRODUCER
- PDF_MODIFIED_AFTER_CREATION
- PDF_INCREMENTAL_UPDATE
- FONT_MIX_IN_NUMERIC_FIELD
- COVER_UP_RECTANGLE
- REGION_STATISTICALLY_INCONSISTENT (ELA / Noise Residual)
"""

import os
import re
from datetime import datetime

import numpy as np
from PIL import Image, ImageChops, ImageEnhance

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


def parse_pdf_date(date_str: str) -> datetime | None:
    """Parse standard PDF date format (D:YYYYMMDDHHmmSSZ)."""
    if not date_str:
        return None
    match = re.match(r"D:(\d{14})", str(date_str).strip())
    if match:
        try:
            return datetime.strptime(match.group(1), "%Y%m%d%H%M%S")
        except ValueError:
            return None
    return None


class VisualEngine(BaseEngine):
    name = "visual"
    category = "visual"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("visual"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        findings: list[Finding] = []
        features = {}

        caveat = "Note: Visual anomalies can occur with legitimate edits, re-exports, or scanning artifacts."

        # 1. PDF-structure checks
        if context.pdf_path and os.path.exists(context.pdf_path):
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(context.pdf_path)

                # Metadata checks
                meta = doc.metadata or {}
                producer = str(meta.get("producer", "")).lower()
                creator = str(meta.get("creator", "")).lower()

                suspicious_editors = settings_service.get(
                    "visual.pdf_editors",
                    ["photoshop", "canva", "ilovepdf", "sejda", "smallpdf", "pdfescape", "illustrator", "gimp"]
                )

                for editor in suspicious_editors:
                    if editor in producer or editor in creator:
                        findings.append(self.create_finding(
                            finding_type="PDF_EDITOR_PRODUCER",
                            severity="high",
                            score=65.0,
                            confidence=0.85,
                            title="Suspicious PDF Editor Detected",
                            summary=f"The PDF metadata indicates it was created or modified using '{editor}', which is typically used for image editing rather than invoicing.",
                            expected="Standard financial software or print driver",
                            found=f"Producer: {producer}, Creator: {creator}",
                            difference=editor,
                            recommended_action=f"Inspect the invoice for manual manipulation. {caveat}"
                        ))
                        break

                # Modified after creation
                creation_dt = parse_pdf_date(meta.get("creationDate"))
                mod_dt = parse_pdf_date(meta.get("modDate"))
                if creation_dt and mod_dt:
                    diff_seconds = (mod_dt - creation_dt).total_seconds()
                    # Threshold: 24 hours (86400 s). ReportLab and many PDF
                    # generators record slightly different timestamps; flagging
                    # any gap > 1 h caused false positives on genuine invoices
                    # (ADR 006 root cause E). A 24 h gap is a meaningful signal.
                    if diff_seconds > 86400:
                        findings.append(self.create_finding(
                            finding_type="PDF_MODIFIED_AFTER_CREATION",
                            severity="medium",
                            score=45.0,
                            confidence=0.75,
                            title="PDF Modified After Creation",
                            summary=f"The document was modified {(diff_seconds / 3600):.1f} hours after its initial creation.",
                            expected="Modification date close to creation date",
                            found=f"Created: {creation_dt}, Modified: {mod_dt}",
                            difference=f"{diff_seconds} seconds gap",
                            recommended_action=f"Check if the document was altered post-generation. {caveat}"
                        ))

                # Incremental updates (multiple %%EOF)
                with open(context.pdf_path, "rb") as f:
                    content = f.read()
                    eof_count = content.count(b"%%EOF")
                    if eof_count > 1:
                        findings.append(self.create_finding(
                            finding_type="PDF_INCREMENTAL_UPDATE",
                            severity="medium",
                            score=40.0,
                            confidence=0.85,
                            title="Multiple PDF Incremental Updates",
                            summary=f"The file contains {eof_count} end-of-file markers, indicating it was saved/edited incrementally.",
                            expected="1 %%EOF marker for a clean export",
                            found=str(eof_count),
                            difference=f"{eof_count - 1} extra updates",
                            recommended_action=f"Verify if the document was signed or legitimately annotated. {caveat}"
                        ))

                # Page level structure checks
                for page_num in range(doc.page_count):
                    page = doc.load_page(page_num)

                    # FONT_MIX_IN_NUMERIC_FIELD and COVER_UP_RECTANGLE
                    text_dict = page.get_text("dict")
                    drawings = page.get_drawings()

                    blocks = text_dict.get("blocks", [])
                    for block in blocks:
                        if block.get("type") == 0:  # Text block
                            for line in block.get("lines", []):
                                fonts_in_line = set()
                                for span in line.get("spans", []):
                                    text = span.get("text", "").strip()
                                    if any(c.isdigit() for c in text):
                                        fonts_in_line.add(span.get("font", ""))

                                if len(fonts_in_line) > 1:
                                    findings.append(self.create_finding(
                                        finding_type="FONT_MIX_IN_NUMERIC_FIELD",
                                        severity="info",
                                        score=30.0,
                                        confidence=0.55,
                                        title="Inconsistent Fonts in Text Line",
                                        summary=f"A line on page {page_num+1} contains numeric data with mixed fonts ({', '.join(fonts_in_line)}). This can occur in genuine PDFs with bold/regular labels.",
                                        expected="Uniform font across a single line",
                                        found=f"Mixed fonts: {', '.join(fonts_in_line)}",
                                        difference="",
                                        recommended_action=f"Only escalate if combined with other high-severity indicators. {caveat}",
                                        bbox=line.get("bbox")
                                    ))
                                    break

                    # Simple cover up rectangle detection (filled shapes over text)
                    for draw in drawings:
                        if draw.get("fill") is not None and not draw.get("color"):
                            # It's a filled rectangle with no border, often used to hide text
                            rect = draw.get("rect")
                            # We would normally check if it overlaps any text block here
                            # For now, we just flag large white rectangles
                            if rect and (rect[2] - rect[0]) > 20 and (rect[3] - rect[1]) > 10:
                                # Pseudo-check for white (often [1, 1, 1])
                                if draw.get("fill") == [1, 1, 1]:
                                    findings.append(self.create_finding(
                                        finding_type="COVER_UP_RECTANGLE",
                                        severity="low",
                                        score=40.0,
                                        confidence=0.70,
                                        title="Opaque Shape Detected",
                                        summary=f"An opaque shape is drawn on page {page_num+1}, which might be hiding underlying text.",
                                        expected="No cover-up shapes",
                                        found="Filled white rectangle",
                                        difference="",
                                        recommended_action=f"Verify if text was redacted. {caveat}",
                                        bbox=list(rect)
                                    ))
                                    break

            except Exception:
                # If fitz fails, we just continue to pixel checks
                pass

        # 2. Pixel-level checks (ELA / Noise Residual)
        if context.page_images:
            for idx, img_path in enumerate(context.page_images):
                if not os.path.exists(img_path):
                    continue
                try:
                    img = Image.open(img_path).convert("RGB")

                    # Error Level Analysis (ELA)
                    # Resave image at 90% quality and find difference
                    temp_path = img_path + ".ela.jpg"
                    img.save(temp_path, "JPEG", quality=90)
                    resaved_img = Image.open(temp_path)

                    ela_diff = ImageChops.difference(img, resaved_img)
                    extrema = ela_diff.getextrema()
                    max_diff = max([ex[1] for ex in extrema])

                    if max_diff == 0:
                        max_diff = 1
                    scale = 255.0 / max_diff
                    ela_image = ImageEnhance.Brightness(ela_diff).enhance(scale)

                    # Calculate std of ELA values (rough proxy for regional inconsistency)
                    ela_array = np.array(ela_image)
                    ela_std = np.std(ela_array)

                    # If std is very high, it means some regions have much higher error (potential splice)
                    if ela_std > 25.0:
                        findings.append(self.create_finding(
                            finding_type="REGION_STATISTICALLY_INCONSISTENT",
                            severity="medium",
                            score=70.0,
                            confidence=0.85, # Capped
                            title="Inconsistent Compression Artifacts",
                            summary=f"Error Level Analysis (ELA) on page {idx+1} indicates regions with varying compression levels (std_dev = {ela_std:.1f}), a sign of potential image splicing.",
                            expected="Uniform compression artifacts",
                            found=f"ELA StdDev: {ela_std:.1f}",
                            difference="High variance",
                            recommended_action=f"Review the document for copy-pasted sections. {caveat}"
                        ))

                    # Clean up temp file
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception:
                    pass

        return SignalResult(
            name=self.name,
            score=self.aggregate_score(findings),
            confidence=0.85, # Overall capped confidence
            findings=findings,
            features=features
        )
