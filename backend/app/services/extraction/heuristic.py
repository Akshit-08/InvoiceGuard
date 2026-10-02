"""Heuristic & Layout-Based Extractor for Invoice Entities.

Parses key anchors, regexes, party header blocks, and line-item tables with
normalized bounding box attribution per Blueprint section 7.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Tuple

from backend.app.schemas.contracts import (
    Field,
    InvoiceData,
    LineItem,
    Token,
)
from backend.app.services.extraction.normalize import (
    normalize_account_number,
    normalize_date,
    normalize_gstin,
    normalize_ifsc,
    normalize_inr_amount,
    normalize_pan,
)


@dataclass
class Line:
    tokens: list[Token]
    text: str
    bbox: list[float]
    page: int


def group_tokens_into_lines(tokens: list[Token], y_thresh: float = 0.012) -> list[Line]:
    """Group tokens into horizontal reading lines sorted top-to-bottom, left-to-right."""
    if not tokens:
        return []

    # Sort tokens by page, then top coordinate, then left coordinate
    sorted_tokens = sorted(tokens, key=lambda t: (t.page, t.bbox[1], t.bbox[0]))
    lines: list[Line] = []

    current_line_tokens: list[Token] = []
    current_page = sorted_tokens[0].page
    current_y = sorted_tokens[0].bbox[1]

    for t in sorted_tokens:
        if t.page != current_page or abs(t.bbox[1] - current_y) > y_thresh:
            if current_line_tokens:
                # Sort line tokens left-to-right
                current_line_tokens.sort(key=lambda tok: tok.bbox[0])
                line_text = " ".join([tok.text for tok in current_line_tokens])
                x0 = min(tok.bbox[0] for tok in current_line_tokens)
                y0 = min(tok.bbox[1] for tok in current_line_tokens)
                x1 = max(tok.bbox[2] for tok in current_line_tokens)
                y1 = max(tok.bbox[3] for tok in current_line_tokens)
                lines.append(
                    Line(
                        tokens=current_line_tokens,
                        text=line_text,
                        bbox=[round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                        page=current_page,
                    )
                )
            current_line_tokens = [t]
            current_page = t.page
            current_y = t.bbox[1]
        else:
            current_line_tokens.append(t)

    if current_line_tokens:
        current_line_tokens.sort(key=lambda tok: tok.bbox[0])
        line_text = " ".join([tok.text for tok in current_line_tokens])
        x0 = min(tok.bbox[0] for tok in current_line_tokens)
        y0 = min(tok.bbox[1] for tok in current_line_tokens)
        x1 = max(tok.bbox[2] for tok in current_line_tokens)
        y1 = max(tok.bbox[3] for tok in current_line_tokens)
        lines.append(
            Line(
                tokens=current_line_tokens,
                text=line_text,
                bbox=[round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                page=current_page,
            )
        )

    return lines


class HeuristicExtractor:
    """Robust heuristic and layout-aware invoice entity extractor."""

    def extract(self, tokens: list[Token]) -> InvoiceData:
        lines = group_tokens_into_lines(tokens)
        data = InvoiceData()

        # 1. Extract GSTINs (Vendor vs Buyer)
        gstin_pattern = re.compile(
            r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b"
        )
        found_gstins: list[Tuple[str, Line]] = []

        for line in lines:
            matches = gstin_pattern.findall(line.text)
            for m in matches:
                found_gstins.append((m, line))

        if found_gstins:
            # First GSTIN is vendor GSTIN
            v_gstin, v_line = found_gstins[0]
            data.vendor.gstin = Field[str](
                value=normalize_gstin(v_gstin),
                raw=v_gstin,
                conf=0.98,
                source="heuristic",
                bbox=v_line.bbox,
                page=v_line.page,
            )
            # Associated PAN is characters 3 to 12
            if len(v_gstin) == 15:
                pan_val = v_gstin[2:12]
                data.vendor.pan = Field[str](
                    value=pan_val,
                    raw=pan_val,
                    conf=0.95,
                    source="heuristic",
                    bbox=v_line.bbox,
                    page=v_line.page,
                )

            # Second GSTIN (if present) is Buyer GSTIN
            if len(found_gstins) > 1:
                b_gstin, b_line = found_gstins[1]
                data.buyer.gstin = Field[str](
                    value=normalize_gstin(b_gstin),
                    raw=b_gstin,
                    conf=0.95,
                    source="heuristic",
                    bbox=b_line.bbox,
                    page=b_line.page,
                )

        # 2. Extract PAN (if not already extracted from GSTIN)
        if not data.vendor.pan.value:
            pan_pattern = re.compile(r"\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b")
            for line in lines:
                m = pan_pattern.search(line.text)
                if m:
                    pan_val = m.group(1)
                    data.vendor.pan = Field[str](
                        value=normalize_pan(pan_val),
                        raw=pan_val,
                        conf=0.90,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )
                    break

        # 3. Extract Invoice Number & Dates
        inv_no_regex = re.compile(
            r"(?i)(?:invoice\s*(?:no|number|#)|inv\s*(?:no|#|:)|bill\s*(?:no|#)|#)\s*[:#-]?\s*([A-Za-z0-9/-]{3,30})"
        )
        date_regex = re.compile(
            r"(?i)(?:invoice\s*date|dated?|date|inv\s*date)\s*[:#-]?\s*([0-9]{1,4}[-/.][A-Za-z0-9]{1,4}[-/.][0-9]{2,4})"
        )
        due_regex = re.compile(
            r"(?i)(?:due\s*date|payment\s*due|due)\s*[:#-]?\s*([0-9]{1,4}[-/.][A-Za-z0-9]{1,4}[-/.][0-9]{2,4})"
        )

        for line in lines:
            # Invoice number
            if not data.invoice_number.value:
                m_inv = inv_no_regex.search(line.text)
                if m_inv:
                    val = m_inv.group(1).strip()
                    data.invoice_number = Field[str](
                        value=val,
                        raw=line.text,
                        conf=0.96,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )

            # Invoice date
            if not data.invoice_date.value:
                m_date = date_regex.search(line.text)
                if m_date:
                    raw_d = m_date.group(1).strip()
                    norm_d = normalize_date(raw_d)
                    if norm_d:
                        data.invoice_date = Field[str](
                            value=norm_d,
                            raw=raw_d,
                            conf=0.96,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        )

            # Due date
            if not data.due_date:
                m_due = due_regex.search(line.text)
                if m_due:
                    raw_due = m_due.group(1).strip()
                    norm_due = normalize_date(raw_due)
                    if norm_due:
                        data.due_date = Field[str](
                            value=norm_due,
                            raw=raw_due,
                            conf=0.92,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        )

        # Fallback for Invoice Number if not captured by prefix
        if not data.invoice_number.value:
            for line in lines:
                m_num = re.search(r"\b(INV[/-][A-Za-z0-9/-]{3,20})\b", line.text, re.IGNORECASE)
                if m_num:
                    val = m_num.group(1).strip()
                    data.invoice_number = Field[str](
                        value=val,
                        raw=val,
                        conf=0.85,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )
                    break

        # 4. Extract Vendor Name and Buyer Name
        # Vendor name is usually in the top header lines (page 0, top 25% of page, left column)
        for line in lines:
            if line.page == 0 and line.bbox[1] < 0.25:
                # Isolate vendor tokens on the left side of the page (vendor block is x < 0.48)
                v_tokens = [
                    t for t in line.tokens
                    if t.bbox[0] < 0.48 and not any(k in t.text.upper() for k in ["TAX", "INVOICE", "ORIGINAL", "DUPLICATE", "BILL", "BILLED"])
                ]
                if v_tokens:
                    candidate = " ".join([t.text for t in v_tokens]).strip()
                    upper_c = candidate.upper()
                    if any(upper_c.startswith(k) for k in ["GSTIN", "PAN", "EMAIL", "PHONE", "TEL", "STATE", "DATE", "DUE", "UNDER"]):
                        continue
                    if len(candidate) > 3 and not data.vendor.name.value:
                        data.vendor.name = Field[str](
                            value=candidate,
                            raw=candidate,
                            conf=0.92,
                            source="heuristic",
                            bbox=[
                                min(t.bbox[0] for t in v_tokens),
                                min(t.bbox[1] for t in v_tokens),
                                max(t.bbox[2] for t in v_tokens),
                                max(t.bbox[3] for t in v_tokens),
                            ],
                            page=line.page,
                        )
                        break

        # Buyer Name follows "Billed To:" or "Bill To:" or "Client:"
        for i, line in enumerate(lines):
            if any(k in line.text.upper() for k in ["BILLED TO", "BILL TO", "CLIENT:", "ISSUED TO", "CUST:"]):
                # Look on same line or next line
                subtext = re.sub(r"(?i)^(billed to|bill to|client|issued to|cust)\s*[:#-]?\s*", "", line.text).strip()
                if subtext:
                    data.buyer.name = Field[str](
                        value=subtext,
                        raw=subtext,
                        conf=0.90,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )
                    break
                elif i + 1 < len(lines):
                    next_line = lines[i + 1]
                    data.buyer.name = Field[str](
                        value=next_line.text.strip(),
                        raw=next_line.text,
                        conf=0.90,
                        source="heuristic",
                        bbox=next_line.bbox,
                        page=next_line.page,
                    )
                    break

        # 5. Extract Financial Totals (Subtotal, Grand Total, Tax)
        gt_regex = re.compile(
            r"(?i)(?:grand\s*total|total\s*(?:invoice\s*value|due|amount)|\btotal\s*:)\s*[:#-]?\s*[^0-9\n]*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)"
        )
        sub_regex = re.compile(
            r"(?i)(?:subtotal|sub\s*total|taxable\s*value|total\s*taxable)\s*[:#-]?\s*[^0-9\n]*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)"
        )

        for line in lines:
            # Grand Total
            if not data.grand_total.value:
                m_gt = gt_regex.search(line.text)
                if m_gt:
                    raw_val = m_gt.group(1).strip()
                    val = normalize_inr_amount(raw_val)
                    if val is not None and val > 0:
                        data.grand_total = Field[float](
                            value=val,
                            raw=raw_val,
                            conf=0.98,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        )

            # Subtotal
            if not data.subtotal.value:
                m_sub = sub_regex.search(line.text)
                if m_sub:
                    raw_val = m_sub.group(1).strip()
                    val = normalize_inr_amount(raw_val)
                    if val is not None and val > 0:
                        data.subtotal = Field[float](
                            value=val,
                            raw=raw_val,
                            conf=0.95,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        )

            # Taxes: CGST / SGST / IGST / Generic Tax
            if "CGST" in line.text.upper():
                val = normalize_inr_amount(line.text)
                if val:
                    data.tax.cgst = Field[float](
                        value=val, raw=line.text, conf=0.92, source="heuristic", bbox=line.bbox, page=line.page
                    )
            if "SGST" in line.text.upper():
                val = normalize_inr_amount(line.text)
                if val:
                    data.tax.sgst = Field[float](
                        value=val, raw=line.text, conf=0.92, source="heuristic", bbox=line.bbox, page=line.page
                    )
            if "IGST" in line.text.upper():
                val = normalize_inr_amount(line.text)
                if val:
                    data.tax.igst = Field[float](
                        value=val, raw=line.text, conf=0.92, source="heuristic", bbox=line.bbox, page=line.page
                    )
            if re.search(r"(?i)\btax\b", line.text) and not any(k in line.text.upper() for k in ["TAX INVOICE", "TAXABLE"]):
                val = normalize_inr_amount(line.text)
                if val:
                    data.tax.total = Field[float](
                        value=val, raw=line.text, conf=0.92, source="heuristic", bbox=line.bbox, page=line.page
                    )

        # Tax total calculation
        tax_total_val = 0.0
        if data.tax.total.value:
            tax_total_val = data.tax.total.value
        elif data.tax.igst and data.tax.igst.value:
            tax_total_val = data.tax.igst.value
        elif data.tax.cgst and data.tax.cgst.value and data.tax.sgst and data.tax.sgst.value:
            tax_total_val = round(data.tax.cgst.value + data.tax.sgst.value, 2)
        elif data.grand_total.value and data.subtotal.value:
            tax_total_val = max(0.0, round(data.grand_total.value - data.subtotal.value, 2))

        data.tax.total = Field[float](
            value=tax_total_val,
            conf=0.90,
            source="heuristic",
        )

        # 6. Extract Amount in Words
        words_regex = re.compile(
            r"(?i)(?:amount\s*in\s*words|in\s*words)\s*[:#-]?\s*([A-Za-z\s,-]+(?:only|rupees)?)"
        )
        for line in lines:
            m_words = words_regex.search(line.text)
            if m_words:
                raw_w = m_words.group(1).strip()
                data.amount_in_words = Field[str](
                    value=raw_w,
                    raw=raw_w,
                    conf=0.92,
                    source="heuristic",
                    bbox=line.bbox,
                    page=line.page,
                )
                break

        # 7. Extract Bank Details
        ifsc_regex = re.compile(r"\b([A-Z]{4}0[A-Z0-9]{6})\b")
        acc_regex = re.compile(r"(?i)(?:a/c|account|ac)\s*(?:no|number)?\s*[:#-]?\s*([0-9]{9,18})")

        for line in lines:
            if not data.payment.ifsc:
                m_ifsc = ifsc_regex.search(line.text)
                if m_ifsc:
                    val = m_ifsc.group(1).strip()
                    data.payment.ifsc = Field[str](
                        value=normalize_ifsc(val),
                        raw=val,
                        conf=0.95,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )

            if not data.payment.account_number:
                m_acc = acc_regex.search(line.text)
                if m_acc:
                    val = m_acc.group(1).strip()
                    data.payment.account_number = Field[str](
                        value=normalize_account_number(val),
                        raw=val,
                        conf=0.95,
                        source="heuristic",
                        bbox=line.bbox,
                        page=line.page,
                    )

        # 8. Table Parsing for Line Items
        table_items = self._parse_table_items(lines)
        data.items = table_items

        return data

    def _parse_table_items(self, lines: list[Line]) -> list[LineItem]:
        """Detect table header and extract line item records."""
        items: list[LineItem] = []
        table_header_idx = -1

        # Look for table header keywords
        for idx, line in enumerate(lines):
            t_upper = line.text.upper()
            has_desc = any(k in t_upper for k in ["DESCRIPTION", "ITEM", "PARTICULARS"])
            has_total = any(k in t_upper for k in ["AMOUNT", "TOTAL", "RATE", "PRICE"])
            if has_desc and has_total and not any(k in t_upper for k in ["GRAND TOTAL", "SUBTOTAL"]):
                table_header_idx = idx
                break

        if table_header_idx == -1:
            return items

        # Read item rows following header until totals block
        for row_idx in range(table_header_idx + 1, min(len(lines), table_header_idx + 20)):
            line = lines[row_idx]
            t_upper = line.text.upper()

            # Break on totals section
            if any(k in t_upper for k in ["SUBTOTAL", "TOTAL:", "TAXABLE", "CGST", "SGST", "IGST", "GRAND TOTAL", "AMOUNT IN WORDS"]):
                break

            # Search line for numbers
            # Usually line structure: [index] [Description] [qty] [rate] [total]
            numbers = re.findall(r"([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)", line.text)
            clean_nums = []
            for n in numbers:
                val = normalize_inr_amount(n)
                if val is not None:
                    clean_nums.append(val)

            if len(clean_nums) >= 2:
                # Last number is line total, penultimate is rate or qty
                line_total = clean_nums[-1]
                rate = clean_nums[-2]
                qty = clean_nums[-3] if len(clean_nums) >= 3 else 1.0

                # Text before numbers is description
                # Strip numeric tokens from end of text
                desc = re.sub(r"([0-9,.-]+\s*)+$", "", line.text).strip()
                # Strip leading row number if present
                desc = re.sub(r"^[0-9]+[.\s]+", "", desc).strip()
                if not desc:
                    desc = f"Item {len(items)+1}"

                items.append(
                    LineItem(
                        description=Field[str](
                            value=desc,
                            raw=desc,
                            conf=0.90,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        ),
                        quantity=Field[float](
                            value=qty,
                            raw=str(qty),
                            conf=0.88,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        ),
                        unit_price=Field[float](
                            value=rate,
                            raw=str(rate),
                            conf=0.88,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        ),
                        line_total=Field[float](
                            value=line_total,
                            raw=str(line_total),
                            conf=0.92,
                            source="heuristic",
                            bbox=line.bbox,
                            page=line.page,
                        ),
                    )
                )

        return items


heuristic_extractor = HeuristicExtractor()
