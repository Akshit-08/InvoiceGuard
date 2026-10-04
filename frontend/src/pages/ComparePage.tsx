import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

// ── Diff helpers ───────────────────────────────────────────────
interface DeltaResult {
  text: string
  severity: 'medium' | 'high'
}

function getDelta(
  valA: unknown,
  valB: unknown,
  type?: string,
): DeltaResult | null {
  if (valA === valB) return null
  if (type === 'currency' && typeof valA === 'number' && typeof valB === 'number') {
    const diff = valB - valA
    const pct = valA !== 0 ? Math.abs(diff / valA) : 1
    return {
      text: `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`,
      severity: pct > 0.5 ? 'high' : 'medium',
    }
  }
  return { text: 'Modified', severity: 'medium' }
}

// ── Cell styles ────────────────────────────────────────────────
const tdBase: React.CSSProperties = {
  padding: '11px 16px',
  fontSize: 13,
  borderBottom: '1px solid var(--border-hairline)',
  verticalAlign: 'middle',
}

const thBase: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-tertiary)',
  background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border-hairline)',
}

// ── Page ───────────────────────────────────────────────────────
export default function ComparePage() {
  const { a, b } = useParams<{ a: string; b: string }>()
  const navigate = useNavigate()

  const { data: invA, isLoading: loadA } = useQuery({
    queryKey: ['invoice', a],
    queryFn: () => invoiceApi.get(a!),
    enabled: !!a,
  })

  const { data: invB, isLoading: loadB } = useQuery({
    queryKey: ['invoice', b],
    queryFn: () => invoiceApi.get(b!),
    enabled: !!b,
  })

  if (loadA || loadB) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-96" />
      </div>
    )
  }

  if (!invA || !invB) {
    return <ErrorState title="Invoices not found" />
  }

  const fields: Array<{
    label: string
    key: string
    a: unknown
    b: unknown
    type?: string
  }> = [
    {
      label: 'Invoice Number',
      key: 'invoice_number',
      a: invA.data?.invoice_number?.value,
      b: invB.data?.invoice_number?.value,
    },
    {
      label: 'Date',
      key: 'invoice_date',
      a: invA.data?.invoice_date?.value,
      b: invB.data?.invoice_date?.value,
    },
    {
      label: 'Vendor',
      key: 'vendor.name',
      a: invA.data?.vendor?.name?.value,
      b: invB.data?.vendor?.name?.value,
    },
    {
      label: 'Subtotal',
      key: 'subtotal',
      a: invA.data?.subtotal?.value,
      b: invB.data?.subtotal?.value,
      type: 'currency',
    },
    {
      label: 'Tax Total',
      key: 'tax.total',
      a: invA.data?.tax?.total?.value,
      b: invB.data?.tax?.total?.value,
      type: 'currency',
    },
    {
      label: 'Grand Total',
      key: 'grand_total',
      a: invA.data?.grand_total?.value,
      b: invB.data?.grand_total?.value,
      type: 'currency',
    },
    {
      label: 'Bank Name',
      key: 'payment.bank_name',
      a: invA.data?.payment?.bank_name?.value,
      b: invB.data?.payment?.bank_name?.value,
    },
    {
      label: 'Account No.',
      key: 'payment.account_number',
      a: invA.data?.payment?.account_number?.value,
      b: invB.data?.payment?.account_number?.value,
    },
    {
      label: 'IFSC',
      key: 'payment.ifsc',
      a: invA.data?.payment?.ifsc?.value,
      b: invB.data?.payment?.ifsc?.value,
    },
  ]

  const changedCount = fields.filter(f => getDelta(f.a, f.b, f.type) !== null).length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          className="btn-ghost"
          style={{ padding: '0.4rem', minWidth: 0 }}
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Compare Invoices
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {changedCount === 0
              ? 'No differences found between these invoices.'
              : `${changedCount} field${changedCount !== 1 ? 's' : ''} differ between `}
            {changedCount > 0 && (
              <>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {invA.invoice_number ?? a?.slice(0, 8)}
                </span>{' '}
                and{' '}
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {invB.invoice_number ?? b?.slice(0, 8)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Diff table ──────────────────────────────────────────── */}
      <div className="surface rounded-2xl overflow-hidden">
        {/* Column headers */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: '180px 1fr 1fr',
            background: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-hairline)',
          }}
        >
          {/* Field label column header */}
          <div style={{ ...thBase, background: 'transparent' }}>Field</div>

          {/* Invoice A header */}
          <div
            style={{
              ...thBase,
              background: 'transparent',
              borderLeft: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>Invoice A</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
              onClick={() => navigate(`/invoices/${invA.id}`)}
            >
              <FileText size={11} />
              {invA.invoice_number ?? invA.id.slice(0, 8)}
            </button>
          </div>

          {/* Invoice B header */}
          <div
            style={{
              ...thBase,
              background: 'transparent',
              borderLeft: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>Invoice B</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
              onClick={() => navigate(`/invoices/${invB.id}`)}
            >
              <FileText size={11} />
              {invB.invoice_number ?? invB.id.slice(0, 8)}
            </button>
          </div>
        </div>

        {/* Diff rows */}
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {fields.map(f => {
              const delta = getDelta(f.a, f.b, f.type)
              const changed = delta !== null
              const riskKey = changed
                ? delta!.severity === 'high'
                  ? 'risk-high'
                  : 'risk-medium'
                : null

              const formatVal = (v: unknown) =>
                f.type === 'currency'
                  ? formatCurrency(v as number)
                  : (v?.toString() ?? '—')

              return (
                <tr key={f.key}>
                  {/* Field name */}
                  <td
                    style={{
                      ...tdBase,
                      width: 180,
                      color: 'var(--text-tertiary)',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {f.label}
                  </td>

                  {/* Invoice A value */}
                  <td
                    style={{
                      ...tdBase,
                      borderLeft: '1px solid var(--border-hairline)',
                      color: changed ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      opacity: changed ? 0.6 : 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: f.type === 'currency' ? 'var(--font-mono)' : undefined,
                        textDecoration: changed ? 'line-through' : undefined,
                      }}
                    >
                      {formatVal(f.a)}
                    </span>
                  </td>

                  {/* Invoice B value — highlighted when changed */}
                  <td
                    style={{
                      ...tdBase,
                      borderLeft: changed
                        ? `2px solid var(--${riskKey}-text)`
                        : '1px solid var(--border-hairline)',
                      background: changed ? `var(--${riskKey}-bg)` : 'transparent',
                      color: changed ? `var(--${riskKey}-text)` : 'var(--text-primary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: f.type === 'currency' ? 'var(--font-mono)' : undefined,
                          fontWeight: changed ? 600 : 400,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatVal(f.b)}
                      </span>

                      {/* Delta chip */}
                      {delta && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 10,
                            fontWeight: 700,
                            background: `var(--${riskKey}-bg)`,
                            color: `var(--${riskKey}-text)`,
                            border: `1px solid var(--${riskKey}-border)`,
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {delta.text}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
