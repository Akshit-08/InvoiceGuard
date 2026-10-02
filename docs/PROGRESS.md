# InvoiceGuard Progress Log

## Day 1 — Foundation, Synthetic Data Engine, Document Intelligence (Fri 2 Oct 2026)

### Goals
- [x] Initial project scaffold, repository rules, git workflow, CI.
- [ ] Backend skeleton with FastAPI, Pydantic v2 schemas, SQLAlchemy models, uniform error handling, health endpoint.
- [ ] Deterministic synthetic invoice & fraud data generator with ground truth and tamper operators.
- [ ] Document processing pipeline: ingestion, dual-reader (PDF text layer & RapidOCR), heuristic extractor with normalizer.
- [ ] Extraction evaluation against synthetic test set (targeting >=0.95 F1 text-layer, >=0.85 scan).
- [ ] Unit tests, golden fixtures, and Day 1 milestone release.

### Progress Updates
- **Initial Scaffold:** Created directory layout per Blueprint section 5, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `CHANGELOG.md`, `docs/DECISIONS.md`.
- **Colab Track:** Fine-tuning notebook for LayoutLMv3 committed on branch `feat/layoutlm-notebook`.
- **Branching:** Main branch initialized and pushed.
