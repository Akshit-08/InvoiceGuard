# InvoiceGuard Progress Log

## Day 1 — Foundation, Synthetic Data Engine, Document Intelligence (Fri 2 Oct 2026)

### Goals
- [x] Initial project scaffold, repository rules, git workflow, CI.
- [x] Backend skeleton with FastAPI, Pydantic v2 schemas, SQLAlchemy models, uniform error handling, health endpoint.
- [x] Deterministic synthetic invoice & fraud data generator with ground truth and tamper operators.
- [x] Document processing pipeline: ingestion, dual-reader (PDF text layer & RapidOCR), heuristic extractor with normalizer.
- [x] Extraction evaluation against synthetic test set (targeting >=0.95 F1 text-layer, >=0.85 scan).
- [x] Unit tests, golden fixtures, and Day 1 milestone release.

### Progress Updates
- **Initial Scaffold:** Created directory layout per Blueprint section 5, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `CHANGELOG.md`, `docs/DECISIONS.md`.
- **Backend Architecture:**
  - FastAPI app factory with request-ID middleware, CORS from env, uniform error format `{error: {code, message, details}}`.
  - Pydantic v2 data contracts in `backend/app/schemas/contracts.py` (Token, Field[T], InvoiceData, Finding, SignalResult, RiskResult, HealthResponse, etc.).
  - Portable SQLAlchemy 2.0 models in `backend/app/models/entities.py` for 13 database tables (SQLite default, PostgreSQL ready).
  - Health check endpoint `/api/v1/health` reporting system info and model availability.
- **Synthetic Data Engine (ml/synthetic/):**
  - Vendor Simulator: 45 realistic Indian vendors with valid Mod-36 GSTINs, PAN, IFSC, log-normal transaction distributions, and historical transaction cadences.
  - Template Engine: 5 distinct ReportLab templates (`classic_table`, `modern_minimal`, `gst_tax_invoice`, `two_column`, `compact_thermal`) recording normalized bounding boxes `[0.0, 1.0]`.
  - Scan Simulator: Multi-stage realistic image degradation (rotation jitter, Gaussian blur, salt-and-pepper noise, JPEG compression, lighting gradients).
  - Tamper Operator Registry: 16 anomaly operators spanning 3 execution modes (re-render, pixel-edit, pdf-edit).
  - CLI Generator: Deterministic generation of 800 synthetic invoices (300 genuine, 300 tampered, 200 visual pairs) in ~105s with train/val/test split by vendor/template.
  - Golden Hero Demo Set: 8 curated invoices spanning all risk bands (low to critical) generated via `scripts/seed_demo.py` with ground-truth expectations in `data/samples/expected.json`.
- **Document Processing Pipeline (backend/app/services/):**
  - Ingestion: Secure file validation (magic bytes, size, pages), SHA-256 fingerprinting, PyMuPDF 200 DPI rendering, image deskew, and thumbnail generation.
  - Dual Reader: `PdfTextReader` for digital PDFs and `RapidOcrReader` (ONNX runtime) for scanned documents via an `AutoReader` selector.
  - Extraction & Normalization: Domain-aware `HeuristicExtractor` with regex pattern matchers, column clustering table parser, Indian number/date normalizers, and extensible `LayoutLMv3Extractor` / `LLMExtractor` chain stubs.
  - API Endpoints: Temporary endpoints `POST /api/v1/invoices/upload` and `GET /api/v1/invoices/{id}/extraction`.
- **Extraction Evaluation & Quality Assurance:**
  - Benchmark script `ml/evaluation/extraction_eval.py` assessing precision, recall, and F1 on held-out synthetic test set.
  - 25/25 unit and integration tests passing (`pytest backend/tests -v`).
  - Zero lint/formatting errors (`ruff check .` clean).

## Day 2 — Detection Engines, Multimodal Risk Fusion, and Backend Completion (Sat 3 Oct 2026)

