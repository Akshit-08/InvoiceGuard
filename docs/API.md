# InvoiceGuard API Reference (v0.2.0)

> **Golden Rule of Language:**
> *InvoiceGuard reports risk indicators, never fraud verdicts.*
> Every client interface and report must prominently display:
> *"InvoiceGuard flags anomalies for human review. It does not determine fraud."*

Base URL: `/api/v1`  
OpenAPI Specification: [`docs/openapi.json`](file:///c:/Users/AKSHIT/InvoiceGuard/docs/openapi.json)  
Mock Fixtures: [`frontend-mocks/`](file:///c:/Users/AKSHIT/InvoiceGuard/frontend-mocks)

---

## 1. Uniform Error Format

All API errors return standard HTTP error codes with uniform payload structure:

```json
{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice inv-123 not found.",
    "details": null
  }
}
```

Standard Error Codes:
- `400`: `BAD_REQUEST`, `INVALID_FILE_TYPE`
- `404`: `INVOICE_NOT_FOUND`, `VENDOR_NOT_FOUND`, `PAGE_NOT_FOUND`
- `413`: `FILE_TOO_LARGE` (Limit: 15 MB)
- `422`: `VALIDATION_ERROR`, `INVALID_REVIEW_STATUS`
- `500`: `INTERNAL_SERVER_ERROR`, `ANALYSIS_FAILED`

---

## 2. Real-Time Processing SSE Stream

### `GET /invoices/{id}/events`
Opens a Server-Sent Events (SSE) connection streaming real-time stage progression.

**Event Protocol:**
- `event: connected` — connection confirmed.
- `event: stage_event` — payload:
```json
{
  "invoice_id": "inv-hero-03-critical",
  "stage": "ingest | read | extract | analyze",
  "status": "in_progress | completed | failed",
  "message": "Human readable status description",
  "progress": 0.25,
  "timestamp": "2026-10-03T08:00:00Z"
}
```
- Stream completes and closes when `stage == "analyze"` and `status in {"completed", "failed"}`.

---

## 3. Endpoints

### 3.1 Invoices & Document Processing

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/invoices/upload` | Multipart upload (PDF or image). Returns `UploadResponse` and triggers ingestion/extraction. |
| `GET` | `/invoices/{id}/events` | SSE stage stream. |
| `GET` | `/invoices/{id}/extraction` | Returns parsed `InvoiceData` with per-field confidence chips and verification flags. |
| `PUT` | `/invoices/{id}/extraction` | Saves human reviewer edits; logs changes to audit trail. |
| `POST` | `/invoices/{id}/analyze` | Runs all 8 detection engines + multimodal fusion. |
| `GET` | `/invoices/{id}` | Full analysis payload: metadata, 0-100 risk score, signals, findings with bboxes, matches, SHAP top contributors, and recommendation. |
| `GET` | `/invoices` | History table: pagination (`limit`, `offset`), filter (`risk_level`, `status`, `vendor_id`), search query (`search`). |
| `GET` | `/invoices/{id}/pages/{n}.png` | Serves rendered 200 DPI PNG page preview for document canvas. |
| `GET` | `/invoices/{id}/thumb` | Serves 400px thumbnail. |
| `GET` | `/invoices/{id}/compare/{other_id}` | Field-by-field diff between two invoices with changed/identical tags. |
| `PATCH` | `/invoices/{id}/review` | Updates review status (`needs_review`, `confirmed_issue`, `false_positive`, `approved`) and notes. |
| `GET` | `/invoices/{id}/audit` | Complete chronological audit trail. |
| `GET` | `/invoices/{id}/report.pdf` | Downloads generated PDF audit certificate. |

### 3.2 Dashboard & KPIs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard/stats` | KPI summary cards, risk distribution (low/medium/high/critical), anomaly category breakdown, recent analyses. |

### 3.3 Vendors

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/vendors` | Vendor directory with invoice volume, total billed, average risk score. |
| `GET` | `/vendors/{id}` | Vendor profile: known bank accounts (masked `XXXXXX1234`), transaction history, categories. |

### 3.4 Models & Insights

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/models` | Active model roster and calibration readiness. |
| `GET` | `/models/metrics` | Returns `reports/metrics.json` containing ROC-AUC, PR-AUC, confusion matrix, ROC/PR curve points, per-fraud-type recall, and latency. |

### 3.5 System Settings & Demo

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/settings` | System thresholds, tolerances, date-aware GST slabs, engine toggles. |
| `PUT` | `/settings` | Dynamic runtime settings overrides stored in DB. |
| `POST` | `/demo/seed` | Generates 8 hero demo invoices and vendor history in one command. |
| `POST` | `/demo/reset` | Clears demo invoice database records. |
| `GET` | `/demo/samples` | Lists expected ground truth bands for the 8 hero demo invoices. |
| `GET` | `/health` | System health and optional model availability. |

---

## 4. Frontend Contract Caveats & Data Guarantees

1. **Normalized Coordinates:** All bounding boxes are strictly normalized `[x0, y0, x1, y1]` where values range between `0.0` and `1.0` relative to rendered page width and height. Scale coordinates by canvas dimensions:
   ```ts
   const pixelBox = {
     left: bbox[0] * canvasWidth,
     top: bbox[1] * canvasHeight,
     width: (bbox[2] - bbox[0]) * canvasWidth,
     height: (bbox[3] - bbox[1]) * canvasHeight,
   };
   ```
2. **Account Masking:** Bank account numbers are never transmitted in plaintext. The API returns masked identifiers (`XXXXXX1234`).
3. **Risk Score Scale:** `overall_score` is on a continuous scale from `0.0` to `100.0`.
   - Low: `0.0` – `29.9`
   - Medium: `30.0` – `59.9`
   - High: `60.0` – `79.9`
   - Critical: `80.0` – `100.0`
4. **Offline Mocks:** UI developers can develop the complete frontend against [`frontend-mocks/`](file:///c:/Users/AKSHIT/InvoiceGuard/frontend-mocks) prior to connecting to the live backend.
