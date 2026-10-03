import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { vendorApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

export default function VendorsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendors'],
    queryFn: vendorApi.list,
  })

  if (isLoading) return <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
  if (error) return <ErrorState title="Could not load vendors" onRetry={() => refetch()} />

  const vendors = data?.items ?? []

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6 space-y-4">
      <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Vendors</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map(v => (
          <div key={v.id} className="surface p-5">
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{v.name}</p>
            {v.gstin && <p className="text-xs font-mono mb-2" style={{ color: 'var(--text-tertiary)' }}>{v.gstin}</p>}
            <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{v.invoice_count} invoices</span>
              {v.total_billed != null && <span>{formatCurrency(v.total_billed)}</span>}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
