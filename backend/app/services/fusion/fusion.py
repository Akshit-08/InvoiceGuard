"""Risk Fusion Orchestrator — Blueprint section 9.

Pipeline:
  1. Build feature vector from engine signals
  2. Compute noisy-OR baseline score (always deterministic)
  3. Compute XGBoost ML score (if model is available + FUSION_MODE≠baseline)
  4. Blend: 0.5·baseline + 0.5·ml  (configurable in fusion.yaml)
  5. Apply escalation rules (multi-signal floor, critical anomaly floor)
  6. Derive level, confidence band
  7. Compute SHAP top contributors
  8. Build plain-English narrative + lower-risk hints
  9. Return fully populated RiskResult

Backwards compatible: the old `fusion_engine.fuse(signals)` API is preserved.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import yaml

from backend.app.schemas.contracts import RiskResult, SignalResult
from backend.app.services.explain.narrative import (
    DISCLAIMER,
)
from backend.app.services.explain.recommendations import get_recommendation
from backend.app.services.fusion.feature_builder import build_feature_vector
from backend.app.services.fusion.shap_explain import compute_shap_top
from backend.app.services.fusion.thresholds import (
    apply_escalations,
    compute_confidence_band,
    score_to_level,
)
from backend.app.services.fusion.xgb_model import xgb_model

logger = logging.getLogger(__name__)

# ── Load fusion config ────────────────────────────────────────────────────────
_CONFIG_PATH = Path("config/fusion.yaml")


def _load_fusion_cfg() -> dict[str, Any]:
    if _CONFIG_PATH.exists():
        try:
            with open(_CONFIG_PATH, encoding="utf-8") as fh:
                return yaml.safe_load(fh) or {}
        except Exception:
            logger.exception("Failed to load fusion.yaml — using defaults.")
    return {}


def _get_weights(cfg: dict[str, Any]) -> dict[str, float]:
    defaults = {
        "financial": 0.85,
        "tax_identity": 0.60,
        "duplicate": 0.80,
        "vendor": 0.60,
        "bank_change": 0.80,
        "identifiers": 0.40,
        "visual": 0.50,
    }
    return {**defaults, **cfg.get("weights", {})}


# ── Noisy-OR baseline ─────────────────────────────────────────────────────────
def _noisy_or(signals: list[SignalResult], weights: dict[str, float]) -> float:
    """Deterministic noisy-OR: 1 − ∏(1 − w_i · s_i/100) × 100."""
    prob_no_anomaly = 1.0
    for sig in signals:
        w = weights.get(sig.name, 0.5)
        p_i = sig.score / 100.0
        prob_no_anomaly *= 1.0 - (w * p_i)
    return round((1.0 - prob_no_anomaly) * 100.0, 1)


def _signals_without_informational(
    signals: list[SignalResult],
    informational_types: set[str],
) -> list[SignalResult]:
    """Return cloned signals with informational-only finding scores zeroed out.

    If ALL findings on a signal are informational, the signal's effective score
    for baseline purposes is 0.  If some findings are non-informational, only
    the non-informational ones contribute to the effective score (max of their
    individual scores, matching the original aggregate_score logic).

    The original signal objects are NOT mutated — we only create lightweight
    surrogate SignalResult objects with the adjusted scores for the noisy-OR
    computation. The full, unmodified signals are still used everywhere else
    (API response, SHAP, escalations, UI findings list).
    """
    if not informational_types:
        return signals

    adjusted: list[SignalResult] = []
    for sig in signals:
        if not sig.findings:
            effective_score = sig.score
        else:
            non_info_scores = [
                f.score
                for f in sig.findings
                if getattr(f, "type", getattr(f, "finding_type", "")) not in informational_types
            ]
            if not non_info_scores:
                # All findings are informational — zero out this signal's baseline contribution
                effective_score = 0.0
            else:
                effective_score = float(max(non_info_scores))

        # Create a surrogate (only score is changed; name/confidence preserved)
        adjusted.append(
            SignalResult(
                name=sig.name,
                score=effective_score,
                confidence=sig.confidence,
                findings=[],  # findings are already in original sig
                features=sig.features or {},
            )
        )
    return adjusted



# ── Main FusionEngine class ───────────────────────────────────────────────────
class FusionEngine:
    """Fuses detection engine signals into an explainable 0–100 RiskResult."""

    def fuse(
        self,
        signals: list[SignalResult],
        weights: dict[str, float] | None = None,
        invoice_meta: dict[str, Any] | None = None,
        extraction_confidence: float = 1.0,
    ) -> RiskResult:
        """Produce a fully explainable RiskResult from engine signals.

        Args:
            signals: Output from every detection engine.
            weights: Override the engine weights (falls back to fusion.yaml).
            invoice_meta: Optional invoice-level features (grand_total, item_count, …).
            extraction_confidence: Overall extraction quality [0, 1].
        """
        cfg = _load_fusion_cfg()
        if weights is None:
            weights = _get_weights(cfg)

        blend_cfg = cfg.get("combination_ratio", {"baseline": 0.5, "ml": 0.5})
        baseline_ratio = float(blend_cfg.get("baseline", 0.5))
        ml_ratio = float(blend_cfg.get("ml", 0.5))

        escalation_cfg = cfg.get("escalations", {})
        threshold_cfg = cfg.get("level_thresholds", {})
        confidence_band_cfg = cfg.get("confidence_band", {})

        # Informational finding types are shown in UI but excluded from the
        # noisy-OR baseline so they cannot push genuine invoices above threshold.
        informational_types: set[str] = set(cfg.get("informational_finding_types", []))

        # ── Step 1: Noisy-OR baseline (informational findings excluded) ───────
        # We rebuild per-engine scores after stripping informational findings.
        scored_signals = _signals_without_informational(signals, informational_types)
        baseline_score = _noisy_or(scored_signals, weights)


        # ── Step 2: Feature vector ────────────────────────────────────────────
        feat_values, feat_names = build_feature_vector(signals, invoice_meta or {})

        # ── Step 3: XGBoost ML score ──────────────────────────────────────────
        fusion_mode = os.environ.get("FUSION_MODE", cfg.get("fusion_mode", "auto")).lower()
        ml_score = 0.0
        shap_top: list[dict[str, Any]] = []

        if fusion_mode != "baseline" and xgb_model.is_available:
            ml_score = xgb_model.predict_score(feat_values)
            # SHAP top contributors
            if xgb_model._pipeline is not None:
                shap_top = compute_shap_top(
                    pipeline=xgb_model._pipeline,
                    feature_vector=feat_values,
                    feature_names=feat_names,
                    top_n=8,
                )

        # ── Step 4: Blend ─────────────────────────────────────────────────────
        if fusion_mode == "baseline" or not xgb_model.is_available:
            # Baseline-only mode
            blended = baseline_score
        else:
            blended = baseline_ratio * baseline_score + ml_ratio * ml_score

        blended = round(min(100.0, max(0.0, blended)), 1)

        # ── Step 5: Escalations ───────────────────────────────────────────────
        final_score, escalations = apply_escalations(blended, signals, escalation_cfg)

        # ── Step 6: Level + confidence band ──────────────────────────────────
        level = score_to_level(final_score, threshold_cfg)
        confidence_band = compute_confidence_band(
            extraction_confidence, signals, confidence_band_cfg
        )

        # ── Step 7: Overall confidence scalar ────────────────────────────────
        overall_confidence = _compute_overall_confidence(
            extraction_confidence, signals, confidence_band
        )

        # ── Step 8: Narrative & hints ─────────────────────────────────────────
        recommendation = get_recommendation(level, signals)

        # ── Step 9: Assemble RiskResult ───────────────────────────────────────
        signal_scores = {s.name: s.score for s in signals}
        thresholds_dict = {
            "low_max": threshold_cfg.get("low_max", 29.0),
            "medium_max": threshold_cfg.get("medium_max", 59.0),
            "high_max": threshold_cfg.get("high_max", 79.0),
        }

        actual_mode = "baseline" if (fusion_mode == "baseline" or not xgb_model.is_available) else "xgboost+baseline"

        return RiskResult(
            overall_score=final_score,
            level=level.lower(),  # schema uses lowercase
            level_thresholds=thresholds_dict,
            probability=round(final_score / 100.0, 4),
            signals=signal_scores,
            confidence=overall_confidence,
            baseline_score=baseline_score,
            ml_score=ml_score,
            fusion_mode=actual_mode,
            shap_top=shap_top,
            escalations=escalations,
            recommendation=recommendation,
            disclaimer=DISCLAIMER,
        )


def _compute_overall_confidence(
    extraction_confidence: float,
    signals: list[SignalResult],
    confidence_band: str,
) -> float:
    """Derive a single [0, 1] confidence scalar from band and engine signals."""
    band_map = {"HIGH": 0.9, "MEDIUM": 0.65, "LOW": 0.35}
    return round(band_map.get(confidence_band, 0.65), 2)


# Module-level singleton (replaces the old `fusion_engine` in baseline.py)
fusion_engine = FusionEngine()
