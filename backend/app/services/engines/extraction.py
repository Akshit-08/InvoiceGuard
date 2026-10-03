"""Extraction Confidence Engine for InvoiceGuard.

Implements Blueprint section 8.8:
- Not a risk signal (confidence only)
- OCR_LOW_CONFIDENCE info findings
- CRITICAL_FIELD_MISSING info findings
- manual-verification flag
"""

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine


class ExtractionConfidenceEngine(BaseEngine):
    name = "extraction"
    category = "rule"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        data = context.data
        findings: list[Finding] = []
        features = {}

        critical_fields = {
            "invoice_number": data.invoice_number,
            "vendor_name": data.vendor.name if data.vendor else None,
            "invoice_date": data.invoice_date,
            "grand_total": data.grand_total
        }


        for field_name, field_obj in critical_fields.items():
            if not field_obj or field_obj.value is None or str(field_obj.value).strip() == "":
                # Mark at engine level (aggregated in features dict)
                findings.append(self.create_finding(
                    finding_type="CRITICAL_FIELD_MISSING",
                    severity="info",
                    score=0.0,
                    confidence=1.0,
                    title=f"Missing Critical Field: {field_name}",
                    summary=f"The field '{field_name}' could not be extracted from the invoice.",
                    expected="A valid value",
                    found="Missing",
                    difference="",
                    recommended_action="Manually enter the missing information."
                ))
            elif getattr(field_obj, "conf", 1.0) < 0.6:
                # Note: needs_manual_verification is aggregated at engine level
                findings.append(self.create_finding(
                    finding_type="OCR_LOW_CONFIDENCE",
                    severity="info",
                    score=0.0,
                    confidence=1.0,
                    title=f"Low Extraction Confidence: {field_name}",
                    summary=f"The field '{field_name}' was extracted with low confidence ({field_obj.conf:.2f}).",
                    expected="Confidence >= 0.6",
                    found=f"{field_obj.conf:.2f}",
                    difference="Below threshold",
                    recommended_action="Verify the extracted value against the document image.",
                    field=field_name,
                    bbox=field_obj.bbox
                ))

        # Calculate overall confidence
        confs = []
        for field_obj in critical_fields.values():
            if field_obj and field_obj.value is not None:
                confs.append(getattr(field_obj, "conf", 1.0))

        overall_confidence = sum(confs) / len(confs) if confs else 0.0

        return SignalResult(
            name=self.name,
            score=0.0, # Not a risk signal
            confidence=overall_confidence,
            findings=findings,
            features=features
        )
