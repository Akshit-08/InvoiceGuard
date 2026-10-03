import { useQuery } from '@tanstack/react-query'
import { FileText, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

import { dashboardApi } from '@/api/client'
import { KpiCard, ErrorState } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats(),
  })

  if (isLoading) return <div className="p-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading dashboard...</div>
  if (error || !data) return <ErrorState title="Failed to load dashboard" />

  const { kpis, distribution, trend } = data

  const pieData = [
    { name: 'Low', value: distribution.low, color: 'var(--risk-low-text)' },
    { name: 'Medium', value: distribution.medium, color: 'var(--risk-medium-text)' },
    { name: 'High', value: distribution.high, color: 'var(--risk-high-text)' },
    { name: 'Critical', value: distribution.critical, color: 'var(--risk-critical-text)' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Overview</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Invoice analysis and anomaly detection at a glance.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Total Invoices" value={kpis.total_analyzed} icon={<FileText size={16} />} />
        <KpiCard title="Total Volume" value={formatCurrency(kpis.total_volume)} icon={<CheckCircle2 size={16} />} />
        <KpiCard title="Needs Review" value={kpis.needs_review} icon={<AlertTriangle size={16} />} trend="+2" />
        <KpiCard title="High & Critical" value={kpis.high_critical} icon={<ShieldAlert size={16} />} trend="-5%" />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-3 gap-6 h-[300px]">
        {/* Risk Distribution */}
        <div className="surface p-6 flex flex-col">
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Risk Distribution</h3>
          <div className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius="60%"
                  outerRadius="80%"
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-mono">{kpis.total_analyzed}</span>
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="surface p-6 md:col-span-2 flex flex-col">
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>30-Day Anomalies Trend</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="colorAnomalies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="anomalies" stroke="var(--accent)" fillOpacity={1} fill="url(#colorAnomalies)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