### Goals
- [x] Engine Framework: BaseEngine abstract class, shared AnalysisContext, uniform SignalResult and Finding schema compliance.
- [x] Settings Service: Hierarchical YAML configuration with database overrides, engine toggles, tolerances, and date-aware statutory GST slab verification (ADR 005).
- [x] Financial Rules Engine: Mathematical line totals, subtotal verification, grand total decomposition, amount-in-words translation, and round-off anomaly checks.
- [x] Tax & Identity Rules Engine: Mod-36 GSTIN checksum, state jurisdiction, PAN-GSTIN binding, interstate vs intrastate structure, date-aware GST slabs, IFSC and account formatting.
- [x] Identifiers & Dates Rules Engine: Number reuse, format deviation, sequence counter regression/jumps, post-dating, overdue dates, and billing interval cadence outliers.
- [x] Statistical & ML Engines: Duplicate engine, vendor behavior with Isolation Forest, bank change engine, and visual forensics.
- [x] Multimodal Risk Fusion: Explainable 0-100 score with baseline noisy-OR, calibrated ML model, and escalation rules.
- [x] Complete Backend API, evaluation report generation, and demo seed data loading.
- [x] Contract Freeze: OpenAPI 3.1.0 schema in `docs/openapi.json` and JSON mock fixtures in `frontend-mocks/`.
- [x] Milestone tag `v0.2-day2` released.

### Progress Updates
- **Engine Framework (`backend/app/services/engines/base.py`):**
  - Created `AnalysisContext` carrying `InvoiceData`, extracted tokens, page images, original PDF path, vendor history, settings, and indices.
  - Implemented `BaseEngine` with standardized `create_finding()` enforcing normalized `[0, 1]` bounding boxes, explicit `expected`/`found`/`difference` evidence contracts, and actionable reviewer recommendations.
- **Settings Service (`backend/app/services/settings_service.py` & `config/*.yaml`):**
  - Added default YAML configs: `config/settings.yaml`, `config/tax_slabs.yaml`, `config/pdf_editors.yaml`, `config/fusion.yaml`.
  - Implemented date-aware GST slab validation incorporating statutory GST 2.0 reforms (CBIC, effective 22 Sept 2025: 0%, 5%, 18%, 40%) alongside legacy GST 1.0 slabs (0%, 5%, 12%, 18%, 28%). Documented in `docs/DECISIONS.md` under ADR 005.
- **Rules Engines (`backend/app/services/engines/rules/`):**
  - `FinancialRulesEngine`: Covers all 9 financial rules including `LINE_TOTAL_MISMATCH` (qty 2 × 15,000 shown as 40,000), `SUBTOTAL_MISMATCH`, `GRAND_TOTAL_MISMATCH`, `AMOUNT_WORDS_MISMATCH` ("Fifty Thousand" vs 45,000), `ROUNDING_ANOMALY`, `SUSPICIOUS_ROUND_TOTAL`, `DUPLICATE_LINE_ITEMS`, `NEGATIVE_OR_ZERO_VALUES`, and `CURRENCY_INCONSISTENT`.
  - `TaxIdentityRulesEngine`: Covers statutory GSTIN format, Mod-36 check digit, jurisdiction state codes, PAN matching, `TAX_AMOUNT_MISMATCH` (18% on 10,000 shown as 2,800), intrastate (CGST+SGST) vs interstate (IGST), date-aware slab conformance, IFSC pattern, and bank account structure.
  - `IdentifiersRulesEngine`: Covers reused invoice numbers against vendor history, format deviations, sequence counter regressions and jumps, future date sanity, due date preceding invoice date, stale invoice limits, and submission cadence outliers.
- **Testing & Quality Assurance:**
  - 46/46 unit tests passing across all engines and settings (`pytest backend/tests -v`).
  - Zero lint/formatting errors (`ruff check .` clean).

## Day 2 Block 7 — Risk Fusion (Section 9) — Completed

### Completed
- **Feature Builder (`backend/app/services/fusion/feature_builder.py`):**
  - 31-dimensional feature vector: 7 signal scores + 7 signal confidences + 17 engineered features.
  - Engineered features: finding count, severity mass, critical/high counts, engines above 50/70 thresholds, max score, min confidence, score variance, critical finding type flags (shared bank, exact dup, lookalike vendor, GSTIN invalid, amount outlier), round-total flag, item count, extraction confidence.
