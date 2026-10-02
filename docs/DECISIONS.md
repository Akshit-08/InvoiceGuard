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
