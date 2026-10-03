"""ReportLab Invoice Templates with Exact Ground-Truth Bounding Box Tracking.

Implements 5 distinct invoice templates per Blueprint section 10:
1. classic_table: Traditional corporate layout with bordered table
2. modern_minimal: Modern borderless design with colored header bar
3. gst_tax_invoice: Formal tax invoice with HSN/SAC, CGST/SGST/IGST breakdown
4. two_column: Two-column executive layout with left vendor/payment panel
5. compact_thermal: Compact statement layout with dashed rules
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from ml.synthetic.formatters import compute_tax_breakdown, format_inr

PAGE_WIDTH, PAGE_HEIGHT = A4  # 595.27 x 841.89 points


@dataclass
class InvoiceSpec:
    invoice_number: str
    invoice_date: str
    due_date: str
    vendor_id: str
    vendor_name: str
    vendor_gstin: str
    vendor_pan: str
    vendor_address: str
    vendor_email: str
    vendor_phone: str
    vendor_state_code: str
    buyer_name: str
    buyer_gstin: str
    buyer_address: str
    buyer_state_code: str
    currency: str
    items: list[dict[str, Any]]
    subtotal: float
    tax_rate: float
    discount: float
    shipping: float
    grand_total: float
    amount_in_words: str
    bank_name: str
    account_number: str
    ifsc: str
    template_id: str = "classic_table"


class BboxRecorder:
    """Helper to convert ReportLab bottom-left coordinates to top-left normalized [0, 1] boxes."""

    def __init__(self, page_width: float = PAGE_WIDTH, page_height: float = PAGE_HEIGHT):
        self.width = page_width
        self.height = page_height
        self.fields: Dict[str, Any] = {}
        self.items: list[dict[str, Any]] = []

    def to_normalized_bbox(
        self, x: float, y: float, w: float, h: float
    ) -> list[float]:
        """Convert bottom-left (x, y) with width w, height h to top-left normalized [x0, y0, x1, y1]."""
        x0 = max(0.0, min(1.0, x / self.width))
        x1 = max(0.0, min(1.0, (x + w) / self.width))
        # In reportlab, y is from bottom. Top of box is y + h.
        y0 = max(0.0, min(1.0, (self.height - (y + h)) / self.height))
        y1 = max(0.0, min(1.0, (self.height - y) / self.height))
        return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]

    def record_field(
        self,
        name: str,
        value: Any,
        raw_text: str,
        x: float,
        y: float,
        w: float,
        h: float,
        page: int = 0,
    ) -> list[float]:
        bbox = self.to_normalized_bbox(x, y, w, h)
        self.fields[name] = {
            "value": value,
            "raw": raw_text,
            "bbox": bbox,
            "page": page,
        }
        return bbox

    def get_ground_truth(self) -> dict[str, Any]:
        return {
            "fields": self.fields,
            "items": self.items,
            "page_width": self.width,
            "page_height": self.height,
        }


def draw_text_with_bbox(
    c: canvas.Canvas,
    recorder: BboxRecorder,
    field_name: Optional[str],
    value: Any,
    text: str,
    x: float,
    y: float,
    font_name: str = "Helvetica",
    font_size: float = 10,
    color: colors.Color = colors.black,
    align: str = "left",
) -> list[float]:
    """Draw text on canvas and record its normalized bounding box."""
    c.setFont(font_name, font_size)
    c.setFillColor(color)
    text_width = c.stringWidth(text, font_name, font_size)
    text_height = font_size

    draw_x = x
    if align == "right":
        draw_x = x - text_width
    elif align == "center":
        draw_x = x - (text_width / 2.0)

    c.drawString(draw_x, y, text)

    if field_name:
        return recorder.record_field(
            field_name, value, text, draw_x, y - 2, text_width, text_height + 4
        )
    return recorder.to_normalized_bbox(draw_x, y - 2, text_width, text_height + 4)


# ---------------------------------------------------------
# Template 1: Classic Table
# ---------------------------------------------------------
def render_classic_table(c: canvas.Canvas, spec: InvoiceSpec) -> dict[str, Any]:
    rec = BboxRecorder()
    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # Top border bar
    c.setFillColor(colors.HexColor("#1e293b"))
    c.rect(0, H - 8, W, 8, fill=1, stroke=0)

    # Header title
    draw_text_with_bbox(
        c, rec, None, None, "TAX INVOICE", 40, H - 45, "Helvetica-Bold", 20, colors.HexColor("#0f172a")
    )

    # Vendor Block (Left)
    draw_text_with_bbox(
        c, rec, "vendor.name", spec.vendor_name, spec.vendor_name, 40, H - 75, "Helvetica-Bold", 12
    )
    draw_text_with_bbox(
        c, rec, "vendor.address", spec.vendor_address, spec.vendor_address, 40, H - 90, "Helvetica", 9, colors.HexColor("#475569")
    )
    draw_text_with_bbox(
        c, rec, "vendor.gstin", spec.vendor_gstin, f"GSTIN: {spec.vendor_gstin}", 40, H - 105, "Helvetica-Bold", 9
    )
    draw_text_with_bbox(
        c, rec, "vendor.pan", spec.vendor_pan, f"PAN: {spec.vendor_pan}", 40, H - 118, "Helvetica", 9
    )
    draw_text_with_bbox(
        c, rec, "vendor.email", spec.vendor_email, f"Email: {spec.vendor_email}", 40, H - 131, "Helvetica", 9
    )

    # Metadata Block (Right)
    draw_text_with_bbox(
        c, rec, None, None, "Invoice No:", W - 220, H - 75, "Helvetica-Bold", 9
    )
    draw_text_with_bbox(
        c, rec, "invoice_number", spec.invoice_number, spec.invoice_number, W - 140, H - 75, "Helvetica", 9
    )

    draw_text_with_bbox(
        c, rec, None, None, "Invoice Date:", W - 220, H - 90, "Helvetica-Bold", 9
    )
    draw_text_with_bbox(
        c, rec, "invoice_date", spec.invoice_date, spec.invoice_date, W - 140, H - 90, "Helvetica", 9
    )

    draw_text_with_bbox(
        c, rec, None, None, "Due Date:", W - 220, H - 105, "Helvetica-Bold", 9
    )
    draw_text_with_bbox(
        c, rec, "due_date", spec.due_date, spec.due_date, W - 140, H - 105, "Helvetica", 9
    )

    # Buyer Block
    c.setFillColor(colors.HexColor("#f8fafc"))
    c.setStrokeColor(colors.HexColor("#e2e8f0"))
    c.rect(40, H - 200, W - 80, 52, fill=1, stroke=1)

    draw_text_with_bbox(
        c, rec, None, None, "BILLED TO:", 50, H - 160, "Helvetica-Bold", 8, colors.HexColor("#64748b")
    )
    draw_text_with_bbox(
        c, rec, "buyer.name", spec.buyer_name, spec.buyer_name, 50, H - 173, "Helvetica-Bold", 10
    )
    draw_text_with_bbox(
        c, rec, "buyer.address", spec.buyer_address, spec.buyer_address, 50, H - 186, "Helvetica", 8, colors.HexColor("#475569")
    )
    draw_text_with_bbox(
        c, rec, "buyer.gstin", spec.buyer_gstin, f"GSTIN: {spec.buyer_gstin}", 50, H - 196, "Helvetica-Bold", 8
    )

    # Table Header
    table_top = H - 225
    c.setFillColor(colors.HexColor("#f1f5f9"))
    c.rect(40, table_top - 18, W - 80, 20, fill=1, stroke=0)

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#334155"))
    c.drawString(48, table_top - 13, "#")
    c.drawString(70, table_top - 13, "DESCRIPTION")
    c.drawString(290, table_top - 13, "HSN/SAC")
    c.drawString(360, table_top - 13, "QTY")
    c.drawString(420, table_top - 13, "RATE")
    c.drawRightString(W - 48, table_top - 13, "AMOUNT")

    # Table Rows
    curr_y = table_top - 32
    for idx, item in enumerate(spec.items):
        c.setStrokeColor(colors.HexColor("#e2e8f0"))
        c.line(40, curr_y - 4, W - 40, curr_y - 4)

        desc = item["description"]
        qty = item["quantity"]
        rate = item["unit_price"]
        total = item["line_total"]
        hsn = item.get("hsn_sac", "998313")

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(48, curr_y, str(idx + 1))
        c.drawString(70, curr_y, desc[:45])
        c.drawString(290, curr_y, hsn)
        c.drawString(360, curr_y, f"{qty:.2f}")
        c.drawString(420, curr_y, format_inr(rate, symbol=False))
        c.drawRightString(W - 48, curr_y, format_inr(total, symbol=False))

        # Record item bounding box
        row_bbox = rec.to_normalized_bbox(40, curr_y - 4, W - 80, 16)
        rec.items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": rate,
            "line_total": total,
            "hsn_sac": hsn,
            "bbox": row_bbox,
        })
        curr_y -= 18

    # Totals Block
    totals_y = curr_y - 15
    draw_text_with_bbox(c, rec, None, None, "Subtotal:", W - 200, totals_y, "Helvetica", 9)
    draw_text_with_bbox(
        c, rec, "subtotal", spec.subtotal, format_inr(spec.subtotal, symbol=True), W - 45, totals_y, "Helvetica-Bold", 9, align="right"
    )

    cgst, sgst, igst, total_tax = compute_tax_breakdown(
        spec.subtotal, spec.tax_rate, spec.vendor_state_code, spec.buyer_state_code
    )

    if igst > 0:
        totals_y -= 14
        draw_text_with_bbox(c, rec, None, None, f"IGST ({spec.tax_rate*100:.0f}%):", W - 200, totals_y, "Helvetica", 9)
        draw_text_with_bbox(
            c, rec, "tax.igst", igst, format_inr(igst, symbol=True), W - 45, totals_y, "Helvetica", 9, align="right"
        )
    else:
        totals_y -= 14
        draw_text_with_bbox(c, rec, None, None, f"CGST ({spec.tax_rate*50:.1f}%):", W - 200, totals_y, "Helvetica", 9)
        draw_text_with_bbox(
            c, rec, "tax.cgst", cgst, format_inr(cgst, symbol=True), W - 45, totals_y, "Helvetica", 9, align="right"
        )
        totals_y -= 14
        draw_text_with_bbox(c, rec, None, None, f"SGST ({spec.tax_rate*50:.1f}%):", W - 200, totals_y, "Helvetica", 9)
        draw_text_with_bbox(
            c, rec, "tax.sgst", sgst, format_inr(sgst, symbol=True), W - 45, totals_y, "Helvetica", 9, align="right"
        )

    # Grand Total
    totals_y -= 18
    c.setFillColor(colors.HexColor("#0f172a"))
    c.rect(W - 220, totals_y - 6, 180, 20, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.white)
    c.drawString(W - 212, totals_y, "Grand Total:")
    draw_text_with_bbox(
        c, rec, "grand_total", spec.grand_total, format_inr(spec.grand_total, symbol=True), W - 48, totals_y, "Helvetica-Bold", 10, colors.white, align="right"
    )

    # Amount in words
    words_y = totals_y - 25
    words_text = f"Amount in Words: {spec.amount_in_words}"
    draw_text_with_bbox(
        c, rec, "amount_in_words", spec.amount_in_words, words_text, 40, words_y, "Helvetica-Oblique", 8, colors.HexColor("#334155")
    )

    # Bank Details Box (Bottom Left)
    bank_y = words_y - 50
    c.setFillColor(colors.HexColor("#f8fafc"))
    c.setStrokeColor(colors.HexColor("#cbd5e1"))
    c.rect(40, bank_y - 10, 240, 52, fill=1, stroke=1)

    draw_text_with_bbox(c, rec, None, None, "BANK REMITTANCE DETAILS", 48, bank_y + 30, "Helvetica-Bold", 7, colors.HexColor("#475569"))
    draw_text_with_bbox(c, rec, "payment.bank_name", spec.bank_name, f"Bank: {spec.bank_name}", 48, bank_y + 18, "Helvetica", 8)
    draw_text_with_bbox(c, rec, "payment.account_number", spec.account_number, f"A/C: {spec.account_number}", 48, bank_y + 6, "Helvetica-Bold", 8)
    draw_text_with_bbox(c, rec, "payment.ifsc", spec.ifsc, f"IFSC: {spec.ifsc}", 48, bank_y - 5, "Helvetica", 8)

    # Footer notice
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#94a3b8"))
    c.drawCentredString(W / 2.0, 25, "This is a computer generated invoice and requires no physical signature.")

    return rec.get_ground_truth()


# ---------------------------------------------------------
# Template 2: Modern Minimal
# ---------------------------------------------------------
def render_modern_minimal(c: canvas.Canvas, spec: InvoiceSpec) -> dict[str, Any]:
    rec = BboxRecorder()
    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # Indigo accent header bar
    c.setFillColor(colors.HexColor("#4f46e5"))
    c.rect(0, H - 70, W, 70, fill=1, stroke=0)

    draw_text_with_bbox(
        c, rec, "vendor.name", spec.vendor_name, spec.vendor_name, 40, H - 42, "Helvetica-Bold", 18, colors.white
    )
    draw_text_with_bbox(
        c, rec, None, None, "INVOICE", W - 40, H - 42, "Helvetica-Bold", 20, colors.white, align="right"
    )

    # Vendor & Buyer layout
    meta_y = H - 95
    draw_text_with_bbox(c, rec, "vendor.gstin", spec.vendor_gstin, f"GSTIN: {spec.vendor_gstin}", 40, meta_y, "Helvetica-Bold", 9)
    draw_text_with_bbox(c, rec, "vendor.address", spec.vendor_address, spec.vendor_address, 40, meta_y - 14, "Helvetica", 8, colors.HexColor("#64748b"))

    # Invoice details on right
    draw_text_with_bbox(c, rec, "invoice_number", spec.invoice_number, f"Invoice #: {spec.invoice_number}", W - 40, meta_y, "Helvetica-Bold", 10, align="right")
    draw_text_with_bbox(c, rec, "invoice_date", spec.invoice_date, f"Date: {spec.invoice_date}", W - 40, meta_y - 14, "Helvetica", 9, align="right")
    draw_text_with_bbox(c, rec, "due_date", spec.due_date, f"Due: {spec.due_date}", W - 40, meta_y - 28, "Helvetica", 9, align="right")

    # Client block
    client_y = meta_y - 50
    draw_text_with_bbox(c, rec, None, None, "Client:", 40, client_y, "Helvetica-Bold", 8, colors.HexColor("#6366f1"))
    draw_text_with_bbox(c, rec, "buyer.name", spec.buyer_name, spec.buyer_name, 40, client_y - 12, "Helvetica-Bold", 10)
    draw_text_with_bbox(c, rec, "buyer.gstin", spec.buyer_gstin, f"GSTIN: {spec.buyer_gstin}", 40, client_y - 24, "Helvetica", 8)

    # Minimal zebra table
    table_top = client_y - 45
    c.setFillColor(colors.HexColor("#eef2ff"))
    c.rect(40, table_top - 16, W - 80, 20, fill=1, stroke=0)

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#4338ca"))
    c.drawString(50, table_top - 12, "ITEM")
    c.drawString(340, table_top - 12, "QTY")
    c.drawString(410, table_top - 12, "PRICE")
    c.drawRightString(W - 50, table_top - 12, "TOTAL")

    curr_y = table_top - 30
    for idx, item in enumerate(spec.items):
        if idx % 2 == 1:
            c.setFillColor(colors.HexColor("#f8fafc"))
            c.rect(40, curr_y - 4, W - 80, 16, fill=1, stroke=0)

        desc = item["description"]
        qty = item["quantity"]
        rate = item["unit_price"]
        total = item["line_total"]

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#1e293b"))
        c.drawString(50, curr_y, desc[:50])
        c.drawString(340, curr_y, f"{qty:.2f}")
        c.drawString(410, curr_y, format_inr(rate, symbol=False))
        c.drawRightString(W - 50, curr_y, format_inr(total, symbol=False))

        rec.items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": rate,
            "line_total": total,
            "bbox": rec.to_normalized_bbox(40, curr_y - 4, W - 80, 16),
        })
        curr_y -= 18

    # Totals
    totals_y = curr_y - 20
    draw_text_with_bbox(c, rec, None, None, "Subtotal", W - 180, totals_y, "Helvetica", 9)
    draw_text_with_bbox(c, rec, "subtotal", spec.subtotal, format_inr(spec.subtotal), W - 50, totals_y, "Helvetica-Bold", 9, align="right")

    cgst, sgst, igst, total_tax = compute_tax_breakdown(
        spec.subtotal, spec.tax_rate, spec.vendor_state_code, spec.buyer_state_code
    )
    totals_y -= 14
    draw_text_with_bbox(c, rec, None, None, f"Tax ({spec.tax_rate*100:.0f}%)", W - 180, totals_y, "Helvetica", 9)
    draw_text_with_bbox(c, rec, "tax.total", total_tax, format_inr(total_tax), W - 50, totals_y, "Helvetica", 9, align="right")

    totals_y -= 22
    draw_text_with_bbox(c, rec, None, None, "Total Due", W - 180, totals_y, "Helvetica-Bold", 12, colors.HexColor("#4f46e5"))
    draw_text_with_bbox(
        c, rec, "grand_total", spec.grand_total, format_inr(spec.grand_total), W - 50, totals_y, "Helvetica-Bold", 12, colors.HexColor("#4f46e5"), align="right"
    )

    # Bank details & words
    draw_text_with_bbox(c, rec, "amount_in_words", spec.amount_in_words, spec.amount_in_words, 40, totals_y - 20, "Helvetica-Oblique", 8)
    draw_text_with_bbox(c, rec, "payment.account_number", spec.account_number, f"Pay to: {spec.bank_name} A/C {spec.account_number} ({spec.ifsc})", 40, totals_y - 40, "Helvetica", 8)

    return rec.get_ground_truth()


# ---------------------------------------------------------
# Template 3: GST Tax Invoice
# ---------------------------------------------------------
def render_gst_tax_invoice(c: canvas.Canvas, spec: InvoiceSpec) -> dict[str, Any]:
    rec = BboxRecorder()
    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # Outer border
    c.setStrokeColor(colors.HexColor("#334155"))
    c.rect(30, 30, W - 60, H - 60, fill=0, stroke=1)

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(W / 2.0, H - 55, "TAX INVOICE")
    c.setFont("Helvetica", 8)
    c.drawCentredString(W / 2.0, H - 67, "(Under Section 31 of GST Act)")

    # Separator
    c.line(30, H - 75, W - 30, H - 75)

    # Vendor Details (Left) vs Invoice Details (Right)
    draw_text_with_bbox(c, rec, "vendor.name", spec.vendor_name, spec.vendor_name, 40, H - 90, "Helvetica-Bold", 11)
    draw_text_with_bbox(c, rec, "vendor.address", spec.vendor_address, spec.vendor_address, 40, H - 104, "Helvetica", 8)
    draw_text_with_bbox(c, rec, "vendor.gstin", spec.vendor_gstin, f"GSTIN/UIN: {spec.vendor_gstin}", 40, H - 118, "Helvetica-Bold", 8)
    draw_text_with_bbox(c, rec, "vendor.state_code", spec.vendor_state_code, f"State Code: {spec.vendor_state_code}", 40, H - 130, "Helvetica", 8)

    c.line(W / 2.0, H - 75, W / 2.0, H - 145)

    draw_text_with_bbox(c, rec, "invoice_number", spec.invoice_number, f"Invoice No: {spec.invoice_number}", W / 2.0 + 10, H - 90, "Helvetica-Bold", 9)
    draw_text_with_bbox(c, rec, "invoice_date", spec.invoice_date, f"Date: {spec.invoice_date}", W / 2.0 + 10, H - 104, "Helvetica", 8)
    draw_text_with_bbox(c, rec, "due_date", spec.due_date, f"Payment Due: {spec.due_date}", W / 2.0 + 10, H - 118, "Helvetica", 8)

    c.line(30, H - 145, W - 30, H - 145)

    # Buyer
    draw_text_with_bbox(c, rec, "buyer.name", spec.buyer_name, f"Bill To: {spec.buyer_name}", 40, H - 160, "Helvetica-Bold", 9)
    draw_text_with_bbox(c, rec, "buyer.address", spec.buyer_address, spec.buyer_address, 40, H - 172, "Helvetica", 8)
    draw_text_with_bbox(c, rec, "buyer.gstin", spec.buyer_gstin, f"GSTIN: {spec.buyer_gstin}", 40, H - 184, "Helvetica-Bold", 8)

    c.line(30, H - 195, W - 30, H - 195)

    # Table Header with HSN and GST columns
    table_y = H - 210
    c.setFont("Helvetica-Bold", 8)
    c.drawString(35, table_y, "S.N.")
    c.drawString(60, table_y, "Description of Goods/Services")
    c.drawString(280, table_y, "HSN")
    c.drawString(335, table_y, "Qty")
    c.drawString(380, table_y, "Rate")
    c.drawRightString(W - 35, table_y, "Total (INR)")

    c.line(30, table_y - 6, W - 30, table_y - 6)

    curr_y = table_y - 18
    for idx, item in enumerate(spec.items):
        desc = item["description"]
        qty = item["quantity"]
        rate = item["unit_price"]
        total = item["line_total"]
        hsn = item.get("hsn_sac", "998314")

        c.setFont("Helvetica", 8)
        c.drawString(35, curr_y, str(idx + 1))
        c.drawString(60, curr_y, desc[:42])
        c.drawString(280, curr_y, hsn)
        c.drawString(335, curr_y, f"{qty:.2f}")
        c.drawString(380, curr_y, format_inr(rate, symbol=False))
        c.drawRightString(W - 35, curr_y, format_inr(total, symbol=False))

        rec.items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": rate,
            "line_total": total,
            "hsn_sac": hsn,
            "bbox": rec.to_normalized_bbox(30, curr_y - 4, W - 60, 14),
        })
        curr_y -= 16

    c.line(30, curr_y - 4, W - 30, curr_y - 4)

    # Totals table
    tot_y = curr_y - 18
    draw_text_with_bbox(c, rec, None, None, "Total Taxable Value:", W - 220, tot_y, "Helvetica-Bold", 8)
    draw_text_with_bbox(c, rec, "subtotal", spec.subtotal, format_inr(spec.subtotal), W - 35, tot_y, "Helvetica-Bold", 8, align="right")

    cgst, sgst, igst, total_tax = compute_tax_breakdown(
        spec.subtotal, spec.tax_rate, spec.vendor_state_code, spec.buyer_state_code
    )

    tot_y -= 14
    if igst > 0:
        draw_text_with_bbox(c, rec, None, None, f"Integrated Tax (IGST {spec.tax_rate*100:.0f}%):", W - 220, tot_y, "Helvetica", 8)
        draw_text_with_bbox(c, rec, "tax.igst", igst, format_inr(igst), W - 35, tot_y, "Helvetica", 8, align="right")
    else:
        draw_text_with_bbox(c, rec, None, None, f"Central Tax (CGST {spec.tax_rate*50:.1f}%):", W - 220, tot_y, "Helvetica", 8)
        draw_text_with_bbox(c, rec, "tax.cgst", cgst, format_inr(cgst), W - 35, tot_y, "Helvetica", 8, align="right")
        tot_y -= 14
        draw_text_with_bbox(c, rec, None, None, f"State Tax (SGST {spec.tax_rate*50:.1f}%):", W - 220, tot_y, "Helvetica", 8)
        draw_text_with_bbox(c, rec, "tax.sgst", sgst, format_inr(sgst), W - 35, tot_y, "Helvetica", 8, align="right")

    tot_y -= 18
    c.line(W - 240, tot_y + 12, W - 30, tot_y + 12)
    draw_text_with_bbox(c, rec, None, None, "Total Invoice Value:", W - 220, tot_y, "Helvetica-Bold", 10)
    draw_text_with_bbox(c, rec, "grand_total", spec.grand_total, format_inr(spec.grand_total), W - 35, tot_y, "Helvetica-Bold", 10, align="right")

    # Words and Bank
    draw_text_with_bbox(c, rec, "amount_in_words", spec.amount_in_words, f"Amount in Words: {spec.amount_in_words}", 40, tot_y - 25, "Helvetica-Oblique", 8)
    draw_text_with_bbox(c, rec, "payment.account_number", spec.account_number, f"Bank Account: {spec.bank_name} A/c No: {spec.account_number} IFSC: {spec.ifsc}", 40, tot_y - 45, "Helvetica", 8)

    return rec.get_ground_truth()


# ---------------------------------------------------------
# Template 4: Two Column Layout
# ---------------------------------------------------------
def render_two_column(c: canvas.Canvas, spec: InvoiceSpec) -> dict[str, Any]:
    rec = BboxRecorder()
    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # Left colored sidebar
    c.setFillColor(colors.HexColor("#0f172a"))
    c.rect(0, 0, 180, H, fill=1, stroke=0)

    # Left Column Content (Vendor & Bank Details)
    draw_text_with_bbox(c, rec, "vendor.name", spec.vendor_name, spec.vendor_name, 15, H - 45, "Helvetica-Bold", 13, colors.white)
    draw_text_with_bbox(c, rec, "vendor.gstin", spec.vendor_gstin, f"GST: {spec.vendor_gstin}", 15, H - 65, "Helvetica", 8, colors.HexColor("#94a3b8"))
    draw_text_with_bbox(c, rec, "vendor.pan", spec.vendor_pan, f"PAN: {spec.vendor_pan}", 15, H - 78, "Helvetica", 8, colors.HexColor("#94a3b8"))
    draw_text_with_bbox(c, rec, "vendor.email", spec.vendor_email, spec.vendor_email, 15, H - 91, "Helvetica", 8, colors.HexColor("#94a3b8"))

    # Left Bank Details
    draw_text_with_bbox(c, rec, None, None, "PAYMENT METHOD", 15, H - 140, "Helvetica-Bold", 9, colors.HexColor("#38bdf8"))
    draw_text_with_bbox(c, rec, "payment.bank_name", spec.bank_name, spec.bank_name, 15, H - 156, "Helvetica", 8, colors.white)
    draw_text_with_bbox(c, rec, "payment.account_number", spec.account_number, f"A/C: {spec.account_number}", 15, H - 170, "Helvetica-Bold", 8, colors.white)
    draw_text_with_bbox(c, rec, "payment.ifsc", spec.ifsc, f"IFSC: {spec.ifsc}", 15, H - 184, "Helvetica", 8, colors.HexColor("#94a3b8"))

    # Right Column Content (Main Invoice & Items)
    main_x = 200
    draw_text_with_bbox(c, rec, None, None, "INVOICE", main_x, H - 45, "Helvetica-Bold", 22, colors.HexColor("#0f172a"))
    draw_text_with_bbox(c, rec, "invoice_number", spec.invoice_number, f"#{spec.invoice_number}", W - 40, H - 45, "Helvetica-Bold", 12, align="right")

    draw_text_with_bbox(c, rec, "invoice_date", spec.invoice_date, f"Date: {spec.invoice_date}", main_x, H - 75, "Helvetica", 9)
    draw_text_with_bbox(c, rec, "due_date", spec.due_date, f"Due: {spec.due_date}", main_x + 120, H - 75, "Helvetica", 9)

    # Client
    draw_text_with_bbox(c, rec, None, None, "ISSUED TO", main_x, H - 105, "Helvetica-Bold", 8, colors.HexColor("#64748b"))
    draw_text_with_bbox(c, rec, "buyer.name", spec.buyer_name, spec.buyer_name, main_x, H - 118, "Helvetica-Bold", 10)
    draw_text_with_bbox(c, rec, "buyer.gstin", spec.buyer_gstin, f"GSTIN: {spec.buyer_gstin}", main_x, H - 130, "Helvetica", 8)

    # Items table
    table_top = H - 165
    c.setFillColor(colors.HexColor("#f1f5f9"))
    c.rect(main_x, table_top - 14, W - main_x - 40, 18, fill=1, stroke=0)

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#334155"))
    c.drawString(main_x + 8, table_top - 10, "ITEM")
    c.drawString(main_x + 180, table_top - 10, "QTY")
    c.drawRightString(W - 48, table_top - 10, "PRICE")

    curr_y = table_top - 26
    for item in spec.items:
        desc = item["description"]
        qty = item["quantity"]
        total = item["line_total"]

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(main_x + 8, curr_y, desc[:35])
        c.drawString(main_x + 180, curr_y, f"{qty:.2f}")
        c.drawRightString(W - 48, curr_y, format_inr(total, symbol=False))

        rec.items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": item["unit_price"],
            "line_total": total,
            "bbox": rec.to_normalized_bbox(main_x, curr_y - 4, W - main_x - 40, 14),
        })
        curr_y -= 16

    # Totals
    totals_y = curr_y - 20
    draw_text_with_bbox(c, rec, "subtotal", spec.subtotal, f"Subtotal: {format_inr(spec.subtotal)}", W - 48, totals_y, "Helvetica", 9, align="right")
    totals_y -= 14
    tax_amt = round(spec.subtotal * spec.tax_rate, 2)
    draw_text_with_bbox(c, rec, "tax.total", tax_amt, f"Tax ({spec.tax_rate*100:.0f}%): {format_inr(tax_amt)}", W - 48, totals_y, "Helvetica", 9, align="right")
    totals_y -= 18
    draw_text_with_bbox(c, rec, "grand_total", spec.grand_total, f"Grand Total: {format_inr(spec.grand_total)}", W - 48, totals_y, "Helvetica-Bold", 12, colors.HexColor("#0f172a"), align="right")

    return rec.get_ground_truth()


# ---------------------------------------------------------
# Template 5: Compact Thermal / Statement
# ---------------------------------------------------------
def render_compact_thermal(c: canvas.Canvas, spec: InvoiceSpec) -> dict[str, Any]:
    rec = BboxRecorder()
    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # Centered compact receipt header
    draw_text_with_bbox(c, rec, "vendor.name", spec.vendor_name, spec.vendor_name, W / 2.0, H - 45, "Helvetica-Bold", 14, align="center")
    draw_text_with_bbox(c, rec, "vendor.address", spec.vendor_address, spec.vendor_address, W / 2.0, H - 60, "Helvetica", 8, colors.HexColor("#475569"), align="center")
    draw_text_with_bbox(c, rec, "vendor.gstin", spec.vendor_gstin, f"GSTIN: {spec.vendor_gstin}", W / 2.0, H - 72, "Helvetica", 8, align="center")

    # Dashed divider
    c.setDash(3, 3)
    c.line(40, H - 85, W - 40, H - 85)
    c.setDash()

    # Invoice info line
    info_y = H - 100
    draw_text_with_bbox(c, rec, "invoice_number", spec.invoice_number, f"INV: {spec.invoice_number}", 45, info_y, "Helvetica-Bold", 8)
    draw_text_with_bbox(c, rec, "invoice_date", spec.invoice_date, f"DATE: {spec.invoice_date}", W - 45, info_y, "Helvetica", 8, align="right")

    draw_text_with_bbox(c, rec, "buyer.name", spec.buyer_name, f"CUST: {spec.buyer_name}", 45, info_y - 14, "Helvetica", 8)
    draw_text_with_bbox(c, rec, "buyer.gstin", spec.buyer_gstin, f"CUST GST: {spec.buyer_gstin}", W - 45, info_y - 14, "Helvetica", 8, align="right")

    c.setDash(3, 3)
    c.line(40, info_y - 24, W - 40, info_y - 24)
    c.setDash()

    # Table items
    table_y = info_y - 38
    c.setFont("Helvetica-Bold", 8)
    c.drawString(45, table_y, "ITEM DESCRIPTION")
    c.drawString(340, table_y, "QTY")
    c.drawRightString(W - 45, table_y, "AMOUNT")

    curr_y = table_y - 14
    for item in spec.items:
        desc = item["description"]
        qty = item["quantity"]
        total = item["line_total"]

        c.setFont("Helvetica", 8)
        c.drawString(45, curr_y, desc[:45])
        c.drawString(340, curr_y, f"{qty:.2f}")
        c.drawRightString(W - 45, curr_y, format_inr(total, symbol=False))

        rec.items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": item["unit_price"],
            "line_total": total,
            "bbox": rec.to_normalized_bbox(40, curr_y - 2, W - 80, 12),
        })
        curr_y -= 14

    c.setDash(3, 3)
    c.line(40, curr_y - 4, W - 40, curr_y - 4)
    c.setDash()

    totals_y = curr_y - 18
    draw_text_with_bbox(c, rec, "subtotal", spec.subtotal, f"SUBTOTAL: {format_inr(spec.subtotal)}", W - 45, totals_y, "Helvetica", 8, align="right")
    totals_y -= 12
    tax_amt = round(spec.subtotal * spec.tax_rate, 2)
    draw_text_with_bbox(c, rec, "tax.total", tax_amt, f"TAX ({spec.tax_rate*100:.0f}%): {format_inr(tax_amt)}", W - 45, totals_y, "Helvetica", 8, align="right")
    totals_y -= 16
    draw_text_with_bbox(c, rec, "grand_total", spec.grand_total, f"TOTAL: {format_inr(spec.grand_total)}", W - 45, totals_y, "Helvetica-Bold", 10, align="right")

    draw_text_with_bbox(c, rec, "payment.account_number", spec.account_number, f"Bank: {spec.bank_name} A/C {spec.account_number}", 45, totals_y - 25, "Helvetica", 8)

    return rec.get_ground_truth()


TEMPLATE_REGISTRY = {
    "classic_table": render_classic_table,
    "modern_minimal": render_modern_minimal,
    "gst_tax_invoice": render_gst_tax_invoice,
    "two_column": render_two_column,
    "compact_thermal": render_compact_thermal,
}


def render_invoice_pdf(spec: InvoiceSpec, output_path: str) -> dict[str, Any]:
    """Render an invoice spec to PDF using the chosen template and return ground-truth bboxes."""
    renderer = TEMPLATE_REGISTRY.get(spec.template_id, render_classic_table)
    c = canvas.Canvas(output_path, pagesize=A4)
    gt = renderer(c, spec)
    c.showPage()
    c.save()
    return gt
