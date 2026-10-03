"""Unit tests for table parser and heuristic extraction."""

from backend.app.schemas.contracts import Token
from backend.app.services.extraction.heuristic import heuristic_extractor


def test_table_parsing_and_totals():
    # Build synthetic tokens simulating an invoice table
    tokens = [
        # Vendor Header
        Token(text="Acme", bbox=[0.1, 0.05, 0.2, 0.07], conf=1.0, source="pdf"),
        Token(text="Solutions", bbox=[0.21, 0.05, 0.35, 0.07], conf=1.0, source="pdf"),
        Token(text="GSTIN:", bbox=[0.1, 0.08, 0.18, 0.10], conf=1.0, source="pdf"),
        Token(text="27AABCT1332L1ZE", bbox=[0.19, 0.08, 0.40, 0.10], conf=1.0, source="pdf"),
        # Metadata
        Token(text="Invoice", bbox=[0.6, 0.05, 0.7, 0.07], conf=1.0, source="pdf"),
        Token(text="No:", bbox=[0.71, 0.05, 0.75, 0.07], conf=1.0, source="pdf"),
        Token(text="INV/25-26/0042", bbox=[0.76, 0.05, 0.9, 0.07], conf=1.0, source="pdf"),
        Token(text="Date:", bbox=[0.6, 0.08, 0.68, 0.10], conf=1.0, source="pdf"),
        Token(text="15/09/2026", bbox=[0.7, 0.08, 0.85, 0.10], conf=1.0, source="pdf"),
        # Table Header
        Token(text="Description", bbox=[0.1, 0.25, 0.3, 0.27], conf=1.0, source="pdf"),
        Token(text="Qty", bbox=[0.4, 0.25, 0.45, 0.27], conf=1.0, source="pdf"),
        Token(text="Rate", bbox=[0.55, 0.25, 0.62, 0.27], conf=1.0, source="pdf"),
        Token(text="Amount", bbox=[0.75, 0.25, 0.85, 0.27], conf=1.0, source="pdf"),
        # Table Row 1
        Token(text="Cloud", bbox=[0.1, 0.30, 0.18, 0.32], conf=1.0, source="pdf"),
        Token(text="Hosting", bbox=[0.19, 0.30, 0.28, 0.32], conf=1.0, source="pdf"),
        Token(text="2.00", bbox=[0.4, 0.30, 0.45, 0.32], conf=1.0, source="pdf"),
        Token(text="5,000.00", bbox=[0.55, 0.30, 0.65, 0.32], conf=1.0, source="pdf"),
        Token(text="10,000.00", bbox=[0.75, 0.30, 0.88, 0.32], conf=1.0, source="pdf"),
        # Table Row 2
        Token(text="Domain", bbox=[0.1, 0.35, 0.18, 0.37], conf=1.0, source="pdf"),
        Token(text="SSL", bbox=[0.19, 0.35, 0.25, 0.37], conf=1.0, source="pdf"),
        Token(text="1.00", bbox=[0.4, 0.35, 0.45, 0.37], conf=1.0, source="pdf"),
        Token(text="2,000.00", bbox=[0.55, 0.35, 0.65, 0.37], conf=1.0, source="pdf"),
        Token(text="2,000.00", bbox=[0.75, 0.35, 0.88, 0.37], conf=1.0, source="pdf"),
        # Totals
        Token(text="Subtotal:", bbox=[0.6, 0.45, 0.72, 0.47], conf=1.0, source="pdf"),
        Token(text="12,000.00", bbox=[0.75, 0.45, 0.88, 0.47], conf=1.0, source="pdf"),
        Token(text="Grand", bbox=[0.6, 0.50, 0.67, 0.52], conf=1.0, source="pdf"),
        Token(text="Total:", bbox=[0.68, 0.50, 0.74, 0.52], conf=1.0, source="pdf"),
        Token(text="14,160.00", bbox=[0.75, 0.50, 0.88, 0.52], conf=1.0, source="pdf"),
    ]

    data = heuristic_extractor.extract(tokens)

    assert data.invoice_number.value == "INV/25-26/0042"
    assert data.invoice_date.value == "2026-09-15"
    assert data.vendor.gstin.value == "27AABCT1332L1ZE"
    assert data.subtotal.value == 12000.0
    assert data.grand_total.value == 14160.0
    assert len(data.items) == 2
    assert data.items[0].line_total.value == 10000.0
    assert data.items[1].line_total.value == 2000.0
