"""Tax and Identity Rules Engine for InvoiceGuard.

Implements Blueprint section 8.2:
- GSTIN_INVALID_FORMAT
- GSTIN_CHECKSUM_FAIL
- GSTIN_STATE_INVALID
- GSTIN_PAN_MISMATCH
- TAX_AMOUNT_MISMATCH
- TAX_STRUCTURE_INCONSISTENT
- TAX_RATE_INVALID_SLAB
- IFSC_INVALID
- ACCOUNT_NUMBER_FORMAT
- PAN_INVALID
"""

import re
from typing import Any

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service
from ml.synthetic.gstin import STATE_CODES, validate_gstin

# Regex patterns
PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
IFSC_REGEX = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT_NUM_REGEX = re.compile(r"^\d{9,18}$")


class TaxIdentityRulesEngine(BaseEngine):
    """Evaluates statutory GSTIN compliance, tax slabs, interstate tax logic, and banking identifiers."""

    name = "tax_identity"
    category = "rule"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("tax_identity"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        data = context.data
        findings: list[Finding] = []
        features: dict[str, Any] = {
            "has_vendor_gstin": bool(data.vendor.gstin.value),
            "gstin_valid": 1,
            "pan_valid": 1,
            "ifsc_valid": 1,
            "tax_mismatch_amount": 0.0,
            "invalid_slab_count": 0,
        }

        invoice_date = data.invoice_date.value if data.invoice_date else None
        tax_tol_abs = settings_service.get_tolerance("tax_amount_abs", 1.0)
        tax_tol_pct = settings_service.get_tolerance("tax_amount_pct", 0.5) / 100.0

        # 1. Vendor GSTIN Checks
        vendor_gstin = (data.vendor.gstin.value or "").strip().upper()
        vendor_state_code: str = ""
        vendor_pan_from_gstin: str = ""

        if vendor_gstin:
            if len(vendor_gstin) >= 2:
                vendor_state_code = vendor_gstin[:2]
            if len(vendor_gstin) >= 12:
                vendor_pan_from_gstin = vendor_gstin[2:12]

            is_valid, err_msg = validate_gstin(vendor_gstin)
            if not is_valid:
                features["gstin_valid"] = 0
                if "Format" in err_msg or len(vendor_gstin) != 15:
                    findings.append(
                        self.create_finding(
                            finding_type="GSTIN_INVALID_FORMAT",
                            severity="high",
                            score=70.0,
                            confidence=0.98,
                            title="Invalid Vendor GSTIN Format",
                            summary=f"Vendor GSTIN '{vendor_gstin}' does not match official 15-character GST structure.",
                            expected="15-character alphanumeric GSTIN matching ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
                            found=vendor_gstin,
                            difference=err_msg,
                            recommended_action="Verify vendor GST registration on the government GST portal (services.gst.gov.in).",
                            field="vendor.gstin",
                            bbox=data.vendor.gstin.bbox,
                        )
                    )
                elif "State code" in err_msg:
                    findings.append(
                        self.create_finding(
                            finding_type="GSTIN_STATE_INVALID",
                            severity="high",
                            score=75.0,
                            confidence=0.98,
                            title="Invalid GSTIN State Jurisdiction",
                            summary=f"First two digits of GSTIN '{vendor_gstin}' ({vendor_gstin[:2]}) do not represent a valid Indian State/UT code.",
                            expected="Valid 2-digit Indian State/UT code (01-38, 97)",
                            found=vendor_gstin[:2],
                            difference=f"Unknown jurisdiction code: {vendor_gstin[:2]}",
                            recommended_action="Request updated GST registration certificate from vendor.",
                            field="vendor.gstin",
                            bbox=data.vendor.gstin.bbox,
                        )
                    )
                elif "Checksum" in err_msg:
                    findings.append(
                        self.create_finding(
                            finding_type="GSTIN_CHECKSUM_FAIL",
                            severity="high",
                            score=80.0,
                            confidence=0.98,
                            title="Vendor GSTIN Mod-36 Checksum Verification Failed",
                            summary=f"GSTIN '{vendor_gstin}' failed statutory Mod-36 check-digit verification.",
                            expected="Statutorily valid check digit",
                            found=vendor_gstin[-1],
                            difference="Check digit mismatch",
                            recommended_action="Cross-verify GSTIN with vendor's registered certificate or GST portal.",
                            field="vendor.gstin",
                            bbox=data.vendor.gstin.bbox,
                        )
                    )

        # 2. Buyer GSTIN Checks
        buyer_gstin = (data.buyer.gstin.value or "").strip().upper()
        buyer_state_code: str = ""
        if buyer_gstin:
            if len(buyer_gstin) >= 2:
                buyer_state_code = buyer_gstin[:2]
            b_valid, b_err = validate_gstin(buyer_gstin)
            if not b_valid and len(buyer_gstin) == 15:
                # If buyer gstin checksum fails
                findings.append(
                    self.create_finding(
                        finding_type="GSTIN_CHECKSUM_FAIL",
                        severity="medium",
                        score=60.0,
                        confidence=0.95,
                        title="Buyer GSTIN Checksum Verification Failed",
                        summary=f"Stated buyer GSTIN '{buyer_gstin}' failed Mod-36 checksum verification ({b_err}).",
                        expected="Valid buyer GSTIN",
                        found=buyer_gstin,
                        difference=b_err,
                        recommended_action="Ensure your company's billing entity GSTIN is printed correctly.",
                        field="buyer.gstin",
                        bbox=data.buyer.gstin.bbox,
                    )
                )

        # 3. PAN Verification & PAN-GSTIN Mismatch
        vendor_pan = (data.vendor.pan.value or "").strip().upper()
        if vendor_pan:
            if not PAN_REGEX.match(vendor_pan):
                features["pan_valid"] = 0
                findings.append(
                    self.create_finding(
                        finding_type="PAN_INVALID",
                        severity="medium",
                        score=55.0,
                        confidence=0.95,
                        title="Invalid Vendor PAN Format",
                        summary=f"Vendor PAN '{vendor_pan}' does not adhere to statutory 10-character alphanumeric PAN format.",
                        expected="5 letters + 4 digits + 1 letter (e.g. AABCT1332L)",
                        found=vendor_pan,
                        difference="Format pattern mismatch",
                        recommended_action="Confirm vendor PAN number and tax deduction records.",
                        field="vendor.pan",
                        bbox=data.vendor.pan.bbox,
                    )
                )
            elif vendor_pan_from_gstin and vendor_pan != vendor_pan_from_gstin:
                # GSTIN chars 3-12 must match PAN
                findings.append(
                    self.create_finding(
                        finding_type="GSTIN_PAN_MISMATCH",
                        severity="critical",
                        score=90.0,
                        confidence=0.98,
                        title="PAN and GSTIN Entity Discrepancy",
                        summary=(
                            f"Vendor stated PAN '{vendor_pan}' does not match PAN embedded in GSTIN "
                            f"'{vendor_gstin}' (embedded PAN is '{vendor_pan_from_gstin}')."
                        ),
                        expected=vendor_pan_from_gstin,
                        found=vendor_pan,
                        difference=f"{vendor_pan} != {vendor_pan_from_gstin}",
                        recommended_action=(
                            "Halt payment processing immediately. Verify vendor entity legal identity against tax records."
                        ),
                        field="vendor.pan",
                        bbox=data.vendor.pan.bbox,
                    )
                )

        # 4. TAX_STRUCTURE_INCONSISTENT (Intrastate vs Interstate)
        tax = data.tax
        cgst_val = tax.cgst.value if tax.cgst and tax.cgst.value else 0.0
        sgst_val = tax.sgst.value if tax.sgst and tax.sgst.value else 0.0
        igst_val = tax.igst.value if tax.igst and tax.igst.value else 0.0

        if vendor_state_code and buyer_state_code:
            is_intrastate = vendor_state_code == buyer_state_code
            if is_intrastate:
                # Intrastate transaction: same state -> must be CGST + SGST (equal), no IGST
                if igst_val > 1.0:
                    findings.append(
                        self.create_finding(
                            finding_type="TAX_STRUCTURE_INCONSISTENT",
                            severity="high",
                            score=75.0,
                            confidence=0.95,
                            title="Inconsistent Tax Structure: IGST Billed on Intrastate Transaction",
                            summary=(
                                f"Both vendor and buyer reside in state {vendor_state_code} "
                                f"({STATE_CODES.get(vendor_state_code, 'Unknown')}). "
                                f"Intrastate supplies require CGST+SGST, but IGST of ₹{igst_val:,.2f} was charged."
                            ),
                            expected="CGST + SGST (equal halves), IGST = ₹0.00",
                            found=f"IGST ₹{igst_val:,.2f}",
                            difference=f"IGST applied on intrastate transaction (State {vendor_state_code})",
                            recommended_action="Request revised invoice applying CGST and SGST instead of IGST.",
                            field="tax.igst",
                            bbox=tax.igst.bbox if tax.igst else None,
                        )
                    )
                elif cgst_val > 0 and sgst_val > 0 and abs(cgst_val - sgst_val) > 1.0:
                    findings.append(
                        self.create_finding(
                            finding_type="TAX_STRUCTURE_INCONSISTENT",
                            severity="medium",
                            score=55.0,
                            confidence=0.92,
                            title="Unequal CGST and SGST Split",
                            summary=(
                                f"Statutory rules require equal bifurcation for intrastate GST. "
                                f"CGST is ₹{cgst_val:,.2f} while SGST is ₹{sgst_val:,.2f}."
                            ),
                            expected=cgst_val,
                            found=sgst_val,
                            difference=round(abs(cgst_val - sgst_val), 2),
                            recommended_action="Ensure CGST and SGST amounts are split equally.",
                            field="tax.sgst",
                            bbox=tax.sgst.bbox if tax.sgst else None,
                        )
                    )
            else:
                # Interstate transaction: different states -> must be IGST, no CGST/SGST
                if (cgst_val > 1.0 or sgst_val > 1.0) and igst_val <= 1.0:
                    findings.append(
                        self.create_finding(
                            finding_type="TAX_STRUCTURE_INCONSISTENT",
                            severity="high",
                            score=75.0,
                            confidence=0.95,
                            title="Inconsistent Tax Structure: CGST/SGST Billed on Interstate Transaction",
                            summary=(
                                f"Vendor (State {vendor_state_code}) and Buyer (State {buyer_state_code}) are in different states. "
                                f"Interstate supplies require IGST, but CGST (₹{cgst_val:,.2f}) and SGST (₹{sgst_val:,.2f}) were charged."
                            ),
                            expected="IGST only, CGST=₹0.00, SGST=₹0.00",
                            found=f"CGST ₹{cgst_val:,.2f}, SGST ₹{sgst_val:,.2f}",
                            difference="CGST/SGST charged on interstate supply",
                            recommended_action="Request revised invoice applying IGST for interstate supply.",
                            field="tax.cgst",
                            bbox=tax.cgst.bbox if tax.cgst else None,
                        )
                    )

        # 5. TAX_RATE_INVALID_SLAB & TAX_AMOUNT_MISMATCH
        # Check line item tax rates and amounts
        for idx, item in enumerate(data.items):
            rate = item.tax_rate.value if item.tax_rate and item.tax_rate.value is not None else None
            tax_amt = item.tax_amount.value if item.tax_amount and item.tax_amount.value is not None else None
            line_tot = item.line_total.value if item.line_total and item.line_total.value is not None else 0.0

            if rate is not None:
                # Date-aware slab check
                if not settings_service.is_valid_gst_slab(rate, invoice_date):
                    features["invalid_slab_count"] += 1
                    valid_slabs = settings_service.get_valid_gst_slabs(invoice_date)
                    findings.append(
                        self.create_finding(
                            finding_type="TAX_RATE_INVALID_SLAB",
                            severity="high",
                            score=70.0,
                            confidence=0.94,
                            title=f"Non-Standard GST Slab ({rate}%) on Line #{idx + 1}",
                            summary=(
                                f"Line #{idx + 1} charges {rate}% GST. Valid statutory GST slabs "
                                f"for invoice date {invoice_date or 'current'} are {valid_slabs}%."
                            ),
                            expected=valid_slabs,
                            found=rate,
                            difference=f"{rate}% not in statutory slabs",
                            recommended_action="Check item HSN/SAC code against official GST Council rate schedules.",
                            field=f"items[{idx}].tax_rate",
                            bbox=item.tax_rate.bbox if item.tax_rate else None,
                        )
                    )

                # Tax amount calculation check on line item
                if tax_amt is not None and line_tot > 0:
                    expected_tax = round(line_tot * (rate / 100.0), 2)
                    diff_tax = round(tax_amt - expected_tax, 2)
                    tol = max(tax_tol_abs, expected_tax * tax_tol_pct)
                    if abs(diff_tax) > tol:
                        features["tax_mismatch_amount"] = max(features["tax_mismatch_amount"], abs(diff_tax))
                        findings.append(
                            self.create_finding(
                                finding_type="TAX_AMOUNT_MISMATCH",
                                severity="high",
                                score=75.0,
                                confidence=0.95,
                                title=f"Tax Amount Discrepancy on Line #{idx + 1}",
                                summary=(
                                    f"Line #{idx + 1} ({rate}% on ₹{line_tot:,.2f}) has stated tax of ₹{tax_amt:,.2f}, "
                                    f"but calculated tax is ₹{expected_tax:,.2f} (difference ₹{diff_tax:,.2f})."
                                ),
                                expected=expected_tax,
                                found=tax_amt,
                                difference=diff_tax,
                                recommended_action="Correct tax amount computation according to stated rate.",
                                field=f"items[{idx}].tax_amount",
                                bbox=item.tax_amount.bbox if item.tax_amount else None,
                            )
                        )

        # Invoice-level tax calculation check (e.g. GST 18% on 10,000 shown as 2,800)
        subtotal_val = (
            data.subtotal.value
            if data.subtotal and data.subtotal.value
            else sum(i.line_total.value or 0.0 for i in data.items)
        )
        reported_tax_total = (
            tax.total.value
            if tax.total and tax.total.value
            else (cgst_val + sgst_val + igst_val)
        )
        reported_tax_rate = tax.rate.value if tax.rate and tax.rate.value is not None else None

        if reported_tax_rate is not None and subtotal_val > 0 and reported_tax_total > 0:
            expected_tax_total = round(subtotal_val * (reported_tax_rate / 100.0), 2)
            diff_inv_tax = round(reported_tax_total - expected_tax_total, 2)
            tol = max(tax_tol_abs, expected_tax_total * tax_tol_pct)
            if abs(diff_inv_tax) > tol:
                features["tax_mismatch_amount"] = max(features["tax_mismatch_amount"], abs(diff_inv_tax))
                findings.append(
                    self.create_finding(
                        finding_type="TAX_AMOUNT_MISMATCH",
                        severity="high",
                        score=80.0,
                        confidence=0.96,
                        title="Invoice Tax Calculation Mismatch",
                        summary=(
                            f"Reported tax of ₹{reported_tax_total:,.2f} on subtotal of ₹{subtotal_val:,.2f} "
                            f"at {reported_tax_rate}% deviates from expected ₹{expected_tax_total:,.2f} "
                            f"(difference ₹{diff_inv_tax:,.2f})."
                        ),
                        expected=expected_tax_total,
                        found=reported_tax_total,
                        difference=diff_inv_tax,
                        recommended_action="Recompute statutory tax on taxable value.",
                        field="tax.total",
                        bbox=tax.total.bbox if tax.total else None,
                    )
                )

            # Check invoice header tax rate validity
            if not settings_service.is_valid_gst_slab(reported_tax_rate, invoice_date):
                features["invalid_slab_count"] += 1
                valid_slabs = settings_service.get_valid_gst_slabs(invoice_date)
                findings.append(
                    self.create_finding(
                        finding_type="TAX_RATE_INVALID_SLAB",
                        severity="high",
                        score=70.0,
                        confidence=0.94,
                        title=f"Non-Standard Statutory Tax Slab ({reported_tax_rate}%)",
                        summary=(
                            f"Invoice applies {reported_tax_rate}% tax rate, which does not match official GST slabs "
                            f"({valid_slabs}%)."
                        ),
                        expected=valid_slabs,
                        found=reported_tax_rate,
                        difference=f"{reported_tax_rate}% invalid slab",
                        recommended_action="Verify applicable GST rate for supplied goods/services.",
                        field="tax.rate",
                        bbox=tax.rate.bbox if tax.rate else None,
                    )
                )

        # 6. Banking Identifiers Checks (IFSC & Account Number)
        payment = data.payment
        if payment.ifsc and payment.ifsc.value:
            ifsc_val = payment.ifsc.value.strip().upper()
            if not IFSC_REGEX.match(ifsc_val):
                features["ifsc_valid"] = 0
                findings.append(
                    self.create_finding(
                        finding_type="IFSC_INVALID",
                        severity="high",
                        score=75.0,
                        confidence=0.96,
                        title="Invalid Bank IFSC Code Format",
                        summary=f"Stated IFSC code '{ifsc_val}' does not follow RBI 11-character format (4 letters, 0, 6 alphanumeric).",
                        expected="11-character RBI IFSC (e.g. HDFC0001234)",
                        found=ifsc_val,
                        difference="Invalid IFSC pattern",
                        recommended_action="Verify remittance details with official bank branch records.",
                        field="payment.ifsc",
                        bbox=payment.ifsc.bbox,
                    )
                )

        if payment.account_number and payment.account_number.value:
            acc_val = payment.account_number.value.strip()
            # Clean spaces/hyphens
            clean_acc = re.sub(r"[\s\-]", "", acc_val)
            if not ACCOUNT_NUM_REGEX.match(clean_acc):
                findings.append(
                    self.create_finding(
                        finding_type="ACCOUNT_NUMBER_FORMAT",
                        severity="high",
                        score=70.0,
                        confidence=0.94,
                        title="Non-Conforming Bank Account Number",
                        summary=f"Account number '{acc_val}' contains invalid non-digit characters or irregular length ({len(clean_acc)} digits).",
                        expected="9 to 18 numeric digits",
                        found=acc_val,
                        difference=f"Length {len(clean_acc)} or non-digit characters",
                        recommended_action="Confirm vendor bank account number before executing electronic fund transfer.",
                        field="payment.account_number",
                        bbox=payment.account_number.bbox,
                    )
                )

        overall_score = self.aggregate_score(findings)
        return SignalResult(
            name=self.name,
            score=overall_score,
            confidence=0.95,
            findings=findings,
            features=features,
        )
