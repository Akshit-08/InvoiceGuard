"""Identifiers & Dates Rules Engine for InvoiceGuard.

Implements Blueprint section 8.3:
- INVOICE_NUMBER_REUSED
- INVOICE_NUMBER_FORMAT_DEVIATION
- INVOICE_NUMBER_SEQUENCE_ANOMALY
- DATE_IN_FUTURE
- DUE_BEFORE_INVOICE
- DATE_TOO_OLD
- UNUSUAL_SUBMISSION_INTERVAL
"""

import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse common Indian and international date formats into a datetime object."""
    if not date_str or not str(date_str).strip():
        return None

    clean = str(date_str).strip()[:10]
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def extract_trailing_number(text: str) -> Optional[int]:
    """Extract numeric suffix from an invoice identifier (e.g. 'INV-2024-0042' -> 42)."""
    match = re.search(r"(\d+)$", text.strip())
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return None


class IdentifiersRulesEngine(BaseEngine):
    """Evaluates invoice numbering patterns, sequence cadence, date sanity, and cadence outliers."""

    name = "identifiers"
    category = "rule"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("identifiers"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        data = context.data
        findings: list[Finding] = []
        features: dict[str, Any] = {
            "invoice_number_length": len(data.invoice_number.value or ""),
            "has_reused_number": 0,
            "has_format_deviation": 0,
            "has_sequence_anomaly": 0,
            "date_in_future": 0,
            "due_before_invoice": 0,
        }

        now_utc = datetime.now(timezone.utc)
        inv_date_str = data.invoice_date.value if data.invoice_date else None
        parsed_inv_date = parse_date(inv_date_str)
        due_date_str = data.due_date.value if data.due_date else None
        parsed_due_date = parse_date(due_date_str)

        # 1. DATE_IN_FUTURE
        future_buffer_days = settings_service.get("identifiers.future_date_buffer_days", 1)
        if parsed_inv_date:
            days_diff = (parsed_inv_date.date() - now_utc.date()).days
            if days_diff > future_buffer_days:
                features["date_in_future"] = 1
                findings.append(
                    self.create_finding(
                        finding_type="DATE_IN_FUTURE",
                        severity="high",
                        score=75.0,
                        confidence=0.98,
                        title="Post-Dated Invoice Date",
                        summary=(
                            f"Invoice date {inv_date_str} is set {days_diff} days in the future "
                            f"(current date: {now_utc.strftime('%Y-%m-%d')})."
                        ),
                        expected=f"Date <= {now_utc.strftime('%Y-%m-%d')}",
                        found=inv_date_str,
                        difference=f"{days_diff} days ahead",
                        recommended_action="Confirm actual dispatch/service delivery date with vendor.",
                        field="invoice_date",
                        bbox=data.invoice_date.bbox if data.invoice_date else None,
                        details={"days_ahead": days_diff},
                    )
                )

        # 2. DUE_BEFORE_INVOICE
        if parsed_inv_date and parsed_due_date:
            due_delta_days = (parsed_due_date.date() - parsed_inv_date.date()).days
            if due_delta_days < 0:
                features["due_before_invoice"] = 1
                findings.append(
                    self.create_finding(
                        finding_type="DUE_BEFORE_INVOICE",
                        severity="high",
                        score=70.0,
                        confidence=0.96,
                        title="Payment Due Date Precedes Invoice Date",
                        summary=(
                            f"Stated payment due date ({due_date_str}) is {abs(due_delta_days)} days before "
                            f"the invoice issuance date ({inv_date_str})."
                        ),
                        expected=f"Due date >= {inv_date_str}",
                        found=due_date_str,
                        difference=f"{abs(due_delta_days)} days prior",
                        recommended_action="Request vendor rectify conflicting payment terms and due date.",
                        field="due_date",
                        bbox=data.due_date.bbox if data.due_date else None,
                        details={"delta_days": due_delta_days},
                    )
                )

        # 3. DATE_TOO_OLD
        max_age_days = settings_service.get("identifiers.max_invoice_age_days", 365)
        if parsed_inv_date:
            age_days = (now_utc.date() - parsed_inv_date.date()).days
            if age_days > max_age_days:
                findings.append(
                    self.create_finding(
                        finding_type="DATE_TOO_OLD",
                        severity="medium",
                        score=50.0,
                        confidence=0.92,
                        title="Stale or Back-Dated Invoice Submission",
                        summary=(
                            f"Invoice date {inv_date_str} is {age_days} days old, exceeding maximum "
                            f"standard processing age window ({max_age_days} days)."
                        ),
                        expected=f"Invoice age <= {max_age_days} days",
                        found=f"{age_days} days old",
                        difference=f"{age_days - max_age_days} days overdue",
                        recommended_action="Verify whether this invoice was already settled or if input tax credit window has lapsed.",
                        field="invoice_date",
                        bbox=data.invoice_date.bbox if data.invoice_date else None,
                    )
                )

        # 4. INVOICE_NUMBER_REUSED
        curr_num = (data.invoice_number.value or "").strip()
        history = context.vendor_history or []
        related_ids: list[str] = []

        if curr_num and history:
            for past in history:
                past_num = str(past.get("invoice_number", "")).strip()
                past_id = str(past.get("id", past.get("invoice_id", "")))
                if past_num and past_num.lower() == curr_num.lower() and past_id != context.invoice_id:
                    related_ids.append(past_id)
                    features["has_reused_number"] = 1
                    past_total = past.get("grand_total")
                    past_date = past.get("invoice_date")
                    curr_total = data.grand_total.value

                    findings.append(
                        self.create_finding(
                            finding_type="INVOICE_NUMBER_REUSED",
                            severity="critical" if past_total != curr_total else "high",
                            score=90.0 if past_total != curr_total else 80.0,
                            confidence=0.98,
                            title=f"Reused Invoice Number '{curr_num}'",
                            summary=(
                                f"Invoice number '{curr_num}' was previously issued by this vendor on {past_date} "
                                f"(prior total: ₹{past_total:,.2f} vs current total: ₹{curr_total:,.2f})."
                            ),
                            expected="Unique invoice number for each billing transaction",
                            found=curr_num,
                            difference=f"Identical invoice number in invoice {past_id}",
                            recommended_action=(
                                "Halt processing. Confirm with procurement whether this is a duplicate bill or modified submission."
                            ),
                            field="invoice_number",
                            bbox=data.invoice_number.bbox if data.invoice_number else None,
                            related_invoice_ids=related_ids,
                            details={
                                "prior_invoice_id": past_id,
                                "prior_invoice_date": past_date,
                                "prior_total": past_total,
                            },
                        )
                    )
                    break

        # 5. INVOICE_NUMBER_FORMAT_DEVIATION
        if curr_num and len(history) >= 3:
            # Check prefix consistency in history
            prefixes = []
            for past in history:
                p_num = str(past.get("invoice_number", "")).strip()
                match = re.match(r"^([A-Za-z]+[\-_/]?)", p_num)
                if match:
                    prefixes.append(match.group(1).upper())

            if prefixes:
                # Most common prefix
                most_common_prefix = max(set(prefixes), key=prefixes.count)
                prefix_freq = prefixes.count(most_common_prefix) / len(prefixes)

                if prefix_freq >= 0.75:
                    curr_match = re.match(r"^([A-Za-z]+[\-_/]?)", curr_num)
                    curr_prefix = curr_match.group(1).upper() if curr_match else ""
                    if curr_prefix != most_common_prefix:
                        features["has_format_deviation"] = 1
                        findings.append(
                            self.create_finding(
                                finding_type="INVOICE_NUMBER_FORMAT_DEVIATION",
                                severity="medium",
                                score=60.0,
                                confidence=0.88,
                                title="Vendor Invoice Numbering Format Deviation",
                                summary=(
                                    f"Vendor typically formats invoice numbers with prefix '{most_common_prefix}' "
                                    f"({prefix_freq:.0%} of historical bills), but this bill uses '{curr_num}'."
                                ),
                                expected=f"Pattern starting with '{most_common_prefix}'",
                                found=curr_num,
                                difference=f"Expected prefix '{most_common_prefix}', found '{curr_prefix or 'none'}'",
                                recommended_action="Check if vendor recently changed billing systems or ERP numbering series.",
                                field="invoice_number",
                                bbox=data.invoice_number.bbox if data.invoice_number else None,
                            )
                        )

        # 6. INVOICE_NUMBER_SEQUENCE_ANOMALY
        if curr_num and len(history) >= 3:
            curr_seq = extract_trailing_number(curr_num)
            past_seqs = [
                extract_trailing_number(str(p.get("invoice_number", "")))
                for p in history
                if extract_trailing_number(str(p.get("invoice_number", ""))) is not None
            ]
            if curr_seq is not None and past_seqs:
                max_past_seq = max(past_seqs)
                # Sequence regression check
                if curr_seq < max_past_seq and (max_past_seq - curr_seq) > 10:
                    features["has_sequence_anomaly"] = 1
                    findings.append(
                        self.create_finding(
                            finding_type="INVOICE_NUMBER_SEQUENCE_ANOMALY",
                            severity="medium",
                            score=65.0,
                            confidence=0.86,
                            title="Invoice Sequence Number Regression",
                            summary=(
                                f"Invoice number counter ({curr_seq}) is lower than vendor's previously recorded "
                                f"counter ({max_past_seq}), indicating an out-of-order sequence."
                            ),
                            expected=f"Counter > {max_past_seq}",
                            found=curr_seq,
                            difference=f"Sequence stepped back by {max_past_seq - curr_seq}",
                            recommended_action="Inquire with vendor regarding chronological numbering sequence gap.",
                            field="invoice_number",
                            bbox=data.invoice_number.bbox if data.invoice_number else None,
                        )
                    )
                # Implausible jump check
                elif (curr_seq - max_past_seq) > 500:
                    features["has_sequence_anomaly"] = 1
                    findings.append(
                        self.create_finding(
                            finding_type="INVOICE_NUMBER_SEQUENCE_ANOMALY",
                            severity="medium",
                            score=65.0,
                            confidence=0.86,
                            title="Implausible Sequence Number Jump",
                            summary=(
                                f"Invoice counter jumped from previous maximum {max_past_seq} to {curr_seq} "
                                f"(jump of {curr_seq - max_past_seq} invoices), which deviates from typical transaction cadence."
                            ),
                            expected=f"Counter close to {max_past_seq + 1}",
                            found=curr_seq,
                            difference=f"Jump of +{curr_seq - max_past_seq}",
                            recommended_action="Verify invoice series continuity with vendor account manager.",
                            field="invoice_number",
                            bbox=data.invoice_number.bbox if data.invoice_number else None,
                        )
                    )

        # 7. UNUSUAL_SUBMISSION_INTERVAL
        if parsed_inv_date and len(history) >= 4:
            history_dates = []
            for p in history:
                d = parse_date(p.get("invoice_date"))
                if d:
                    history_dates.append(d)

            history_dates.sort()
            if len(history_dates) >= 4:
                intervals = [
                    (history_dates[i] - history_dates[i - 1]).days
                    for i in range(1, len(history_dates))
                    if (history_dates[i] - history_dates[i - 1]).days >= 0
                ]
                if intervals:
                    mean_interval = sum(intervals) / len(intervals)
                    variance = sum((x - mean_interval) ** 2 for x in intervals) / len(intervals)
                    std_interval = math.sqrt(variance) if variance > 0 else 1.0

                    last_date = history_dates[-1]
                    current_interval = (parsed_inv_date.date() - last_date.date()).days

                    if current_interval > 0 and std_interval > 0:
                        z_score = (current_interval - mean_interval) / std_interval
                        if z_score >= 3.5 and current_interval > 60:
                            findings.append(
                                self.create_finding(
                                    finding_type="UNUSUAL_SUBMISSION_INTERVAL",
                                    severity="medium",
                                    score=55.0,
                                    confidence=0.82,
                                    title="Unusual Vendor Billing Interval",
                                    summary=(
                                        f"Days since vendor's previous bill is {current_interval} days "
                                        f"(vendor typically bills every {mean_interval:.0f} ± {std_interval:.0f} days; z-score: {z_score:.1f})."
                                    ),
                                    expected=f"Interval ~{mean_interval:.0f} days",
                                    found=f"{current_interval} days",
                                    difference=f"{current_interval - mean_interval:.0f} days above average",
                                    recommended_action="Check if vendor engagement was inactive or restarted recently.",
                                    field="invoice_date",
                                    bbox=data.invoice_date.bbox if data.invoice_date else None,
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
