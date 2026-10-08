import io
from datetime import datetime
from pathlib import Path

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.app.models.entities import AuditEvent, Invoice, InvoiceFinding, RiskScoreRecord


def draw_header_footer(canvas, doc):
    canvas.saveState()
    # Header
    canvas.setFillColor(colors.HexColor("#0f172a"))
    canvas.rect(0, doc.pagesize[1] - 40, doc.pagesize[0], 40, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(inch, doc.pagesize[1] - 25, "InvoiceGuard™ Intelligence Report")

    # Footer
    canvas.setFillColor(colors.gray)
    canvas.setFont("Helvetica", 9)
    canvas.drawString(inch, 0.5 * inch, f"Page {doc.page}")
    canvas.drawString(doc.pagesize[0] - 2 * inch, 0.5 * inch, "CONFIDENTIAL")

    # Golden Rule Disclaimer on every page
    canvas.setFont("Helvetica-Oblique", 8)
    canvas.drawString(inch, 0.3 * inch, "InvoiceGuard flags anomalies for human review. It does not determine fraud.")
    canvas.restoreState()

def build_pdf_report(invoice: Invoice, findings: list[InvoiceFinding], risk_record: RiskScoreRecord, audit_events: list[AuditEvent], thumb_path: str = None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch
    )

    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    h1_style = styles["Heading1"]
    h2_style = styles["Heading2"]
    normal_style = styles["Normal"]

    risk_colors = {
        "LOW": colors.HexColor("#10b981"),
        "MEDIUM": colors.HexColor("#f59e0b"),
        "HIGH": colors.HexColor("#f97316"),
        "CRITICAL": colors.HexColor("#ef4444")
    }
    level = risk_record.level if risk_record else invoice.risk_level or "LOW"
    theme_color = risk_colors.get(level, colors.gray)

    elements = []

    # 1. Branded Cover
    elements.append(Spacer(1, 2*inch))
    elements.append(Paragraph("<font color='#0f172a'><b>Anomaly & Risk Analysis Report</b></font>", title_style))
    elements.append(Spacer(1, 0.5*inch))

    score = risk_record.overall_score if risk_record else invoice.overall_score or 0.0
    elements.append(Paragraph(f"<font size=24 color='{theme_color}'><b>{level} RISK ({score:.1f}/100)</b></font>", ParagraphStyle(name='Centered', alignment=1)))
    elements.append(Spacer(1, inch))

    cover_data = [
        ["Invoice Number:", invoice.invoice_number or "N/A"],
        ["Vendor Name:", invoice.vendor.name if invoice.vendor else "Unknown"],
        ["Invoice Date:", str(invoice.invoice_date)],
        ["Amount:", f"{invoice.currency or 'INR'} {invoice.grand_total:,.2f}" if invoice.grand_total else "N/A"],
        ["Analysis Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["Recommendation:", risk_record.recommendation if risk_record else "Review Required"]
    ]
    t = Table(cover_data, colWidths=[2.5*inch, 3.5*inch])
    t.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey)
    ]))
    elements.append(t)
    elements.append(PageBreak())

    # 2. Invoice Snapshot & Extracted Fields
    elements.append(Paragraph("Extraction Overview", h1_style))

    if thumb_path and Path(thumb_path).exists():
        img = Image(thumb_path, width=3*inch, height=4*inch)
        # Would highlight regions here ideally if we dynamically rendered bounding boxes onto the image
        # For now, just the thumbnail is embedded.
    else:
        img = Paragraph("[Document Preview Not Available]", normal_style)

    fields_data = [["Field", "Value", "Conf"]]
    if invoice.raw_extracted_json:
        for k, v in invoice.raw_extracted_json.items():
            if isinstance(v, dict) and "value" in v:
                val = str(v.get("value", ""))[:40]
                conf = f"{v.get('conf', 0.0):.2f}"
                fields_data.append([k, val, conf])

    t_fields = Table(fields_data, colWidths=[1.5*inch, 2.5*inch, 0.5*inch])
    t_fields.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
        ('ALIGN', (2,0), (2,-1), 'RIGHT'),
    ]))

    # Layout thumbnail next to fields using a wrapper table
    layout_table = Table([[img, t_fields]], colWidths=[3.2*inch, 4.8*inch])
    layout_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    elements.append(layout_table)
    elements.append(Spacer(1, 0.5*inch))

    # 3. Signal Breakdown Chart
    if risk_record and risk_record.signals_json:
        elements.append(Paragraph("Signal Contributions (SHAP / Sub-scores)", h2_style))
        d = Drawing(400, 200)
        chart = VerticalBarChart()
        chart.x = 50
        chart.y = 50
        chart.height = 125
        chart.width = 300

        signals = risk_record.signals_json
        labels = list(signals.keys())[:8] # Max 8
        values = [signals[k] for k in labels]

        chart.data = [values]
        chart.categoryAxis.categoryNames = [label[:10] for label in labels]
        chart.valueAxis.valueMin = 0
        chart.valueAxis.valueMax = max(values) + 10 if values else 100
        chart.bars[0].fillColor = theme_color
        d.add(chart)
        elements.append(d)
        elements.append(Spacer(1, 0.5*inch))

    # 4. Findings grouped by Engine
    elements.append(PageBreak())
    elements.append(Paragraph("Detailed Findings", h1_style))

    if not findings:
        elements.append(Paragraph("No anomalies detected.", normal_style))
    else:
        # Group findings
        grouped = {}
        for f in findings:
            grouped.setdefault(f.engine, []).append(f)

        for engine, facts in grouped.items():
            elements.append(Paragraph(f"{engine.replace('_', ' ').title()} Engine", h2_style))
            for f in facts:
                sev_color = risk_colors.get(f.severity.upper(), colors.black)
                f_data = [
                    [Paragraph(f"<font color='{sev_color}'><b>[{f.severity.upper()}]</b></font> {f.title}", normal_style)],
                    [Paragraph(f"<b>Summary:</b> {f.summary}", normal_style)],
                    [Paragraph(f"<b>Action:</b> {f.recommended_action}", normal_style)],
                    [Paragraph(f"<b>Evidence:</b> {str(f.evidence_json)[:200]}...", normal_style)]
                ]
                t_f = Table(f_data, colWidths=[7*inch])
                t_f.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.lightgrey),
                    ('INNERGRID', (0,0), (-1,-1), 0.25, colors.lightgrey),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ]))
                elements.append(KeepTogether([t_f, Spacer(1, 10)]))

    # 5. Audit Trail
    elements.append(PageBreak())
    elements.append(Paragraph("Audit Trail", h1_style))

    if not audit_events:
        elements.append(Paragraph("No audit events recorded.", normal_style))
    else:
        audit_data = [["Timestamp", "Actor", "Action", "Details"]]
        for a in audit_events:
            ts = a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else ""
            payload = str(a.payload_json)[:50]
            audit_data.append([ts, a.actor, a.action, payload])

        t_audit = Table(audit_data, colWidths=[1.5*inch, 1*inch, 2*inch, 2.5*inch])
        t_audit.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
        ]))
        elements.append(t_audit)

    doc.build(elements, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)

    return buffer.getvalue()
