"""Extractor Chain and Validation Report Generator.

Orchestrates HeuristicExtractor -> LayoutLMv3 -> LLM with confidence-based
merging and verification auditing per Blueprint section 7.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from backend.app.config import settings
from backend.app.schemas.contracts import ExtractionResponse, InvoiceData, Token
from backend.app.services.extraction.heuristic import heuristic_extractor
from backend.app.services.extraction.layoutlm import LayoutLMv3Extractor


class BaseExtractor(ABC):
    @abstractmethod
    def extract(self, tokens: list[Token], doc_context: Optional[dict[str, Any]] = None) -> InvoiceData:
        pass


class LLMExtractor(BaseExtractor):
    """Optional LLM Extractor with strict JSON schema output behind env flag."""

    def __init__(self):
        self.is_enabled = bool(settings.EXTRACTOR_LLM and settings.LLM_API_KEY)

    def extract(self, tokens: list[Token], doc_context: Optional[dict[str, Any]] = None) -> InvoiceData:
        # Stub: calls external LLM provider if configured
        return InvoiceData()


class ExtractorChain:
    """Chains multiple extraction strategies and merges by confidence."""

    def __init__(self):
        self.heuristic = heuristic_extractor
        self.layoutlm = LayoutLMv3Extractor()
        self.llm = LLMExtractor()

    def extract(
        self, tokens: list[Token], invoice_id: str, read_quality: float = 1.0
    ) -> ExtractionResponse:
        # 1. Primary: Run Heuristic extractor
        invoice_data = self.heuristic.extract(tokens)

        # 2. Secondary: If LayoutLMv3 is enabled and model loaded, fill/override fields by confidence
        if self.layoutlm.is_available:
            layoutlm_results = self.layoutlm.extract(tokens)
            invoice_data = self.layoutlm.merge_into_invoice_data(invoice_data, layoutlm_results)

        # 3. Compute per-field confidence report and audit critical fields
        confidences: Dict[str, float] = {}
        missing_critical_fields: list[str] = []

        critical_checks = [
            ("invoice_number", invoice_data.invoice_number),
            ("vendor.name", invoice_data.vendor.name),
            ("invoice_date", invoice_data.invoice_date),
            ("grand_total", invoice_data.grand_total),
        ]

        for field_name, field_obj in critical_checks:
            val = field_obj.value
            conf = field_obj.conf
            confidences[field_name] = round(conf, 2)
            if val is None or val == "" or val == 0.0 or conf < 0.6:
                missing_critical_fields.append(field_name)

        # Additional non-critical field confidences
        confidences["vendor.gstin"] = round(invoice_data.vendor.gstin.conf, 2)
        confidences["subtotal"] = round(invoice_data.subtotal.conf, 2)
        confidences["tax.total"] = round(invoice_data.tax.total.conf, 2)
        if invoice_data.buyer.name.value:
            confidences["buyer.name"] = round(invoice_data.buyer.name.conf, 2)

        needs_manual = bool(missing_critical_fields or read_quality < 0.6)

        return ExtractionResponse(
            invoice_id=invoice_id,
            data=invoice_data,
            confidences=confidences,
            missing_critical_fields=missing_critical_fields,
            needs_manual_verification=needs_manual,
            read_quality=read_quality,
        )


extractor_chain = ExtractorChain()
