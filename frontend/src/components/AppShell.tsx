import { useState, useCallback } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, Users,
  Settings, ChevronLeft, ChevronRight,
  Search, ClipboardList, BarChart2, Command,
} from 'lucide-react'
import { Disclaimer } from './ui'
import { Logo } from './brand/Logo'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/analyze',   label: 'Analyze',       icon: Upload },
  { to: '/history',   label: 'History',       icon: History },
  { to: '/review',    label: 'Review Queue',  icon: ClipboardList },
  { to: '/vendors',   label: 'Vendors',       icon: Users },
  { to: '/insights',  label: 'Model Insights', icon: BarChart2 },
  { to: '/settings',  label: 'Settings',      icon: Settings },
] as const

const CMD_ITEMS = [
  { id: 'upload',    label: 'Upload New Invoice',            icon: Upload,          to: '/analyze' },
  { id: 'recent',    label: 'Open Recent Invoices',          icon: History,         to: '/history' },
  { id: 'dashboard', label: 'Go to Dashboard',              icon: LayoutDashboard, to: '/dashboard' },
  { id: 'review',    label: 'Open Review Queue',             icon: ClipboardList,   to: '/review' },
  { id: 'vendors',   label: 'View Vendors',                  icon: Users,           to: '/vendors' },
  { id: 'insights',  label: 'Model Insights & Metrics',       icon: BarChart2,       to: '/insights' },
  { id: 'settings',  label: 'Settings & Risk Thresholds',     icon: Settings,        to: '/settings' },
] as const

// ── Command Palette ───────────────────────────────────────────────
interface CommandPaletteProps {
  onClose: () => void
  onNavigate: (to: string) => void
  onToggleTheme: () => void
}

function CommandPalette({ onClose, onNavigate, onToggleTheme }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const filtered = CMD_ITEMS.filter(i =>
    i.label.toLowerCase().includes(query.toLowerCase())
  )

  const handleSelect = (item: (typeof CMD_ITEMS)[number]) => {
    if ('action' in item && item.action === 'toggle-theme') {
      onToggleTheme()
      onClose()
    } else if ('to' in item && item.to) {
      onNavigate(item.to)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(10,10,10,0.65)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette panel */}
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
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {/* Search input */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <Command size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} aria-hidden="true" />
            <input
              autoFocus
              placeholder="Search pages, actions…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
              onKeyDown={e => {
                if (e.key === 'Escape') onClose()
                if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0])
              }}
              aria-label="Command search"
            />
            <kbd
              className="text-xs px-1.5 py-0.5 rounded hidden sm:inline-block"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--border-default)',
              }}
            >
              esc
            </kbd>
          </div>

          {/* Results */}
          <div className="py-1.5 max-h-72 overflow-y-auto">
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
                    style={{ color: 'var(--text-primary)', background: 'transparent' }}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <ItemIcon size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} aria-hidden="true" />
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

// ── AppShell ──────────────────────────────────────────────────────
interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
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
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col shrink-0 overflow-hidden"
        style={{
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
        aria-label="Main navigation"
      >
        {/* ── Logo row ── */}
        <div
          className="flex items-center gap-2.5 px-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-hairline)', height: 56 }}
        >
          <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none min-w-0">
            <Logo
              variant={collapsed ? 'mark' : 'full'}
              size={24}
              animated
              wordmarkColor="var(--sidebar-text)"
            />
          </Link>
        </div>

        {/* ── Nav items ── */}
        <nav
          className="flex-1 py-3 overflow-y-auto"
          style={{ padding: collapsed ? '12px 8px' : '12px 8px' }}
          role="navigation"
          aria-label="App navigation"
        >
          <div className="space-y-0.5">
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
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer overflow-hidden',
                      isActive && 'nav-item-active',
                    )}
                    style={{
                      color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                      background: isActive ? 'var(--sidebar-hover)' : 'transparent',
                      transition: 'background 150ms, color 150ms',
                    }}
                    whileHover={isActive ? {} : { x: 2 }}
                    transition={{ duration: 0.1 }}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-bar"
                        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
                        style={{ background: 'var(--sidebar-text)' }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}

                    <Icon size={17} className="shrink-0" aria-hidden="true" />

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
          </div>
        </nav>

        {/* ── Collapse toggle ── */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute top-1/2 -right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-colors duration-150"
          style={{
            background: 'var(--bg-overlay)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-tertiary)',
            transform: 'translateY(-50%)',
            boxShadow: 'var(--shadow-sm)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight size={11} aria-hidden="true" />
            : <ChevronLeft  size={11} aria-hidden="true" />
          }
        </button>

        {/* ── Bottom disclaimer ── */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-3 border-t"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Flags anomalies for review.
                <br />Does not determine fraud.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Top bar: backdrop-blur 12px over charcoal-alpha, hairline bottom border ── */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-5 shrink-0"
          style={{ height: 56, background: 'var(--bg-base)' }}
          role="banner"
        >
          {/* Search / command palette trigger */}
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors duration-150 max-w-xs flex-1"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-tertiary)',
              border: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
            onClick={() => setCmdOpen(true)}
            aria-label="Open command palette (Ctrl+K)"
          >
            <Search size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Search or type a command…</span>
            <kbd
              className="ml-auto text-xs px-1.5 py-0.5 rounded hidden sm:inline-block"
              style={{
                background: 'var(--bg-subtle)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-hairline)',
              }}
              aria-label="Keyboard shortcut Ctrl+K"
            >
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Primary CTA */}
            <Link 
              to="/analyze" 
              className="inline-flex items-center justify-center gap-2 text-sm py-1.5 px-4 rounded-lg font-medium transition-transform hover:scale-[0.98] active:scale-95"
              style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
            >
              <Upload size={13} aria-hidden="true" />
              Upload
            </Link>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>

        <Disclaimer />
      </div>

      {/* ── Command Palette ────────────────────────────────────── */}
      <AnimatePresence>
        {cmdOpen && (
          <CommandPalette
            onClose={() => setCmdOpen(false)}
            onNavigate={(to) => { navigate(to); setCmdOpen(false) }}
            onToggleTheme={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
