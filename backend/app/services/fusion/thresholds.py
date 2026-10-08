"""Risk level thresholds and escalation rules — Blueprint section 9.

All thresholds and escalation rules are loaded from config/fusion.yaml
and can be overridden at runtime via the settings API.
"""

from __future__ import annotations

from typing import Any

from backend.app.schemas.contracts import SignalResult

# ── Default thresholds (mirrors config/fusion.yaml) ──────────────────────────
DEFAULT_LEVEL_THRESHOLDS: dict[str, float] = {
    "low_max": 29.0,
    "medium_max": 59.0,
    "high_max": 79.0,
}

DEFAULT_ESCALATIONS: dict[str, Any] = {
    "multi_signal_count": 2,
    "multi_signal_threshold": 70.0,
    "multi_signal_floor": 65.0,
    "critical_anomaly_types": {
        "BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR",
        "MODIFIED_DUPLICATE",
        "EXACT_FILE_DUPLICATE",
    },
    "critical_anomaly_floor": 75.0,
}


def score_to_level(score: float, thresholds: dict[str, float] | None = None) -> str:
    """Map 0–100 score to LOW / MEDIUM / HIGH / CRITICAL."""
    t = thresholds or DEFAULT_LEVEL_THRESHOLDS
    if score <= t.get("low_max", 29.0):
        return "LOW"
    if score <= t.get("medium_max", 59.0):
        return "MEDIUM"
    if score <= t.get("high_max", 79.0):
        return "HIGH"
    return "CRITICAL"


def apply_escalations(
    score: float,
    signals: list[SignalResult],
    cfg: dict[str, Any] | None = None,
) -> tuple[float, list[str]]:
    """Apply escalation rules and return (final_score, list[escalation_messages]).

    Escalation rules (Blueprint §9.3):
      • ≥ N engines with score ≥ multi_signal_threshold → floor to multi_signal_floor
      • Any finding of a critical type → floor to critical_anomaly_floor
    """
    e = cfg or DEFAULT_ESCALATIONS
    escalations: list[str] = []
    final = score

    # Rule 1: multiple high-signal engines
    multi_threshold = float(e.get("multi_signal_threshold", 70.0))
    multi_count = int(e.get("multi_signal_count", 2))
    multi_floor = float(e.get("multi_signal_floor", 65.0))
    high_sigs = [s for s in signals if s.score >= multi_threshold]
    if len(high_sigs) >= multi_count:
        if final < multi_floor:
            final = multi_floor
        escalations.append(
            f"{len(high_sigs)} independent engines reported risk ≥ {multi_threshold:.0f} "
            f"— risk floor raised to {multi_floor:.0f}."
        )

    # Rule 2: critical finding types
    critical_types = set(e.get("critical_anomaly_types", set()))
    critical_floor = float(e.get("critical_anomaly_floor", 75.0))
    for sig in signals:
        for finding in sig.findings:
            if finding.type in critical_types:
                if final < critical_floor:
                    final = critical_floor
                escalations.append(
                    f"Critical anomaly '{finding.type}' detected — "
                    f"risk floor raised to {critical_floor:.0f}."
                )
                break  # one message per signal is enough

    # Rule 3: severe single-engine anomaly (score >= severe_single_threshold) guarantees High band
    severe_threshold = float(e.get("severe_single_threshold", 90.0))
    severe_floor = float(e.get("severe_single_floor", 60.0))
    severe_sigs = [s for s in signals if s.score >= severe_threshold]
    if severe_sigs and final < severe_floor:
        final = severe_floor
        escalations.append(
            f"Severe anomaly in '{severe_sigs[0].name}' ({severe_sigs[0].score:.0f}) "
            f"— risk floor raised to {severe_floor:.0f}."
        )

    return round(final, 1), escalations


def compute_confidence_band(
    extraction_confidence: float,
    signals: list[SignalResult],
    cfg: dict[str, Any] | None = None,
) -> str:
    """Derive HIGH / MEDIUM / LOW confidence band.

    Confidence is the geometric mean of extraction_confidence and
    mean engine confidence, clipped to [0, 1].
    """
    if not signals:
        return "LOW"

    mean_engine_conf = sum(s.confidence for s in signals) / len(signals)
    # Geometric mean of both sources
    import math
    blended = math.sqrt(max(0.0, extraction_confidence) * max(0.0, mean_engine_conf))
    blended = min(1.0, blended)

    high_min = 0.75
    medium_min = 0.45
    if cfg:
        high_min = float(cfg.get("high_min", 0.75))
        medium_min = float(cfg.get("medium_min", 0.45))

    if blended >= high_min:
        return "HIGH"
    if blended >= medium_min:
        return "MEDIUM"
    return "LOW"
