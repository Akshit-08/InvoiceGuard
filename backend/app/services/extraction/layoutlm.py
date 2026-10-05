"""LayoutLMv3 Neural Token Classification Extractor for Invoices.

Loads fine-tuned weights from Hugging Face Hub (or local directory)
and performs multimodal inference combining OCR tokens, 2D bboxes, and page images.
Provides graceful fallback if transformers or model weights are unavailable.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from backend.app.config import settings
from backend.app.schemas.contracts import Field, InvoiceData, Token

logger = logging.getLogger(__name__)

# Check if transformers is importable
HAS_TRANSFORMERS = False
try:
    import torch
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor
    HAS_TRANSFORMERS = True
except ImportError:
    torch = None
    LayoutLMv3ForTokenClassification = None
    LayoutLMv3Processor = None


class LayoutLMv3Extractor:
    """Multimodal LayoutLMv3 extractor for invoice key information extraction."""

    def __init__(
        self,
        model_id: Optional[str] = None,
        hf_token: Optional[str] = None,
        label_map_path: Optional[str] = None,
    ):
        self.model_id = model_id or settings.LAYOUTLM_MODEL_ID or os.getenv("LAYOUTLM_MODEL_ID", "")
        self.hf_token = hf_token or settings.HF_TOKEN or os.getenv("HF_TOKEN", "")
        self.is_available = False
        self.processor = None
        self.model = None
        self.id2label = {}
        self.label_map: Dict[str, str] = {}

        if not HAS_TRANSFORMERS:
            logger.info("transformers or torch not available; LayoutLMv3 extractor disabled.")
            return

        if not self.model_id:
            logger.info("LAYOUTLM_MODEL_ID not configured; LayoutLMv3 extractor disabled.")
            return

        # Load label mapping
        map_path = Path(label_map_path or "ml/layoutlm/label_map.json")
        if map_path.exists():
            try:
                with open(map_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    self.label_map = cfg.get("dataset_to_invoiceguard", {})
            except Exception as e:
                logger.warning(f"Failed to load LayoutLMv3 label map: {e}")

        # Attempt to load model and processor
        try:
            self.device = torch.device("cpu")
            logger.info(f"Loading LayoutLMv3 model from {self.model_id}...")
            self.processor = LayoutLMv3Processor.from_pretrained(
                self.model_id,
                apply_ocr=False,
                token=self.hf_token if self.hf_token else None,
            )
            self.model = LayoutLMv3ForTokenClassification.from_pretrained(
                self.model_id,
                token=self.hf_token if self.hf_token else None,
            )
            self.model.to(self.device)
            self.model.eval()
            self.id2label = getattr(self.model.config, "id2label", {})
            self.is_available = True
            logger.info(f"LayoutLMv3 model successfully loaded from {self.model_id}")
        except Exception as e:
            logger.warning(
                f"Could not initialize LayoutLMv3 model ({self.model_id}): {e}. "
                "Extraction chain will continue with HeuristicExtractor."
            )
            self.is_available = False

    def extract(
        self,
        tokens: List[Token],
        page_image: Optional[Image.Image] = None,
        confidence_threshold: float = 0.40,
    ) -> Dict[str, Dict[str, Any]]:
        """Run token classification inference on OCR tokens.

        Returns a dictionary of extracted fields keyed by canonical field name:
        {
            "invoice_number": {"value": str, "conf": float, "bbox": [x0, y0, x1, y1], "source": "layoutlmv3"},
            ...
        }
        """
        if not self.is_available or not tokens or self.model is None or self.processor is None:
            return {}

        try:
            # 1. Prepare word strings and boxes in [0, 1000] scale for LayoutLMv3
            words: List[str] = []
            boxes_1000: List[List[int]] = []

            for tok in tokens:
                w = tok.text.strip()
                if not w:
                    continue
                words.append(w)
                b = tok.bbox
                b_1000 = [
                    int(max(0.0, min(1.0, b[0])) * 1000),
                    int(max(0.0, min(1.0, b[1])) * 1000),
                    int(max(0.0, min(1.0, b[2])) * 1000),
                    int(max(0.0, min(1.0, b[3])) * 1000),
                ]
                boxes_1000.append(b_1000)

            if not words:
                return {}

            # Fallback blank image if page_image is None
            if page_image is None:
                img = Image.new("RGB", (1000, 1000), color=(255, 255, 255))
            else:
                img = page_image.convert("RGB")

            # 2. Tokenize and encode
            encoding = self.processor(
                img,
                words,
                boxes=boxes_1000,
                truncation=True,
                padding="max_length",
                max_length=512,
                return_tensors="pt",
            )

            input_ids = encoding["input_ids"].to(self.device)
            attention_mask = encoding["attention_mask"].to(self.device)
            bbox = encoding["bbox"].to(self.device)
            pixel_values = encoding["pixel_values"].to(self.device)

            with torch.no_grad():
                outputs = self.model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    bbox=bbox,
                    pixel_values=pixel_values,
                )

            probs = torch.softmax(outputs.logits.squeeze(0), dim=-1)
            pred_scores, pred_ids = torch.max(probs, dim=-1)
            word_ids = encoding.word_ids(batch_index=0)

            entities: List[Dict[str, Any]] = []
            current_entity: Optional[Dict[str, Any]] = None

            for idx, word_idx in enumerate(word_ids):
                if word_idx is None:
                    continue
                if idx > 0 and word_ids[idx - 1] == word_idx:
                    continue

                tag = self.id2label.get(pred_ids[idx].item(), "O")
                score = float(pred_scores[idx].item())
                word_str = words[word_idx]
                box = boxes_1000[word_idx]

                if tag.startswith("B-"):
                    if current_entity:
                        entities.append(current_entity)
                    raw_label = tag[2:]
                    current_entity = {
                        "raw_label": raw_label,
                        "tokens": [word_str],
                        "boxes": [box],
                        "scores": [score],
                    }
                elif tag.startswith("I-") and current_entity:
                    raw_label = tag[2:]
                    if raw_label == current_entity["raw_label"]:
                        current_entity["tokens"].append(word_str)
                        current_entity["boxes"].append(box)
                        current_entity["scores"].append(score)
                    else:
                        entities.append(current_entity)
                        current_entity = {
                            "raw_label": raw_label,
                            "tokens": [word_str],
                            "boxes": [box],
                            "scores": [score],
                        }
                else:
                    if current_entity:
                        entities.append(current_entity)
                        current_entity = None

            if current_entity:
                entities.append(current_entity)

            results: Dict[str, Dict[str, Any]] = {}
            for ent in entities:
                raw_label = ent["raw_label"]
                canonical_name = self.label_map.get(raw_label, raw_label.lower())
                if not canonical_name:
                    continue

                avg_score = sum(ent["scores"]) / len(ent["scores"])
                if avg_score < confidence_threshold:
                    continue

                field_text = " ".join(ent["tokens"]).strip()
                # Union box in normalized [0.0, 1.0] scale
                union_box = [
                    round(min(b[0] for b in ent["boxes"]) / 1000.0, 4),
                    round(min(b[1] for b in ent["boxes"]) / 1000.0, 4),
                    round(max(b[2] for b in ent["boxes"]) / 1000.0, 4),
                    round(max(b[3] for b in ent["boxes"]) / 1000.0, 4),
                ]

                if canonical_name not in results or avg_score > results[canonical_name]["conf"]:
                    results[canonical_name] = {
                        "value": field_text,
                        "conf": round(avg_score, 3),
                        "bbox": union_box,
                        "source": "layoutlmv3",
                    }

            return results

        except Exception as e:
            logger.warning(f"LayoutLMv3 inference error: {e}")
            return {}

    def merge_into_invoice_data(
        self, invoice_data: InvoiceData, layoutlm_results: Dict[str, Dict[str, Any]]
    ) -> InvoiceData:
        """Merge LayoutLMv3 predictions into InvoiceData where LayoutLMv3 has higher confidence."""
        if not layoutlm_results:
            return invoice_data

        # Map canonical field names to InvoiceData attributes
        if "invoice_number" in layoutlm_results:
            res = layoutlm_results["invoice_number"]
            if res["conf"] > invoice_data.invoice_number.conf or not invoice_data.invoice_number.value:
                invoice_data.invoice_number = Field(
                    value=str(res["value"]),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "seller" in layoutlm_results or "vendor_name" in layoutlm_results:
            res = layoutlm_results.get("seller") or layoutlm_results.get("vendor_name")
            if res and (res["conf"] > invoice_data.vendor.name.conf or not invoice_data.vendor.name.value):
                invoice_data.vendor.name = Field(
                    value=str(res["value"]),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "client" in layoutlm_results or "buyer_name" in layoutlm_results:
            res = layoutlm_results.get("client") or layoutlm_results.get("buyer_name")
            if res and (res["conf"] > invoice_data.buyer.name.conf or not invoice_data.buyer.name.value):
                invoice_data.buyer.name = Field(
                    value=str(res["value"]),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "seller_tax_id" in layoutlm_results:
            res = layoutlm_results["seller_tax_id"]
            if res["conf"] > invoice_data.vendor.gstin.conf or not invoice_data.vendor.gstin.value:
                invoice_data.vendor.gstin = Field(
                    value=str(res["value"]).upper(),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "iban" in layoutlm_results:
            res = layoutlm_results["iban"]
            if res["conf"] > invoice_data.bank.account_number.conf or not invoice_data.bank.account_number.value:
                invoice_data.bank.account_number = Field(
                    value=str(res["value"]),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "invoice_date" in layoutlm_results:
            res = layoutlm_results["invoice_date"]
            if res["conf"] > invoice_data.invoice_date.conf or not invoice_data.invoice_date.value:
                invoice_data.invoice_date = Field(
                    value=str(res["value"]),
                    raw=str(res["value"]),
                    conf=res["conf"],
                    source="layoutlmv3",
                    bbox=res["bbox"],
                    page=1,
                )

        if "subtotal" in layoutlm_results:
            res = layoutlm_results["subtotal"]
            try:
                val = float(str(res["value"]).replace(",", "").replace("$", "").replace("₹", "").strip())
                if res["conf"] > invoice_data.subtotal.conf or invoice_data.subtotal.value == 0.0:
                    invoice_data.subtotal = Field(
                        value=val,
                        raw=str(res["value"]),
                        conf=res["conf"],
                        source="layoutlmv3",
                        bbox=res["bbox"],
                        page=1,
                    )
            except ValueError:
                pass

        if "total_vat" in layoutlm_results:
            res = layoutlm_results["total_vat"]
            try:
                val = float(str(res["value"]).replace(",", "").replace("$", "").replace("₹", "").strip())
                if res["conf"] > invoice_data.tax.total.conf or invoice_data.tax.total.value == 0.0:
                    invoice_data.tax.total = Field(
                        value=val,
                        raw=str(res["value"]),
                        conf=res["conf"],
                        source="layoutlmv3",
                        bbox=res["bbox"],
                        page=1,
                    )
            except ValueError:
                pass

        if "total_gross_worth" in layoutlm_results:
            res = layoutlm_results["total_gross_worth"]
            try:
                val = float(str(res["value"]).replace(",", "").replace("$", "").replace("₹", "").strip())
                if res["conf"] > invoice_data.grand_total.conf or invoice_data.grand_total.value == 0.0:
                    invoice_data.grand_total = Field(
                        value=val,
                        raw=str(res["value"]),
                        conf=res["conf"],
                        source="layoutlmv3",
                        bbox=res["bbox"],
                        page=1,
                    )
            except ValueError:
                pass

        return invoice_data
