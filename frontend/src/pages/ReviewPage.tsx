import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, AlertTriangle, MousePointerClick } from 'lucide-react'
import { toast } from 'sonner'

import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { ErrorState } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import type { InvoiceListItem, ReviewStatus } from '@/api/types'

// ── Helpers ────────────────────────────────────────────────────
function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: 'var(--radius-md)',
        background: 'var(--sidebar-bg)',
        color: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: '0.02em',
      }}
    >
      {initials}
    </div>
  )
}

// ── Queue item card ────────────────────────────────────────────
function QueueItem({
  item,
  selected,
  onClick,
}: {
  item: InvoiceListItem
  selected: boolean
  onClick: () => void
}) {
  const vendorName = item.vendor?.name ?? item.vendor_name ?? 'Unknown Vendor'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 12,
        padding: 16,
        borderRadius: 24,
        border: selected ? '1px solid var(--sidebar-bg)' : '1px solid var(--border-hairline)',
        background: selected ? '#EAE5DB' : '#F4EFE6',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 120ms ease',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Monogram name={vendorName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {vendorName}
          </p>
          <RiskBadge level={scoreToLevel(item.overall_score ?? 0)} size="sm" />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 4,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>{item.invoice_number ?? '—'}</span>
          <span>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(item.grand_total)}
          </span>
          <span>·</span>
          <span>{formatDate(item.invoice_date)}</span>
        </div>
      </div>
    </button>
  )
}

