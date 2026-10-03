"""Financial Rules Engine for InvoiceGuard.

Implements Blueprint section 8.1:
- LINE_TOTAL_MISMATCH
- SUBTOTAL_MISMATCH
- GRAND_TOTAL_MISMATCH
- AMOUNT_WORDS_MISMATCH
- ROUNDING_ANOMALY
- SUSPICIOUS_ROUND_TOTAL
- DUPLICATE_LINE_ITEMS
- NEGATIVE_OR_ZERO_VALUES
- CURRENCY_INCONSISTENT
"""

import re
from typing import Any, Optional

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service

# Indian number word token mappings
ONES = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
SCALES = {
    "crore": 10000000,
    "crores": 10000000,
    "lakh": 100000,
    "lakhs": 100000,
    "lac": 100000,
    "lacs": 100000,
    "thousand": 1000,
    "thousands": 1000,
    "hundred": 100,
    "hundreds": 100,
}


def parse_indian_amount_words(text: str) -> Optional[float]:
    """Parse Indian currency amount written in words to a numeric value."""
    if not text or not text.strip():
        return None

    clean = re.sub(r"[^a-zA-Z\s]", " ", text.lower())
    tokens = clean.split()
    total = 0
    current = 0
    found_any = False

    for tok in tokens:
        if tok in ONES:
            current += ONES[tok]
            found_any = True
        elif tok in TENS:
            current += TENS[tok]
            found_any = True
        elif tok in SCALES:
            scale = SCALES[tok]
            found_any = True
            if current == 0:
                current = 1
            if scale >= 1000:
                total += current * scale
                current = 0
            else:
                current *= scale

    total += current
    return float(total) if found_any and total > 0 else None


