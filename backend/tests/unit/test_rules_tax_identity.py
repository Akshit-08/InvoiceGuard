"""Unit tests for TaxIdentityRulesEngine."""

from backend.app.schemas.contracts import Field, InvoiceData, LineItem
from backend.app.services.engines.base import AnalysisContext
from backend.app.services.engines.rules.tax_identity import TaxIdentityRulesEngine


def test_gstin_format_checksum_state_and_pan_mismatch():
    engine = TaxIdentityRulesEngine()

    # Pass case: valid Maharashtra GSTIN (27) matching PAN AABCT1332L (check digit 'E')
    data_pass = InvoiceData(
        invoice_date=Field[str](value="2026-02-15"),
        vendor=InvoiceData().vendor,
    )
    data_pass.vendor.gstin = Field[str](value="27AABCT1332L1ZE")
    data_pass.vendor.pan = Field[str](value="AABCT1332L")

    res_pass = engine.analyze(AnalysisContext(invoice_id="inv-t-pass", data=data_pass))
    assert not any(f.type.startswith("GSTIN_") for f in res_pass.findings)
    assert not any(f.type == "PAN_INVALID" for f in res_pass.findings)

    # Fail case 1: Checksum failure (mod-36 check digit corrupted)
    data_checksum_fail = InvoiceData()
    data_checksum_fail.vendor.gstin = Field[str](value="27AABCT1332L1Z9")
    res_cs = engine.analyze(
        AnalysisContext(invoice_id="inv-cs", data=data_checksum_fail)
    )
    assert any(f.type == "GSTIN_CHECKSUM_FAIL" for f in res_cs.findings)

    # Fail case 2: Invalid State jurisdiction (State code 99)
    data_state_fail = InvoiceData()
    data_state_fail.vendor.gstin = Field[str](value="99AABCT1332L1Z5")
    res_st = engine.analyze(
        AnalysisContext(invoice_id="inv-st", data=data_state_fail)
    )
    assert any(f.type == "GSTIN_STATE_INVALID" for f in res_st.findings)

    # Fail case 3: PAN-GSTIN mismatch (vendor stated PAN does not match chars 3-12)
    data_pan_mismatch = InvoiceData()
    data_pan_mismatch.vendor.gstin = Field[str](value="27AABCT1332L1Z5")
    data_pan_mismatch.vendor.pan = Field[str](value="ZZZPT9999K")
    res_pan = engine.analyze(
        AnalysisContext(invoice_id="inv-pm", data=data_pan_mismatch)
    )
    assert any(f.type == "GSTIN_PAN_MISMATCH" for f in res_pan.findings)


def test_tax_amount_mismatch_and_invalid_slabs():
    engine = TaxIdentityRulesEngine()

    # Fail case (Plan's example): GST 18% on 10,000 shown as 2,800
    data_tax_fail = InvoiceData(
        invoice_date=Field[str](value="2026-03-01"),
        subtotal=Field[float](value=10000.0),
        items=[
            LineItem(
                description=Field[str](value="Technical Services"),
                unit_price=Field[float](value=10000.0),
                line_total=Field[float](value=10000.0),
                tax_rate=Field[float](value=18.0),
                tax_amount=Field[float](value=2800.0),  # Should be 1800.0
            )
        ],
        grand_total=Field[float](value=12800.0),
    )
    data_tax_fail.tax.rate = Field[float](value=18.0)
    data_tax_fail.tax.total = Field[float](value=2800.0)

    res_tax = engine.analyze(
        AnalysisContext(invoice_id="inv-tax", data=data_tax_fail)
    )
    tax_findings = [f for f in res_tax.findings if f.type == "TAX_AMOUNT_MISMATCH"]
    assert len(tax_findings) >= 1
    # Check that difference of 1000 is reported
    assert any(f.evidence["difference"] == 1000.0 for f in tax_findings)

    # Fail case: Invalid tax slab (e.g. 16% is not a valid slab)
    data_slab_fail = InvoiceData(
        invoice_date=Field[str](value="2026-03-01"),
        items=[
            LineItem(
                description=Field[str](value="Raw Materials"),
                line_total=Field[float](value=5000.0),
                tax_rate=Field[float](value=16.0),  # Invalid slab
            )
        ],
    )
    res_slab = engine.analyze(
        AnalysisContext(invoice_id="inv-slab", data=data_slab_fail)
    )
    assert any(f.type == "TAX_RATE_INVALID_SLAB" for f in res_slab.findings)


