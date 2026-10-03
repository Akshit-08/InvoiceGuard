"""Unit tests for synthetic generator determinism."""

from ml.synthetic.vendor_simulator import VendorSimulator


def test_generator_determinism():
    sim1 = VendorSimulator(seed=42)
    vendors1 = sim1.generate_vendors(count=10)
    df1 = sim1.simulate_history(months=6, min_invoices=5, max_invoices=10)

    sim2 = VendorSimulator(seed=42)
    vendors2 = sim2.generate_vendors(count=10)
    df2 = sim2.simulate_history(months=6, min_invoices=5, max_invoices=10)

    assert len(vendors1) == len(vendors2)
    for v1, v2 in zip(vendors1, vendors2):
        assert v1.name == v2.name
        assert v1.gstin == v2.gstin
        assert v1.account_number == v2.account_number

    assert len(df1) == len(df2)
    assert df1["invoice_number"].tolist() == df2["invoice_number"].tolist()
    assert df1["grand_total"].tolist() == df2["grand_total"].tolist()
