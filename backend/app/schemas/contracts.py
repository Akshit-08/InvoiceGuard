"""Pydantic v2 Data Contracts for InvoiceGuard.

Frozen core schemas defining tokens, fields, structured invoice data,
anomaly findings, detection signals, and explainable risk fusion outputs.
"""

from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import BaseModel
from pydantic import Field as PydanticField

T = TypeVar("T")


class Token(BaseModel):
    """Normalized token extracted from PDF text layer or OCR engine."""

    text: str = PydanticField(..., description="Extracted textual content")
    bbox: list[float] = PydanticField(
        ...,
        description="Normalized bounding box [x0, y0, x1, y1] on [0, 1] relative coordinates",
    )
    page: int = PydanticField(0, description="0-indexed page number")
    conf: float = PydanticField(1.0, ge=0.0, le=1.0, description="Confidence score 0.0 - 1.0")
    source: Literal["pdf", "ocr"] = PydanticField(
        "pdf", description="Source reader: native PDF text layer or OCR"
    )


class Field(BaseModel, Generic[T]):
    """Generic wrapper for any extracted entity or scalar field."""

    value: Optional[T] = PydanticField(None, description="Typed parsed value")
    raw: Optional[str] = PydanticField(None, description="Original unparsed string extracted")
    conf: float = PydanticField(1.0, ge=0.0, le=1.0, description="Extraction confidence score")
    source: str = PydanticField(
        "heuristic", description="Extraction source (heuristic, layoutlmv3, llm, user_edit)"
    )
    bbox: Optional[list[float]] = PydanticField(
        None, description="Normalized bounding box [x0, y0, x1, y1] (0 to 1)"
    )
    page: Optional[int] = PydanticField(0, description="0-indexed page number")


class VendorParty(BaseModel):
    """Vendor identity and contact entities."""

    name: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    gstin: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    pan: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    address: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    email: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    phone: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))


class BuyerParty(BaseModel):
    """Buyer/Customer identity and contact entities."""

    name: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    gstin: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    address: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))


class LineItem(BaseModel):
    """Individual invoice item line."""

    description: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    hsn_sac: Optional[Field[str]] = None
    quantity: Field[float] = PydanticField(default_factory=lambda: Field[float](value=1.0))
    unit: Optional[Field[str]] = None
    unit_price: Field[float] = PydanticField(default_factory=lambda: Field[float](value=0.0))
    discount: Optional[Field[float]] = None
    tax_rate: Optional[Field[float]] = None
    tax_amount: Optional[Field[float]] = None
    line_total: Field[float] = PydanticField(default_factory=lambda: Field[float](value=0.0))


class TaxDetail(BaseModel):
    """Tax breakdown components (GST)."""

    cgst: Optional[Field[float]] = None
    sgst: Optional[Field[float]] = None
    igst: Optional[Field[float]] = None
    other: Optional[Field[float]] = None
    total: Field[float] = PydanticField(default_factory=lambda: Field[float](value=0.0))
    rate: Optional[Field[float]] = None


class PaymentDetail(BaseModel):
    """Banking and remittance details."""

    bank_name: Optional[Field[str]] = None
    account_number: Optional[Field[str]] = None
    ifsc: Optional[Field[str]] = None
    upi: Optional[Field[str]] = None
    payment_terms: Optional[Field[str]] = None


class InvoiceData(BaseModel):
    """Fully structured invoice contract per Blueprint section 6."""

    vendor: VendorParty = PydanticField(default_factory=VendorParty)
    buyer: BuyerParty = PydanticField(default_factory=BuyerParty)
    invoice_number: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    invoice_date: Field[str] = PydanticField(default_factory=lambda: Field[str](value=""))
    due_date: Optional[Field[str]] = None
    po_number: Optional[Field[str]] = None
    currency: Field[str] = PydanticField(default_factory=lambda: Field[str](value="INR"))
    items: list[LineItem] = PydanticField(default_factory=list)
    subtotal: Field[float] = PydanticField(default_factory=lambda: Field[float](value=0.0))
    discount_total: Optional[Field[float]] = None
    shipping: Optional[Field[float]] = None
    tax: TaxDetail = PydanticField(default_factory=TaxDetail)
    grand_total: Field[float] = PydanticField(default_factory=lambda: Field[float](value=0.0))
    amount_in_words: Optional[Field[str]] = None
    payment: PaymentDetail = PydanticField(default_factory=PaymentDetail)


