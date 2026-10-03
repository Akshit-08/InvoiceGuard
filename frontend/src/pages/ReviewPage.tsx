import { motion } from 'framer-motion'
import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'

export default function ReviewPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6">
      <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Review Queue</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Invoices requiring human sign-off. Use <kbd className="font-mono text-xs">j/k</kbd> to navigate, <kbd className="font-mono text-xs">Enter</kbd> to open.
      </p>
      <EmptyState
        title="Queue is clear"
        description="No invoices are currently waiting for review. Newly analysed high-risk invoices will appear here."
        action={{ label: 'View all invoices', onClick: () => window.location.href = '/history' }}
        icon={<ClipboardList size={48} />}
      />
    </motion.div>
  )
}
