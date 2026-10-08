import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, ShieldAlert, CreditCard, Activity,
  Link as LinkIcon, BadgeAlert, FileText, TrendingUp,
} from 'lucide-react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Scatter, Cell } from 'recharts'

import { vendorApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { RiskBadge } from '@/components/RiskBadge'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import type { VendorProfile } from '@/api/types'

// ── Helpers ────────────────────────────────────────────────────

/** Monogram avatar seeded from vendor name (matches Dashboard pattern) */
function Monogram({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return (
    <div
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: 'var(--sidebar-bg)',
        color: 'var(--bg-base)',
      }}
      className="rounded-full flex items-center justify-center font-bold select-none shrink-0"
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

/** 7-bar decorative sparkline — heights seeded from vendor name */
function nameSeededBars(name: string): number[] {
  const seed = [...name].reduce((h, c) => h + c.charCodeAt(0), 0)
  return Array.from({ length: 7 }, (_, i) => ((seed * (i + 1) * 2654435761) >>> 0) % 60 + 20)
}

// ── VENDORS LIST VIEW ──────────────────────────────────────────

function VendorList() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorApi.list(),
  })

  const [search, setSearch] = useState('')

  const vendors = data?.items ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter(v =>
      v.name.toLowerCase().includes(q) ||
      (v.gstin ?? '').toLowerCase().includes(q)
    )
  }, [vendors, search])

  if (isLoading) return <div className="p-8"><SkeletonCard className="h-64" /></div>
  if (error) return <ErrorState title="Failed to load vendors" />

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Vendors</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Profiles, historical statistics, and behavioural analysis.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-8">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search vendors or GSTIN…"
          className="input-base w-full rounded-full transition-shadow hover:shadow-sm focus:shadow-md py-3 text-[15px]"
          style={{ paddingLeft: 42, background: '#EAE5DB', border: 'none', outline: 'none' }}
        />
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          No vendors match your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(vendor => {
            const bars = nameSeededBars(vendor.name)
            const barMax = Math.max(...bars)
            const avgScore = vendor.avg_risk_score ?? 0
            const level = scoreToLevel(avgScore)

            return (
              <button
                key={vendor.id}
                onClick={() => navigate(`/vendors/${vendor.id}`)}
                className="p-6 rounded-[32px] text-left cursor-pointer transition-all duration-150 group flex flex-col"
                style={{ background: '#F4EFE6', border: '1px solid var(--border-hairline)' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                aria-label={`View vendor ${vendor.name}`}
              >
                {/* Row 1: avatar + name + risk badge */}
                <div className="flex items-center gap-3 mb-2">
                  <Monogram name={vendor.name} size={32} />
                  <span className="font-semibold flex-1 truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                    {vendor.name}
                  </span>
                  <RiskBadge level={level} size="sm" />
                </div>

                {/* Row 2: GSTIN */}
                <p className="font-mono text-xs mb-3 truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {vendor.gstin || 'GSTIN N/A'}
                </p>

                {/* Row 3: Stats */}
                <div
                  className="flex items-center gap-3 text-xs mb-4"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>{vendor.invoice_count} invoices</span>
                  <span style={{ color: 'var(--border-default)' }}>·</span>
                  <span className="font-mono tabular-nums">{formatCurrency(vendor.total_volume)}</span>
                  <span style={{ color: 'var(--border-default)' }}>·</span>
                  <span>Avg: {avgScore}</span>
                </div>

                {/* Row 4: Mini sparkline */}
                <div className="flex items-end gap-0.5 h-6" aria-hidden="true">
                  {bars.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm transition-opacity duration-150"
                      style={{
                        height: `${(v / barMax) * 100}%`,
                        background: 'var(--accent-muted)',
                        border: '1px solid var(--accent-border)',
                        opacity: 0.7,
                      }}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── VENDOR PROFILE VIEW ────────────────────────────────────────

function VendorProfileView({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => vendorApi.get(id),
  })

  if (isLoading) return <div className="p-8"><SkeletonCard className="h-64" /></div>
  if (error || !data) return <ErrorState title="Vendor not found" />

  // Deterministic MAD timeline mock
  const madData = Array.from({ length: 12 }).map((_, i) => {
    const val = 1000 + Math.random() * 500
    const isAnomaly = i === 8 || i === 2
    const actual = isAnomaly ? val * (i === 8 ? 2.5 : 0.3) : val
    return { date: `M${i + 1}`, median: 1250, upper: 1750, lower: 750, actual, isAnomaly }
  })

  // KPI cards config
  const kpis = [
    {
      icon: <FileText size={15} />,
      label: 'Invoice Count',
      value: data.invoice_count,
      mono: true,
    },
    {
      icon: <TrendingUp size={15} />,
      label: 'Total Volume',
      value: formatCurrency(data.total_volume),
      mono: true,
    },
    {
      icon: <Activity size={15} />,
      label: 'Avg Risk Score',
      value: data.avg_risk_score ?? 0,
      mono: true,
      accent: true,
    },
    {
      icon: <CreditCard size={15} />,
      label: 'Known Accounts',
      value: data.known_accounts?.length ?? 0,
      mono: true,
    },
  ]

  // "NEW" account heuristic: invoice_count === 1
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  function isNewAccount(acc: VendorProfile['known_accounts'] extends Array<infer T> | undefined ? T : never) {
    if (acc.invoice_count === 1) return true
    if (acc.first_seen) {
      const d = new Date(acc.first_seen)
      return d > thirtyDaysAgo
    }
    return false
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Hero header */}
      <div
        className="surface p-6 rounded-2xl flex flex-wrap items-start justify-between gap-4"
        style={{ border: '1px solid var(--border-hairline)' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Monogram name={data.name} size={36} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{data.name}</h1>
          </div>
          <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            GSTIN: {data.gstin || '—'}
          </p>
        </div>

        {data.avg_risk_score != null && data.avg_risk_score > 60 && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--risk-high-bg)', border: '1px solid var(--risk-high-border)' }}
          >
            <ShieldAlert size={18} style={{ color: 'var(--risk-high-text)' }} />
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--risk-high-text)' }}>Elevated Risk Profile</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--risk-high-text)', opacity: 0.8 }}>
                Score: {data.avg_risk_score}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ icon, label, value, mono, accent }) => (
          <div
            key={label}
            className="surface p-4 rounded-xl"
            style={{ border: '1px solid var(--border-hairline)' }}
          >
            <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
            </div>
            <p
              className={mono ? 'text-lg font-bold font-mono tabular-nums' : 'text-lg font-bold'}
              style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              {String(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Accounts + Timeline */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Known accounts */}
        <div
          className="surface p-6 rounded-2xl md:col-span-1 space-y-6"
          style={{ border: '1px solid var(--border-hairline)' }}
        >
          <div>
            <h3
              className="font-bold mb-4 flex items-center gap-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              <CreditCard size={15} style={{ color: 'var(--accent)' }} />
              Known Bank Accounts
            </h3>

            {data.known_accounts && data.known_accounts.length > 0 ? (
              <div className="space-y-0">
                {data.known_accounts.map((acc, i) => {
                  const newAcc = isNewAccount(acc)
                  return (
                    <div
                      key={i}
                      className="py-3 text-sm"
                      style={{
                        borderBottom: i < data.known_accounts!.length - 1
                          ? '1px solid var(--border-hairline)'
                          : 'none',
                      }}
                    >
                      {/* Account number + NEW badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                          XXXXXX{acc.last4}
                        </span>
                        {newAcc && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
                            style={{
                              background: 'var(--risk-medium-bg)',
                              color: 'var(--risk-medium-text)',
                              border: '1px solid var(--risk-medium-border)',
                            }}
                          >
                            New
                          </span>
                        )}
                      </div>

                      {/* Bank + IFSC */}
                      {(acc.bank_name || acc.ifsc) && (
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                          {acc.bank_name && <span>{acc.bank_name}</span>}
                          {acc.bank_name && acc.ifsc && <span> · </span>}
                          {acc.ifsc && <span className="font-mono">{acc.ifsc}</span>}
                        </p>
                      )}

                      {/* First / Last seen */}
                      <div className="flex gap-3 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {acc.first_seen && (
                          <span>First: <span className="font-mono">{formatDate(acc.first_seen)}</span></span>
                        )}
                        {acc.last_seen && (
                          <span>Last: <span className="font-mono">{formatDate(acc.last_seen)}</span></span>
                        )}
                        {acc.invoice_count != null && !acc.first_seen && (
                          <span>Seen {acc.invoice_count}×</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                No accounts on record
              </p>
            )}
          </div>

          {/* Linked entities */}
          <div>
            <h3
              className="font-bold mb-3 flex items-center gap-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              <LinkIcon size={15} style={{ color: 'var(--accent)' }} />
              Linked Entities
            </h3>
            <div
              className="p-3 rounded-lg text-sm text-center"
              style={{ border: '1px solid var(--border-default)' }}
            >
              <BadgeAlert size={22} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>2 vendors share same PAN</p>
              <button
                className="text-xs mt-2 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                View Linkages
              </button>
            </div>
          </div>
        </div>

        {/* Amount timeline (MAD band) */}
        <div
          className="surface p-6 rounded-2xl md:col-span-2 flex flex-col"
          style={{ border: '1px solid var(--border-hairline)' }}
        >
          <h3
            className="font-bold mb-2 flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            <Activity size={15} style={{ color: 'var(--accent)' }} />
            Invoice Amount Timeline (MAD)
          </h3>
          <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
            Shaded region = median ± 2 MAD. Points outside are flagged as anomalous.
          </p>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={madData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => `₹${v / 1000}k`}
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
                <Area type="step" dataKey="upper" stroke="none" fill="var(--bg-subtle)" />
                <Area type="step" dataKey="lower" stroke="none" fill="var(--bg-surface)" />
                <Line
                  type="step"
                  dataKey="median"
                  stroke="var(--chart-grid)"
                  strokeDasharray="4 3"
                  dot={false}
                />
                <Scatter dataKey="actual">
                  {madData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isAnomaly ? 'var(--risk-high-text)' : 'var(--accent)'}
                    />
                  ))}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Route switcher ─────────────────────────────────────────────

export default function VendorsPage() {
  const { id } = useParams<{ id?: string }>()
  return id ? <VendorProfileView id={id} /> : <VendorList />
}
