// ─────────────────────────────────────────────────────────────
// InvoiceGuard — API types (hand-written from openapi.json)
// ─────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type FindingCategory = 'rule' | 'statistical' | 'ml' | 'visual'
export type ReviewStatus = 'needs_review' | 'confirmed_issue' | 'false_positive' | 'approved' | 'pending'
export type InvoiceStatus = 'pending' | 'ingested' | 'reading' | 'extracting' | 'analyzed' | 'failed'

export interface BBox {
  /** Normalised [x0, y0, x1, y1] relative to page (0–1) */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Field<T = unknown> {
  value: T
  raw?: string
  conf: number
  source?: string
  bbox?: [number, number, number, number]
  page?: number
}

export interface VendorData {
  name?: Field<string>
  gstin?: Field<string>
  pan?: Field<string>
  address?: Field<string>
  email?: Field<string>
  phone?: Field<string>
}

export interface BuyerData {
  name?: Field<string>
  gstin?: Field<string>
  address?: Field<string>
}

export interface InvoiceItem {
  description?: Field<string>
  hsn_sac?: Field<string>
  quantity?: Field<number>
  unit?: Field<string>
  unit_price?: Field<number>
  discount?: Field<number>
  tax_rate?: Field<number>
  tax_amount?: Field<number>
  line_total?: Field<number>
}

export interface TaxData {
  cgst?: Field<number>
  sgst?: Field<number>
  igst?: Field<number>
  other?: Field<number>
  total?: Field<number>
  rate?: Field<number>
}

export interface PaymentData {
  bank_name?: Field<string>
  account_number?: Field<string>
  ifsc?: Field<string>
  upi?: Field<string>
  payment_terms?: Field<string>
}

export interface InvoiceData {
  vendor?: VendorData
  buyer?: BuyerData
  invoice_number?: Field<string>
  invoice_date?: Field<string>
  due_date?: Field<string>
  po_number?: Field<string>
  currency?: Field<string>
  items?: InvoiceItem[]
  subtotal?: Field<number>
  discount_total?: Field<number>
  shipping?: Field<number>
  tax?: TaxData
  grand_total?: Field<number>
  amount_in_words?: Field<string>
  payment?: PaymentData
}

export interface FindingEvidence {
  expected?: unknown
  found?: unknown
  difference?: unknown
  similarity?: number
  matched_invoice_id?: string
  details?: Record<string, unknown>
  history_refs?: string[]
}

export interface Finding {
  id: string
  engine: string
  category: FindingCategory
  type: string
  severity: Severity
  score: number
  confidence: number
  title: string
  summary: string
  evidence: FindingEvidence
  field?: string
  bbox?: [number, number, number, number]
  related_invoice_ids?: string[]
  recommended_action?: string
}

export interface ShapEntry {
  feature: string
  importance: number
  direction: 'increases_risk' | 'decreases_risk'
  value: number
}

export interface RiskResult {
  overall_score: number
  level: RiskLevel
  probability?: number
  confidence?: number
  baseline_score?: number
  ml_score?: number
  signals?: Record<string, number>
  shap_top?: ShapEntry[]
  escalations?: string[]
  recommendation?: string
  disclaimer?: string
}

export interface InvoiceMatch {
  matched_invoice_id: string
  matched_invoice_number?: string
  similarity: number
  status: string
  date?: string
  total?: number
}

export interface VendorSummary {
  id: string
  name: string
  gstin?: string
  pan?: string
  category?: string
}

export interface InvoiceDetail {
  id: string
  original_filename?: string
  page_count?: number
  invoice_number?: string
  invoice_date?: string
  grand_total?: number
  currency?: string
  status: InvoiceStatus
  risk_level?: RiskLevel
  overall_score?: number
  review_status?: ReviewStatus
  review_note?: string | null
  read_quality?: number
  extraction_confidence?: number
  needs_manual_verification?: boolean
  created_at?: string
  data?: InvoiceData
  risk?: RiskResult
  signals?: Record<string, number>
  findings?: Finding[]
  matches?: InvoiceMatch[]
  vendor?: VendorSummary
}

export interface InvoiceListItem {
  id: string
  invoice_number?: string
  invoice_date?: string
  grand_total?: number
  currency?: string
  status: InvoiceStatus
  risk_level?: RiskLevel
  overall_score?: number
  review_status?: ReviewStatus
  created_at?: string
  vendor_name?: string
  vendor?: { name?: string }
}

export interface InvoiceListResponse {
  items: InvoiceListItem[]
  total: number
  limit: number
  offset: number
}

export interface UploadResponse {
  invoice_id: string
  status: string
  message?: string
}

export type DateRange = '7d' | '30d' | '90d'

export interface DashboardStats {
  kpis: {
    total_invoices: number
    analyzed_count: number
    needs_review_count: number
    high_critical_count: number
    duplicate_alerts: number
    /** Sum of grand_total for HIGH+CRITICAL invoices (INR) */
    value_at_risk?: number
    total_volume?: number
    total_analyzed?: number
    needs_review?: number
    high_critical?: number
    sparklines?: {
      analyzed?:      number[]
      needs_review?:  number[]
      high_critical?: number[]
      value_at_risk?: number[]
    }
    deltas?: {
      analyzed?:      number
      needs_review?:  number
      high_critical?: number
      value_at_risk?: number
    }
  }
  risk_distribution: {
    low: number
    medium: number
    high: number
    critical: number
  }
  anomaly_categories?: Record<string, number>
  categories?: Record<string, number>
  recent_analyses?: InvoiceListItem[]
  /** Per-day stacked breakdown by risk level */
  trend?: Array<{
    date: string
    low: number
    medium: number
    high: number
    critical: number
    /** legacy fields */
    count?: number
    high_risk?: number
  }>
  top_vendors?: Array<{
    id: string
    name: string
    invoice_count: number
    avg_risk_score?: number
    flagged_count?: number
    /** alias */
    avg_score?: number
  }>
  needs_review_queue?: InvoiceListItem[]
  system_status?: {
    model_loaded: boolean
    fusion_mode: string
    roc_auc?: number
    pr_auc?: number
    engines_enabled?: string[]
    last_evaluated_at?: string
  }
  last_updated_at?: string
  date_range?: DateRange
}

export interface VendorProfile {
  id: string
  name: string
  gstin?: string
  pan?: string
  category?: string
  invoice_count: number
  total_billed?: number
  total_volume?: number
  avg_risk_score?: number
  known_accounts?: Array<{
    last4: string
    bank_name?: string
    ifsc?: string
    first_seen?: string
    last_seen?: string
    invoice_count?: number
  }>
}

export interface VendorListResponse {
  items: VendorProfile[]
  total: number
}

export interface HealthResponse {
  status: string
  version: string
  environment: string
  optional_models: Record<string, boolean>
}

export interface ModelMetrics {
  roc_auc?: number
  pr_auc?: number
  precision?: number
  recall?: number
  f1?: number
  latency_p50_ms?: number
  latency_p95_ms?: number
  per_fraud_type_recall?: Record<string, number>
}

export interface StageEvent {
  invoice_id: string
  stage: 'ingest' | 'read' | 'extract' | 'analyze'
  status: 'in_progress' | 'completed' | 'failed'
  message: string
  progress: number
  timestamp: string
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
