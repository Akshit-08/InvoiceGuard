import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { FileText } from 'lucide-react'

export default function HistoryPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoices-list'],
    queryFn: () => invoiceApi.list({ limit: 50 }),
  })

  if (isLoading) return <div className="p-6 space-y-3">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
  if (error) return <ErrorState title="Could not load history" onRetry={() => refetch()} />

  const items = data?.items ?? []

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6 space-y-4">
      <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Invoice History</h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{data?.total ?? 0} invoices processed</p>

      <div className="surface overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No invoices yet. Upload one to get started.</p>
            <Link to="/analyze" className="btn-primary mt-4 inline-flex">Upload invoice</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-subtle)' }}>
                {['Invoice #', 'Vendor', 'Date', 'Amount', 'Risk', 'Uploaded'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((inv, i) => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b transition-colors duration-100"
                  style={{ borderColor: 'var(--border-hairline)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3">
                    <Link to={`/invoices/${inv.id}`} className="font-mono text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                      {inv.invoice_number ?? inv.id.slice(0, 12)}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{inv.vendor_name ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{inv.invoice_date ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(inv.grand_total)}</td>
                  <td className="px-4 py-3">{inv.risk_level ? <RiskBadge level={inv.risk_level} size="sm" /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatRelativeTime(inv.created_at)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
