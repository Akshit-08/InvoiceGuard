import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
import { Upload, FileText, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import type { StageEvent, InvoiceDetail } from '@/api/types'

type UploadState = 'idle' | 'pipeline' | 'extraction-review' | 'analyzing' | 'error'

const SAMPLE_GALLERY = [
  { id: '01_clean_low', label: '01 — Clean', score: 18, level: 'LOW' as const },
  { id: '02_minor_warning_medium', label: '02 — Medium Warning', score: 45, level: 'MEDIUM' as const },
  { id: '03_hero_critical', label: '03 — Hero Critical', score: 85, level: 'CRITICAL' as const },
  { id: '04_near_duplicate', label: '04 — Duplicate', score: 72, level: 'HIGH' as const },
  { id: '05_bank_change_only', label: '05 — Bank Change', score: 62, level: 'HIGH' as const },
  { id: '06_pdf_edited_visual', label: '06 — Visual Edit', score: 68, level: 'HIGH' as const },
  { id: '07_new_vendor', label: '07 — New Vendor', score: 35, level: 'MEDIUM' as const },
  { id: '08_scanned_noisy_genuine', label: '08 — Noisy Scan', score: 25, level: 'LOW' as const },
]

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
    // For demo purposes, we will navigate directly, but in a real app this might trigger a backend pipeline
    // using the sample. We'll just go straight to the result.
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

  // Listen to SSE events for pipeline
  useEffect(() => {
    if ((state === 'pipeline' || state === 'analyzing') && invoiceId) {
      const cleanup = invoiceApi.streamEvents(invoiceId, 
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
            // Extraction done, load review UI
            invoiceApi.getExtraction(invoiceId).then((ext: any) => {
              setExtraction(ext.data ?? null)
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

  // Keyboard shortcut for Enter -> Analyze
  useEffect(() => {
    if (state !== 'extraction-review') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleApproveExtraction()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state, handleApproveExtraction])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) handleUpload(accepted[0]) },
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxSize: 15 * 1024 * 1024,
    multiple: false,
    disabled: state !== 'idle',
  })

  // Pipeline visual stepper
  const renderPipeline = () => {
    const currentProgress = events.length > 0 ? events[events.length - 1].progress * 100 : 0
    const stages = ['ingest', 'read', 'extract', 'analyze']
    
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-12 max-w-4xl mx-auto w-full">
        {/* Left: Document Thumbnail with Scan Beam */}
        <div className="hidden md:flex flex-col items-center justify-center w-1/3">
          <div className="relative w-48 h-64 bg-white rounded-lg shadow-2xl overflow-hidden border border-neutral-200">
             <div className="absolute inset-0 flex items-center justify-center opacity-10">
               <FileText size={64} className="text-black" />
             </div>
             {/* Scan Beam */}
             <motion.div 
               className="absolute top-0 left-0 right-0 h-1 bg-accent/80 shadow-[0_0_15px_rgba(var(--accent-rgb),0.8)] z-10"
               animate={{ top: ['0%', '100%', '0%'] }}
               transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
             />
          </div>
          <p className="font-mono text-xs mt-4 text-neutral-500 text-center">
            Elapsed: {(elapsedMs / 1000).toFixed(1)}s
          </p>
        </div>

        {/* Right: Stepper and Log */}
        <div className="flex-1 surface p-8 space-y-8 rounded-2xl relative">
          <div aria-live="polite" className="sr-only">
             {events.length > 0 && events[events.length - 1].message}
          </div>
          
          <h2 className="text-xl font-bold">Processing Document</h2>
          
          <div className="space-y-6">
            {stages.map((s, idx) => {
              const ev = events.find(e => e.stage === s)
              const isActive = ev?.status === 'in_progress'
              const isDone = ev?.status === 'completed'
              const isFailed = ev?.status === 'failed'
              const hasPassed = isDone || events.some(e => stages.indexOf(e.stage) > idx)
              
              return (
                <div key={s} className="flex gap-4 relative">
                  {idx !== stages.length - 1 && (
                    <div className="absolute left-3 top-8 bottom-[-24px] w-0.5" style={{ background: hasPassed ? 'var(--accent)' : 'var(--border-default)' }} />
                  )}
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10"
                    style={{ 
                      background: isFailed ? 'var(--risk-critical)' : isDone ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--bg-subtle)',
                      color: isFailed || isDone || isActive ? '#fff' : 'var(--text-tertiary)'
                    }}
                  >
                    {isDone ? <CheckCircle2 size={14} /> : isActive ? <Loader2 size={12} className="animate-spin" /> : <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
                  </div>
                  <div>
                    <p className="font-medium capitalize" style={{ color: isActive || isDone ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{s}</p>
                    {ev && (
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{ev.message}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="h-1.5 rounded-full overflow-hidden absolute bottom-0 left-0 right-0" style={{ background: 'var(--bg-subtle)' }}>
            <motion.div 
              className="h-full rounded-full" 
              style={{ background: 'var(--accent)' }}
              initial={{ width: 0 }}
              animate={{ width: `${currentProgress}%` }}
              transition={{ ease: 'linear', duration: 0.5 }}
            />
          </div>
        </div>
      </motion.div>
    )
  }

  // Extraction Review UI
  const renderExtractionReview = () => {
    if (!extraction) return null
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface w-full max-w-6xl mx-auto flex flex-col md:flex-row rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border-hairline)' }}>
        {/* Editable Fields (Left) */}
        <div className="w-full md:w-1/2 p-6 border-r flex flex-col" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-1">Extraction Review</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Verify low-confidence fields before running analysis.
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {[
              { label: 'Invoice Number', key: 'invoice_number', field: extraction.invoice_number },
              { label: 'Vendor', key: 'vendor.name', field: extraction.vendor?.name },
              { label: 'Date', key: 'invoice_date', field: extraction.invoice_date },
              { label: 'Grand Total', key: 'grand_total', field: extraction.grand_total },
              { label: 'Subtotal', key: 'subtotal', field: extraction.subtotal },
            ].map(item => {
              const conf = item.field?.conf ?? 0
              const isLow = conf < 0.6 && conf > 0
              return (
                <div 
                  key={item.key} 
                  className={`p-3 rounded-xl border transition-colors cursor-pointer ${activeField === item.key ? 'ring-2 ring-accent' : ''}`}
                  style={{ 
                    borderColor: isLow ? 'var(--risk-medium-border)' : 'var(--border-default)', 
                    background: isLow ? 'var(--risk-medium-bg)' : 'transparent' 
                  }}
                  onClick={() => setActiveField(item.key)}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                    {conf > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-subtle)', color: isLow ? 'var(--risk-medium-text)' : 'var(--text-secondary)' }}>
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
          
          <div className="pt-6 mt-4 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
            <button className="btn-primary w-full" onClick={handleApproveExtraction}>
              Looks good — Analyze <kbd className="ml-2 font-mono text-[10px] opacity-60">↵</kbd>
            </button>
          </div>
        </div>
        
        {/* Document view (Right) */}
        <div className="w-full md:w-1/2 bg-zinc-950 relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')] opacity-20" />
          {/* Mock document with boxes */}
          <div className="relative w-[80%] aspect-[1/1.4] bg-white rounded shadow-2xl m-8">
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <FileText size={64} className="text-black" />
            </div>
            {/* Draw active field box if active */}
            {activeField && (
              <motion.div 
                layoutId="bbox"
                className="absolute border-2 border-blue-500 bg-blue-500/20"
                style={{
                  top: activeField === 'invoice_number' ? '15%' : activeField === 'grand_total' ? '85%' : '30%',
                  left: activeField === 'invoice_number' ? '70%' : activeField === 'grand_total' ? '70%' : '10%',
                  width: '25%',
                  height: '4%',
                }}
              />
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col max-w-7xl mx-auto w-full">
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-3" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Analyse an Invoice
        </h1>
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
          Upload a PDF or scanned image. InvoiceGuard extracts fields and runs financial, anomaly, and visual forensics engines.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        {state === 'idle' && (
          <div className="w-full max-w-3xl space-y-12">
            <div
              {...getRootProps()}
              className="relative rounded-3xl border-2 border-dashed p-16 text-center cursor-pointer transition-all duration-200 shadow-sm"
              style={{
                borderColor: isDragReject ? 'var(--risk-critical-border)' : isDragActive ? 'var(--accent)' : 'var(--border-default)',
                background: isDragReject ? 'var(--risk-critical-bg)' : isDragActive ? 'var(--accent-muted)' : 'var(--bg-surface)',
              }}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-colors" 
                style={{ background: isDragReject ? 'var(--risk-critical-text)' : isDragActive ? 'var(--accent)' : 'var(--bg-subtle)' }}
              >
                <Upload size={28} style={{ color: isDragReject || isDragActive ? 'white' : 'var(--text-tertiary)' }} />
              </div>
              <p className="text-xl font-medium mb-2">
                {isDragReject ? 'Invalid file type' : isDragActive ? 'Drop invoice to analyze' : 'Drag & drop or click to browse'}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Supports PDF, JPG, PNG up to 15 MB</p>
            </div>
            
            <div>
              <p className="text-xs font-bold mb-4 uppercase tracking-widest text-center" style={{ color: 'var(--text-tertiary)' }}>Demo Samples</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {SAMPLE_GALLERY.map(sample => (
                  <motion.button
                    key={sample.id}
                    className="surface p-4 text-left rounded-xl transition-all duration-150 flex flex-col items-start hover:border-neutral-500/30"
                    onClick={() => handleSampleClick(sample.id)}
                    whileHover={{ y: -2 }}
                  >
                    <RiskBadge level={sample.level} size="sm" className="mb-3" />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sample.label}</p>
                    <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>Score: {sample.score}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(state === 'pipeline' || state === 'analyzing') && renderPipeline()}
        {state === 'extraction-review' && renderExtractionReview()}

        {state === 'error' && (
          <div className="text-center surface p-8 rounded-2xl max-w-md w-full shadow-lg">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--risk-critical-bg)' }}>
              <AlertCircle size={28} style={{ color: 'var(--risk-critical-text)' }} />
            </div>
            <p className="text-lg font-bold mb-2">Upload failed</p>
            <p className="text-sm" style={{ color: 'var(--risk-critical-text)' }}>{error}</p>
            <button className="btn-primary mt-6 mx-auto" onClick={() => setState('idle')}>
              <X size={16} /> Try another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