def test_tax_structure_intrastate_vs_interstate():
    engine = TaxIdentityRulesEngine()

    # Intrastate (both state 27 Maharashtra): charging IGST is inconsistent
    data_intra = InvoiceData()
    data_intra.vendor.gstin = Field[str](value="27AABCT1332L1ZE")
    data_intra.buyer.gstin = Field[str](value="27BBBCK9999L1ZF")
    data_intra.tax.igst = Field[float](value=1800.0)

    res_intra = engine.analyze(
        AnalysisContext(invoice_id="inv-intra", data=data_intra)
    )
    assert any(f.type == "TAX_STRUCTURE_INCONSISTENT" for f in res_intra.findings)

    # Interstate (vendor state 27, buyer state 07 Delhi): charging CGST/SGST is inconsistent
    data_inter = InvoiceData()
    data_inter.vendor.gstin = Field[str](value="27AABCT1332L1ZE")
    data_inter.buyer.gstin = Field[str](value="07AAACG1234M1Z2")
    data_inter.tax.cgst = Field[float](value=900.0)
    data_inter.tax.sgst = Field[float](value=900.0)

    res_inter = engine.analyze(
        AnalysisContext(invoice_id="inv-inter", data=data_inter)
    )
    assert any(f.type == "TAX_STRUCTURE_INCONSISTENT" for f in res_inter.findings)


def test_banking_identifiers_ifsc_and_account():
    engine = TaxIdentityRulesEngine()

    # Fail cases: Invalid IFSC & non-digit bank account
    data_bank_fail = InvoiceData()
    data_bank_fail.payment.ifsc = Field[str](value="HDFC0123")  # too short
    data_bank_fail.payment.account_number = Field[str](
        value="ACC-998822"
    )  # non-digit chars

    res = engine.analyze(
        AnalysisContext(invoice_id="inv-bank", data=data_bank_fail)
    )
    types = [f.type for f in res.findings]
    assert "IFSC_INVALID" in types
    assert "ACCOUNT_NUMBER_FORMAT" in types

    # Pass case
    data_bank_pass = InvoiceData()
    data_bank_pass.payment.ifsc = Field[str](value="HDFC0001234")
    data_bank_pass.payment.account_number = Field[str](value="50100234567891")
    res_pass = engine.analyze(
        AnalysisContext(invoice_id="inv-bank-pass", data=data_bank_pass)
    )
    types_pass = [f.type for f in res_pass.findings]
    assert "IFSC_INVALID" not in types_pass
    assert "ACCOUNT_NUMBER_FORMAT" not in types_pass


def test_unequal_cgst_sgst_and_buyer_gstin_failure():
    engine = TaxIdentityRulesEngine()

    # Unequal CGST and SGST split
    data_unequal = InvoiceData()
    data_unequal.vendor.gstin = Field[str](value="27AABCT1332L1ZE")
    data_unequal.buyer.gstin = Field[str](value="27BBBCK9999L1ZF")
    data_unequal.tax.cgst = Field[float](value=1200.0)
    data_unequal.tax.sgst = Field[float](value=600.0)  # Should equal CGST

    res_unequal = engine.analyze(
        AnalysisContext(invoice_id="inv-unequal", data=data_unequal)
    )
    assert any(f.type == "TAX_STRUCTURE_INCONSISTENT" for f in res_unequal.findings)

    # Buyer GSTIN checksum failure
    data_buyer_fail = InvoiceData()
    data_buyer_fail.buyer.gstin = Field[str](value="07AAACG1234M1Z9")  # Invalid check digit
    res_b = engine.analyze(
        AnalysisContext(invoice_id="inv-b-fail", data=data_buyer_fail)
    )
    assert any(f.type == "GSTIN_CHECKSUM_FAIL" for f in res_b.findings)


def test_tax_identity_engine_toggle_disabled(monkeypatch):
    from backend.app.services.settings_service import settings_service

    monkeypatch.setattr(settings_service, "is_engine_enabled", lambda eng: False)
    engine = TaxIdentityRulesEngine()
    data = InvoiceData()
    data.vendor.gstin = Field[str](value="INVALID_GSTIN")
    res = engine.analyze(AnalysisContext(invoice_id="inv-t-dis", data=data))
    assert res.score == 0.0
    assert len(res.findings) == 0

