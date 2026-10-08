"""Unit tests for IdentifiersRulesEngine."""

from backend.app.schemas.contracts import Field, InvoiceData
from backend.app.services.engines.base import AnalysisContext
from backend.app.services.engines.rules.identifiers import IdentifiersRulesEngine


def test_date_in_future_due_before_invoice_and_date_too_old():
    engine = IdentifiersRulesEngine()

    # Pass case: reasonable dates (current month, due 15 days later)
    data_pass = InvoiceData(
        invoice_date=Field[str](value="2026-03-01"),
        due_date=Field[str](value="2026-03-20"),
    )
    res_pass = engine.analyze(
        AnalysisContext(invoice_id="inv-id-pass", data=data_pass)
    )
    assert not any(f.type == "DATE_IN_FUTURE" for f in res_pass.findings)
    assert not any(f.type == "DUE_BEFORE_INVOICE" for f in res_pass.findings)

    # Fail case 1: Far future date (e.g. 2035)
    data_future = InvoiceData(
        invoice_date=Field[str](value="2035-12-01"),
    )
    res_future = engine.analyze(
        AnalysisContext(invoice_id="inv-future", data=data_future)
    )
    assert any(f.type == "DATE_IN_FUTURE" for f in res_future.findings)

    # Fail case 2: Due before invoice
    data_due_fail = InvoiceData(
        invoice_date=Field[str](value="2026-03-15"),
        due_date=Field[str](value="2026-03-01"),
    )
    res_due = engine.analyze(
        AnalysisContext(invoice_id="inv-due", data=data_due_fail)
    )
    assert any(f.type == "DUE_BEFORE_INVOICE" for f in res_due.findings)

    # Fail case 3: Date too old (> 365 days ago)
    data_old = InvoiceData(
        invoice_date=Field[str](value="2020-01-01"),
    )
    res_old = engine.analyze(
        AnalysisContext(invoice_id="inv-old", data=data_old)
    )
    assert any(f.type == "DATE_TOO_OLD" for f in res_old.findings)


def test_invoice_number_reused_and_format_deviation():
    engine = IdentifiersRulesEngine()

    vendor_history = [
        {"invoice_number": "INV-2025-0101", "invoice_date": "2025-01-15", "grand_total": 45000.0, "id": "hist-1"},
        {"invoice_number": "INV-2025-0102", "invoice_date": "2025-02-15", "grand_total": 48000.0, "id": "hist-2"},
        {"invoice_number": "INV-2025-0103", "invoice_date": "2025-03-15", "grand_total": 52000.0, "id": "hist-3"},
        {"invoice_number": "INV-2025-0104", "invoice_date": "2025-04-15", "grand_total": 50000.0, "id": "hist-4"},
    ]

    # Reused invoice number fail: same invoice number INV-2025-0102 but different total
    data_reused = InvoiceData(
        invoice_number=Field[str](value="INV-2025-0102"),
        grand_total=Field[float](value=99000.0),
    )
    ctx_reused = AnalysisContext(
        invoice_id="inv-new-reused",
        data=data_reused,
        vendor_history=vendor_history,
    )
    res_reused = engine.analyze(ctx_reused)
    reused_findings = [f for f in res_reused.findings if f.type == "INVOICE_NUMBER_REUSED"]
    assert len(reused_findings) == 1
    assert reused_findings[0].severity == "critical"

    # Format deviation fail: vendor history uses INV- prefix, this invoice uses BILL/99
    data_dev = InvoiceData(
        invoice_number=Field[str](value="BILL/99"),
        grand_total=Field[float](value=50000.0),
    )
    ctx_dev = AnalysisContext(
        invoice_id="inv-new-dev",
        data=data_dev,
        vendor_history=vendor_history,
    )
    res_dev = engine.analyze(ctx_dev)
    assert any(f.type == "INVOICE_NUMBER_FORMAT_DEVIATION" for f in res_dev.findings)


def test_invoice_number_sequence_anomaly_and_interval():
    engine = IdentifiersRulesEngine()

    vendor_history = [
        {"invoice_number": "INV-0100", "invoice_date": "2025-01-01", "grand_total": 10000.0, "id": "h1"},
        {"invoice_number": "INV-0101", "invoice_date": "2025-02-01", "grand_total": 10000.0, "id": "h2"},
        {"invoice_number": "INV-0102", "invoice_date": "2025-03-01", "grand_total": 10000.0, "id": "h3"},
        {"invoice_number": "INV-0103", "invoice_date": "2025-04-01", "grand_total": 10000.0, "id": "h4"},
    ]

    # Sequence regression fail: counter steps back to 0050
    data_seq_reg = InvoiceData(
        invoice_number=Field[str](value="INV-0050"),
        invoice_date=Field[str](value="2025-05-01"),
    )
    ctx_reg = AnalysisContext(
        invoice_id="inv-reg",
        data=data_seq_reg,
        vendor_history=vendor_history,
    )
    res_reg = engine.analyze(ctx_reg)
    assert any(f.type == "INVOICE_NUMBER_SEQUENCE_ANOMALY" for f in res_reg.findings)

    # Implausible jump fail: counter jumps to 0999
    data_seq_jump = InvoiceData(
        invoice_number=Field[str](value="INV-0999"),
        invoice_date=Field[str](value="2025-05-01"),
    )
    ctx_jump = AnalysisContext(
        invoice_id="inv-jump",
        data=data_seq_jump,
        vendor_history=vendor_history,
    )
    res_jump = engine.analyze(ctx_jump)
    assert any(f.type == "INVOICE_NUMBER_SEQUENCE_ANOMALY" for f in res_jump.findings)

    # Unusual submission interval fail: vendor billed monthly (Jan, Feb, Mar, Apr), but now bills in 2026 after 300 days
    data_interval = InvoiceData(
        invoice_number=Field[str](value="INV-0104"),
        invoice_date=Field[str](value="2026-03-01"),
    )
    ctx_interval = AnalysisContext(
        invoice_id="inv-interval",
        data=data_interval,
        vendor_history=vendor_history,
    )
    res_interval = engine.analyze(ctx_interval)
    assert any(f.type == "UNUSUAL_SUBMISSION_INTERVAL" for f in res_interval.findings)


def test_identifiers_engine_toggle_disabled(monkeypatch):
    from backend.app.services.settings_service import settings_service

    monkeypatch.setattr(settings_service, "is_engine_enabled", lambda eng: False)
    engine = IdentifiersRulesEngine()
    data = InvoiceData(
        invoice_date=Field[str](value="2040-01-01"),
    )
    res = engine.analyze(AnalysisContext(invoice_id="inv-i-dis", data=data))
    assert res.score == 0.0
    assert len(res.findings) == 0

