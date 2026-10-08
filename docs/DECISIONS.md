# Architecture Decision Records (ADRs)

## ADR 001: SQLite by Default with Configurable SQLAlchemy URL
- **Context:** Rapid local development and testing without requiring Docker or a dedicated database instance on day 1.
- **Decision:** Use SQLite stored in `data/invoiceguard.db` as the default `DATABASE_URL`, while keeping SQLAlchemy 2.0 models completely portable for PostgreSQL.
- **Status:** Accepted.

## ADR 002: Dual Document Reader Strategy (PyMuPDF Text Layer + RapidOCR)
- **Context:** Real invoices range from native digital vector PDFs to noisy multi-generation scans. PaddleOCR installation often suffers from OS-specific C++ dependency issues.
- **Decision:** First inspect PDF text layer with PyMuPDF (words with coordinates). If digital words count < 30 (indicating scanned/raster), fall back to RapidOCR (ONNX runtime PaddleOCR model).
- **Status:** Accepted.

## ADR 003: Heuristic-First Extractor Chain
- **Context:** Training ML models (like LayoutLMv3) takes hours and can suffer from distribution shift or delayed weights.
- **Decision:** Build a high-precision, anchor-based HeuristicExtractor with domain-aware regex (GST, PAN, IFSC, date, amounts, tables). Provide pluggable hooks for LayoutLMv3 and LLM extractors that can override low-confidence fields.
- **Status:** Accepted.

## ADR 004: Normalised Page-Relative Bounding Boxes (0.0 to 1.0)
- **Context:** Responsive UI rendering with pan/zoom and dynamic resolutions requires coordinates that do not depend on fixed pixel or point DPI.
- **Decision:** All extracted tokens and field bounding boxes are normalized to [0.0, 1.0] relative to page width and height (`x0, y0, x1, y1`).
- **Status:** Accepted.