class FinancialRulesEngine(BaseEngine):
    """Evaluates mathematical consistency, line arithmetic, roundings, and currency."""

    name = "financial"
    category = "rule"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("financial"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        data = context.data
        findings: list[Finding] = []
        features: dict[str, Any] = {
            "line_item_count": len(data.items),
            "line_mismatches_count": 0,
            "max_line_diff": 0.0,
            "subtotal_diff": 0.0,
            "grand_total_diff": 0.0,
            "amount_words_mismatch_flag": 0,
        }

        # Tolerances
        line_tol_abs = settings_service.get_tolerance("line_total_abs", 1.0)
        line_tol_pct = settings_service.get_tolerance("line_total_pct", 0.5) / 100.0
        subtotal_tol_abs = settings_service.get_tolerance("subtotal_abs", 1.0)
        subtotal_tol_pct = settings_service.get_tolerance("subtotal_pct", 0.5) / 100.0
        grand_tol_abs = settings_service.get_tolerance("grand_total_abs", 1.0)
        grand_tol_pct = settings_service.get_tolerance("grand_total_pct", 0.5) / 100.0

        # 1. LINE_TOTAL_MISMATCH
        for idx, item in enumerate(data.items):
            qty = item.quantity.value if item.quantity and item.quantity.value is not None else 1.0
            price = (
                item.unit_price.value if item.unit_price and item.unit_price.value is not None else 0.0
            )
            disc = item.discount.value if item.discount and item.discount.value is not None else 0.0
            line_total = (
                item.line_total.value if item.line_total and item.line_total.value is not None else 0.0
            )

            expected_line = round((qty * price) - disc, 2)
            diff = round(line_total - expected_line, 2)
            tol = max(line_tol_abs, abs(expected_line) * line_tol_pct)

            if abs(diff) > tol and (qty > 0 and price > 0):
                features["line_mismatches_count"] += 1
                features["max_line_diff"] = max(features["max_line_diff"], abs(diff))
                severity = "high" if abs(diff) >= 500 or (expected_line > 0 and abs(diff) / expected_line >= 0.1) else "medium"
                score = min(85.0, 55.0 + min(30.0, (abs(diff) / max(1.0, expected_line)) * 40.0))

                desc = item.description.value if item.description else f"Item {idx + 1}"
                findings.append(
                    self.create_finding(
                        finding_type="LINE_TOTAL_MISMATCH",
                        severity=severity,
                        score=score,
                        confidence=0.95,
                        title=f"Line Item #{idx + 1} Arithmetic Mismatch",
                        summary=(
                            f"Line '{desc}' specifies quantity {qty} @ ₹{price:,.2f}"
                            + (f" with ₹{disc:,.2f} discount" if disc > 0 else "")
                            + f", yielding expected ₹{expected_line:,.2f}, but line total shows ₹{line_total:,.2f}."
                        ),
                        expected=expected_line,
                        found=line_total,
                        difference=diff,
                        recommended_action=(
                            "Verify line item unit pricing, billed quantity, and applied discount against purchase order."
                        ),
                        field=f"items[{idx}].line_total",
                        bbox=item.line_total.bbox if item.line_total else item.description.bbox,
                        details={
                            "line_number": idx + 1,
                            "quantity": qty,
                            "unit_price": price,
                            "discount": disc,
                            "description": desc,
                        },
                    )
                )

        # 2. SUBTOTAL_MISMATCH
        sum_lines = round(
            sum(
                item.line_total.value
                for item in data.items
                if item.line_total and item.line_total.value is not None
            ),
            2,
        )
        reported_subtotal = data.subtotal.value if data.subtotal and data.subtotal.value is not None else 0.0

        if data.items and reported_subtotal > 0:
            diff_subtotal = round(reported_subtotal - sum_lines, 2)
            tol_sub = max(subtotal_tol_abs, abs(sum_lines) * subtotal_tol_pct)
            if abs(diff_subtotal) > tol_sub:
                features["subtotal_diff"] = abs(diff_subtotal)
                sev = "high" if abs(diff_subtotal) >= 1000 else "medium"
                findings.append(
                    self.create_finding(
                        finding_type="SUBTOTAL_MISMATCH",
                        severity=sev,
                        score=min(85.0, 50.0 + min(35.0, (abs(diff_subtotal) / max(1.0, sum_lines)) * 50.0)),
                        confidence=0.95,
                        title="Subtotal Calculation Discrepancy",
                        summary=(
                            f"Sum of {len(data.items)} line item totals is ₹{sum_lines:,.2f}, "
                            f"but reported subtotal is ₹{reported_subtotal:,.2f} (difference ₹{diff_subtotal:,.2f})."
                        ),
                        expected=sum_lines,
                        found=reported_subtotal,
                        difference=diff_subtotal,
                        recommended_action="Recalculate subtotal by summing all individual item line totals.",
                        field="subtotal",
                        bbox=data.subtotal.bbox if data.subtotal else None,
                    )
                )

        # 3. GRAND_TOTAL_MISMATCH
        effective_subtotal = reported_subtotal if reported_subtotal > 0 else sum_lines
        disc_total = data.discount_total.value if data.discount_total and data.discount_total.value else 0.0
        shipping = data.shipping.value if data.shipping and data.shipping.value else 0.0
        tax_total = 0.0
        if data.tax and data.tax.total and data.tax.total.value:
            tax_total = data.tax.total.value
        elif data.tax:
            cgst = data.tax.cgst.value if data.tax.cgst and data.tax.cgst.value else 0.0
            sgst = data.tax.sgst.value if data.tax.sgst and data.tax.sgst.value else 0.0
            igst = data.tax.igst.value if data.tax.igst and data.tax.igst.value else 0.0
            tax_total = cgst + sgst + igst

        expected_grand = round(effective_subtotal - disc_total + shipping + tax_total, 2)
        reported_grand = (
            data.grand_total.value if data.grand_total and data.grand_total.value is not None else 0.0
        )

        if reported_grand > 0 and expected_grand > 0:
            diff_grand = round(reported_grand - expected_grand, 2)
            tol_grand = max(grand_tol_abs, abs(expected_grand) * grand_tol_pct)
            if abs(diff_grand) > tol_grand:
                features["grand_total_diff"] = abs(diff_grand)
                # Analyze plausible cause
                plausible = "Discrepancy unexplained by standard line additions."
                if tax_total > 0 and abs(abs(diff_grand) - tax_total) <= 2.0:
                    plausible = "Discrepancy closely matches tax total being double-counted or omitted."
                elif shipping > 0 and abs(abs(diff_grand) - shipping) <= 2.0:
                    plausible = "Discrepancy closely matches omitted or duplicated shipping charges."
                elif disc_total > 0 and abs(abs(diff_grand) - disc_total) <= 2.0:
                    plausible = "Discrepancy closely matches discount total applied inversely."

                sev = "critical" if abs(diff_grand) >= 10000 else ("high" if abs(diff_grand) >= 500 else "medium")
                score = min(95.0, 60.0 + min(35.0, (abs(diff_grand) / max(1.0, expected_grand)) * 40.0))
                findings.append(
                    self.create_finding(
                        finding_type="GRAND_TOTAL_MISMATCH",
                        severity=sev,
                        score=score,
                        confidence=0.95,
                        title="Grand Total Summation Mismatch",
                        summary=(
                            f"Calculated total from subtotal (₹{effective_subtotal:,.2f}), "
                            f"tax (₹{tax_total:,.2f}), discount (₹{disc_total:,.2f}), and shipping (₹{shipping:,.2f}) "
                            f"is ₹{expected_grand:,.2f}, but stated grand total is ₹{reported_grand:,.2f}. {plausible}"
                        ),
                        expected=expected_grand,
                        found=reported_grand,
                        difference=diff_grand,
                        recommended_action=(
                            "Review invoice arithmetic and verify whether taxes, discounts, or surcharges were miscalculated."
                        ),
                        field="grand_total",
                        bbox=data.grand_total.bbox if data.grand_total else None,
                        details={"plausible_explanation": plausible},
                    )
                )

        # 4. AMOUNT_WORDS_MISMATCH
        if data.amount_in_words and data.amount_in_words.value:
            words_text = data.amount_in_words.value.strip()
            parsed_words = parse_indian_amount_words(words_text)
            if parsed_words is not None and reported_grand > 0:
                diff_words = round(reported_grand - parsed_words, 2)
                if abs(diff_words) > 1.0:
                    features["amount_words_mismatch_flag"] = 1
                    findings.append(
                        self.create_finding(
                            finding_type="AMOUNT_WORDS_MISMATCH",
                            severity="high",
                            score=75.0,
                            confidence=0.92,
                            title="Amount in Words Discrepancy",
                            summary=(
                                f"Amount written in words ('{words_text}') translates to ₹{parsed_words:,.2f}, "
                                f"which contradicts the numeric grand total of ₹{reported_grand:,.2f}."
                            ),
                            expected=reported_grand,
                            found=parsed_words,
                            difference=diff_words,
                            recommended_action=(
                                "Confirm with vendor whether the legal written words or numeric total is the intended invoice amount."
                            ),
                            field="amount_in_words",
                            bbox=data.amount_in_words.bbox if data.amount_in_words else None,
                            details={"raw_words": words_text},
                        )
                    )

        # 5. ROUNDING_ANOMALY
        if reported_grand > 0 and expected_grand > 0:
            diff_round = round(abs(reported_grand - expected_grand), 2)
            # Legitimate round-off is typically <= ₹1.0. Between ₹1.01 and ₹10.0 is an anomalous rounding
            if 1.0 < diff_round <= 10.0:
                findings.append(
                    self.create_finding(
                        finding_type="ROUNDING_ANOMALY",
                        severity="low",
                        score=30.0,
                        confidence=0.85,
                        title="Irregular Round-off Adjustment",
                        summary=(
                            f"Invoice grand total has a round-off difference of ₹{diff_round:.2f}, "
                            "exceeding standard statutory round-off tolerance (₹1.00)."
                        ),
                        expected=expected_grand,
                        found=reported_grand,
                        difference=diff_round,
                        recommended_action="Ensure round-off conforms to standard accounting practices.",
                        field="grand_total",
                        bbox=data.grand_total.bbox if data.grand_total else None,
                    )
                )

        # 6. SUSPICIOUS_ROUND_TOTAL
        if reported_grand >= 10000.0 and reported_grand % 1000.0 == 0.0:
            # Check if line items naturally sum to an exact thousand
            has_decimals = any(
                item.unit_price.value and item.unit_price.value % 1.0 != 0.0
                for item in data.items
            )
            if has_decimals or (sum_lines > 0 and sum_lines % 100.0 != 0.0):
                findings.append(
                    self.create_finding(
                        finding_type="SUSPICIOUS_ROUND_TOTAL",
                        severity="info",
                        score=15.0,
                        confidence=0.70,
                        title="Artificially Rounded Invoice Amount",
                        summary=(
                            f"Invoice total is an even ₹{reported_grand:,.2f} despite line item rates "
                            "suggesting unrounded pricing."
                        ),
                        expected=sum_lines,
                        found=reported_grand,
                        difference=round(reported_grand - sum_lines, 2),
                        recommended_action="Review whether lump-sum rounding was mutually agreed in contract.",
                        field="grand_total",
                        bbox=data.grand_total.bbox if data.grand_total else None,
                    )
                )

        # 7. DUPLICATE_LINE_ITEMS
        seen_lines: dict[str, list[int]] = {}
        for idx, item in enumerate(data.items):
            desc = (item.description.value or "").strip().lower()
            qty = item.quantity.value if item.quantity else 1.0
            price = item.unit_price.value if item.unit_price else 0.0
            if desc and price > 0:
                sig = f"{desc}|{qty}|{price}"
                seen_lines.setdefault(sig, []).append(idx + 1)

        for sig, line_indices in seen_lines.items():
            if len(line_indices) > 1:
                desc = sig.split("|")[0]
                findings.append(
                    self.create_finding(
                        finding_type="DUPLICATE_LINE_ITEMS",
                        severity="medium",
                        score=55.0,
                        confidence=0.90,
                        title="Duplicate Line Item Detected",
                        summary=(
                            f"Identical line item '{desc}' appears {len(line_indices)} times "
                            f"on lines {line_indices} with identical quantity and rate."
                        ),
                        expected=1,
                        found=len(line_indices),
                        difference=len(line_indices) - 1,
                        recommended_action="Verify if the repeated line item is intentional or an accidental double entry.",
                        details={"lines": line_indices, "item_signature": sig},
                    )
                )

        # 8. NEGATIVE_OR_ZERO_VALUES
        for idx, item in enumerate(data.items):
            price = item.unit_price.value if item.unit_price else 0.0
            qty = item.quantity.value if item.quantity else 0.0
            total = item.line_total.value if item.line_total else 0.0
            desc = (item.description.value or "").lower()
            is_discount_line = any(w in desc for w in ["discount", "rebate", "credit", "coupon"])

            if not is_discount_line and (price < 0 or qty < 0 or total < 0):
                findings.append(
                    self.create_finding(
                        finding_type="NEGATIVE_OR_ZERO_VALUES",
                        severity="medium",
                        score=45.0,
                        confidence=0.92,
                        title=f"Non-Standard Negative Value on Line #{idx + 1}",
                        summary=(
                            f"Line #{idx + 1} ('{desc}') contains negative values (qty: {qty}, price: {price}, total: {total}) "
                            "without discount/credit description."
                        ),
                        expected=0.0,
                        found=total,
                        difference=total,
                        recommended_action="Confirm if this line represents an authorized credit note or return item.",
                        field=f"items[{idx}].line_total",
                        bbox=item.line_total.bbox if item.line_total else None,
                    )
                )

        # 9. CURRENCY_INCONSISTENT
        header_curr = (data.currency.value or "INR").upper()
        conflicting_symbols = []
        if header_curr in ["INR", "RS"]:
            conflicting_symbols = ["$", "€", "£", "USD", "EUR", "GBP"]
        elif header_curr in ["USD"]:
            conflicting_symbols = ["₹", "INR", "€", "£"]

        for t in context.tokens:
            for sym in conflicting_symbols:
                if sym in t.text and len(t.text.strip()) <= 5:
                    findings.append(
                        self.create_finding(
                            finding_type="CURRENCY_INCONSISTENT",
                            severity="medium",
                            score=50.0,
                            confidence=0.88,
                            title="Inconsistent Currency Denomination",
                            summary=(
                                f"Invoice header states {header_curr}, but symbol/code '{sym}' was identified on page."
                            ),
                            expected=header_curr,
                            found=sym,
                            difference=f"{header_curr} vs {sym}",
                            recommended_action="Confirm billing currency and foreign exchange terms with vendor.",
                            field="currency",
                            bbox=t.bbox,
                        )
                    )
                    break
            if features.get("currency_mismatch_flag"):
                break

        overall_score = self.aggregate_score(findings)
        return SignalResult(
            name=self.name,
            score=overall_score,
            confidence=0.95,
            findings=findings,
            features=features,
        )
