import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6 h-full flex flex-col items-center justify-center">
      <div className="surface p-12 text-center max-w-lg mx-auto rounded-2xl w-full">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--risk-critical-bg)' }}>
          <ShieldAlert size={32} style={{ color: 'var(--risk-critical-text)' }} />
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>404 Not Found</h1>
        <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/" className="btn-primary inline-flex">
          Go back home
        </Link>
      </div>
    </motion.div>
  )
}
