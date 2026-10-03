import { motion } from 'framer-motion'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6">
      <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Settings</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Manage system configuration and risk thresholds.
      </p>

      <div className="surface p-12 text-center max-w-2xl mx-auto rounded-2xl">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg-subtle)' }}>
          <Settings size={32} style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <h2 className="text-lg font-bold mb-2">Settings module</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Risk thresholds and user management configurations will be added here.
        </p>
      </div>
    </motion.div>
  )
}
