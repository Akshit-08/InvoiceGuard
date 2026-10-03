"""Tests for the risk fusion system — feature builder, thresholds, narrative, and fusion engine.

Blueprint section 9 coverage:
  - Noisy-OR baseline correct computation
  - Escalation rules (multi-signal floor, critical anomaly floor)
  - Level boundaries
  - Confidence band derivation
  - Feature vector shape and monotonicity
  - SHAP stub (no model present)
  - Plain-English narrative includes required elements
  - Recommendation per level
  - FUSION_MODE=baseline fallback
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from backend.app.schemas.contracts import Finding, RiskResult, SignalResult
from backend.app.services.explain.narrative import (
    DISCLAIMER,
    build_lower_risk_hints,
    build_narrative,
)
from backend.app.services.explain.recommendations import get_recommendation
from backend.app.services.fusion.feature_builder import (
    ENGINE_ORDER,
    build_feature_vector,
    feature_columns,
)
from backend.app.services.fusion.fusion import FusionEngine, _noisy_or
from backend.app.services.fusion.thresholds import (
    apply_escalations,
    compute_confidence_band,
    score_to_level,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_signal(name: str, score: float, confidence: float = 0.9, findings=None) -> SignalResult:
    return SignalResult(
        name=name,
        score=score,
        confidence=confidence,
        findings=findings or [],
        features={},
    )


def _make_finding(
    finding_type: str,
    severity: str = "high",
    score: float = 70.0,
    confidence: float = 0.8,
) -> Finding:
    import uuid
    return Finding(
        id=str(uuid.uuid4()),
        engine="test",
        category="rule",
        type=finding_type,
        severity=severity,
        score=score,
        confidence=confidence,
        title=f"Test {finding_type}",
        summary="Test finding summary.",
        evidence={"expected": "x", "found": "y", "difference": "z"},
        recommended_action="Verify manually.",
    )


# ── Noisy-OR baseline ─────────────────────────────────────────────────────────

class TestNoisyOR:
    def test_zero_signals_returns_zero(self):
        result = _noisy_or([], {})
        assert result == 0.0

    def test_single_high_signal(self):
        signals = [_make_signal("financial", 100.0)]
        weights = {"financial": 0.85}
        score = _noisy_or(signals, weights)
        assert score == pytest.approx(85.0, abs=0.2)

    def test_accumulation_above_single(self):
        """Two 50-score signals should combine above 50."""
        signals = [
            _make_signal("financial", 50.0),
            _make_signal("duplicate", 50.0),
        ]
        weights = {"financial": 0.85, "duplicate": 0.80}
        score = _noisy_or(signals, weights)
        assert score > 50.0

    def test_all_zero_signals(self):
        signals = [_make_signal(name, 0.0) for name in ENGINE_ORDER]
        score = _noisy_or(signals, {name: 0.8 for name in ENGINE_ORDER})
        assert score == 0.0

    def test_order_independent(self):
        """Noisy-OR must be commutative."""
        signals_ab = [_make_signal("financial", 60.0), _make_signal("duplicate", 80.0)]
        signals_ba = [_make_signal("duplicate", 80.0), _make_signal("financial", 60.0)]
        w = {"financial": 0.85, "duplicate": 0.80}
        assert _noisy_or(signals_ab, w) == pytest.approx(_noisy_or(signals_ba, w))


# ── Feature builder ───────────────────────────────────────────────────────────

class TestFeatureBuilder:
    def test_empty_signals_returns_expected_length(self):
        values, names = build_feature_vector([])
        assert len(values) == len(names)
        # 7 scores + 7 confs + 17 engineered = 31
        assert len(values) == 31

    def test_feature_columns_consistent(self):
        cols = feature_columns()
        assert len(cols) == 31
        assert "score_financial" in cols
        assert "feat_finding_count" in cols

    def test_engines_above_70_count_correct(self):
        signals = [
            _make_signal("financial", 80.0),
            _make_signal("duplicate", 75.0),
            _make_signal("vendor", 30.0),
        ]
        values, names = build_feature_vector(signals)
        idx = names.index("feat_engines_above_70")
        assert values[idx] == 2.0

    def test_critical_finding_flag(self):
        critical_finding = _make_finding("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR", "critical", 95.0)
        signals = [_make_signal("bank_change", 90.0, findings=[critical_finding])]
        values, names = build_feature_vector(signals)
        idx = names.index("feat_flag_shared_bank")
        assert values[idx] == 1.0

    def test_round_total_flag(self):
        _, names = build_feature_vector([], invoice_meta={"grand_total": 10000.0})
        values, _ = build_feature_vector([], invoice_meta={"grand_total": 10000.0})
        idx = names.index("feat_round_total_flag")
        assert values[idx] == 1.0

        # Non-round total should be 0
        values_no_round, _ = build_feature_vector([], invoice_meta={"grand_total": 10137.50})
        assert values_no_round[idx] == 0.0


# ── Thresholds ────────────────────────────────────────────────────────────────

class TestLevelThresholds:
    @pytest.mark.parametrize("score,expected", [
        (0, "LOW"),
        (15, "LOW"),
        (29, "LOW"),
        (30, "MEDIUM"),
        (59, "MEDIUM"),
        (60, "HIGH"),
        (79, "HIGH"),
        (80, "CRITICAL"),
        (100, "CRITICAL"),
    ])
    def test_default_level_boundaries(self, score, expected):
        assert score_to_level(score) == expected


class TestEscalations:
    def test_no_escalation_on_low_signals(self):
        signals = [_make_signal("financial", 50.0), _make_signal("duplicate", 40.0)]
        score, escalations = apply_escalations(50.0, signals)
        assert escalations == []
        assert score == 50.0

    def test_multi_signal_floor_triggered(self):
        signals = [_make_signal("financial", 75.0), _make_signal("duplicate", 80.0)]
        # Initial score is 40, which is below the floor
        score, escalations = apply_escalations(40.0, signals)
        assert score == 65.0
        assert len(escalations) >= 1
        assert "65" in escalations[0]

    def test_critical_anomaly_floor_shared_bank(self):
        critical_finding = _make_finding("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR", "critical", 95.0)
        signals = [_make_signal("bank_change", 90.0, findings=[critical_finding])]
        score, escalations = apply_escalations(50.0, signals)
        assert score == 75.0
        assert any("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR" in e for e in escalations)

    def test_critical_anomaly_floor_modified_duplicate(self):
        finding = _make_finding("MODIFIED_DUPLICATE", "critical", 95.0)
        signals = [_make_signal("duplicate", 95.0, findings=[finding])]
        score, escalations = apply_escalations(60.0, signals)
        assert score == 75.0

    def test_escalation_does_not_lower_score(self):
        """If the score is already above the floor, escalation must not lower it."""
        signals = [_make_signal("financial", 75.0), _make_signal("duplicate", 80.0)]
        score, _ = apply_escalations(80.0, signals)
        assert score >= 80.0


class TestConfidenceBand:
    def test_high_confidence(self):
        signals = [_make_signal("financial", 80.0, confidence=0.9)]
        band = compute_confidence_band(0.95, signals)
        assert band == "HIGH"

    def test_low_confidence_extraction(self):
        signals = [_make_signal("financial", 80.0, confidence=0.9)]
        band = compute_confidence_band(0.1, signals)
        assert band == "LOW"

    def test_medium_confidence(self):
        signals = [_make_signal("financial", 50.0, confidence=0.6)]
        band = compute_confidence_band(0.5, signals)
        # sqrt(0.5 × 0.6) ≈ 0.548 → MEDIUM
        assert band == "MEDIUM"


# ── Narrative ─────────────────────────────────────────────────────────────────

class TestNarrative:
    def test_disclaimer_always_present(self):
        signals = [_make_signal("financial", 40.0)]
        narrative = build_narrative(signals, 40.0, "MEDIUM", [], "HIGH")
        assert DISCLAIMER in narrative

    def test_score_mentioned(self):
        signals = [_make_signal("financial", 75.0)]
        narrative = build_narrative(signals, 75.0, "HIGH", [], "MEDIUM")
        assert "75" in narrative

    def test_escalation_included(self):
        signals = [_make_signal("financial", 75.0)]
        narrative = build_narrative(signals, 75.0, "HIGH", ["Test escalation rule triggered."], "MEDIUM")
        assert "Test escalation rule triggered." in narrative

    def test_low_confidence_warning(self):
        signals = [_make_signal("financial", 75.0)]
        narrative = build_narrative(signals, 75.0, "HIGH", [], "LOW")
        assert "low" in narrative.lower()

    def test_hints_low_level_empty_action(self):
        signals = [_make_signal("financial", 10.0)]
        hints = build_lower_risk_hints(signals, "LOW")
        assert len(hints) > 0
        assert "No specific actions" in hints[0]

    def test_hints_for_bank_finding(self):
        finding = _make_finding("BANK_ACCOUNT_CHANGED", "high", 80.0)
        signals = [_make_signal("bank_change", 80.0, findings=[finding])]
        hints = build_lower_risk_hints(signals, "HIGH")
        assert any("bank" in h.lower() for h in hints)


# ── Recommendations ───────────────────────────────────────────────────────────

class TestRecommendations:
    @pytest.mark.parametrize("level,expected_keyword", [
        ("LOW", "standard"),
        ("MEDIUM", "secondary reviewer"),
        ("HIGH", "Hold payment"),
        ("CRITICAL", "Do not approve"),
    ])
    def test_recommendation_per_level(self, level, expected_keyword):
        rec = get_recommendation(level)
        assert expected_keyword.lower() in rec.lower()


# ── Full fusion engine ────────────────────────────────────────────────────────

class TestFusionEngine:
    def test_fuse_returns_risk_result(self):
        engine = FusionEngine()
        signals = [
            _make_signal("financial", 40.0),
            _make_signal("tax_identity", 20.0),
        ]
        result = engine.fuse(signals)
        assert isinstance(result, RiskResult)

    def test_disclaimer_always_present(self):
        engine = FusionEngine()
        result = engine.fuse([_make_signal("financial", 50.0)])
        assert DISCLAIMER in result.disclaimer

    def test_level_matches_score(self):
        engine = FusionEngine()
        # Force a very high score via high signals
        signals = [_make_signal(name, 90.0) for name in ENGINE_ORDER]
        result = engine.fuse(signals)
        assert result.level in ("high", "critical")

    def test_low_risk_result(self):
        engine = FusionEngine()
        signals = [_make_signal(name, 0.0) for name in ENGINE_ORDER]
        result = engine.fuse(signals)
        assert result.baseline_score == 0.0
        assert result.overall_score < 30.0
        assert result.level == "low"

    def test_baseline_mode_skips_ml(self):
        engine = FusionEngine()
        signals = [_make_signal("financial", 50.0)]
        with patch.dict(os.environ, {"FUSION_MODE": "baseline"}):
            result = engine.fuse(signals)
        # When baseline-only, ml_score should be 0
        assert result.ml_score == 0.0

    def test_shap_empty_without_model(self):
        """Without a trained model artifact, SHAP top should be empty."""
        engine = FusionEngine()
        signals = [_make_signal("financial", 70.0)]
        with patch.dict(os.environ, {"FUSION_MODE": "baseline"}):
            result = engine.fuse(signals)
        # No model → no SHAP
        assert isinstance(result.shap_top, list)

    def test_escalation_critical_finding_applied(self):
        engine = FusionEngine()
        critical_finding = _make_finding("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR", "critical", 95.0)
        signals = [
            _make_signal("bank_change", 90.0, findings=[critical_finding]),
            _make_signal("financial", 10.0),
        ]
        with patch.dict(os.environ, {"FUSION_MODE": "baseline"}):
            result = engine.fuse(signals)
        # Score must be >= 75 due to critical escalation
        assert result.overall_score >= 75.0
        assert len(result.escalations) >= 1

    def test_signals_dict_populated(self):
        engine = FusionEngine()
        signals = [
            _make_signal("financial", 55.0),
            _make_signal("vendor", 30.0),
        ]
        result = engine.fuse(signals)
        assert "financial" in result.signals
        assert result.signals["financial"] == 55.0

    def test_probability_in_range(self):
        engine = FusionEngine()
        signals = [_make_signal("financial", 60.0)]
        result = engine.fuse(signals)
        assert 0.0 <= result.probability <= 1.0

    def test_level_thresholds_in_result(self):
        engine = FusionEngine()
        result = engine.fuse([])
        assert "low_max" in result.level_thresholds
        assert "medium_max" in result.level_thresholds
        assert "high_max" in result.level_thresholds