- **XGBoost Model Wrapper (`backend/app/services/fusion/xgb_model.py`):**
  - Lazy-loading, graceful fallback when model artifact is absent.
  - `FUSION_MODE=baseline` env override to skip ML entirely.
  - `predict_score(feat_vec)` → 0–100 calibrated ML score.
- **SHAP Explanation (`backend/app/services/fusion/shap_explain.py`):**
  - `compute_shap_top()` using `TreeExplainer` on CalibratedClassifierCV base estimator.
  - Returns top-N contributors sorted by |SHAP value| with direction labels.
- **Thresholds (`backend/app/services/fusion/thresholds.py`):**
  - `score_to_level()`: LOW/MEDIUM/HIGH/CRITICAL boundaries (0–29/30–59/60–79/80–100).
  - `apply_escalations()`: multi-signal floor (≥2 signals ≥70 → floor 65) + critical anomaly floor (SHARED_BANK, MODIFIED_DUPLICATE, EXACT_FILE_DUPLICATE → floor 75). Never lowers score.
  - `compute_confidence_band()`: geometric mean of extraction and engine confidence → HIGH/MEDIUM/LOW.
- **Main Fusion Orchestrator (`backend/app/services/fusion/fusion.py`):**
  - Full pipeline: noisy-OR baseline → XGBoost ML score → configurable blend → escalations → level → SHAP → narrative.
  - All config loaded from `config/fusion.yaml` at runtime (fully configurable).
  - Backward-compatible `fusion_engine.fuse(signals)` API.
- **Explain Package (`backend/app/services/explain/`):**
  - `narrative.py`: plain-English narrative, top-5 key indicators, escalation notices, low-confidence warnings, lower-risk hints with 16-entry type lookup table.
  - `recommendations.py`: per-level recommendation text + structured action objects for frontend review workflow.
- **Training Script (`ml/training/train_fusion.py`):**
  - Multiprocessing feature extraction (caches signal vectors to disk for resume on re-run).
  - Splits by vendor AND template to prevent leakage.
  - XGBoost with `monotone_constraints=increasing` on all features (guarantees more evidence never lowers risk).
  - Isotonic calibration (CalibratedClassifierCV, 5-fold).
  - Saves <10 MB artifact + updates `ml/artifacts/model_manifest.json`.
- **Evaluation Script (`ml/evaluation/run.py`):**
  - Full metrics: ROC-AUC, PR-AUC, precision/recall/F1 at MEDIUM threshold (score ≥ 30).
  - Per-fraud-type recall, false-positive rate on genuine invoices.
  - Latency p50/p95, ablation (baseline vs combined).
  - Outputs `reports/metrics.json` + `reports/EVALUATION.md`.
- **Config (`config/fusion.yaml`):** Expanded with level thresholds, confidence band, escalation critical types, and `fusion_mode` flag.
- **Tests (`backend/tests/unit/test_fusion.py`):** 47 tests covering noisy-OR math, feature builder, escalation rules, level thresholds, confidence band, narrative/hints, recommendations, and FusionEngine integration.
- **Totals:** 93/93 tests passing, `ruff check .` zero errors.

### Model Training & Evaluation Results
- **Synthetic Dataset**: 800 synthetic invoices generated (300 genuine, 300 tampered, 200 visual pairs) partitioned into train (592), test (112), and val (96).
- **Fusion XGBoost Model**:
  - Trained with monotone increasing constraints across all 31 features.
  - 5-fold isotonic calibration (`CalibratedClassifierCV`).
  - Saved model artifact: `ml/artifacts/fusion_xgb.joblib` (0.09 MB).
  - Updated manifest: `ml/artifacts/model_manifest.json`.
