import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
import {
  Upload, FileText, CheckCircle2, X, Loader2,
  Database, ScanLine, Activity,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { ErrorState } from '@/components/ui'
import type { StageEvent, InvoiceDetail } from '@/api/types'

type UploadState = 'idle' | 'pipeline' | 'extraction-review' | 'analyzing' | 'error'

const SAMPLE_GALLERY = [
  { id: '01_clean_low',            label: '01 — Clean',         score: 18, level: 'LOW'      as const, desc: 'Genuine invoice, all checks pass' },
  { id: '02_minor_warning_medium', label: '02 — Minor warning',  score: 45, level: 'MEDIUM'   as const, desc: 'Rounding discrepancy in line total' },
  { id: '03_hero_critical',        label: '03 — Critical',       score: 85, level: 'CRITICAL' as const, desc: 'Arithmetic error + bank change' },
  { id: '04_near_duplicate',       label: '04 — Duplicate',      score: 72, level: 'HIGH'     as const, desc: 'Near-identical invoice already seen' },
  { id: '05_bank_change_only',     label: '05 — Bank change',    score: 62, level: 'HIGH'     as const, desc: 'New remittance account detected' },
  { id: '06_pdf_edited_visual',    label: '06 — Edited PDF',     score: 68, level: 'HIGH'     as const, desc: 'Structural PDF manipulation detected' },
  { id: '07_new_vendor',           label: '07 — New vendor',     score: 35, level: 'MEDIUM'   as const, desc: 'First-time vendor, no baseline' },
  { id: '08_scanned_noisy_genuine',label: '08 — Noisy scan',     score: 25, level: 'LOW'      as const, desc: 'Low-quality scan, genuine document' },
]

const STAGE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  ingest:  { label: 'Ingesting',  Icon: Database  },
  read:    { label: 'Reading',    Icon: ScanLine  },
  extract: { label: 'Extracting', Icon: FileText  },
  analyze: { label: 'Analysing',  Icon: Activity  },
}

const RISK_SCORE_COLOR: Record<string, string> = {
  LOW:      'var(--risk-low-text)',
  MEDIUM:   'var(--risk-medium-text)',
  HIGH:     'var(--risk-high-text)',
  CRITICAL: 'var(--risk-critical-text)',
}

