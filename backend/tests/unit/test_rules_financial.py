"""Unit tests for FinancialRulesEngine."""

from backend.app.schemas.contracts import Field, InvoiceData, LineItem, Token
from backend.app.services.engines.base import AnalysisContext
from backend.app.services.engines.rules.financial import (
    FinancialRulesEngine,
    parse_indian_amount_words,
)


def test_parse_indian_amount_words():
    assert parse_indian_amount_words("Forty Thousand Only") == 40000.0
    assert parse_indian_amount_words("Rupees One Lakh Fifty Thousand Only") == 150000.0
    assert (
        parse_indian_amount_words("Forty-Five Thousand Two Hundred and Fifty Rupees")
        == 45250.0
    )
    assert parse_indian_amount_words("Ten Crores Only") == 100000000.0
    assert parse_indian_amount_words("") is None


def test_line_total_pass_and_fail():
    engine = FinancialRulesEngine()

    # Pass case: 2 x 15,000 = 30,000
    data_pass = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="IT Consulting"),
                quantity=Field[float](value=2.0),
                unit_price=Field[float](value=15000.0),
                line_total=Field[float](value=30000.0),
            )
        ],
        subtotal=Field[float](value=30000.0),
        grand_total=Field[float](value=30000.0),
    )
    ctx_pass = AnalysisContext(invoice_id="inv-pass", data=data_pass)
    res_pass = engine.analyze(ctx_pass)
    line_findings = [f for f in res_pass.findings if f.type == "LINE_TOTAL_MISMATCH"]
    assert len(line_findings) == 0

    # Fail case (Plan's example): qty 2 x 15,000 shown as 40,000
    data_fail = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="Software Licenses"),
                quantity=Field[float](value=2.0),
                unit_price=Field[float](value=15000.0),
                line_total=Field[float](value=40000.0),
            )
        ],
        subtotal=Field[float](value=40000.0),
        grand_total=Field[float](value=40000.0),
    )
    ctx_fail = AnalysisContext(invoice_id="inv-fail", data=data_fail)
    res_fail = engine.analyze(ctx_fail)
    line_findings = [f for f in res_fail.findings if f.type == "LINE_TOTAL_MISMATCH"]
    assert len(line_findings) == 1
    f = line_findings[0]
    assert f.evidence["expected"] == 30000.0
    assert f.evidence["found"] == 40000.0
    assert f.evidence["difference"] == 10000.0
    assert f.severity in ["high", "medium"]


def test_subtotal_and_grand_total_mismatch():
    engine = FinancialRulesEngine()

    # Subtotal mismatch
    data_subtotal_fail = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="Item A"),
                quantity=Field[float](value=1.0),
                unit_price=Field[float](value=20000.0),
                line_total=Field[float](value=20000.0),
            ),
            LineItem(
                description=Field[str](value="Item B"),
                quantity=Field[float](value=1.0),
                unit_price=Field[float](value=30000.0),
                line_total=Field[float](value=30000.0),
            ),
        ],
        subtotal=Field[float](value=55000.0),  # Should be 50,000
        grand_total=Field[float](value=55000.0),
    )
    ctx = AnalysisContext(invoice_id="inv-sub", data=data_subtotal_fail)
    res = engine.analyze(ctx)
    sub_findings = [f for f in res.findings if f.type == "SUBTOTAL_MISMATCH"]
    assert len(sub_findings) == 1
    assert sub_findings[0].evidence["expected"] == 50000.0
    assert sub_findings[0].evidence["found"] == 55000.0
    assert sub_findings[0].evidence["difference"] == 5000.0

    # Grand total mismatch: subtotal 50,000 + tax 9,000 = 59,000, but reported 89,000
    data_grand_fail = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="Consulting"),
                line_total=Field[float](value=50000.0),
            )
        ],
        subtotal=Field[float](value=50000.0),
        tax=data_subtotal_fail.tax,
        grand_total=Field[float](value=80000.0),  # Discrepancy of 30,000
    )
    data_grand_fail.tax.total = Field[float](value=9000.0)
    ctx_grand = AnalysisContext(invoice_id="inv-grand", data=data_grand_fail)
    res_grand = engine.analyze(ctx_grand)
    grand_findings = [f for f in res_grand.findings if f.type == "GRAND_TOTAL_MISMATCH"]
    assert len(grand_findings) == 1
    assert grand_findings[0].evidence["expected"] == 59000.0
    assert grand_findings[0].evidence["found"] == 80000.0
    assert grand_findings[0].evidence["difference"] == 21000.0


