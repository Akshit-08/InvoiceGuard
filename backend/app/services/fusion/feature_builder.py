"""Feature builder for risk fusion — Blueprint section 9.

Converts a list of SignalResults into a flat numeric feature vector
suitable for XGBoost training and inference.

Features (31 total):
  - 7 signal scores (one per engine, 0-100)
  - 7 signal confidences (one per engine, 0-1)
  - 17 engineered features derived from findings + invoice metadata
"""

from __future__ import annotations

from typing import Any

import numpy as np

from backend.app.schemas.contracts import SignalResult

# Canonical engine order — must match training column order
ENGINE_ORDER = [
    "financial",
    "tax_identity",
    "duplicate",
    "vendor",
    "bank_change",
    "identifiers",
    "visual",
]

# Finding type → severity weights for engineered features
SEVERITY_MAP = {"info": 0.0, "low": 0.2, "medium": 0.5, "high": 0.8, "critical": 1.0}


def build_feature_vector(
    signals: list[SignalResult],
    invoice_meta: dict[str, Any] | None = None,
) -> tuple[list[float], list[str]]:
    """Build a numeric feature vector from engine signals.

    Returns:
        (values, column_names) — parallel lists of the same length.
    """
    if invoice_meta is None:
        invoice_meta = {}

    signal_map: dict[str, SignalResult] = {s.name: s for s in signals}

    values: list[float] = []
    names: list[str] = []

    # ── Group 1: Raw engine scores (7) ───────────────────────────────────────
    for eng in ENGINE_ORDER:
        sig = signal_map.get(eng)
        score = sig.score if sig else 0.0
        values.append(float(score))
        names.append(f"score_{eng}")

    # ── Group 2: Engine confidences (7) ──────────────────────────────────────
    for eng in ENGINE_ORDER:
        sig = signal_map.get(eng)
        conf = sig.confidence if sig else 0.0
        values.append(float(conf))
        names.append(f"conf_{eng}")

    # ── Group 3: Engineered features (18) ────────────────────────────────────

    # 3a. total findings count, weighted severity mass
    all_findings = []
    for sig in signals:
        all_findings.extend(sig.findings)

    finding_count = float(len(all_findings))
    severity_mass = sum(SEVERITY_MAP.get(f.severity, 0.0) for f in all_findings)
    values.append(finding_count)
    names.append("feat_finding_count")
    values.append(severity_mass)
    names.append("feat_severity_mass")

    # 3b. Critical + high finding counts
    critical_count = float(sum(1 for f in all_findings if f.severity == "critical"))
    high_count = float(sum(1 for f in all_findings if f.severity == "high"))
    values.append(critical_count)
    names.append("feat_critical_count")
    values.append(high_count)
    names.append("feat_high_count")

    # 3c. Number of engines with score >= 50
    engines_above_50 = float(sum(1 for sig in signals if sig.score >= 50.0))
    engines_above_70 = float(sum(1 for sig in signals if sig.score >= 70.0))
    values.append(engines_above_50)
    names.append("feat_engines_above_50")
    values.append(engines_above_70)
    names.append("feat_engines_above_70")

    # 3d. Max score and min confidence across all engines
    all_scores = [sig.score for sig in signals]
    all_confs = [sig.confidence for sig in signals]
    max_score = float(max(all_scores)) if all_scores else 0.0
    min_conf = float(min(all_confs)) if all_confs else 0.0
    values.append(max_score)
    names.append("feat_max_engine_score")
    values.append(min_conf)
    names.append("feat_min_engine_conf")

    # 3e. Score variance (high variance = mixed signals = uncertainty)
    score_variance = float(np.var(all_scores)) if len(all_scores) > 1 else 0.0
    values.append(score_variance)
    names.append("feat_score_variance")

    # 3f. Specific high-value finding type flags
    finding_types = {f.type for f in all_findings}
    values.append(float("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR" in finding_types))
    names.append("feat_flag_shared_bank")
    values.append(float("MODIFIED_DUPLICATE" in finding_types or "EXACT_FILE_DUPLICATE" in finding_types))
    names.append("feat_flag_exact_duplicate")
    values.append(float("LOOKALIKE_VENDOR_NAME" in finding_types))
    names.append("feat_flag_lookalike_vendor")
    values.append(float("GSTIN_CHECKSUM_FAIL" in finding_types or "GSTIN_INVALID_FORMAT" in finding_types))
    names.append("feat_flag_gstin_invalid")
    values.append(float("AMOUNT_OUTLIER" in finding_types))
    names.append("feat_flag_amount_outlier")

    # 3g. Invoice-level metadata features
    grand_total = float(invoice_meta.get("grand_total", 0.0) or 0.0)
    # Round-total flag: grand_total is a suspiciously "round" number
    round_total_flag = float(grand_total > 0 and grand_total % 500 == 0)
    values.append(round_total_flag)
    names.append("feat_round_total_flag")

    item_count = float(invoice_meta.get("item_count", 0) or 0)
    values.append(item_count)
    names.append("feat_item_count")

    extraction_conf = float(invoice_meta.get("extraction_confidence", 0.0) or 0.0)
    values.append(extraction_conf)
    names.append("feat_extraction_confidence")

    assert len(values) == len(names), "Feature vector length mismatch"

    return values, names


def feature_columns() -> list[str]:
    """Return the canonical ordered list of feature column names."""
    _, names = build_feature_vector(
        signals=[],
        invoice_meta={},
    )
    return names
