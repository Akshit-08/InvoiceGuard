"""Base engine interface and shared AnalysisContext for InvoiceGuard."""

import uuid
from abc import ABC, abstractmethod
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.contracts import Finding, InvoiceData, SignalResult, Token


class AnalysisContext(BaseModel):
    """Shared contextual state provided to all detection engines."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    invoice_id: str
    data: InvoiceData
    tokens: list[Token] = Field(default_factory=list)
    page_images: list[str] = Field(
        default_factory=list, description="Absolute paths to rendered PNG page images"
    )
    pdf_path: Optional[str] = Field(
        default=None, description="Absolute path to original PDF file if available"
    )
    vendor_history: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Historical invoice records from the same vendor",
    )
    settings: dict[str, Any] = Field(
        default_factory=dict, description="Resolved settings and tolerances"
    )
    indices: dict[str, Any] = Field(
        default_factory=dict, description="Shared lookup indices (vector, phash, etc.)"
    )
    all_vendors: list[dict[str, Any]] = Field(
        default_factory=list, description="Cross-vendor directory for lookalike & sharing checks"
    )
    content_hash: Optional[str] = None
    phash: Optional[str] = None


class BaseEngine(ABC):
    """Abstract base class for all InvoiceGuard anomaly detection engines."""

    name: str = "base"
    category: Literal["rule", "statistical", "ml", "visual"] = "rule"

    @abstractmethod
    def analyze(self, context: AnalysisContext) -> SignalResult:
        """Run engine analysis against the provided context and return SignalResult."""
        pass

    def create_finding(
        self,
        *,
        finding_type: str,
        severity: Literal["info", "low", "medium", "high", "critical"],
        score: float,
        confidence: float,
        title: str,
        summary: str,
        expected: Any,
        found: Any,
        difference: Any,
        recommended_action: str,
        field: Optional[str] = None,
        bbox: Optional[list[float]] = None,
        related_invoice_ids: Optional[list[str]] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> Finding:
        """Helper to create a strictly compliant Finding object."""
        # Ensure bounding boxes are valid normalized [x0, y0, x1, y1] in [0, 1]
        valid_bbox: Optional[list[float]] = None
        if bbox is not None and len(bbox) == 4:
            valid_bbox = [
                max(0.0, min(1.0, float(bbox[0]))),
                max(0.0, min(1.0, float(bbox[1]))),
                max(0.0, min(1.0, float(bbox[2]))),
                max(0.0, min(1.0, float(bbox[3]))),
            ]

        evidence_payload: dict[str, Any] = {
            "expected": expected,
            "found": found,
            "difference": difference,
        }
        if details:
            evidence_payload["details"] = details

        return Finding(
            id=str(uuid.uuid4()),
            engine=self.name,
            category=self.category,
            type=finding_type,
            severity=severity,
            score=max(0.0, min(100.0, float(score))),
            confidence=max(0.0, min(1.0, float(confidence))),
            title=title,
            summary=summary,
            evidence=evidence_payload,
            field=field,
            bbox=valid_bbox,
            related_invoice_ids=related_invoice_ids or [],
            recommended_action=recommended_action,
        )

    def aggregate_score(self, findings: list[Finding]) -> float:
        """Aggregate finding scores into a 0-100 engine signal score.

        Uses smooth saturation: 1 - prod(1 - score/100) or max-weighted bounded aggregation.
        """
        if not findings:
            return 0.0

        # Severity weights
        severity_multipliers = {
            "info": 0.0,
            "low": 0.3,
            "medium": 0.6,
            "high": 0.85,
            "critical": 1.0,
        }

        # Multi-finding probabilistic union: P(any anomaly) = 1 - prod(1 - P_i)
        complement_prob = 1.0
        for f in findings:
            weight = severity_multipliers.get(f.severity, 0.5)
            effective_p = (f.score / 100.0) * weight * f.confidence
            complement_prob *= (1.0 - max(0.0, min(0.99, effective_p)))

        final_score = (1.0 - complement_prob) * 100.0
        return round(max(0.0, min(100.0, final_score)), 1)
