import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, FileText, AlertTriangle } from 'lucide-react'
import { batchApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'

export default function BatchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [isPolling, setIsPolling] = useState(true)

  const { data: status, error } = useQuery({
    queryKey: ['batch', id],
    queryFn: async () => {
      const res = await batchApi.status(id!)
      if (res.status === 'completed' || res.status === 'failed') {
        setIsPolling(false)
      }
      return res
    },
    enabled: !!id,
    refetchInterval: isPolling ? 2000 : false,
  })

  if (error) {
    return (
      <div className="p-8 text-center max-w-xl mx-auto">
        <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
        <h2 className="text-xl font-bold mb-2">Batch not found</h2>
        <p className="text-sm text-gray-500 mb-6">The requested batch could not be found or has expired.</p>
        <button onClick={() => navigate('/analyze')} className="btn-primary">
          Back to Analyze
        </button>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    )
  }

  const isComplete = status.status === 'completed' || status.status === 'failed'
  const progress = status.total > 0 ? (status.completed / status.total) * 100 : 0

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-end border-b pb-6" style={{ borderColor: 'var(--border-hairline)' }}>
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Batch Processing
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            ID: <span className="font-mono">{id}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
            {status.completed} / {status.total}
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Files processed</p>
        </div>
      </div>

      <div className="surface p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {!isComplete ? (
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--accent)' }} />
            ) : (
              <CheckCircle2 size={20} style={{ color: 'var(--risk-low-text)' }} />
            )}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isComplete ? 'Processing Complete' : 'Analyzing invoices...'}
            </span>
          </div>
          {status.failed > 0 && (
            <span className="text-sm font-medium" style={{ color: 'var(--risk-critical-text)' }}>
              {status.failed} failed
            </span>
          )}
        </div>
        
        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
          <div 
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, background: 'var(--accent)' }}
          />
        </div>
      </div>

      <div className="surface rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border-hairline)' }}>
        <table className="w-full text-left text-sm">
          <thead style={{ background: 'var(--bg-overlay)' }}>
            <tr>
              <th className="px-6 py-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Filename</th>
              <th className="px-6 py-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
              <th className="px-6 py-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Risk Level</th>
              <th className="px-6 py-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Score</th>
              <th className="px-6 py-4 font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {status.results.map((r, i) => (
              <tr key={i} className="hover:bg-[var(--bg-overlay)] transition-colors">
                <td className="px-6 py-4 flex items-center gap-3">
                  <FileText size={16} style={{ color: 'var(--text-tertiary)' }} />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.filename}</span>
                </td>
                <td className="px-6 py-4">
                  {r.status === 'success' ? (
                    <span className="text-green-500 font-medium">Success</span>
                  ) : (
                    <span className="text-red-500 font-medium" title={r.error}>Failed</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {r.risk_level && r.risk_level !== 'UNKNOWN' ? <RiskBadge level={r.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} size="sm" /> : '-'}
                </td>
                <td className="px-6 py-4">
                  {r.overall_score !== undefined ? (
                    <span className="font-mono">{r.overall_score.toFixed(1)}</span>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  {r.invoice_id ? (
                    <button 
                      onClick={() => navigate(`/invoices/${r.invoice_id}`)}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      View Report
                    </button>
                  ) : '-'}
                </td>
              </tr>
            ))}
            {status.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Results will appear here as files are processed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
