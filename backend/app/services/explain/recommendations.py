"""Recommendations per risk level — Blueprint section 9.5.

Returns an actionable, human-readable recommendation string and a
structured action object based on the final risk level and top findings.
"""

from __future__ import annotations

from typing import Any

from backend.app.schemas.contracts import SignalResult

_LEVEL_RECOMMENDATIONS: dict[str, str] = {
    "LOW": (
        "This invoice appears within normal parameters. "
        "Proceed with standard approval workflow."
    ),
    "MEDIUM": (
        "This invoice has minor anomalies. "
        "A secondary reviewer should confirm the flagged findings before approving payment."
    ),
    "HIGH": (
        "Hold payment pending manual review. "
        "Verify flagged fields directly with the vendor and obtain supporting documentation."
    ),
    "CRITICAL": (
        "Do not approve payment. "
        "Escalate to the finance compliance team immediately. "
        "Preserve all evidence and do not contact the vendor until the investigation is complete."
    ),
}

_LEVEL_ACTIONS: dict[str, dict[str, Any]] = {
    "LOW": {
        "action": "approve",
        "urgency": "routine",
        "escalate_to": None,
    },
    "MEDIUM": {
        "action": "secondary_review",
        "urgency": "within_5_days",
        "escalate_to": "senior_approver",
    },
    "HIGH": {
        "action": "hold_payment",
        "urgency": "within_48_hours",
        "escalate_to": "finance_manager",
    },
    "CRITICAL": {
        "action": "block_and_escalate",
        "urgency": "immediate",
        "escalate_to": "compliance_team",
    },
}


def get_recommendation(level: str, signals: list[SignalResult] | None = None) -> str:
    """Return the plain-English recommendation for a risk level."""
    base = _LEVEL_RECOMMENDATIONS.get(level.upper(), "Review the invoice carefully.")
    # Append specific guidance if a bank change was the main driver
    if signals:
        for sig in signals:
            if sig.name == "bank_change" and sig.score >= 60:
                base += (
                    " Note: A bank account change was detected. "
                    "Confirm the new account details directly with the vendor via a known contact."
                )
                break
    return base


def get_action_object(level: str) -> dict[str, Any]:
    """Return a structured action dict for the frontend review workflow."""
    return _LEVEL_ACTIONS.get(level.upper(), {"action": "review", "urgency": "routine", "escalate_to": None})
