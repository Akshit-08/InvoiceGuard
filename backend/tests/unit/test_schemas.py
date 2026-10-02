"""Unit tests for Pydantic v2 data contracts."""

from backend.app.schemas.contracts import (
    Field,
    Finding,
    InvoiceData,
    LineItem,
    RiskResult,
    SignalResult,
    Token,
)


def test_token_schema():
    token = Token(
        text="INVOICE",
        bbox=[0.1, 0.2, 0.3, 0.4],
        page=0,
        conf=0.98,
        source="pdf",
    )
    assert token.text == "INVOICE"
    assert token.bbox == [0.1, 0.2, 0.3, 0.4]
    assert token.conf == 0.98
    assert token.source == "pdf"


def test_invoice_data_defaults():
    inv = InvoiceData()
    assert inv.currency.value == "INR"
    assert inv.vendor.name.value == ""
    assert inv.items == []
    assert inv.grand_total.value == 0.0

    # Add item
    item = LineItem(
        description=Field[str](value="Cloud Hosting"),
        quantity=Field[float](value=2.0),
        unit_price=Field[float](value=5000.0),
        line_total=Field[float](value=10000.0),
    )
    inv.items.append(item)
    assert len(inv.items) == 1
    assert inv.items[0].line_total.value == 10000.0


def test_finding_and_signal():
    finding = Finding(
        id="f1",
        engine="financial",
        category="rule",
        type="LINE_TOTAL_MISMATCH",
        severity="high",
        score=75.0,
        confidence=0.95,
        title="Line item total mismatch",
        summary="Calculated line total differs from stated total",
        evidence={"expected": 10000.0, "found": 15000.0, "difference": 5000.0},
        field="items[0].line_total",
        bbox=[0.1, 0.5, 0.3, 0.55],
        recommended_action="Verify line calculation with vendor.",
    )
    signal = SignalResult(
        name="financial",
        score=75.0,
        confidence=0.95,
        findings=[finding],
        features={"mismatch_count": 1},
    )
    assert signal.score == 75.0
    assert len(signal.findings) == 1


def test_risk_result_disclaimer():
    risk = RiskResult(
        overall_score=45.0,
        level="medium",
        probability=0.45,
        signals={"financial": 75.0, "tax_identity": 0.0},
        confidence=0.92,
        baseline_score=40.0,
        ml_score=50.0,
        recommendation="Manual verification suggested.",
    )
    assert "InvoiceGuard flags anomalies for human review" in risk.disclaimer
    assert risk.overall_score == 45.0
