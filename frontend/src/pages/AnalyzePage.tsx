import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, AlertCircle, CheckCircle2, X, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { invoiceApi } from '@/api/client'
import type { StageEvent } from '@/api/types'

type UploadState = 'idle' | 'pipeline' | 'extraction-review' | 'analyzing' | 'error'

export default function AnalyzePage() {
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  
  // Pipeline state
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [events, setEvents] = useState<StageEvent[]>([])
  
  // Extraction data
  const [extraction, setExtraction] = useState<any>(null)

  const handleUpload = useCallback(async (f: File) => {
    setFile(f)
    setState('pipeline')
    setError(null)
    setEvents([])
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

  // Listen to SSE events for pipeline
  useEffect(() => {
    if ((state === 'pipeline' || state === 'analyzing') && invoiceId) {
      const cleanup = invoiceApi.streamEvents(invoiceId, 
        (ev) => {
          setEvents(prev => {
            // update or append
            const idx = prev.findIndex(p => p.stage === ev.stage)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = ev
              return next
            }
            return [...prev, ev]
          })
          
          if (ev.stage === 'extract' && ev.status === 'completed' && state === 'pipeline') {
            // Extraction done, load review UI
            invoiceApi.getExtraction(invoiceId).then(ext => {
              setExtraction(ext)
              setState('extraction-review')
            }).catch(e => {
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
        }
      )
      return cleanup
    }
  }, [state, invoiceId, navigate])

  const handleApproveExtraction = async () => {
    if (!invoiceId) return
    setState('analyzing')
    try {
      await invoiceApi.analyze(invoiceId)
    } catch (e) {
      toast.error('Analysis failed to start')
      setState('error')
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) handleUpload(accepted[0]) },
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxSize: 15 * 1024 * 1024,
    multiple: false,
    disabled: state !== 'idle',
  })

  // Pipeline visual stepper
  const renderPipeline = () => {
    const currentProgress = events.length > 0 ? events[events.length - 1].progress * 100 : 0
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="surface p-8 max-w-lg mx-auto w-full space-y-6">
        <h2 className="text-lg font-bold">Processing Document</h2>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
          <motion.div 
            className="h-full rounded-full" 
            style={{ background: 'var(--accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${currentProgress}%` }}
            transition={{ ease: 'linear', duration: 0.5 }}
          />
        </div>
        <div className="space-y-3 font-mono text-xs">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center gap-3">
              {ev.status === 'completed' ? (
                <CheckCircle2 size={14} style={{ color: 'var(--risk-low-text)' }} />
              ) : (
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              )}
              <span style={{ color: ev.status === 'completed' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                [{ev.stage.toUpperCase()}] {ev.message}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    )
  }

  // Extraction Review UI
  const renderExtractionReview = () => {
    if (!extraction) return null
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface p-6 w-full max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Review Extraction</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Verify the extracted fields before running detection engines.
          </p>
          <div className="space-y-3 mt-4 text-sm">
            <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-hairline)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Invoice Number</span>
              <span className="font-mono">{extraction.invoice_number?.value ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-hairline)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Vendor</span>
              <span className="font-medium">{extraction.vendor?.name?.value ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-hairline)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Date</span>
              <span className="font-mono">{extraction.invoice_date?.value ?? '—'}</span>
            </div>
            <div className="flex justify-between pb-2">
              <span style={{ color: 'var(--text-tertiary)' }}>Grand Total</span>
              <span className="font-mono font-bold">₹{extraction.grand_total?.value?.toLocaleString('en-IN') ?? '—'}</span>
            </div>
          </div>
          <button className="btn-primary w-full mt-4" onClick={handleApproveExtraction}>
            Looks good — Analyze <ChevronRight size={16} />
          </button>
        </div>
        
        {/* Document preview stub */}
        <div className="rounded-xl flex flex-col items-center justify-center text-center p-6 border border-dashed" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-default)' }}>
          <FileText size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">Document Preview</p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
            Interactive viewer with bounding boxes will render here.
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Analyse an Invoice
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upload a PDF or scanned image. InvoiceGuard will extract fields and run all seven detection engines.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        {state === 'idle' && (
          <div
            {...getRootProps()}
            className="relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 w-full max-w-2xl"
            style={{
              borderColor: isDragActive ? 'var(--accent)' : 'var(--border-default)',
              background: isDragActive ? 'var(--accent-muted)' : 'var(--bg-surface)',
            }}
          >
            <input {...getInputProps()} />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: isDragActive ? 'var(--accent)' : 'var(--bg-subtle)' }}>
              <Upload size={24} style={{ color: isDragActive ? 'white' : 'var(--text-tertiary)' }} />
            </div>
            <p className="text-base font-medium mb-1">{isDragActive ? 'Drop it here' : 'Drag & drop or click to browse'}</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>PDF, JPG, PNG · Max 15 MB</p>
          </div>
        )}

        {(state === 'pipeline' || state === 'analyzing') && renderPipeline()}
        {state === 'extraction-review' && renderExtractionReview()}

        {state === 'error' && (
          <div className="text-center surface p-8 rounded-2xl max-w-md w-full">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--risk-critical-bg)' }}>
              <AlertCircle size={24} style={{ color: 'var(--risk-critical-text)' }} />
            </div>
            <p className="text-base font-medium mb-1">Upload failed</p>
            <p className="text-sm" style={{ color: 'var(--risk-critical-text)' }}>{error}</p>
            <button className="btn-ghost mt-4 mx-auto" onClick={() => setState('idle')}>
              <X size={14} /> Try again
            </button>
          </div>
        )}
      </div>

      {state === 'idle' && (
        <div className="mt-auto max-w-2xl mx-auto w-full pt-8">
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>OR TRY A DEMO SAMPLE</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { id: 'inv-hero-03-critical', label: '03 — Critical', score: 88 },
              { id: 'inv-hero-01-clean',    label: '01 — Clean',    score: 18 },
              { id: 'inv-hero-05-bank',     label: '05 — Bank Change', score: 62 },
            ].map(sample => (
              <motion.button
                key={sample.id}
                className="surface p-4 text-left rounded-xl transition-all duration-150"
                onClick={() => navigate(`/invoices/${sample.id}`)}
                whileHover={{ y: -1 }}
              >
                <FileText size={16} className="mb-2" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-medium text-primary">{sample.label}</p>
                <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Score: {sample.score}</p>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