class Finding(BaseModel):
    """Individual anomaly or risk finding flagged by a detection engine."""

    id: str = PydanticField(..., description="Unique finding ID")
    engine: str = PydanticField(..., description="Engine name e.g. financial, tax_identity")
    category: Literal["rule", "statistical", "ml", "visual"] = PydanticField(
        ..., description="Methodology category"
    )
    type: str = PydanticField(..., description="Stable code e.g. LINE_TOTAL_MISMATCH")
    severity: Literal["info", "low", "medium", "high", "critical"] = PydanticField(
        ..., description="Risk severity tier"
    )
    score: float = PydanticField(..., ge=0.0, le=100.0, description="Risk impact score (0-100)")
    confidence: float = PydanticField(..., ge=0.0, le=1.0, description="Finding confidence (0-1)")
    title: str = PydanticField(..., description="Concise human-readable finding title")
    summary: str = PydanticField(..., description="Detailed explanation of the discrepancy")
    evidence: dict[str, Any] = PydanticField(
        default_factory=dict,
        description="Evidence payload: expected, found, difference, details, history_refs",
    )
    field: Optional[str] = PydanticField(None, description="Related invoice field if localized")
    bbox: Optional[list[float]] = PydanticField(
        None, description="Normalized bounding box [x0, y0, x1, y1] (0 to 1) if localized"
    )
    related_invoice_ids: list[str] = PydanticField(
        default_factory=list, description="IDs of related invoices e.g. duplicates"
    )
    recommended_action: str = PydanticField(
        ..., description="Actionable recommendation for human reviewer"
    )


class SignalResult(BaseModel):
    """Aggregate output from an individual detection engine."""

    name: str = PydanticField(..., description="Engine identifier e.g. financial, vendor")
    score: float = PydanticField(..., ge=0.0, le=100.0, description="Engine risk score (0-100)")
    confidence: float = PydanticField(..., ge=0.0, le=1.0, description="Engine confidence (0-1)")
    findings: list[Finding] = PydanticField(
        default_factory=list, description="List of findings generated by engine"
    )
    features: dict[str, Any] = PydanticField(
        default_factory=dict, description="Engineered features used for ML risk fusion"
    )


class RiskResult(BaseModel):
    """Fused multimodal risk decision per Blueprint section 6 & 9."""

    overall_score: float = PydanticField(
        ..., ge=0.0, le=100.0, description="Final fused risk score (0-100)"
    )
    level: Literal["low", "medium", "high", "critical"] = PydanticField(
        ..., description="Risk tier"
    )
    level_thresholds: dict[str, float] = PydanticField(
        default_factory=lambda: {"low": 30.0, "medium": 60.0, "high": 80.0},
        description="Threshold boundaries",
    )
    probability: float = PydanticField(..., ge=0.0, le=1.0, description="Calibrated risk probability")
    signals: dict[str, float] = PydanticField(
        default_factory=dict, description="Per-engine risk scores"
    )
    confidence: float = PydanticField(..., ge=0.0, le=1.0, description="Overall decision confidence")
    baseline_score: float = PydanticField(..., ge=0.0, le=100.0, description="Noisy-OR baseline score")
    ml_score: float = PydanticField(..., ge=0.0, le=100.0, description="XGBoost ML risk score")
    shap_top: list[dict[str, Any]] = PydanticField(
        default_factory=list, description="Top SHAP feature contributions"
    )
    escalations: list[str] = PydanticField(
        default_factory=list, description="Triggered escalation rule names"
    )
    recommendation: str = PydanticField(..., description="Overall action recommendation")
    disclaimer: str = PydanticField(
        default="InvoiceGuard flags anomalies for human review. It does not determine fraud.",
        description="Mandatory legal & product language notice",
    )


# API Models
class ErrorDetails(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    error: ErrorDetails


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    environment: str = "development"
    optional_models: dict[str, bool] = PydanticField(
        default_factory=lambda: {
            "layoutlmv3": False,
            "rapidocr": True,
            "fastembed": False,
            "xgboost": True,
            "shap": True,
            "llm": False,
        }
    )


class UploadResponse(BaseModel):
    invoice_id: str
    status: str
    filename: str
    page_count: int
    content_hash: str


class ExtractionResponse(BaseModel):
    invoice_id: str
    data: InvoiceData
    confidences: dict[str, float]
    missing_critical_fields: list[str]
    needs_manual_verification: bool
    read_quality: float
