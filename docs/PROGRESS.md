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
