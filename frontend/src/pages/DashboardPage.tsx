import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { FileText, AlertTriangle, CheckCircle2, ShieldAlert, Upload, Activity, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

import { dashboardApi, invoiceApi } from '@/api/client'
import { KpiCard, ErrorState, SkeletonCard } from '@/components/ui'
import { RiskBadge } from '@/components/RiskBadge'
import { scoreToLevel, formatDate } from '@/lib/utils'

export default function DashboardPage() {
  const navigate = useNavigate()
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats(),
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (accepted) => {
      if (accepted[0]) {
        try {
          const res = await invoiceApi.upload(accepted[0])
          navigate(`/invoices/${res.invoice_id}`)
        } catch (e) {
          console.error('Upload failed', e)
        }
      }
    },
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
  })

  if (isLoading) return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <SkeletonCard className="h-24 w-full" />
      <div className="grid grid-cols-4 gap-4"><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /><SkeletonCard className="h-24" /></div>
      <div className="grid md:grid-cols-3 gap-6"><SkeletonCard className="h-64" /><SkeletonCard className="h-64 md:col-span-2" /></div>
    </div>
  )
  if (error || !data) return <ErrorState title="Failed to load dashboard" />

  const kpis = data.kpis || { total_invoices: 0, analyzed_count: 0, needs_review_count: 0, high_critical_count: 0, duplicate_alerts: 0 }
  const distribution = data.risk_distribution || { low: 0, medium: 0, high: 0, critical: 0 }
  const trend = data.trend || []
  const categories = data.anomaly_categories || data.categories || {}
  const recent_analyses = data.recent_analyses || []
  const top_vendors = data.top_vendors || []

  const pieData = [
    { name: 'Low', value: distribution.low || 0, color: 'var(--risk-low-text)' },
    { name: 'Medium', value: distribution.medium || 0, color: 'var(--risk-medium-text)' },
    { name: 'High', value: distribution.high || 0, color: 'var(--risk-high-text)' },
    { name: 'Critical', value: distribution.critical || 0, color: 'var(--risk-critical-text)' },
  ]
  
  const barData = Object.entries(categories)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const totalAnalyzed = kpis.analyzed_count ?? kpis.total_analyzed ?? kpis.total_invoices ?? 0
  const needsReview = kpis.needs_review_count ?? kpis.needs_review ?? 0
  const highCritical = kpis.high_critical_count ?? kpis.high_critical ?? 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Overview</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Invoice analysis and anomaly detection at a glance.</p>
        </div>
        
        {/* Compact Dropzone */}
        <div 
          {...getRootProps()}
          className="flex items-center gap-3 px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
          style={{
            borderColor: isDragActive ? 'var(--accent)' : 'var(--border-default)',
            background: isDragActive ? 'var(--accent-muted)' : 'var(--bg-surface)'
          }}
        >
          <input {...getInputProps()} />
          <Upload size={16} style={{ color: isDragActive ? 'var(--accent)' : 'var(--text-tertiary)' }} />
          <span className="text-sm font-medium">{isDragActive ? 'Drop here...' : 'Quick Upload'}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Invoices" value={totalAnalyzed} icon={FileText} />
        <KpiCard label="Total Volume" value={kpis.total_volume || 0} icon={CheckCircle2} format="currency" />
        <KpiCard label="Needs Review" value={needsReview} icon={AlertTriangle} delta={2} deltaLabel="new" />
        <KpiCard label="High & Critical" value={highCritical} icon={ShieldAlert} delta={-5} deltaLabel="vs last week" />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-3 gap-6 h-[300px]">
        {/* Risk Distribution */}
        <div className="surface p-6 flex flex-col rounded-2xl">
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Risk Distribution</h3>
          <div className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius="60%" outerRadius="80%" paddingAngle={2} dataKey="value">
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px', fontWeight: 500 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-mono">{totalAnalyzed}</span>
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="surface p-6 md:col-span-2 flex flex-col rounded-2xl">
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>30-Day Anomalies Trend</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend || []}>
                <defs>
                  <linearGradient id="colorAnomalies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--risk-high-text)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--risk-high-text)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="anomalies" stroke="var(--risk-high-text)" fillOpacity={1} fill="url(#colorAnomalies)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Bottom Row */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Categories Bar */}
        <div className="surface p-6 rounded-2xl flex flex-col">
          <h3 className="font-bold text-sm mb-4">Top Anomaly Categories</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }} />
                <Bar dataKey="value" fill="var(--risk-medium-text)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Top Suspicious Vendors */}
        <div className="surface p-6 rounded-2xl flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-sm">Suspicious Vendors</h3>
            <button className="text-xs flex items-center gap-1 text-accent hover:underline" onClick={() => navigate('/vendors')}>View all <ChevronRight size={12}/></button>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto pr-2">
            {(top_vendors || []).map((v: any) => (
              <div key={v.id} className="flex justify-between items-center border-b pb-2 last:border-0" style={{ borderColor: 'var(--border-hairline)' }}>
                <div className="truncate pr-4">
                  <p className="text-sm font-medium truncate">{v.name}</p>
                  <p className="text-xs opacity-50">{v.incidents} incidents</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                   <RiskBadge level={scoreToLevel(v.avg_score || 0)} size="sm" />
                </div>
              </div>
            ))}
            {!top_vendors?.length && <p className="text-xs text-center opacity-50 py-4">No suspicious vendors detected.</p>}
          </div>
        </div>

        {/* Recent Analyses Feed */}
        <div className="surface p-6 rounded-2xl flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-sm">Recent Analyses</h3>
            <button className="text-xs flex items-center gap-1 text-accent hover:underline" onClick={() => navigate('/history')}>History <ChevronRight size={12}/></button>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto pr-2">
            {(recent_analyses || []).map((inv: any) => (
              <div key={inv.id} className="flex items-start gap-3 cursor-pointer hover:bg-neutral-500/5 p-2 -mx-2 rounded-lg transition-colors" onClick={() => navigate(`/invoices/${inv.id}`)}>
                 <Activity size={16} className="shrink-0 mt-0.5 opacity-50" />
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.vendor_name || inv.invoice_number}</p>
                    <p className="text-xs opacity-50">{formatDate(inv.created_at)}</p>
                 </div>
                 <RiskBadge level={scoreToLevel(inv.overall_score || 0)} size="sm" />
              </div>
            ))}
            {!recent_analyses?.length && <p className="text-xs text-center opacity-50 py-4">No recent activity.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
