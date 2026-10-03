// ─────────────────────────────────────────────────────────────
// InvoiceGuard — API Client (fetch wrapper + TanStack Query)
// ─────────────────────────────────────────────────────────────
import type {
  InvoiceDetail,
  InvoiceListResponse,
  UploadResponse,
  DashboardStats,
  VendorProfile,
  VendorListResponse,
  HealthResponse,
  ModelMetrics,
  StageEvent,
  ReviewStatus,
} from './types'

// ── Environment ──────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL ?? ''
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === '1'

// ── Uniform error ─────────────────────────────────────────────
export class ApiException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiException'
  }
}

// ── Fetch wrapper ─────────────────────────────────────────────
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}/api/v1${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR'
    let message = `HTTP ${res.status}`
    let details: unknown
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
      code = body.error?.code ?? code
      message = body.error?.message ?? message
      details = body.error?.details
    } catch {
      // noop
    }
    throw new ApiException(code, message, res.status, details)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Mock loader (VITE_USE_MOCKS=1) ────────────────────────────
async function loadMock<T>(filename: string): Promise<T> {
  const mod = await import(`../../frontend-mocks/${filename}`)
  return mod.default as T
}

// ── Invoice endpoints ─────────────────────────────────────────
export const invoiceApi = {
  upload: async (file: File): Promise<UploadResponse> => {
    if (USE_MOCKS) return loadMock('upload_response.json')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_BASE}/api/v1/invoices/upload`, { method: 'POST', body: form })
    if (!res.ok) throw new ApiException('UPLOAD_FAILED', 'Upload failed', res.status)
    return res.json()
  },

  get: async (id: string): Promise<InvoiceDetail> => {
    if (USE_MOCKS) return loadMock('hero_analysis_result.json')
    return apiFetch<InvoiceDetail>(`/invoices/${id}`)
  },

  list: async (params?: {
    limit?: number
    offset?: number
    risk_level?: string
    status?: string
    vendor_id?: string
    search?: string
  }): Promise<InvoiceListResponse> => {
    if (USE_MOCKS) {
      const mock = await loadMock<{ items: InvoiceListResponse['items'] }>('invoices_history.json')
      return { items: mock.items ?? [], total: mock.items?.length ?? 0, limit: 20, offset: 0 }
    }
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.risk_level) qs.set('risk_level', params.risk_level)
    if (params?.status) qs.set('status', params.status)
    if (params?.vendor_id) qs.set('vendor_id', params.vendor_id)
    if (params?.search) qs.set('search', params.search)
    return apiFetch<InvoiceListResponse>(`/invoices?${qs}`)
  },

  analyze: async (id: string): Promise<{ status: string }> => {
    if (USE_MOCKS) return { status: 'started' }
    return apiFetch(`/invoices/${id}/analyze`, { method: 'POST' })
  },

  review: async (id: string, status: ReviewStatus, note?: string): Promise<void> => {
    if (USE_MOCKS) return
    await apiFetch(`/invoices/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    })
  },

  getExtraction: async (id: string) => {
    if (USE_MOCKS) return loadMock('extraction_response.json')
    return apiFetch(`/invoices/${id}/extraction`)
  },

  pageUrl: (id: string, page: number) =>
    USE_MOCKS ? '' : `${API_BASE}/api/v1/invoices/${id}/pages/${page}.png`,

  thumbUrl: (id: string) =>
    USE_MOCKS ? '' : `${API_BASE}/api/v1/invoices/${id}/thumb`,

  streamEvents: (id: string, onEvent: (e: StageEvent) => void, onDone: () => void): (() => void) => {
    if (USE_MOCKS) {
      // Simulate SSE events
      const stages: StageEvent[] = [
        { invoice_id: id, stage: 'ingest', status: 'in_progress', message: 'Validating and storing document…', progress: 0.1, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'ingest', status: 'completed', message: 'Document ingested.', progress: 0.25, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'read', status: 'in_progress', message: 'Extracting text layer…', progress: 0.35, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'read', status: 'completed', message: 'Text read successfully.', progress: 0.5, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'extract', status: 'in_progress', message: 'Running extraction chain…', progress: 0.6, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'extract', status: 'completed', message: 'Fields extracted.', progress: 0.75, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'analyze', status: 'in_progress', message: 'Running detection engines…', progress: 0.85, timestamp: new Date().toISOString() },
        { invoice_id: id, stage: 'analyze', status: 'completed', message: 'Analysis complete.', progress: 1.0, timestamp: new Date().toISOString() },
      ]
      let i = 0
      const interval = setInterval(() => {
        if (i < stages.length) {
          onEvent(stages[i++])
        } else {
          clearInterval(interval)
          onDone()
        }
      }, 600)
      return () => clearInterval(interval)
    }

    const es = new EventSource(`${API_BASE}/api/v1/invoices/${id}/events`)
    es.addEventListener('stage_event', (ev) => {
      try {
        const data = JSON.parse(ev.data) as StageEvent
        onEvent(data)
        if (data.stage === 'analyze' && (data.status === 'completed' || data.status === 'failed')) {
          es.close()
          onDone()
        }
      } catch {
        // noop
      }
    })
    es.onerror = () => { es.close(); onDone() }
    return () => es.close()
  },
}

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardApi = {
  stats: async (): Promise<DashboardStats> => {
    if (USE_MOCKS) return loadMock('dashboard_stats.json')
    return apiFetch<DashboardStats>('/dashboard/stats')
  },
}

// ── Vendors ───────────────────────────────────────────────────
export const vendorApi = {
  list: async (): Promise<VendorListResponse> => {
    if (USE_MOCKS) {
      const mock = await loadMock<{ items: VendorProfile[] }>('vendor_profile.json')
      return { items: [mock as unknown as VendorProfile], total: 1 }
    }
    return apiFetch<VendorListResponse>('/vendors')
  },

  get: async (id: string): Promise<VendorProfile> => {
    if (USE_MOCKS) return loadMock('vendor_profile.json')
    return apiFetch<VendorProfile>(`/vendors/${id}`)
  },
}

// ── Health ────────────────────────────────────────────────────
export const systemApi = {
  health: (): Promise<HealthResponse> => apiFetch<HealthResponse>('/health'),

  metrics: async (): Promise<ModelMetrics> => {
    if (USE_MOCKS) return { roc_auc: 0.54, pr_auc: 0.66, f1: 0.77, latency_p50_ms: 26, latency_p95_ms: 40 }
    return apiFetch<ModelMetrics>('/models/metrics')
  },

  settings: async () => {
    if (USE_MOCKS) return loadMock('settings.json')
    return apiFetch('/settings')
  },

  seedDemo: async () => apiFetch('/demo/seed', { method: 'POST' }),
  resetDemo: async () => apiFetch('/demo/reset', { method: 'POST' }),
  demoSamples: async () => apiFetch('/demo/samples'),
}
