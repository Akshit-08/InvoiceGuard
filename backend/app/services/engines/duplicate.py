"""Duplicate Engine for InvoiceGuard.

Implements Blueprint section 8.4:
- L0 EXACT_FILE_DUPLICATE (SHA-256)
- L0b NEAR_IMAGE_DUPLICATE (pHash Hamming <= 6)
- L1 exact fields: same (vendor, invoice_number) | same (vendor, date, total)
- L2 fuzzy: rapidfuzz token_set_ratio on canonical string >= 90
- L3 semantic: fastembed embedding cosine >= 0.92
"""

import numpy as np
from rapidfuzz import fuzz

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


class VectorIndex:
    """NumPy-based vector index for fastembed semantic search."""

    def __init__(self, embeddings: dict[str, list[float]]):
        self.ids = list(embeddings.keys())
        if self.ids:
            self.matrix = np.array([embeddings[uid] for uid in self.ids], dtype=np.float32)
            # Normalize for cosine similarity via dot product
            norms = np.linalg.norm(self.matrix, axis=1, keepdims=True)
            self.matrix = self.matrix / np.where(norms == 0, 1e-9, norms)
        else:
            self.matrix = np.empty((0, 384), dtype=np.float32)

    def search(self, query: list[float], top_k: int = 5) -> list[tuple[str, float]]:
        if not self.ids:
            return []
        q_vec = np.array(query, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []
        q_vec = q_vec / q_norm

        scores = np.dot(self.matrix, q_vec)
        top_indices = np.argsort(scores)[::-1][:top_k]

        return [(self.ids[i], float(scores[i])) for i in top_indices]


def build_canonical_string(data: dict) -> str:
    """Builds a canonical string from invoice data for fuzzy matching and embeddings."""
    vendor = data.get("vendor_name", "").strip().lower()
    inv_num = data.get("invoice_number", "").strip().lower()
    date = data.get("invoice_date", "").strip().lower()
    total = str(data.get("grand_total", 0.0))
    items = sorted([str(i).strip().lower() for i in data.get("items", [])])
    return f"{vendor} | {inv_num} | {date} | {total} | {' | '.join(items)}"


class DuplicateEngine(BaseEngine):
    name = "duplicate"
    category = "statistical"

    def __init__(self):
        try:
            from fastembed import TextEmbedding
            self.embedder = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        except ImportError:
            self.embedder = None

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("duplicate"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        findings: list[Finding] = []
        features = {}

        # The indices dictionary should contain 'duplicate_history' and 'embeddings'
        history = context.indices.get("duplicate_history", [])
        current_data = context.data

        # We need the current invoice dict representation for comparison
        curr_dict = {
            "vendor_name": current_data.vendor.name.value if current_data.vendor.name else "",
            "invoice_number": current_data.invoice_number.value if current_data.invoice_number else "",
            "invoice_date": current_data.invoice_date.value if current_data.invoice_date else "",
            "grand_total": current_data.grand_total.value if current_data.grand_total else 0.0,
            "items": [i.description.value for i in current_data.items if i.description and i.description.value]
        }
        curr_canonical = build_canonical_string(curr_dict)

        # 1. EXACT_FILE_DUPLICATE (SHA-256)
        curr_hash = context.content_hash
        if curr_hash:
            for hist in history:
                if hist.get("content_hash") == curr_hash and hist.get("id") != context.invoice_id:
                    findings.append(self.create_finding(
                        finding_type="EXACT_FILE_DUPLICATE",
                        severity="critical",
                        score=100.0,
                        confidence=1.0,
                        title="Exact File Duplicate",
                        summary="This exact file (SHA-256 match) was previously submitted.",
                        expected="Unique file hash",
                        found=curr_hash,
                        difference="Hash match",
                        recommended_action="Reject invoice as an exact duplicate submission.",
                        related_invoice_ids=[hist.get("id")]
                    ))
                    break

        # 2. NEAR_IMAGE_DUPLICATE (pHash)
        curr_phash = context.phash
        if curr_phash:
            import imagehash
            c_hash = imagehash.hex_to_hash(curr_phash)
            for hist in history:
                h_phash = hist.get("phash")
                if h_phash and hist.get("id") != context.invoice_id:
                    h_hash = imagehash.hex_to_hash(h_phash)
                    if c_hash - h_hash <= 6:
                        findings.append(self.create_finding(
                            finding_type="NEAR_IMAGE_DUPLICATE",
                            severity="high",
                            score=90.0,
                            confidence=0.9,
                            title="Near Image Duplicate",
                            summary="This invoice's visual layout is nearly identical (pHash <= 6) to a previous submission.",
                            expected="Unique visual hash",
                            found=curr_phash,
                            difference=f"Hamming distance {c_hash - h_hash}",
                            recommended_action="Visually compare with the previous submission to check for subtle edits.",
                            related_invoice_ids=[hist.get("id")]
                        ))
                        break

        # 3. EXACT FIELDS
        curr_vendor = curr_dict["vendor_name"]
        curr_inv = curr_dict["invoice_number"]
        curr_date = curr_dict["invoice_date"]
        curr_total = curr_dict["grand_total"]

        for hist in history:
            if hist.get("id") == context.invoice_id:
                continue
            h_vendor = hist.get("vendor_name", "").strip().lower()
            h_inv = hist.get("invoice_number", "").strip().lower()
            h_date = hist.get("invoice_date", "").strip().lower()
            h_total = hist.get("grand_total", 0.0)

            if curr_vendor and curr_inv and curr_vendor == h_vendor and curr_inv == h_inv:
                # Same vendor, same invoice number
                if curr_total != h_total:
                    findings.append(self.create_finding(
                        finding_type="MODIFIED_DUPLICATE",
                        severity="critical",
                        score=95.0,
                        confidence=0.95,
                        title="Modified Duplicate (Same Vendor & Number)",
                        summary=f"Invoice number '{curr_inv}' from vendor '{curr_vendor}' was submitted before, but the grand total changed from {h_total} to {curr_total}.",
                        expected=f"Grand total {h_total} or unique invoice number",
                        found=curr_total,
                        difference=f"Total changed by {curr_total - h_total}",
                        recommended_action="Investigate immediately. This indicates a tampered duplicate.",
                        related_invoice_ids=[hist.get("id")]
                    ))
                else:
                    findings.append(self.create_finding(
                        finding_type="EXACT_DATA_DUPLICATE",
                        severity="high",
                        score=85.0,
                        confidence=0.9,
                        title="Exact Data Duplicate",
                        summary=f"Invoice number '{curr_inv}' from vendor '{curr_vendor}' already exists with the same total.",
                        expected="Unique invoice number",
                        found=curr_inv,
                        difference="Matches existing record",
                        recommended_action="Flag as duplicate submission.",
                        related_invoice_ids=[hist.get("id")]
                    ))
            elif curr_vendor and curr_date and curr_total and curr_total > 0:
                if curr_vendor == h_vendor and curr_date == h_date and curr_total == h_total:
                    findings.append(self.create_finding(
                        finding_type="SUSPICIOUS_DUPLICATE",
                        severity="medium",
                        score=75.0,
                        confidence=0.85,
                        title="Suspicious Duplicate Data",
                        summary=f"An invoice from '{curr_vendor}' on {curr_date} with total {curr_total} already exists, but with a different invoice number.",
                        expected="Unique combination of date and total for vendor",
                        found=f"{curr_date}, {curr_total}",
                        difference="Invoice number differs",
                        recommended_action="Check if vendor double-billed under a new invoice number.",
                        related_invoice_ids=[hist.get("id")]
                    ))

        # 4. FUZZY & SEMANTIC MATCHING
        best_fuzz = 0
        best_fuzz_id = None
        for hist in history:
            if hist.get("id") == context.invoice_id:
                continue
            h_canon = hist.get("canonical_string", "")
            score = fuzz.token_set_ratio(curr_canonical, h_canon)
            if score > best_fuzz:
                best_fuzz = score
                best_fuzz_id = hist.get("id")

        if best_fuzz >= 90.0:
            findings.append(self.create_finding(
                finding_type="NEAR_DUPLICATE_TEXT",
                severity="medium",
                score=70.0,
                confidence=0.8,
                title="Near-Duplicate Invoice (Text Match)",
                summary=f"The text content of this invoice is {best_fuzz:.1f}% similar to a previous submission.",
                expected="< 90% text similarity",
                found=f"{best_fuzz:.1f}%",
                difference="High fuzzy string match",
                recommended_action="Review side-by-side to identify minor alterations.",
                related_invoice_ids=[best_fuzz_id]
            ))

        # Semantic embedding
        if self.embedder:
            curr_vec = list(self.embedder.embed([curr_canonical]))[0].tolist()
            # In a real app, embeddings are stored and retrieved from the DB
            # We assume context.indices['embeddings'] provides a dict of {id: vector}
            embeddings_dict = context.indices.get("embeddings", {})
            if embeddings_dict:
                v_index = VectorIndex(embeddings_dict)
                top_matches = v_index.search(curr_vec, top_k=1)
                if top_matches:
                    match_id, match_score = top_matches[0]
                    if match_score >= 0.92 and match_id != context.invoice_id:
                        findings.append(self.create_finding(
                            finding_type="SEMANTIC_DUPLICATE",
                            severity="high",
                            score=80.0,
                            confidence=0.85,
                            title="Semantic Duplicate Detected",
                            summary=f"The semantic embedding of this invoice is highly similar (cosine {match_score:.3f}) to a prior submission.",
                            expected="Cosine similarity < 0.92",
                            found=f"{match_score:.3f}",
                            difference="High semantic match",
                            recommended_action="Examine invoices side-by-side for overlapping content.",
                            related_invoice_ids=[match_id]
                        ))

        return SignalResult(
            name=self.name,
            score=self.aggregate_score(findings),
            confidence=0.9,
            findings=findings,
            features=features
        )
