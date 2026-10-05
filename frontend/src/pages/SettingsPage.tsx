import { useState } from 'react'
import { Save, RotateCcw, AlertTriangle, ShieldCheck, Database } from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Slider from '@radix-ui/react-slider'
import { RiskGauge } from '@/components/RiskGauge'
import { scoreToLevel } from '@/lib/utils'
import { toast } from 'sonner'

export default function SettingsPage() {

  // Risk thresholds
  const [criticalThreshold, setCriticalThreshold] = useState(80)
  const [highThreshold, setHighThreshold] = useState(60)
  const [mediumThreshold, setMediumThreshold] = useState(30)

  // Demo seed
  const [demoSeed, setDemoSeed] = useState(42)
  const [confirmReset, setConfirmReset] = useState(false)

  // Engines
  const [engines, setEngines] = useState({
    financial: true,
    duplicate: true,
    vendor: true,
    visual: false,
  })

  const previewScore = 72

  const previewLabel =
    previewScore >= criticalThreshold ? 'Critical'
    : previewScore >= highThreshold   ? 'High'
    : previewScore >= mediumThreshold ? 'Medium'
    : 'Low'

  const previewVarPrefix =
    previewScore >= criticalThreshold ? 'critical'
    : previewScore >= highThreshold   ? 'high'
    : previewScore >= mediumThreshold ? 'medium'
    : 'low'

  const handleSave = () => {
    toast.success('Settings saved successfully')
  }

  const handleResetDefaults = () => {
    setCriticalThreshold(80)
    setHighThreshold(60)
    setMediumThreshold(30)
    setEngines({ financial: true, duplicate: true, vendor: true, visual: false })
    toast('Settings reset to defaults')
  }

  const handleResetDemoData = () => {
    setConfirmReset(false)
    toast.success('Demo data cleared')
  }

  // Engine metadata
  const engineMeta: Record<string, { label: string; description: string }> = {
    financial: { label: 'Financial Engine',  description: 'Validates amounts, tax calculations, and line-item totals.' },
    duplicate: { label: 'Duplicate Engine',  description: 'Detects near-duplicate invoices using field-level similarity.' },
    vendor:    { label: 'Vendor Engine',     description: 'Behavioural analysis across historical vendor patterns.' },
    visual:    { label: 'Visual Forensics',  description: 'Detects pixel-level tampering via ELA and metadata checks.' },
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Configure risk thresholds, detection engines, and appearance preferences.
        </p>
      </div>



      {/* ── 2. Risk Thresholds ── */}
      <div
        className="surface p-6 space-y-5 rounded-2xl"
        style={{ border: '1px solid var(--border-hairline)' }}
      >
        <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--sidebar-bg)' }} />
          Risk Thresholds
        </h3>

        <div className="grid md:grid-cols-[1fr_200px] gap-8 items-center">
          {/* Sliders */}
          <div className="space-y-5">
            {/* Critical */}
            <div>
              <div className="flex justify-between mb-2 text-sm">
                <span className="font-medium" style={{ color: 'var(--risk-critical-text)' }}>Critical</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{criticalThreshold}</span>
              </div>
              <Slider.Root
                className="relative flex items-center w-full h-5 touch-none"
                value={[criticalThreshold]}
                onValueChange={v => setCriticalThreshold(v[0])}
                max={100} step={1}
              >
                <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                  <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-critical-text)' }} />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-5 h-5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  style={{ background: 'var(--text-primary)' }}
                />
              </Slider.Root>
            </div>

            {/* High */}
            <div>
              <div className="flex justify-between mb-2 text-sm">
                <span className="font-medium" style={{ color: 'var(--risk-high-text)' }}>High</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{highThreshold}</span>
              </div>
              <Slider.Root
                className="relative flex items-center w-full h-5 touch-none"
                value={[highThreshold]}
                onValueChange={v => setHighThreshold(v[0])}
                max={100} step={1}
              >
                <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                  <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-high-text)' }} />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-5 h-5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  style={{ background: 'var(--text-primary)' }}
                />
              </Slider.Root>
            </div>

            {/* Medium */}
            <div>
              <div className="flex justify-between mb-2 text-sm">
                <span className="font-medium" style={{ color: 'var(--risk-medium-text)' }}>Medium</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{mediumThreshold}</span>
              </div>
              <Slider.Root
                className="relative flex items-center w-full h-5 touch-none"
                value={[mediumThreshold]}
                onValueChange={v => setMediumThreshold(v[0])}
                max={100} step={1}
              >
                <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                  <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-medium-text)' }} />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-5 h-5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  style={{ background: 'var(--text-primary)' }}
                />
              </Slider.Root>
            </div>
          </div>

          {/* Live gauge preview */}
          <div className="flex flex-col items-center gap-3">
            <RiskGauge score={previewScore} level={scoreToLevel(previewScore)} size={140} />
            <div className="text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Score <span className="font-bold font-mono">{previewScore}</span> →
              </p>
              <span
                className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{
                  background: `var(--risk-${previewVarPrefix}-bg)`,
                  color: `var(--risk-${previewVarPrefix}-text)`,
                  border: `1px solid var(--risk-${previewVarPrefix}-border)`,
                }}
              >
                {previewLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Detection Engines ── */}
      <div
        className="surface p-6 space-y-5 rounded-2xl"
        style={{ border: '1px solid var(--border-hairline)' }}
      >
        <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <ShieldCheck size={16} style={{ color: 'var(--sidebar-bg)' }} />
          Detection Engines
        </h3>

        <div className="space-y-4">
          {(Object.entries(engines) as [keyof typeof engines, boolean][]).map(([key, active]) => {
            const meta = engineMeta[key]
            return (
              <div key={key} className="flex justify-between items-center gap-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {meta.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {meta.description}
                  </p>
                </div>

                <Switch.Root
                  checked={active}
                  onCheckedChange={c => setEngines(prev => ({ ...prev, [key]: c }))}
                  className="w-[42px] h-[25px] rounded-full relative shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 shrink-0 transition-colors duration-200"
                  style={{
                    background: active ? 'var(--sidebar-bg)' : 'var(--bg-subtle)',
                    border: `1px solid ${active ? 'var(--sidebar-bg)' : 'var(--border-default)'}`,
                  }}
                >
                  <Switch.Thumb
                    className="block w-[19px] h-[19px] rounded-full transition-transform duration-200 shadow-sm"
                    style={{
                      background: active ? '#ffffff' : 'var(--text-primary)',
                      transform: active ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </Switch.Root>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 4. Demo & Reset ── */}
      <div
        className="surface p-6 space-y-5 rounded-2xl"
        style={{ border: '1px solid var(--border-hairline)' }}
      >
        <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Database size={16} style={{ color: 'var(--sidebar-bg)' }} />
          Demo & Reset
        </h3>

        {/* Demo seed */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Demo Seed</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Seed used for generating synthetic invoice data.
            </p>
          </div>
          <input
            type="number"
            value={demoSeed}
            onChange={e => setDemoSeed(Number(e.target.value))}
            className="bg-transparent rounded px-3 py-1.5 text-sm font-mono w-24 focus:outline-none transition-colors"
            style={{
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--sidebar-bg)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
          />
        </div>

        {/* Reset demo data with confirmation */}
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Reset Demo Data</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Clears all uploaded invoices and analysis results. This cannot be undone.
          </p>

          {confirmReset ? (
            <div
              className="p-3 rounded-xl"
              style={{
                background: 'var(--risk-critical-bg)',
                border: '1px solid var(--risk-critical-border)',
              }}
            >
              <p className="text-sm mb-3" style={{ color: 'var(--risk-critical-text)' }}>
                This will clear all invoice data. Are you sure?
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-primary text-sm"
                  style={{ background: 'var(--risk-critical-text)', color: 'var(--text-inverse)' }}
                  onClick={handleResetDemoData}
                >
                  Yes, reset
                </button>
                <button className="btn-ghost text-sm" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost text-sm" onClick={() => setConfirmReset(true)}>
              Reset demo data
            </button>
          )}
        </div>
      </div>

      {/* Save / Reset defaults */}
      <div className="flex gap-3 pt-2">
        <button className="btn-primary flex items-center gap-2" onClick={handleSave}>
          <Save size={15} />
          Save Changes
        </button>
        <button className="btn-ghost flex items-center gap-2" onClick={handleResetDefaults}>
          <RotateCcw size={15} />
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
