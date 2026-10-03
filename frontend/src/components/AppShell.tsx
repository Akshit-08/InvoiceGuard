import { useState, useCallback } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, Users,
  Settings, ChevronLeft, ChevronRight, Moon, Sun,
  Search, Shield, ClipboardList, BarChart2, Command,
} from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Disclaimer } from './ui'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analyze', label: 'Analyze', icon: Upload },
  { to: '/history', label: 'History', icon: History },
  { to: '/review', label: 'Review Queue', icon: ClipboardList },
  { to: '/vendors', label: 'Vendors', icon: Users },
  { to: '/insights', label: 'Model Insights', icon: BarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

const CMD_ITEMS = [
  { id: 'dashboard', label: 'Go to Dashboard',  icon: LayoutDashboard, to: '/dashboard' },
  { id: 'analyze',   label: 'Analyze Invoice',   icon: Upload,          to: '/analyze' },
  { id: 'history',   label: 'Invoice History',   icon: History,         to: '/history' },
  { id: 'review',    label: 'Review Queue',      icon: ClipboardList,   to: '/review' },
  { id: 'vendors',   label: 'Vendors',           icon: Users,           to: '/vendors' },
  { id: 'insights',  label: 'Model Insights',    icon: BarChart2,       to: '/insights' },
  { id: 'settings',  label: 'Settings',          icon: Settings,        to: '/settings' },
] as const

// ── Command Palette ───────────────────────────────────────────
interface CommandPaletteProps {
  onClose: () => void
  onNavigate: (to: string) => void
}

function CommandPalette({ onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const filtered = CMD_ITEMS.filter(i =>
    i.label.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50"
        style={{ background: 'hsl(220 15% 3% / 0.6)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        className="fixed top-24 left-1/2 z-50 w-full max-w-lg px-4"
        style={{ transform: 'translateX(-50%)' }}
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="surface-elevated overflow-hidden" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
            <Command size={16} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
            <input
              autoFocus
              placeholder="Search pages, actions…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
              onKeyDown={e => {
                if (e.key === 'Escape') onClose()
                if (e.key === 'Enter' && filtered.length > 0) onNavigate(filtered[0].to)
              }}
              aria-label="Command search"
            />
          </div>
          <div className="py-2 max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                No results
              </p>
            ) : (
              filtered.map(item => {
                const ItemIcon = item.icon
                return (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors duration-100"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => onNavigate(item.to)}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '' }}
                  >
                    <ItemIcon size={16} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
                    {item.label}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}

// ── AppShell ──────────────────────────────────────────────────
interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const handleGlobalKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setCmdOpen(o => !o)
    }
  }, [])

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--bg-base)' }}
      onKeyDown={handleGlobalKeyDown}
    >
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col border-r shrink-0 overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 border-b"
          style={{ borderColor: 'var(--border-hairline)', height: 64 }}
        >
          <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none group">
            <motion.div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Shield size={16} color="white" aria-hidden="true" />
            </motion.div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  className="font-bold text-base overflow-hidden whitespace-nowrap"
                  style={{ color: 'var(--text-primary)' }}
                >
                  InvoiceGuard
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto" role="navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              aria-label={label}
            >
              {({ isActive }) => (
                <motion.div
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer',
                  )}
                  style={{
                    background: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? 'white' : 'var(--text-secondary)',
                    boxShadow: isActive ? 'var(--shadow-glow-accent)' : undefined,
                  }}
                  whileHover={{ x: isActive ? 0 : 2 }}
                  transition={{ duration: 0.1 }}
                >
                  <Icon size={18} className="shrink-0" aria-hidden="true" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute top-1/2 -right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-colors duration-150"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-tertiary)',
            transform: 'translateY(-50%)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Bottom note */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-4 border-t"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Flags anomalies for review. Does not determine fraud.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="glass sticky top-0 z-30 flex items-center gap-3 px-6 border-b"
          style={{ borderColor: 'var(--glass-border)', height: 64 }}
          role="banner"
        >
          {/* Search / command palette trigger */}
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-150 max-w-xs flex-1"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-hairline)',
            }}
            onClick={() => setCmdOpen(true)}
            aria-label="Open command palette"
          >
            <Search size={14} aria-hidden="true" />
            <span>Search or type a command…</span>
            <kbd
              className="ml-auto text-xs px-1.5 py-0.5 rounded hidden sm:inline-block"
              style={{ background: 'var(--bg-overlay)', fontFamily: 'var(--font-mono)' }}
              aria-label="Keyboard shortcut: Ctrl+K"
            >
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={toggle}
              className="btn-ghost w-9 h-9 p-0 justify-center"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark'
                ? <Sun size={16} aria-hidden="true" />
                : <Moon size={16} aria-hidden="true" />
              }
            </button>

            <Link to="/analyze" className="btn-primary text-sm">
              <Upload size={14} aria-hidden="true" />
              Upload
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>

        <Disclaimer />
      </div>

      {/* ── Command Palette ─────────────────────────────────── */}
      <AnimatePresence>
        {cmdOpen && (
          <CommandPalette
            onClose={() => setCmdOpen(false)}
            onNavigate={(to) => { navigate(to); setCmdOpen(false) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
