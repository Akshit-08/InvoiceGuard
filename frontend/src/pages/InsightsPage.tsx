import { useQuery } from '@tanstack/react-query'
import { Activity, Zap, Target, ShieldCheck, Info } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { systemApi } from '@/api/client'
import { KpiCard, ErrorState } from '@/components/ui'

export default function InsightsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['model-metrics'],
    queryFn: () => systemApi.metrics(),
  })

  if (isLoading) return <div className="p-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading model insights...</div>
  if (error || !data) return <ErrorState title="Failed to load model metrics" />

  const { roc_auc, pr_auc, f1, latency_p50_ms, latency_p95_ms } = data

  const ablationData = [
    { name: 'Baseline (Rules)', auc: 0.516 },
    { name: 'Combined (Rules + ML)', auc: roc_auc },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Model Insights</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Live evaluation metrics, performance, and explainability of the detection engines.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="F1 Score" value={(f1 * 100).toFixed(1) + '%'} icon={<Target size={16} />} />
        <KpiCard title="ROC AUC" value={roc_auc.toFixed(3)} icon={<Activity size={16} />} />
        <KpiCard title="PR AUC" value={pr_auc.toFixed(3)} icon={<ShieldCheck size={16} />} />
        <KpiCard title="Latency p95" value={`${latency_p95_ms} ms`} icon={<Zap size={16} />} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Ablation Chart */}
        <div className="surface p-6 flex flex-col">
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Ablation: Baseline vs ML Fusion (ROC AUC)</h3>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ablationData} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" domain={[0, 1]} hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'var(--bg-subtle)' }}
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }}
                />
                <Bar dataKey="auc" radius={[0, 4, 4, 0]} barSize={24}>
                  {ablationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 1 ? 'var(--accent)' : 'var(--text-tertiary)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Limitations & Dataset */}
        <div className="space-y-6">
          <div className="surface p-6">
            <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>Synthetic Dataset</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              The model was evaluated on a deterministic synthetic dataset containing 800 invoices (300 genuine, 300 tampered, 200 visual pairs). It spans 5 templates and 45 vendors.
            </p>
          </div>
          
          <div className="surface p-6 border" style={{ borderColor: 'var(--risk-medium-border)', background: 'var(--risk-medium-bg)' }}>
            <h3 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--risk-medium-text)' }}>
              <Info size={16} /> Known Limitations
            </h3>
            <ul className="text-sm space-y-2" style={{ color: 'var(--risk-medium-text)' }}>
              <li>• Synthetic evaluation metrics are optimistic compared to real-world performance.</li>
              <li>• Visual forensics CNN relies on patch-pairs; it may flag benign re-saves.</li>
              <li>• The vendor isolation forest requires at least 5 invoices to establish a baseline.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
