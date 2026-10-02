# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