def test_amount_words_mismatch():
    engine = FinancialRulesEngine()

    # Pass case: numeric 40,000 and words "Forty Thousand Only"
    data_pass = InvoiceData(
        grand_total=Field[float](value=40000.0),
        amount_in_words=Field[str](value="Forty Thousand Rupees Only"),
    )
    res_pass = engine.analyze(AnalysisContext(invoice_id="inv-w-pass", data=data_pass))
    assert not any(f.type == "AMOUNT_WORDS_MISMATCH" for f in res_pass.findings)

    # Fail case (Plan's example): numeric 45,000, words "Fifty Thousand Only"
    data_fail = InvoiceData(
        grand_total=Field[float](value=45000.0),
        amount_in_words=Field[str](value="Fifty Thousand Only"),
    )
    res_fail = engine.analyze(AnalysisContext(invoice_id="inv-w-fail", data=data_fail))
    words_findings = [f for f in res_fail.findings if f.type == "AMOUNT_WORDS_MISMATCH"]
    assert len(words_findings) == 1
    assert words_findings[0].evidence["expected"] == 45000.0
    assert words_findings[0].evidence["found"] == 50000.0


def test_rounding_and_suspicious_round_total():
    engine = FinancialRulesEngine()

    # Rounding anomaly (expected 1042.30, reported 1050.00 -> diff 7.70 > 1.0 and <= 10.0)
    data_round = InvoiceData(
        subtotal=Field[float](value=1042.30),
        grand_total=Field[float](value=1050.00),
    )
    res_round = engine.analyze(AnalysisContext(invoice_id="inv-round", data=data_round))
    assert any(f.type == "ROUNDING_ANOMALY" for f in res_round.findings)

    # Suspicious round total: items have decimal cents, but total is even 50,000
    data_suspicious = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="Hardware Parts"),
                unit_price=Field[float](value=12450.45),
                line_total=Field[float](value=12450.45),
            )
        ],
        subtotal=Field[float](value=12450.45),
        grand_total=Field[float](value=50000.00),
    )
    res_suspicious = engine.analyze(
        AnalysisContext(invoice_id="inv-susp", data=data_suspicious)
    )
    assert any(f.type == "SUSPICIOUS_ROUND_TOTAL" for f in res_suspicious.findings)


def test_duplicate_negative_and_currency_findings():
    engine = FinancialRulesEngine()

    # Duplicate line items & negative line items
    data_items = InvoiceData(
        items=[
            LineItem(
                description=Field[str](value="Cloud Hosting Tier 1"),
                quantity=Field[float](value=1.0),
                unit_price=Field[float](value=5000.0),
                line_total=Field[float](value=5000.0),
            ),
            LineItem(
                description=Field[str](value="Cloud Hosting Tier 1"),
                quantity=Field[float](value=1.0),
                unit_price=Field[float](value=5000.0),
                line_total=Field[float](value=5000.0),
            ),
            LineItem(
                description=Field[str](value="Unapproved Penalty"),
                quantity=Field[float](value=1.0),
                unit_price=Field[float](value=-1000.0),
                line_total=Field[float](value=-1000.0),
            ),
        ],
        subtotal=Field[float](value=9000.0),
        grand_total=Field[float](value=9000.0),
        currency=Field[str](value="INR"),
    )
    tokens = [
        Token(text="USD", bbox=[0.5, 0.5, 0.6, 0.6], page=0, conf=0.99, source="pdf")
    ]
    ctx = AnalysisContext(invoice_id="inv-dup", data=data_items, tokens=tokens)
    res = engine.analyze(ctx)

    types = [f.type for f in res.findings]
    assert "DUPLICATE_LINE_ITEMS" in types
    assert "NEGATIVE_OR_ZERO_VALUES" in types
    assert "CURRENCY_INCONSISTENT" in types


def test_grand_total_plausible_explanations():
    engine = FinancialRulesEngine()

    # Omitted tax explanation (diff equals tax_total)
    data_tax_omit = InvoiceData(
        subtotal=Field[float](value=50000.0),
        tax=InvoiceData().tax,
        grand_total=Field[float](value=50000.0),  # Didn't add 9,000 tax
    )
    data_tax_omit.tax.total = Field[float](value=9000.0)
    res_tax = engine.analyze(
        AnalysisContext(invoice_id="inv-tax-omit", data=data_tax_omit)
    )
    finding = next(f for f in res_tax.findings if f.type == "GRAND_TOTAL_MISMATCH")
    assert "tax total" in finding.summary

    # Omitted shipping explanation (diff equals shipping)
    data_ship_omit = InvoiceData(
        subtotal=Field[float](value=50000.0),
        shipping=Field[float](value=1500.0),
        grand_total=Field[float](value=50000.0),  # Didn't add 1,500 shipping
    )
    res_ship = engine.analyze(
        AnalysisContext(invoice_id="inv-ship-omit", data=data_ship_omit)
    )
    finding_ship = next(f for f in res_ship.findings if f.type == "GRAND_TOTAL_MISMATCH")
    assert "shipping" in finding_ship.summary


def test_financial_engine_toggle_disabled(monkeypatch):
    from backend.app.services.settings_service import settings_service

    monkeypatch.setattr(settings_service, "is_engine_enabled", lambda eng: False)
    engine = FinancialRulesEngine()
    data = InvoiceData(
        subtotal=Field[float](value=10000.0),
        grand_total=Field[float](value=99999.0),
    )
    res = engine.analyze(AnalysisContext(invoice_id="inv-dis", data=data))
    assert res.score == 0.0
    assert len(res.findings) == 0