// ── Keyboard hint badge ────────────────────────────────────────
function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        opacity: 0.5,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        padding: '1px 5px',
        marginLeft: 6,
      }}
    >
      {children}
    </kbd>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function ReviewPage() {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => invoiceApi.list({ status: 'needs_review', limit: 20 }),
  })

  const items = data?.items ?? []
  const selectedItem = items[selectedIndex] as InvoiceListItem | undefined

  const handleAction = async (id: string, status: ReviewStatus) => {
    const labels: Record<string, string> = {
      confirmed_issue: 'Confirmed issue',
      false_positive: 'Marked as false positive',
      approved: 'Approved',
    }
    try {
      await invoiceApi.review(id, status)
      if (selectedIndex >= items.length - 1) {
        setSelectedIndex(Math.max(0, items.length - 2))
      }
      refetch()
      toast.success(labels[status] ?? 'Done', {
        action: {
          label: 'Undo',
          onClick: () => invoiceApi.review(id, 'needs_review'),
        },
      })
    } catch (e) {
      console.error(e)
      toast.error('Action failed. Please try again.')
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!items.length) return

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      )
        return

      switch (e.key.toLowerCase()) {
        case 'j':
          setSelectedIndex(prev => Math.min(prev + 1, items.length - 1))
          break
        case 'k':
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'c':
          if (selectedItem) await handleAction(selectedItem.id, 'confirmed_issue')
          break
        case 'f':
          if (selectedItem) await handleAction(selectedItem.id, 'false_positive')
          break
        case 'a':
          if (selectedItem) await handleAction(selectedItem.id, 'approved')
          break
        case 'enter':
          if (selectedItem) navigate(`/invoices/${selectedItem.id}`)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedIndex, navigate, selectedItem])

  if (isLoading)
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Loading queue…
      </div>
    )
  if (error) return <ErrorState title="Failed to load queue" />

  if (items.length === 0) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--bg-subtle)' }}
        >
          <CheckCircle2 size={32} style={{ color: 'var(--risk-low-text)' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Inbox Zero
        </h2>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>
          There are no invoices waiting for manual review. Take a break!
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-5 h-full overflow-y-auto">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Review Queue
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Keyboard:&nbsp;
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move&nbsp;·&nbsp;
          <Kbd>c</Kbd> confirm&nbsp;·&nbsp;
          <Kbd>f</Kbd> false-positive&nbsp;·&nbsp;
          <Kbd>a</Kbd> approve&nbsp;·&nbsp;
          <Kbd>Enter</Kbd> open
        </p>
      </div>

      {/* ── Two-column layout ────────────────────────────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Queue list */}
        <div
          className="flex flex-col gap-2 overflow-y-auto hide-scrollbar shrink-0"
          style={{ width: 320 }}
        >
          {items.map((item, i) => (
            <QueueItem
              key={item.id}
              item={item}
              selected={i === selectedIndex}
              onClick={() => setSelectedIndex(i)}
            />
          ))}

          {/* Count badge */}
          <p
            className="text-center mt-1"
            style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
          >
            {items.length} item{items.length !== 1 ? 's' : ''} pending
          </p>
        </div>

        {/* ── Detail pane ─────────────────────────────────────────── */}
        {selectedItem && (
          <div
            className="surface flex-1 flex flex-col overflow-hidden"
            style={{ borderRadius: 'var(--radius-lg)' }}
          >
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="p-6 rounded-[24px] space-y-6" style={{ background: '#EAE5DB', border: '1px solid var(--border-hairline)' }}>
                  <div className="flex justify-between items-start gap-4">
                  <div className="flex gap-3 items-start">
                    <Monogram
                      name={
                        selectedItem.vendor?.name ?? selectedItem.vendor_name ?? 'Unknown'
                      }
                    />
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {selectedItem.vendor?.name ?? selectedItem.vendor_name ?? '—'}
                      </h2>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Invoice{' '}
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {selectedItem.invoice_number}
                        </span>{' '}
                        · {formatDate(selectedItem.invoice_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="text-2xl font-bold"
                      style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}
                    >
                      {formatCurrency(selectedItem.grand_total)}
                    </p>
                    <div className="mt-2 flex justify-end">
                      <RiskBadge level={scoreToLevel(selectedItem.overall_score ?? 0)} size="md" />
                    </div>
                  </div>
                </div>

                {/* Evidence snippet */}
                <div
                  className="p-5 rounded-2xl"
                  style={{
                    border: '1px solid var(--risk-high-border)',
                    background: 'var(--risk-high-bg)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className="shrink-0 mt-0.5"
                      style={{ color: 'var(--risk-high-text)' }}
                    />
                    <div>
                      <h3
                        className="font-bold text-sm"
                        style={{ color: 'var(--risk-high-text)' }}
                      >
                        Primary Anomalies
                      </h3>
                      <ul
                        className="text-sm mt-2 space-y-1.5"
                        style={{ color: 'var(--risk-high-text)' }}
                      >
                        <li>• Bank account details changed vs vendor history.</li>
                        <li>• Amount is 3.5× higher than median.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                </div>

                <div className="flex justify-center mb-4">
                  <button
                    onClick={() => navigate(`/invoices/${selectedItem.id}`)}
                    className="btn-ghost"
                    style={{ color: 'var(--sidebar-bg)' }}
                  >
                    <MousePointerClick size={16} /> Open Full Analysis
                  </button>
                </div>

                {/* ── Action boxes ────────────────────────────────────────── */}
                <div className="flex justify-center gap-4 flex-wrap pb-6">
                  <button
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl transition-transform hover:-translate-y-0.5 shadow-sm hover:shadow"
                    style={{ border: '1px solid var(--border-default)', background: '#F4EFE6', color: 'var(--text-primary)' }}
                    onClick={() => handleAction(selectedItem.id, 'false_positive')}
                    title="Shortcut: f"
                  >
                    <XCircle size={16} /> <span className="font-semibold text-sm">False positive</span> <Kbd>F</Kbd>
                  </button>
                  <button
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl transition-transform hover:-translate-y-0.5 shadow-sm hover:shadow"
                    style={{ border: '1px solid var(--risk-low-border)', background: 'var(--risk-low-bg)', color: 'var(--risk-low-text)' }}
                    onClick={() => handleAction(selectedItem.id, 'approved')}
                    title="Shortcut: a"
                  >
                    <CheckCircle2 size={16} /> <span className="font-semibold text-sm">Approve</span> <Kbd>A</Kbd>
                  </button>
                  <button
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl transition-transform hover:-translate-y-0.5 shadow-sm hover:shadow"
                    style={{ border: '1px solid var(--risk-critical-border)', background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)' }}
                    onClick={() => handleAction(selectedItem.id, 'confirmed_issue')}
                    title="Shortcut: c"
                  >
                    <AlertTriangle size={16} /> <span className="font-semibold text-sm">Confirm issue</span> <Kbd>C</Kbd>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
