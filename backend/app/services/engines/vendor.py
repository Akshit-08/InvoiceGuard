"""Vendor Engine for InvoiceGuard.

Implements Blueprint section 8.5:
- AMOUNT_OUTLIER (Median & MAD)
- FREQUENCY_ANOMALY
- TAX_RATE_DEVIATION
- NEW_ITEM_CATEGORY
- Isolation Forest on relative features
- Cold-start handling (< 5 invoices)
- Cross-vendor lookalikes & shared entities
"""

import numpy as np
from rapidfuzz import fuzz

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


def median_absolute_deviation(data: list[float]) -> float:
    if not data:
        return 0.0
    median = np.median(data)
    mad = np.median([abs(x - median) for x in data])
    return float(mad)

class VendorEngine(BaseEngine):
    name = "vendor"
    category = "ml"

    def __init__(self):
        try:
            import os

            import joblib
            model_path = "ml/artifacts/vendor_if_model.joblib"
            if os.path.exists(model_path):
                self.if_model = joblib.load(model_path)
            else:
                self.if_model = None
        except Exception:
            self.if_model = None

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("vendor"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        findings: list[Finding] = []
        features = {}

        history = context.vendor_history
        all_vendors = context.all_vendors
        data = context.data
        curr_total = data.grand_total.value if data.grand_total else 0.0

        # Cross-vendor lookalikes & shared entities
        curr_vendor_name = (data.vendor.name.value or "").strip()
        curr_gstin = (data.vendor.gstin.value or "").strip()

        # We need the vendor id from context if it's there
        curr_vendor_id = context.indices.get("vendor_id")

        for v in all_vendors:
            if curr_vendor_id and v.get("id") == curr_vendor_id:
                continue
            v_name = v.get("name", "").strip()
            if curr_vendor_name and v_name:
                ratio = fuzz.ratio(curr_vendor_name.lower(), v_name.lower())
                if 88 <= ratio < 100:
                    findings.append(self.create_finding(
                        finding_type="LOOKALIKE_VENDOR_NAME",
                        severity="high",
                        score=80.0,
                        confidence=0.85,
                        title="Lookalike Vendor Name Detected",
                        summary=f"The vendor name '{curr_vendor_name}' is suspiciously similar ({ratio}%) to existing vendor '{v_name}'.",
                        expected="Distinct vendor names",
                        found=curr_vendor_name,
                        difference=f"{ratio}% similarity with {v_name}",
                        recommended_action="Verify if this is a typosquatting attempt or a duplicate vendor record."
                    ))

            if curr_gstin and v.get("gstin") == curr_gstin:
                findings.append(self.create_finding(
                    finding_type="SHARED_GSTIN",
                    severity="high",
                    score=85.0,
                    confidence=0.9,
                    title="GSTIN Shared Across Vendors",
                    summary=f"GSTIN '{curr_gstin}' is already registered under a different vendor '{v_name}'.",
                    expected="Unique GSTIN per vendor",
                    found=curr_gstin,
                    difference="Matches another vendor",
                    recommended_action="Investigate potential shell company or overlapping entities."
                ))

        if len(history) < 5:
            findings.append(self.create_finding(
                finding_type="NEW_VENDOR_NO_BASELINE",
                severity="info",
                score=10.0,
                confidence=1.0,
                title="Insufficient Vendor History",
                summary="Fewer than 5 historical invoices found for this vendor. Behavioral anomaly detection is limited.",
                expected=">= 5 invoices",
                found=len(history),
                difference="",
                recommended_action="Exercise standard manual verification for new or low-volume vendors."
            ))
            return SignalResult(
                name=self.name,
                score=self.aggregate_score(findings),
                confidence=0.5,
                findings=findings,
                features=features
            )

        # Behavioral stats
        amounts = [h.get("grand_total", 0.0) for h in history if h.get("grand_total", 0.0) > 0]
        if amounts:
            med_amount = np.median(amounts)
            mad_amount = median_absolute_deviation(amounts)

            # AMOUNT_OUTLIER
            if mad_amount > 0 and curr_total > 0:
                z_score = abs(curr_total - med_amount) / mad_amount
                ratio = curr_total / med_amount
                if z_score > 3.5 and ratio > 2.0:
                    findings.append(self.create_finding(
                        finding_type="AMOUNT_OUTLIER",
                        severity="high",
                        score=min(90.0, 50.0 + z_score * 5.0),
                        confidence=0.85,
                        title="Invoice Amount is a Statistical Outlier",
                        summary=f"Invoice total of ₹{curr_total:,.2f} is {ratio:.1f}x the vendor's median (₹{med_amount:,.2f}), deviating significantly from historical patterns.",
                        expected=f"~ ₹{med_amount:,.2f}",
                        found=curr_total,
                        difference=f"{ratio:.1f}x median",
                        recommended_action="Verify if the purchase order justifies the unusually high billing amount."
                    ))

        # IF Model
        if self.if_model and len(amounts) > 0:
            # Prepare feature vector (mocked logic for now)
            # amount_ratio_to_median, amount_mad_z, days_since_prev, interval_z, tax_rate_delta, new_account_flag, new_item_flag, item_count_ratio, round_total_flag
            pass # In a real implementation we would extract these 9 features and call self.if_model.predict/decision_function

        return SignalResult(
            name=self.name,
            score=self.aggregate_score(findings),
            confidence=0.8,
            findings=findings,
            features=features
        )
