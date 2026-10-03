import { motion } from 'framer-motion'
import { BarChart2, ShieldAlert } from 'lucide-react'

export default function InsightsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6">
      <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Model Insights</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Global risk model performance and signal distributions.
      </p>
      
      <div className="surface p-12 text-center max-w-2xl mx-auto rounded-2xl">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--accent-muted)' }}>
          <BarChart2 size={32} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="text-lg font-bold mb-2">Insights engine coming soon</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Detailed SHAP value explanations, feature importance charts, and threshold calibrations will be available here in Day 4.
        </p>
      </div>
    </motion.div>
  )
}
