import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'
import { invoiceApi } from '@/api/client'

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function AnalyzePage() {
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleUpload = useCallback(async (f: File) => {
    setFile(f)
    setState('uploading')
    setError(null)
    try {
      const res = await invoiceApi.upload(f)
      setState('success')
      toast.success('Invoice uploaded — starting analysis…')
      setTimeout(() => navigate(`/invoices/${res.invoice_id}`), 800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setState('error')
      setError(msg)
      toast.error(msg)
    }
  }, [navigate])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) handleUpload(accepted[0]) },
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxSize: 15 * 1024 * 1024,
    multiple: false,
    disabled: state === 'uploading',
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-2xl mx-auto"
    >
      <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Analyse an Invoice
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Upload a PDF or scanned image. InvoiceGuard will extract fields and run all seven detection engines.
      </p>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className="relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200"
        style={{
          borderColor: isDragActive ? 'var(--accent)' : 'var(--border-default)',
          background: isDragActive ? 'var(--accent-muted)' : 'var(--bg-surface)',
          boxShadow: isDragActive ? 'var(--shadow-glow-accent)' : undefined,
        }}
        aria-label="Drop zone: drag and drop invoice file or click to browse"
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: isDragActive ? 'var(--accent)' : 'var(--bg-subtle)' }}
              >
                <Upload size={24} style={{ color: isDragActive ? 'white' : 'var(--text-tertiary)' }} />
              </div>
              <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {isDragActive ? 'Drop it here' : 'Drag & drop or click to browse'}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                PDF, JPG, PNG · Max 15 MB · Up to 10 pages
              </p>
            </motion.div>
          )}

          {state === 'uploading' && (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--accent-muted)', border: '2px solid var(--accent)' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Upload size={24} style={{ color: 'var(--accent)' }} />
              </motion.div>
              <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                Uploading {file?.name}…
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Validating document and starting extraction
              </p>
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--risk-low-bg)', border: '2px solid var(--risk-low-border)' }}
              >
                <CheckCircle2 size={24} style={{ color: 'var(--risk-low-text)' }} />
              </div>
              <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                Uploaded! Redirecting…
              </p>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--risk-critical-bg)', border: '2px solid var(--risk-critical-border)' }}
              >
                <AlertCircle size={24} style={{ color: 'var(--risk-critical-text)' }} />
              </div>
              <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Upload failed</p>
              <p className="text-sm" style={{ color: 'var(--risk-critical-text)' }}>{error}</p>
              <button
                className="btn-ghost mt-4"
                onClick={e => { e.stopPropagation(); setState('idle'); setFile(null) }}
              >
                <X size={14} /> Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Demo samples */}
      <div className="mt-8">
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
          OR TRY A DEMO SAMPLE
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { id: 'inv-hero-03-critical', label: '03 — Critical', score: 88, level: 'CRITICAL' as const },
            { id: 'inv-hero-01-clean',    label: '01 — Clean',    score: 18, level: 'LOW' as const },
            { id: 'inv-hero-05-bank',     label: '05 — Bank Change', score: 62, level: 'HIGH' as const },
          ].map(sample => (
            <motion.button
              key={sample.id}
              className="surface p-4 text-left rounded-xl transition-all duration-150"
              onClick={() => navigate(`/invoices/${sample.id}`)}
              whileHover={{ y: -1 }}
              style={{ cursor: 'pointer' }}
            >
              <FileText size={16} className="mb-2" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sample.label}</p>
              <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                Score: {sample.score}
              </p>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
