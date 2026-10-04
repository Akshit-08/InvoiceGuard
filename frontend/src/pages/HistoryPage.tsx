import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  type Row,
} from '@tanstack/react-table'
import { Search, Download, ArrowUpDown, Upload, X } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { SkeletonCard, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import type { InvoiceListItem } from '@/api/types'

const columnHelper = createColumnHelper<InvoiceListItem>()

// ── Risk filter chips ──────────────────────────────────────────
const RISK_FILTERS = ['low', 'medium', 'high', 'critical'] as const
type RiskFilter = (typeof RISK_FILTERS)[number]

// ── Status pill ────────────────────────────────────────────────
function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status || status === 'pending') {
    return (
      <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12 }}>—</span>
    )
  }

  const map: Record<string, { bg: string; color: string; border: string }> = {
    needs_review: {
      bg: 'var(--risk-medium-bg)',
      color: 'var(--risk-medium-text)',
      border: 'var(--risk-medium-border)',
    },
    confirmed_issue: {
      bg: 'var(--risk-critical-bg)',
      color: 'var(--risk-critical-text)',
      border: 'var(--risk-critical-border)',
    },
    false_positive: {
      bg: 'var(--risk-info-bg)',
      color: 'var(--risk-info-text)',
      border: 'var(--risk-info-border)',
    },
    approved: {
      bg: 'var(--risk-low-bg)',
      color: 'var(--risk-low-text)',
      border: 'var(--risk-low-border)',
    },
  }

  const s = map[status] ?? map.false_positive

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 11,
        fontWeight: 500,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Hover-managed row ──────────────────────────────────────────
function HistoryRow({
  row,
  onClick,
}: {
  row: Row<InvoiceListItem>
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--border-hairline)',
        background: hovered ? 'var(--bg-overlay)' : 'transparent',
        transition: 'background 120ms',
        cursor: 'pointer',
      }}
    >
      {row.getVisibleCells().map(cell => (
        <td
          key={cell.id}
          style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)' }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function HistoryPage() {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  const [search, setSearch] = useState('')
  const [activeRisk, setActiveRisk] = useState<RiskFilter | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices-list'],
    queryFn: () => invoiceApi.list({ limit: 50 }),
  })

  const columns = useMemo(
    () => [
      columnHelper.accessor('invoice_number', {
        header: 'Invoice',
        cell: info => (
          <span
            style={{
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            {info.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor(row => row.vendor_name ?? row.vendor?.name, {
        id: 'vendor',
        header: 'Vendor',
        cell: info => (
          <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {info.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('invoice_date', {
        header: 'Date',
        cell: info => (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('grand_total', {
        header: 'Amount',
        cell: info => (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-primary)',
            }}
          >
            {formatCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('overall_score', {
        header: 'Risk',
        cell: info => {
          const score = info.getValue()
          if (score == null)
            return (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Pending
              </span>
            )
          return <RiskBadge level={scoreToLevel(score)} size="sm" />
        },
      }),
      columnHelper.accessor('review_status', {
        header: 'Status',
        cell: info => <StatusPill status={info.getValue()} />,
      }),
    ],
    [],
  )

  // Client-side filtering
  const allItems: InvoiceListItem[] = (data?.items as InvoiceListItem[]) ?? []
  const filtered = useMemo(() => {
    let result = allItems
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        item =>
          item.invoice_number?.toLowerCase().includes(q) ||
          (item.vendor_name ?? item.vendor?.name ?? '').toLowerCase().includes(q),
      )
    }
    if (activeRisk) {
      result = result.filter(item => scoreToLevel(item.overall_score ?? 0).toLowerCase() === activeRisk)
    }
    return result
  }, [allItems, search, activeRisk])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleExportCSV = () => {
    const headers = ['Invoice Number', 'Vendor', 'Date', 'Amount', 'Risk Score', 'Status']
    const csvRows = [
      headers.join(','),
      ...filtered.map(r =>
        [
          r.invoice_number ?? '',
          (r.vendor_name ?? r.vendor?.name ?? '').replace(/,/g, ' '),
          r.invoice_date ?? '',
          r.grand_total ?? '',
          r.overall_score ?? '',
          r.review_status ?? '',
        ].join(','),
      ),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'invoice-history.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasActiveFilters = Boolean(search || activeRisk)

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-5 h-full overflow-y-auto">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            History
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            All invoice analyses
          </p>
        </div>
        <button className="btn-ghost text-sm" onClick={handleExportCSV}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Search + filter chips ────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search input */}
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              type="text"
              placeholder="Search invoices…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-base w-full"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          {/* Risk level chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {RISK_FILTERS.map(r => {
              const active = activeRisk === r
              return (
                <button
                  key={r}
                  onClick={() => setActiveRisk(active ? null : r)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: `1px solid ${active ? `var(--risk-${r}-border)` : 'var(--border-default)'}`,
                    background: active ? `var(--risk-${r}-bg)` : 'transparent',
                    color: active ? `var(--risk-${r}-text)` : 'var(--text-tertiary)',
                    transition: 'all 120ms ease',
                    textTransform: 'capitalize',
                  }}
                >
                  {r}
                  {active && <X size={10} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Active filters:</span>
            {search && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'var(--accent-muted)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                &ldquo;{search}&rdquo;
                <button
                  onClick={() => setSearch('')}
                  style={{ cursor: 'pointer', lineHeight: 1, display: 'flex' }}
                  aria-label="Clear search"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {activeRisk && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'var(--accent-muted)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                Risk: {activeRisk}
                <button
                  onClick={() => setActiveRisk(null)}
                  style={{ cursor: 'pointer', lineHeight: 1, display: 'flex' }}
                  aria-label="Clear risk filter"
                >
                  <X size={10} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Table card ───────────────────────────────────────────── */}
      <div className="surface rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--risk-critical-text)' }}>
            Failed to load history
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description={
              hasActiveFilters
                ? 'Try adjusting or clearing your filters.'
                : 'Upload an invoice to get started.'
            }
            action={
              !hasActiveFilters
                ? { label: 'Upload Invoice', onClick: () => navigate('/analyze') }
                : undefined
            }
            icon={<Upload size={40} />}
          />
        ) : (
          <div className="flex-1 overflow-auto hide-scrollbar">
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead
                className="sticky top-0 z-10"
                style={{
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border-hairline)',
                }}
              >
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id}>
                    {hg.headers.map(header => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          padding: '10px 16px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {(
                            {
                              asc: (
                                <ArrowUpDown size={11} style={{ opacity: 1 }} />
                              ),
                              desc: (
                                <ArrowUpDown
                                  size={11}
                                  style={{ opacity: 1, transform: 'rotate(180deg)' }}
                                />
                              ),
                            } as Record<string, React.ReactNode>
                          )[header.column.getIsSorted() as string] ?? (
                            <ArrowUpDown size={11} style={{ opacity: 0.25 }} />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <HistoryRow
                    key={row.id}
                    row={row}
                    onClick={() => navigate(`/invoices/${row.original.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