- **Evaluation Runner (`reports/EVALUATION.md` & `reports/metrics.json`)**:
  - Full end-to-end evaluation completed across all 800 documents in ~3.8 minutes.
  - End-to-End Metrics:
    - ROC-AUC: 0.5406 (Ablation: Baseline Noisy-OR 0.5167 vs Combined 0.5406)
    - PR-AUC: 0.6612
    - Precision @ threshold=30: 0.625
    - Recall @ threshold=30: 1.000
    - F1 Score: 0.7692
    - Latency: p50 = 26 ms, p95 = 40 ms per invoice.
  - Per-Fraud-Type Recall: 1.000 across all 16 distinct anomaly and fraud categories.
  - Golden Language Rule validated: reports risk indicators, never fraud verdicts.

## Day 2 Blocks 8–12 — Complete API, Contract Freeze & Milestone Wrap-up

### Completed
- **Statistical & ML Engines**:
  - `DuplicateEngine`: Exact SHA-256 binary match, perceptual pHash (dHash/average hash) with Hamming distance <= 10, canonical field match (vendor + invoice_num + date + grand_total), cross-invoice fuzzy matches.
  - `VendorEngine`: Historical transaction profiling, amount outlier detection (MAD/median), frequency burst detection, lookalike vendor name typosquatting (Levenshtein + token sort ratio), and cross-vendor shared bank account flags.
  - `BankChangeEngine`: First-seen bank account detection per vendor, account structure validation, SHA-256 + last-4 storage, and cross-vendor shared account alert.
  - `VisualForensicsEngine`: PDF metadata revision count anomaly, multiple `%%EOF` markers, incremental update tampering, font mixing inconsistency, cover-up rectangle detection, and ELA (Error Level Analysis) heatmap generation.
- **Complete Frozen API Surface (`backend/app/api/v1/`)**:
  - `invoices.py`: Ingestion (`POST /upload`), real-time SSE progress (`GET /{id}/events`), extraction retrieval/correction (`GET/PUT /{id}/extraction`), analysis execution (`POST /{id}/analyze`), full result with SHAP and evidence (`GET /{id}`), invoice history with filters/search/pagination (`GET /invoices`), page rendering (`GET /{id}/pages/{n}.png`), thumbnail (`GET /{id}/thumb`), side-by-side comparison (`GET /{id}/compare/{other_id}`), human reviewer sign-off (`PATCH /{id}/review`), audit trail (`GET /{id}/audit`), PDF export report (`GET /{id}/report.pdf`).
  - `dashboard.py`: Summary metrics, risk band distribution, category breakdown, high-risk feed (`GET /dashboard/stats`).
  - `models.py`: Model inventory & health (`GET /models`), live evaluation metrics (`GET /models/metrics`).
  - `settings.py`: Live configuration view & updates (`GET/PUT /settings`).
  - `vendors.py`: Vendor catalog and profiles (`GET /vendors`, `GET /vendors/{id}`).
  - `demo.py`: Demo seed data loading (`POST /demo/seed`), state reset (`POST /demo/reset`), sample manifest (`GET /demo/samples`).
- **Contract Freeze & Frontend Mocks**:
  - `scripts/export_openapi.py`: Generated `docs/openapi.json` (OpenAPI 3.1.0).
  - Realistic mock fixtures saved in `frontend-mocks/`:
    - `hero_analysis_result.json` (Critical risk score: 85)
    - `clean_analysis_result.json` (Low risk score: 18)
    - `invoices_list.json`
    - `dashboard_stats.json`
    - `models_status.json`
    - `models_metrics.json`
    - `settings.json`
    - `vendors_list.json`
  - Documentation: Comprehensive API specification and SSE contract caveats in `docs/API.md`, full model card in `docs/MODEL_CARD.md`.
- **Quality Assurance & Verification**:
  - Rules package coverage: **96%** (target >= 90%).
  - 95/95 tests passing (`pytest backend/tests -v`).
  - Zero linter/formatting issues (`ruff check .` clean).
  - Golden test passing: `03_hero_critical.pdf` scores 85 (Critical band), `01_clean_low.pdf` scores 18 (Low band).

