# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-03

### Added
- **Engine Framework & Settings (Blueprint §7 & §8)**:
  - BaseEngine abstract class with normalized `[0, 1]` bounding boxes and uniform `Finding` schema.
  - Hierarchical settings system (`config/settings.yaml`, `config/tax_slabs.yaml`, `config/pdf_editors.yaml`, `config/fusion.yaml`).
  - Date-aware statutory Indian GST 2.0 (CBIC, Sept 2025: 0%, 5%, 18%, 40%) vs GST 1.0 slab validation (ADR 005).
- **Rule Engines**:
  - `financial.py`: Line totals, subtotal parity, grand total decomposition, amount-in-words reconciliation, rounding anomalies.
  - `tax_identity.py`: Mod-36 GSTIN checksum, jurisdiction states, PAN matching, CGST+SGST vs IGST validation, IFSC/account formatting.
  - `identifiers.py`: Invoice number reuse, regex format deviation, sequence regression/jumps, future/stale dates, submission intervals.
- **Statistical & ML Engines**:
  - `duplicate.py`: Exact SHA-256 match, perceptual pHash (dHash/average hash) with Hamming distance <= 10, canonical field match, fuzzy similarity.
  - `vendor.py`: Historical spending profiling (MAD/median), frequency bursts, lookalike vendor typosquatting, cross-vendor shared bank accounts.
  - `bank.py`: First-seen bank account detection per vendor, account structure validation, SHA-256 + last-4 storage.
  - `visual/forensics.py`: PDF metadata revision count anomaly, multiple `%%EOF` markers, incremental update tampering, font mixing inconsistency, cover-up rectangle detection, ELA heatmap generation.
- **Risk Fusion System (Blueprint §9)**:
  - `feature_builder.py`: 31-feature vector (7 scores + 7 confidences + 17 engineered) for XGBoost input.
  - `xgb_model.py`: Lazy-loading XGBoost + isotonic calibration wrapper with `FUSION_MODE=baseline` env override and fallback.
  - `shap_explain.py`: SHAP TreeExplainer returning top-N ordered contributors with direction labels.
  - `thresholds.py`: `score_to_level()` (LOW/MEDIUM/HIGH/CRITICAL), `apply_escalations()` (multi-signal floor 65 + critical anomaly floor 75), `compute_confidence_band()` (geometric mean → HIGH/MEDIUM/LOW).
  - `fusion.py`: Complete orchestrator (noisy-OR baseline + XGBoost blend + escalations + SHAP + narrative).
  - `explain/narrative.py`: Plain-English narrative builder, top-5 key risk indicators, escalation notices, 16-entry hint lookup table for "what would lower the risk".
  - `explain/recommendations.py`: Per-level recommendation text and structured action objects for frontend review workflow.
- **Complete Frozen API Surface (Blueprint §10)**:
  - `POST /api/v1/invoices/upload`: Multipart upload with validation.
  - `GET /api/v1/invoices/{id}/events`: Real-time Server-Sent Events (SSE) progress streaming.
  - `GET/PUT /api/v1/invoices/{id}/extraction`: Field retrieval and human-in-the-loop field edits.
  - `POST /api/v1/invoices/{id}/analyze`: Analysis execution trigger.
  - `GET /api/v1/invoices/{id}`: Complete analysis results with findings, evidence, SHAP, and recommendations.
  - `GET /api/v1/invoices`: History search, status/risk filters, pagination.
  - `GET /api/v1/invoices/{id}/pages/{n}.png`: Rendered page images.
  - `GET /api/v1/invoices/{id}/thumb`: Document thumbnail.
  - `GET /api/v1/invoices/{id}/compare/{other_id}`: Side-by-side duplicate comparison.
  - `PATCH /api/v1/invoices/{id}/review`: Human reviewer sign-off (`approved`/`rejected`/`needs_info`).
  - `GET /api/v1/invoices/{id}/audit`: Full immutable audit trail.
  - `GET /api/v1/invoices/{id}/report.pdf`: Audit report export.
  - `GET /api/v1/dashboard/stats`: Summary statistics and high-risk feed.
  - `GET /api/v1/models` & `GET /api/v1/models/metrics`: Engine inventory and evaluation metrics.
  - `GET/PUT /api/v1/settings`: Live system configuration.
  - `GET /api/v1/vendors` & `GET /api/v1/vendors/{id}`: Vendor catalog and risk profiles.
  - `POST /api/v1/demo/seed`, `POST /api/v1/demo/reset`, `GET /api/v1/demo/samples`: Demo utilities.
- **Contract Freeze & Documentation**:
  - `docs/openapi.json`: OpenAPI 3.1.0 schema generated via `scripts/export_openapi.py`.
  - `frontend-mocks/`: Decoupled JSON fixtures for all endpoints including hero and clean analysis results.
  - `docs/API.md`: Comprehensive API reference with SSE contract caveats.
  - `docs/MODEL_CARD.md`: Full model card with inputs, constraints, evaluation, and limitations.
  - `docs/EVALUATION.md` & `reports/metrics.json`: End-to-end evaluation metrics on held-out test split.
  - `docs/DECISIONS.md`: Added ADRs 006, 007, 008.


## [0.1.0] - 2026-10-02

### Added
- **Repository & Engineering Infrastructure**:
  - Full repo layout per Blueprint Section 5 with CI workflow (`.github/workflows/ci.yml`).
  - Strict typing, `ruff` configuration, cross-platform launchers (`dev.sh`, `dev.ps1`, `Makefile`).
  - Repository operating guidelines and Golden Language Rule ("risk indicators, never fraud verdicts") in `AGENTS.md` and `CLAUDE.md`.
- **Backend Architecture & Data Contracts**:
  - FastAPI application factory with request-ID tracking, CORS, uniform error handling (`{error: {code, message, details}}`).
  - Complete frozen Pydantic v2 schemas in `app/schemas/contracts.py` (`Token`, `Field[T]`, `InvoiceData`, `Finding`, `SignalResult`, `RiskResult`).
  - Complete SQLAlchemy 2.0 schema in `app/models/entities.py` covering all 13 core tables.
  - System health endpoint `GET /api/v1/health`.
- **Deterministic Synthetic Data Engine**:
  - Vendor simulator with Mod-36 GSTIN checksum validation, log-normal transactions, and realistic cadences.
  - 5 ReportLab invoice templates (`classic_table`, `modern_minimal`, `gst_tax_invoice`, `two_column`, `compact_thermal`) recording normalized bounding boxes.
  - Multi-stage scan simulator (rotation, blur, noise, compression, shading).
  - Tamper operator registry with 16 anomaly operators across re-render, pixel-edit, and pdf-edit modes.
  - Data generator CLI producing 800 synthetic invoices (300 genuine, 300 tampered, 200 visual pairs) in ~105 seconds.
  - 8-document Golden Hero Demo set generated via `scripts/seed_demo.py` with ground truth in `data/samples/expected.json`.
- **Document Processing Pipeline**:
  - Secure ingest service with MIME/magic byte validation, PyMuPDF 200 DPI rendering, and deskew.
  - Dual reader architecture (`PdfTextReader` + `RapidOcrReader`) with automated reader selection (`AutoReader`).
  - Layout-aware `HeuristicExtractor`, Indian currency/date `Normalizer`, and extensible extractor chain.
  - Temporary endpoints `POST /api/v1/invoices/upload` and `GET /api/v1/invoices/{id}/extraction`.
- **Evaluation & Test Suite**:
  - Evaluation harness `ml/evaluation/extraction_eval.py` benchmarking field-level precision, recall, and F1.
  - 25 unit, golden, and integration tests passing.