export default function AnalyzePage() {
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Pipeline state
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [events, setEvents] = useState<StageEvent[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  // Extraction data
  const [extraction, setExtraction] = useState<InvoiceDetail['data'] | null>(null)
  const [activeField, setActiveField] = useState<string | null>(null)

  const handleUpload = useCallback(async (f: File) => {
    setState('pipeline')
    setError(null)
    setEvents([])
    setStartTime(Date.now())
    setElapsedMs(0)
    try {
      const res = await invoiceApi.upload(f)
      setInvoiceId(res.invoice_id)
      toast.success('Upload started')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setState('error')
      setError(msg)
      toast.error(msg)
    }
  }, [])

  const handleSampleClick = (id: string) => {
    navigate(`/invoices/${id}`)
  }

  // Timer
  useEffect(() => {
    if ((state === 'pipeline' || state === 'analyzing') && startTime) {
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - startTime)
      }, 100)
      return () => clearInterval(interval)
    }
  }, [state, startTime])

  // SSE pipeline events
  useEffect(() => {
    if ((state === 'pipeline' || state === 'analyzing') && invoiceId) {
      const cleanup = invoiceApi.streamEvents(
        invoiceId,
        (ev) => {
          setEvents(prev => {
            const idx = prev.findIndex(p => p.stage === ev.stage)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = ev
              return next
            }
            return [...prev, ev]
          })

          if (ev.stage === 'extract' && ev.status === 'completed' && state === 'pipeline') {
            invoiceApi.getExtraction(invoiceId).then((ext: any) => {
              setExtraction(ext.data ?? null)
              setState('extraction-review')
            }).catch((e: Error) => {
              toast.error('Failed to load extraction data')
              setState('error')
              setError(e.message)
            })
          }
        },
        () => {
          if (state === 'analyzing') {
            navigate(`/invoices/${invoiceId}`)
          }
        },
      )
      return cleanup
    }
  }, [state, invoiceId, navigate])

  const handleApproveExtraction = useCallback(async () => {
    if (!invoiceId) return
    setState('analyzing')
    try {
      await invoiceApi.analyze(invoiceId)
    } catch (e) {
      toast.error('Analysis failed to start')
      setState('error')
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
  }, [invoiceId])

  // Keyboard shortcut: Enter → approve extraction
  useEffect(() => {
    if (state !== 'extraction-review') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleApproveExtraction()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state, handleApproveExtraction])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: async (accepted) => {
      if (accepted.length === 0) return
      
      if (accepted.length > 1) {
        if (accepted.length > 20) {
          toast.error('Maximum 20 files allowed per batch')
          return
        }
        try {
          const { batchApi } = await import('@/api/client')
          const res = await batchApi.upload(accepted)
          toast.success(res.message)
          navigate(`/batch/${res.batch_id}`)
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Batch upload failed')
        }
      } else {
        handleUpload(accepted[0])
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: 20 * 1024 * 1024,
    multiple: true,
    disabled: state !== 'idle',
  })

  // ── Pipeline stepper ───────────────────────────────────────────
  const renderPipeline = () => {
    const currentProgress = events.length > 0 ? events[events.length - 1].progress * 100 : 0
    const stages = ['ingest', 'read', 'extract', 'analyze']

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex gap-10 max-w-4xl mx-auto w-full"
      >
        {/* Left: document thumbnail */}
        <div className="hidden md:flex flex-col items-center justify-center w-1/3">
          <div
            className="relative w-48 h-64 rounded-lg shadow-2xl overflow-hidden border"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText size={64} style={{ color: 'var(--text-tertiary)', opacity: 0.25 }} />
            </div>
            <motion.div
              className="scan-beam absolute left-0 right-0 h-0.5 z-10"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px rgba(123,114,248,0.7)' }}
            />
          </div>
          <p
            className="font-mono text-xs mt-4 text-center tabular-nums"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {(elapsedMs / 1000).toFixed(1)}s elapsed
          </p>
        </div>

        {/* Right: stepper */}
        <div className="flex-1 surface p-8 space-y-6 rounded-2xl relative overflow-hidden">
          {/* Thin progress bar at top */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'var(--border-hairline)' }}
          >
            <motion.div
              className="h-full"
              style={{ background: 'var(--accent)' }}
              initial={{ width: 0 }}
              animate={{ width: `${currentProgress}%` }}
              transition={{ ease: 'linear', duration: 0.5 }}
            />
          </div>

          <div aria-live="polite" className="sr-only">
            {events.length > 0 && events[events.length - 1].message}
          </div>

          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Processing Document
          </h2>

          <div className="space-y-5">
            {stages.map((s, idx) => {
              const ev = events.find(e => e.stage === s)
              const isActive = ev?.status === 'in_progress'
              const isDone   = ev?.status === 'completed'
              const isFailed = ev?.status === 'failed'
              const hasPassed = isDone || events.some(e => stages.indexOf(e.stage) > idx)
              const meta = STAGE_META[s] ?? { label: s, Icon: FileText }
              const { Icon } = meta

              const dotBg      = isFailed ? 'var(--risk-critical-bg)' : (isDone || isActive) ? 'var(--accent-muted)' : 'var(--bg-subtle)'
              const dotBorder  = isFailed ? 'var(--risk-critical-border)' : (isDone || isActive) ? 'var(--accent-border)' : 'var(--border-default)'
              const dotColor   = isFailed ? 'var(--risk-critical-text)' : (isDone || isActive) ? 'var(--accent)' : 'var(--text-tertiary)'
              const labelColor = (isActive || isDone) ? 'var(--text-primary)' : 'var(--text-tertiary)'

              return (
                <div key={s} className="flex gap-4 relative">
                  {idx !== stages.length - 1 && (
                    <div
                      className="absolute left-3 top-8 bottom-[-20px] w-px"
                      style={{ background: hasPassed ? 'var(--accent-border)' : 'var(--border-hairline)' }}
                    />
                  )}

                  <motion.div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 border"
                    style={{ background: dotBg, borderColor: dotBorder, color: dotColor }}
                    animate={isDone ? { scale: [0.8, 1.2, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : isActive ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    ) : isFailed ? (
                      <X size={10} aria-hidden="true" />
                    ) : (
                      <Icon size={11} aria-hidden="true" />
                    )}
                  </motion.div>

                  <div>
                    <p className="font-medium text-sm" style={{ color: labelColor }}>
                      {meta.label}
                    </p>
                    {ev && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {ev.message}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>
    )
  }

  // ── Extraction review ──────────────────────────────────────────
  const renderExtractionReview = () => {
    if (!extraction) return null
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface w-full max-w-6xl mx-auto flex flex-col md:flex-row rounded-2xl overflow-hidden"
      >
        {/* Left: editable fields */}
        <div
          className="w-full md:w-1/2 p-6 border-r flex flex-col"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          {/* Notice */}
          <div
            className="mb-4 p-3 rounded-lg text-xs border"
            style={{
              background: 'var(--bg-overlay)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--text-secondary)',
            }}
          >
            InvoiceGuard flags anomalies for human review. It does not determine fraud.
          </div>

          <div className="mb-4">
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Extraction Review
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Verify low-confidence fields before running analysis.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {[
              { label: 'Invoice Number', key: 'invoice_number', field: extraction.invoice_number },
              { label: 'Vendor',         key: 'vendor.name',    field: extraction.vendor?.name },
              { label: 'Date',           key: 'invoice_date',   field: extraction.invoice_date },
              { label: 'Grand Total',    key: 'grand_total',    field: extraction.grand_total },
              { label: 'Subtotal',       key: 'subtotal',       field: extraction.subtotal },
            ].map(item => {
              const conf  = item.field?.conf ?? 0
              const isLow = conf < 0.6 && conf > 0
              const isSelected = activeField === item.key

              return (
                <div
                  key={item.key}
                  className="p-3 rounded-xl border transition-all duration-150 cursor-pointer"
                  style={{
                    borderColor:  isSelected ? 'var(--accent-border)'      : isLow ? 'var(--risk-medium-border)' : 'var(--border-default)',
                    background:   isSelected ? 'var(--accent-muted)'       : isLow ? 'var(--risk-medium-bg)'    : 'var(--bg-overlay)',
                    boxShadow:    isSelected ? '0 0 0 2px var(--accent-muted)' : 'none',
                  }}
                  onClick={() => setActiveField(item.key)}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                      {item.label}
                    </span>
                    {conf > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: 'var(--bg-subtle)',
                          color: isLow ? 'var(--risk-medium-text)' : 'var(--text-secondary)',
                        }}
                      >
                        {(conf * 100).toFixed(0)}% conf
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className="w-full bg-transparent font-mono text-sm focus:outline-none"
                    defaultValue={item.field?.value?.toString() ?? ''}
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              )
            })}
          </div>

          <div className="pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
            <button className="btn-primary w-full" onClick={handleApproveExtraction}>
              Looks good — Analyze{' '}
              <kbd className="ml-2 font-mono text-[10px] opacity-60">↵</kbd>
            </button>
          </div>
        </div>

        {/* Right: document preview */}
        <div
          className="w-full md:w-1/2 relative flex items-center justify-center overflow-hidden"
          style={{ background: 'var(--bg-base)' }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle, var(--border-default) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          <div
            className="relative w-[80%] aspect-[1/1.4] rounded shadow-2xl m-8"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText size={64} style={{ color: 'var(--text-tertiary)', opacity: 0.2 }} />
            </div>
            {activeField && (
              <motion.div
                layoutId="bbox"
                className="absolute border-2 rounded-sm"
                style={{
                  borderColor: 'var(--accent)',
                  background:  'var(--accent-muted)',
                  top:    activeField === 'invoice_number' ? '15%' : activeField === 'grand_total' ? '85%' : '30%',
                  left:   activeField === 'invoice_number' ? '70%' : activeField === 'grand_total' ? '70%' : '10%',
                  width:  '25%',
                  height: '4%',
                }}
              />
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  // ── Main render ────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 w-full">
      {/* Page header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1
          className="text-3xl font-bold mb-2"
          style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}
        >
          Analyze Invoice
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upload a PDF or scanned image. InvoiceGuard extracts fields and runs financial,
          anomaly, and visual forensics checks.
        </p>
      </div>

      <div className="flex flex-col items-center min-h-[400px]">
        {/* ── Idle: dropzone + sample gallery ── */}
        {state === 'idle' && (
          <div className="w-full space-y-10">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className="relative rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition-all duration-200"
              style={{
                borderColor: isDragReject
                  ? 'var(--risk-critical-border)'
                  : isDragActive
                  ? 'var(--accent)'
                  : 'var(--border-strong)',
                background: isDragReject
                  ? 'var(--risk-critical-bg)'
                  : isDragActive
                  ? 'var(--accent-muted)'
                  : 'var(--bg-elevated)',
                boxShadow: isDragActive ? '0 0 0 4px var(--accent-muted)' : 'none',
              }}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <Upload
                  size={32}
                  style={{
                    color: isDragReject
                      ? 'var(--risk-critical-text)'
                      : isDragActive
                      ? 'var(--accent)'
                      : 'var(--text-tertiary)',
                    transition: 'color 200ms',
                  }}
                />
                <div>
                  <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    {isDragReject
                      ? 'Invalid file type'
                      : isDragActive
                      ? 'Drop to analyze'
                      : 'Drop PDF or image here'}
                  </p>
                  {!isDragActive && !isDragReject && (
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      or click to browse
                    </p>
                  )}
                </div>
                {!isDragActive && !isDragReject && (
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {['PDF', 'JPG', 'PNG'].map(fmt => (
                      <span
                        key={fmt}
                        className="px-2 py-0.5 rounded text-xs font-mono font-medium"
                        style={{
                          background:   'var(--bg-subtle)',
                          color:        'var(--text-secondary)',
                          border:       '1px solid var(--border-default)',
                        }}
                      >
                        {fmt}
                      </span>
                    ))}
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      · Max 20 MB
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Sample gallery */}
            <div>
              <p
                className="text-xs font-bold mb-4 uppercase tracking-widest text-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Demo Samples
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SAMPLE_GALLERY.map((sample, num) => (
                  <motion.button
                    key={sample.id}
                    className="surface p-3 text-left rounded-xl cursor-pointer group"
                    onClick={() => handleSampleClick(sample.id)}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                        Demo {String(num + 1).padStart(2, '0')}
                      </span>
                      <RiskBadge level={sample.level} size="sm" />
                    </div>
                    <p className="text-xs mb-2 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {sample.desc}
                    </p>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-2xl font-mono font-bold tabular-nums"
                        style={{ color: RISK_SCORE_COLOR[sample.level] }}
                      >
                        {sample.score}
                      </span>
                      <span
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        Run →
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Pipeline / analyzing ── */}
        {(state === 'pipeline' || state === 'analyzing') && renderPipeline()}

        {/* ── Extraction review ── */}
        {state === 'extraction-review' && renderExtractionReview()}

        {/* ── Error ── */}
        {state === 'error' && (
          <div className="w-full max-w-md">
            <ErrorState
              title="Upload failed"
              message={error ?? 'An unexpected error occurred.'}
              onRetry={() => setState('idle')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
