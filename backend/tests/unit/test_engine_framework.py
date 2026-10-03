"""Unit tests for Engine Framework, BaseEngine, AnalysisContext, and SettingsService."""

from backend.app.schemas.contracts import InvoiceData, Token
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


class DummyEngine(BaseEngine):
    name = "dummy"
    category = "rule"

    def analyze(self, context: AnalysisContext):
        finding = self.create_finding(
            finding_type="TEST_ANOMALY",
            severity="high",
            score=75.0,
            confidence=0.95,
            title="Test Discrepancy",
            summary="A test discrepancy was flagged.",
            expected=100.0,
            found=150.0,
            difference=50.0,
            recommended_action="Verify invoice values manually.",
            field="grand_total",
            bbox=[0.1, 0.2, 0.3, 0.4],
        )
        score = self.aggregate_score([finding])
        return self.create_signal_result([finding], score=score)

    def create_signal_result(self, findings, score):
        from backend.app.schemas.contracts import SignalResult

        return SignalResult(
            name=self.name,
            score=score,
            confidence=0.95,
            findings=findings,
            features={"test_feature": 1.0},
        )


def test_settings_service_tolerances_and_toggles():
    tol = settings_service.get_tolerance("line_total_abs", default=1.0)
    assert tol == 1.0
    assert settings_service.is_engine_enabled("financial") is True
    thresholds = settings_service.get_thresholds()
    assert thresholds["low"] == 30.0
    assert thresholds["high"] == 80.0
    editors = settings_service.get_pdf_editors()
    assert "Photoshop" in editors or "iLovePDF" in editors


def test_date_aware_gst_slabs():
    # Pre-reform date (before 22 September 2025): 12% and 28% are valid
    assert settings_service.is_valid_gst_slab(12.0, "2024-05-10") is True
    assert settings_service.is_valid_gst_slab(28.0, "2024-05-10") is True
    assert settings_service.is_valid_gst_slab(18.0, "2024-05-10") is True

    # Post-reform date (GST 2.0 on or after 22 September 2025): 12% and 28% are obsolete
    assert settings_service.is_valid_gst_slab(40.0, "2025-10-01") is True
    assert settings_service.is_valid_gst_slab(18.0, "2025-10-01") is True
    assert settings_service.is_valid_gst_slab(12.0, "2025-10-01") is False
    assert settings_service.is_valid_gst_slab(28.0, "2025-10-01") is False

    # Arbitrary non-slab rate should always fail
    assert settings_service.is_valid_gst_slab(16.5, "2024-05-10") is False
    assert settings_service.is_valid_gst_slab(22.0, "2025-10-01") is False


def test_base_engine_and_analysis_context():
    data = InvoiceData()
    token = Token(text="Invoice", bbox=[0.1, 0.1, 0.2, 0.2], page=0, conf=0.99, source="pdf")
    ctx = AnalysisContext(
        invoice_id="inv-test-123",
        data=data,
        tokens=[token],
    )
    assert ctx.invoice_id == "inv-test-123"
    assert len(ctx.tokens) == 1

    engine = DummyEngine()
    result = engine.analyze(ctx)
    assert result.name == "dummy"
    assert len(result.findings) == 1
    f = result.findings[0]
    assert f.type == "TEST_ANOMALY"
    assert f.evidence["expected"] == 100.0
    assert f.evidence["found"] == 150.0
    assert f.evidence["difference"] == 50.0
    assert f.bbox == [0.1, 0.2, 0.3, 0.4]
    assert "Verify" in f.recommended_action
