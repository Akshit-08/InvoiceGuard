"""Plain-English narrative builder — Blueprint section 9.5.

Converts engine signals and findings into a human-readable investigation
summary, ordered by (score × confidence), with:
  - Top-findings narrative
  - "What would lower the risk" hints
  - Golden-rule disclaimer
"""

from __future__ import annotations

from backend.app.schemas.contracts import Finding, SignalResult

DISCLAIMER = (
    "InvoiceGuard flags anomalies for human review. "
    "It does not determine fraud."
)

_ENGINE_LABELS: dict[str, str] = {
    "financial": "Financial Arithmetic",
    "tax_identity": "Tax & Identity",
    "duplicate": "Duplicate Detection",
    "vendor": "Vendor Behaviour",
    "bank_change": "Bank Account",
    "identifiers": "Invoice Identifiers & Dates",
    "visual": "Visual Forensics",
    "extraction": "Extraction Quality",
}


def build_narrative(
    signals: list[SignalResult],
    overall_score: float,
    level: str,
    escalations: list[str],
    confidence_band: str,
) -> str:
    """Build a concise, plain-English analysis narrative."""
    lines: list[str] = []

    # Opening sentence
    level_desc = {
        "LOW": "a low risk level",
        "MEDIUM": "a medium risk level requiring review",
        "HIGH": "a high risk level that should be held pending investigation",
        "CRITICAL": "a critical risk level — do not approve payment without investigation",
    }.get(level, "an undetermined risk level")

    lines.append(
        f"InvoiceGuard assessed this invoice and assigned an overall risk score of "
        f"{overall_score:.0f}/100, indicating {level_desc}."
    )

    # Confidence band context
    if confidence_band == "LOW":
        lines.append(
            "⚠ Extraction confidence is low. Some findings may reflect poor scan quality "
            "rather than anomalies. Manual field verification is recommended."
        )
    elif confidence_band == "MEDIUM":
        lines.append("Extraction confidence is moderate. Key fields should be cross-checked.")

    # Active engines summary
    active = [(s, _ENGINE_LABELS.get(s.name, s.name)) for s in signals if s.score > 5.0]
    active.sort(key=lambda x: x[0].score, reverse=True)
    if active:
        engine_summary = ", ".join(
            f"{label} ({sig.score:.0f})" for sig, label in active[:4]
        )
        lines.append(f"The most significant signals came from: {engine_summary}.")

    # Top findings narrative
    all_findings = sorted(
        [f for s in signals for f in s.findings],
        key=lambda f: f.score * f.confidence,
        reverse=True,
    )
    non_info = [f for f in all_findings if f.severity != "info"]
    if non_info:
        lines.append("\nKey risk indicators:")
        for f in non_info[:5]:
            lines.append(f"  • [{f.severity.upper()}] {f.title}: {f.summary}")

    # Escalation notices
    if escalations:
        lines.append("\nEscalation rules triggered:")
        for esc in escalations:
            lines.append(f"  → {esc}")

    lines.append(f"\n{DISCLAIMER}")
    return "\n".join(lines)


def build_lower_risk_hints(
    signals: list[SignalResult],
    level: str,
) -> list[str]:
    """Return plain-English hints explaining what would reduce the risk score."""
    if level == "LOW":
        return ["The invoice is within normal parameters. No specific actions required."]

    hints: list[str] = []
    all_findings = sorted(
        [f for s in signals for f in s.findings if f.severity not in ("info",)],
        key=lambda f: f.score * f.confidence,
        reverse=True,
    )
    _seen_types: set[str] = set()
    for f in all_findings[:6]:
        if f.type in _seen_types:
            continue
        _seen_types.add(f.type)
        hint = _hint_for_type(f)
        if hint:
            hints.append(hint)

    if not hints:
        hints.append("Resolve the flagged anomalies and re-submit for analysis.")

    return hints


# ── Hint lookup table ─────────────────────────────────────────────────────────
def _hint_for_type(finding: Finding) -> str:
    _MAP = {
        "LINE_TOTAL_MISMATCH": "Confirm that all line-item totals (qty × unit price − discount) are correct.",
        "SUBTOTAL_MISMATCH": "Verify that the subtotal equals the sum of all line totals.",
        "GRAND_TOTAL_MISMATCH": "Reconcile grand total: subtotal − discount + shipping + taxes should match.",
        "AMOUNT_WORDS_MISMATCH": "Ensure the amount-in-words matches the numeric grand total exactly.",
        "GSTIN_CHECKSUM_FAIL": "Correct the GSTIN — the check digit (mod-36) does not match.",
        "GSTIN_INVALID_FORMAT": "Provide a valid 15-character GSTIN in the standard format.",
        "TAX_AMOUNT_MISMATCH": "Verify tax amounts: rate × taxable base should equal the reported tax.",
        "TAX_STRUCTURE_INCONSISTENT": "For same-state parties use CGST + SGST; for inter-state use IGST.",
        "INVOICE_NUMBER_REUSED": "Use a unique invoice number — this number was submitted before.",
        "BANK_ACCOUNT_CHANGED": "Provide written confirmation of the bank account change from the vendor.",
        "BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR": "Investigate — this bank account is linked to another vendor.",
        "EXACT_FILE_DUPLICATE": "Do not resubmit an identical file; request a new invoice.",
        "MODIFIED_DUPLICATE": "Resolve the discrepancy between the reused invoice number and the changed total.",
        "AMOUNT_OUTLIER": "Provide a purchase order or approval for the unusually high invoice amount.",
        "LOOKALIKE_VENDOR_NAME": "Verify vendor identity — the name closely resembles an existing vendor.",
        "PDF_EDITOR_PRODUCER": "Request an original, unedited PDF directly from the vendor.",
    }
    return _MAP.get(finding.type, f"Resolve the '{finding.type}' finding: {finding.recommended_action}")
