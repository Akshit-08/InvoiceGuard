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
## ADR 006: Monotone-Constrained XGBoost with Calibrated Isotonic Scaling & Baseline Noisy-OR Fallback
- **Context:** Anomaly detection scores in auditing and compliance systems must be explainable, robust to missing features, and strictly monotonic (additional anomaly evidence must never decrease the assessed risk score).
- **Decision:** Train an XGBoost risk model using non-negative monotone constraints across all 31 input features, calibrated via 5-fold `CalibratedClassifierCV` (isotonic regression). Provide an independent deterministic Noisy-OR baseline fusion engine that runs if ML weights are unavailable or if `FUSION_MODE=baseline` is configured.
- **Status:** Accepted.

## ADR 007: Frozen API Contract with SSE Progress Streaming & Decoupled Mock Fixtures
- **Context:** Parallel development of the React/Vite/Tailwind frontend on Day 3 requires a stable, guaranteed backend schema and verifiable real-time progress feedback without polling.
- **Decision:** Freeze the OpenAPI 3.1.0 specification at `docs/openapi.json` and export realistic JSON fixtures in `frontend-mocks/`. Real-time pipeline execution progress is delivered over Server-Sent Events (SSE) via `GET /api/v1/invoices/{id}/events`.
- **Status:** Accepted.

## ADR 008: Multi-Tier Duplicate and Forensics Strategy
- **Context:** Invoices may be duplicated as identical PDF files, re-scanned/rasterized duplicates, modified digital duplicates (altered amount or bank account), or manipulated metadata revisions.
- **Decision:** Implement multi-tier detection: SHA-256 for exact binary duplicates, perceptual pHash (dHash/average hash) with Hamming distance <= 10 for re-scanned duplicates, canonical field normalization (vendor + invoice_number + date + grand_total) for modified duplicates, and PDF structure analysis (revision count, multiple %%EOF markers, font inconsistency, incremental updates) for visual tampering.
- **Status:** Accepted.


