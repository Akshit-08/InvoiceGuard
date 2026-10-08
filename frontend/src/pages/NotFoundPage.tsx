import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '100vh', background: 'var(--bg-base)' }}
    >
      <div className="flex flex-col items-center text-center px-6 max-w-md w-full">
        {/* Large 404 */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            fontFamily:    'var(--font-mono)',
            fontSize:      '96px',
            lineHeight:    1,
            letterSpacing: '-0.05em',
            color:         'var(--text-tertiary)',
            userSelect:    'none',
          }}
          aria-hidden="true"
        >
          404
        </motion.p>

        {/* Heading + description */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
          className="mt-4 space-y-3"
        >
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            Page not found
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            The page you are looking for doesn't exist or has been moved.
            Head back to safety below.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
          className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
        >
          <Link to="/dashboard" className="btn-primary">
            Go to Dashboard
          </Link>
          <Link to="/analyze" className="btn-ghost">
            Analyze an invoice
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