## ADR 005: Date-Aware Indian GST Slab Structure & CBIC Source Reference
- **Context:** GST rates in India are statutory and temporal. In September 2025, the GST Council / Central Board of Indirect Taxes and Customs (CBIC) implemented GST 2.0 reforms (effective 22 September 2025), consolidating standard slabs from 0%, 5%, 12%, 18%, 28% into 0%, 5%, 18%, and a consolidated 40% demerit/luxury rate (with special rates 0.25% and 3.0% for diamonds and precious metals). Invoices issued prior to this date legitimately carry 12% and 28% tax rates. Hardcoding static slabs would result in severe false positives on historical invoices or false negatives on post-reform invoices.
- **Source Verification:** Official notifications from the Central Board of Indirect Taxes and Customs (CBIC, https://www.cbic.gov.in/) and GST Council Gazette notifications on GST 2.0 rate rationalization.
- **Decision:** Maintain a date-aware slab lookup in `config/tax_slabs.yaml` backed by the `SettingsService`. Invoices dated before 2025-09-22 validate against legacy GST 1.0 slabs, while invoices dated on or after 2025-09-22 validate against GST 2.0 slabs. Undated or ambiguous invoices permit both slabs with a warning indicator.
## ADR 006: Model Quality Diagnosis & Remediation — ROC-AUC 0.54 Root Causes

**Status:** Accepted — implemented on branch `fix/day4-model-quality`  
**Symptom:** End-to-end ROC-AUC 0.54 (baseline 0.52), PR-AUC 0.66, precision 0.625 at recall 1.0 at threshold=30.  
False-positive rate on genuine invoices = **1.0** (every genuine invoice scores ≥ 30).  
Per-fraud-type recall = 1.0 across all types, but this is trivially true because the threshold is set so low the model says _every_ document is tampered.

### Confirmed Root Causes (from code and data review)

#### Hypothesis A — Empty/Wrong DB context in evaluation harness ✅ TRUE (PRIMARY)

`ml/common.py :: analysis_context_from_gt()` reads `vendor_history`, `vendor_accounts`, `all_accounts`, and `duplicate_history` directly from the ground-truth JSON. These fields are **never written by `generator.py`** (the GT payload only stores `spec`, `ground_truth`, `label`, `fraud_types`, `mode`, `is_scanned`). So:
- `vendor_history = []` for every document → Vendor engine cold-start path fires `NEW_VENDOR_NO_BASELINE` (score=10, conf=0.5) on **every** invoice, both genuine and tampered.
- `vendor_accounts = []` → Bank engine sees no known accounts, so `BANK_ACCOUNT_CHANGED` fires on **every** invoice with a bank account (score=85).
- `all_accounts = []` → Cross-vendor sharing check never fires (can't detect tamper) and never fires false positive.
- `duplicate_history = []` → Duplicate engine sees no prior invoices.

Effect: Every genuine invoice scores ≥ 30 because of `BANK_ACCOUNT_CHANGED` (score 85, weight 0.80). This pushes baseline ≈ 50+, far above threshold = 30.

#### Hypothesis B — Missing vendor history for held-out vendors ✅ TRUE (SECONDARY)

The split assigns vendors 38–44 to the test split. These vendors are never shown in training. Because vendor history is loaded from GT JSON and the generator never writes it, even if we did write history, the test vendors would have **zero** historical context. The evaluator must build synthetic per-vendor history from the other documents generated for that vendor, excluding the document being evaluated.

#### Hypothesis C — Extraction errors creating false findings on genuine invoices ✅ TRUE (CONTRIBUTING)

For genuine invoices, `invoice_data_from_gt()` reconstructs `InvoiceData` from the spec. However:
- Tax calculations use `taxable = subtotal - (discount_val or 0.0)` then `tax_amount = round(taxable * tax_rate / 100.0, 2)`. The spec already stores the correctly computed `grand_total`, but the reconstructed tax breakdown may differ slightly due to rounding order. This can cause `TAX_AMOUNT_MISMATCH` findings.
- The `op_invoice_no_reuse` operator hardcodes `"INV/25-26/0001"` — when multiple test vendors generate invoices using different numbering patterns, this can accidentally match the current vendor's pattern format and trigger `INVOICE_NUMBER_SEQUENCE_ANOMALY` against itself.
- `amount_in_words` is reconstructed independently in `invoice_data_from_gt` but the spec stores it only as a string; parsing edge cases can cause `AMOUNT_WORDS_MISMATCH` on genuine docs.

#### Hypothesis D — Duplicate engine self-match / leakage ✅ TRUE

The duplicate engine uses `context.indices["duplicate_history"]` which is always `[]`. However for `exact_duplicate` and `near_duplicate` operator invoices, the generator renders a new PDF from the tampered spec — same content as the base invoice but a fresh file. Without prior history loaded, the engine cannot detect duplicates at all. For genuine docs, the duplicate engine scores 0.0. So this is not causing the FP issue but explains why duplicate fraud types all score 1.0 (because the baseline or bank engine pushes the score ≥ 30 independently).

#### Hypothesis E — Visual engine fires on genuine PDFs ✅ TRUE (CONTRIBUTING)

`VisualEngine` checks `PDF_MODIFIED_AFTER_CREATION` when `mod_date - creation_date > 3600 seconds`. ReportLab writes the same timestamp for both fields by default, but PyMuPDF reads them as slightly different due to timezone parsing, and PDFs rendered and then re-opened (for preview generation) may have their metadata re-written. Additionally, the `FONT_MIX_IN_NUMERIC_FIELD` check triggers on any numeric line with 2+ font names — this can happen in genuine PDFs using mixed bold/regular for labels vs amounts. The visual engine contributes a score of 50–65 on some genuine PDFs, which in combination with bank-change score already above 30 makes the total score worse.

#### Hypothesis F — Tamper label mismatch ✅ PARTIALLY TRUE

Some operators (e.g., `op_vendor_lookalike`, `op_invoice_no_reuse`, `op_invoice_no_jump`, `op_exact_duplicate`) produce labels but may not alter fields that the rule engines can actually detect:
- `op_vendor_lookalike`: only changes the vendor name by one character substitution. The engines do detect this via fuzzy matching against `all_vendors`, but `all_vendors=[]` in context.
- `op_exact_duplicate`: renders a fresh identical PDF — SHA-256 will differ because there's no prior hash in context. The engine cannot detect this.
- `op_bank_swap`: correctly creates a detectable anomaly via `BANK_ACCOUNT_CHANGED`, but this fires on ALL invoices anyway (bug A), masking signal.

#### Hypothesis G — XGBoost collapsed to near-constant output ✅ TRUE

Because the feature distributions for genuine and tampered documents are nearly identical (both have bank-change firing, both have cold-start vendor firing, etc.), the XGBoost model trains on essentially random noise with class imbalance. The model converges to outputting approximately 0.65–0.75 probability for every document, which is why the calibrated ML score adds almost no discriminating value beyond the baseline. The monotone constraints on 31 features further limit the model's ability to find patterns in degenerate features.

#### Hypothesis H — Silent baseline fallback (wrong fusion mode) ⚠️ PARTIALLY TRUE

The `FusionEngine` checks for the ML artifact and falls back to baseline if not found. The artifact path `ml/artifacts/fusion_xgb.joblib` is resolved relative to the working directory, which differs between `python ml/evaluation/run.py` (run from project root) and `uvicorn backend.app.main:app` (also from project root). This is not the primary issue, but `ml_score` is not returned in the evaluate dict correctly — the evaluation script correctly calls `result.ml_score` but the model output is essentially constant.

### Summary of Root Causes (Priority Order)

| # | Root Cause | Effect | Fix |
|---|---|---|---|
| 1 | GT JSON never includes vendor_history, vendor_accounts, all_vendors, duplicate_history | Bank engine fires BANK_ACCOUNT_CHANGED on every invoice; vendor engine cold-starts on every invoice | Build per-vendor context in evaluator from manifest |
| 2 | Genuine invoices score ≥ 30 due to bank-change+vendor cold-start; threshold too low | FPR = 1.0; trivial recall=1.0; useless AUC | Fix context, re-evaluate |
| 3 | Training set (592 docs) has same degenerate features | XGBoost learns near-constant output | Generate 4,000+ docs with real context; retrain |
| 4 | Visual engine triggers on genuine PDFs with normal metadata gaps | False visual findings | Cap score, raise threshold for modification gap |
| 5 | Tamper operators not testable without prior history (duplicate, lookalike, bank-change) | Operators that rely on comparison against history have no context to compare against | Load vendor-specific history as context in evaluator |

## ADR 007: Frozen API Contract with SSE Progress Streaming & Decoupled Mock Fixtures
- **Context:** Parallel development of the React/Vite/Tailwind frontend on Day 3 requires a stable, guaranteed backend schema and verifiable real-time progress feedback without polling.
- **Decision:** Freeze the OpenAPI 3.1.0 specification at `docs/openapi.json` and export realistic JSON fixtures in `frontend-mocks/`. Real-time pipeline execution progress is delivered over Server-Sent Events (SSE) via `GET /api/v1/invoices/{id}/events`.
- **Status:** Accepted.

## ADR 008: Multi-Tier Duplicate and Forensics Strategy
- **Context:** Invoices may be duplicated as identical PDF files, re-scanned/rasterized duplicates, modified digital duplicates (altered amount or bank account), or manipulated metadata revisions.
- **Decision:** Implement multi-tier detection: SHA-256 for exact binary duplicates, perceptual pHash (dHash/average hash) with Hamming distance <= 10 for re-scanned duplicates, canonical field normalization (vendor + invoice_number + date + grand_total) for modified duplicates, and PDF structure analysis (revision count, multiple %%EOF markers, font inconsistency, incremental updates) for visual tampering.
- **Status:** Accepted.

## ADR 009: Evaluation Harness Must Mirror Production Context-Building

**Status:** Accepted — implemented in `fix/day4-model-quality`  
**Context:** ADR 006 identified that the evaluation harness ran every document with empty vendor/duplicate/account context, causing `BANK_ACCOUNT_CHANGED` to fire on every genuine invoice (FPR = 1.0). The fix must produce honest, reproducible metrics without gaming the threshold.

### Decisions

1. **Context builder in evaluator (`ml/common.py`)**: The `analysis_context_from_gt` function now accepts a `vendor_registry` dict mapping `vendor_id → list[InvoiceData-dicts]` (prior invoices for that vendor). For each evaluation document, all *other* documents in the manifest for the same vendor are loaded as `vendor_history`. The current document is excluded from its own history (no self-match).

2. **Account registry**: Before evaluating, the evaluator pre-computes a `vendor_accounts` dict (hash + last4 + ifsc per vendor, aggregated across all non-current docs for that vendor). This mirrors how the production pipeline populates `vendor_accounts` from the DB.

3. **All-vendors index**: `all_vendors` is populated from the manifest's vendor pool, so `LOOKALIKE_VENDOR_NAME` can fire correctly.

4. **Duplicate history**: For each doc, all prior docs with the same vendor get added as duplicate candidates, with their SHA-256 and field signatures.

5. **Visual engine — genuine PDF false positives**: `PDF_MODIFIED_AFTER_CREATION` threshold raised from 3600 s to 86400 s (24 h). `FONT_MIX_IN_NUMERIC_FIELD` score lowered to 35 (informational tier) with confidence capped at 0.60. Visual findings of severity `info` or `low` do not contribute to fusion score in the baseline (informational tier).

6. **Fusion config — informational tier**: Added `informational_engine_types` list in `fusion.yaml`. Findings from these types are shown in the UI but their scores are excluded from the noisy-OR baseline computation. Currently includes: `NEW_VENDOR_NO_BASELINE`, `DATE_TOO_OLD`, `BANK_DETAILS_MISSING`, `PDF_MODIFIED_AFTER_CREATION`, `FONT_MIX_IN_NUMERIC_FIELD`.

7. **Larger training set**: Generator regenerated with 2000 genuine + 2000 tampered + 400 visual pairs (4400 total) with proper vendor context written into GT JSON. Vendor+template split preserved.

8. **True TEST holdout**: 10% of vendor IDs (5 vendors) are reserved as TEST, never used for training or hyperparameter tuning. Val split is used only for early stopping. Hyperparameter search uses 5-fold CV on TRAIN only.

9. **XGBoost hyperparameter search**: Grid search over `{max_depth: [3,4,5], n_estimators: [300,500,700], min_child_weight: [3,5,8], gamma: [0.5,1.0,2.0]}` on TRAIN CV. Best params selected by mean ROC-AUC.

10. **Calibration verification**: Reliability curve (calibration curve) plotted for the final model. If Brier score improvement over naive estimator < 0.02, isotonic calibration is replaced by Platt scaling.

11. **Model health warning**: `XGBModelWrapper.predict_score()` raises a `ModelLoadWarning` log at WARNING level if the artifact is not found, and `fusion_mode` in the API response is set to `"baseline"` in that case, not silently using ML mode.

12. **API contract**: The `/invoices/{id}` response always includes `ml_score`, `baseline_score`, `fusion_mode`, and `shap_top` (even when `fusion_mode="baseline"`; in that case `ml_score=null`).

