import { useState } from 'react'
import { Settings, Save, RotateCcw, Monitor, Moon, Sun, AlertTriangle, ShieldCheck } from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Slider from '@radix-ui/react-slider'
import { useTheme } from '@/hooks/useTheme'
import { RiskGauge } from '@/components/RiskGauge'
import { scoreToLevel } from '@/lib/utils'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [criticalThreshold, setCriticalThreshold] = useState(80)
  const [highThreshold, setHighThreshold] = useState(60)
  const [mediumThreshold, setMediumThreshold] = useState(30)
  const [demoSeed, setDemoSeed] = useState(42)

  const [engines, setEngines] = useState({
    financial: true,
    duplicate: true,
    vendor: true,
    visual: false,
  })

  const previewScore = 72

  const handleSave = () => {
    toast.success('Settings saved successfully')
  }

  const handleReset = () => {
    setCriticalThreshold(80)
    setHighThreshold(60)
    setMediumThreshold(30)
    setEngines({ financial: true, duplicate: true, vendor: true, visual: false })
    toast('Settings reset to defaults')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
      <div className="flex-1 space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Configure risk thresholds, engines, and appearance.</p>
        </div>

        {/* Thresholds */}
        <div className="surface p-6 rounded-2xl space-y-6">
          <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={18} className="text-accent" /> Risk Thresholds</h3>
          
          <div>
            <div className="flex justify-between mb-2 text-sm">
              <span className="font-medium">Critical</span>
              <span className="font-mono">{criticalThreshold}</span>
            </div>
            <Slider.Root className="relative flex items-center w-full h-5 touch-none" value={[criticalThreshold]} onValueChange={(v) => setCriticalThreshold(v[0])} max={100} step={1}>
              <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-critical-text)' }} />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ background: 'var(--text-primary)' }} />
            </Slider.Root>
          </div>

          <div>
            <div className="flex justify-between mb-2 text-sm">
              <span className="font-medium">High</span>
              <span className="font-mono">{highThreshold}</span>
            </div>
            <Slider.Root className="relative flex items-center w-full h-5 touch-none" value={[highThreshold]} onValueChange={(v) => setHighThreshold(v[0])} max={100} step={1}>
              <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-high-text)' }} />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 rounded-full shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ background: 'var(--text-primary)' }} />
            </Slider.Root>
          </div>

          <div>
            <div className="flex justify-between mb-2 text-sm">
              <span className="font-medium">Medium</span>
              <span className="font-mono">{mediumThreshold}</span>
            </div>
            <Slider.Root className="relative flex items-center w-full h-5 touch-none" value={[mediumThreshold]} onValueChange={(v) => setMediumThreshold(v[0])} max={100} step={1}>
              <Slider.Track className="relative grow rounded-full h-[4px]" style={{ background: 'var(--bg-subtle)' }}>
                <Slider.Range className="absolute rounded-full h-full" style={{ background: 'var(--risk-medium-text)' }} />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 rounded-full shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ background: 'var(--text-primary)' }} />
            </Slider.Root>
          </div>
        </div>

        {/* Engine Toggles */}
        <div className="surface p-6 rounded-2xl space-y-6">
          <h3 className="font-bold flex items-center gap-2"><ShieldCheck size={18} className="text-accent" /> Analysis Engines</h3>
          <div className="space-y-4">
            {Object.entries(engines).map(([key, active]) => (
              <div key={key} className="flex justify-between items-center">
                <div className="text-sm">
                  <p className="font-medium capitalize">{key} Engine</p>
                  <p className="text-xs opacity-60">Run {key} validation on each invoice.</p>
                </div>
                <Switch.Root 
                  checked={active}
                  onCheckedChange={(c) => setEngines(prev => ({ ...prev, [key]: c }))}
                  className={`w-[42px] h-[25px] bg-black/30 dark:bg-white/10 rounded-full relative shadow-inner focus:outline-none focus:ring-2 focus:ring-accent ${active ? 'bg-accent/80 dark:bg-accent' : ''}`}
                >
                  <Switch.Thumb className={`block w-[21px] h-[21px] bg-white rounded-full transition-transform transform translate-x-[2px] ${active ? 'translate-x-[19px]' : ''}`} />
                </Switch.Root>
              </div>
            ))}
          </div>
        </div>

        {/* Appearance & Demo */}
        <div className="surface p-6 rounded-2xl space-y-6">
          <h3 className="font-bold flex items-center gap-2"><Settings size={18} className="text-accent" /> System Preferences</h3>
          
          <div className="flex justify-between items-center">
            <div className="text-sm">
              <p className="font-medium">Theme</p>
              <p className="text-xs opacity-60">Select your preferred color scheme.</p>
            </div>
            <div className="flex bg-subtle p-1 rounded-lg">
              <button onClick={() => setTheme('light')} className={`p-1.5 rounded ${theme === 'light' ? 'bg-surface shadow' : 'opacity-50'}`}><Sun size={14} /></button>
              <button onClick={() => setTheme('dark')} className={`p-1.5 rounded ${theme === 'dark' ? 'bg-surface shadow' : 'opacity-50'}`}><Moon size={14} /></button>
              <button onClick={() => setTheme('system')} className={`p-1.5 rounded ${theme === 'system' ? 'bg-surface shadow' : 'opacity-50'}`}><Monitor size={14} /></button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm">
              <p className="font-medium">Demo Seed</p>
              <p className="text-xs opacity-60">Seed for generating synthetic data.</p>
            </div>
            <input type="number" value={demoSeed} onChange={(e) => setDemoSeed(Number(e.target.value))} className="bg-transparent border rounded px-3 py-1 text-sm font-mono w-24 focus:outline-none focus:border-accent" style={{ borderColor: 'var(--border-default)' }} />
          </div>
        </div>

        <div className="flex gap-4">
          <button className="btn-primary" onClick={handleSave}><Save size={16} /> Save Changes</button>
          <button className="btn-ghost" onClick={handleReset}><RotateCcw size={16} /> Reset</button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="w-full lg:w-[350px] shrink-0">
        <div className="sticky top-24 surface p-6 rounded-2xl flex flex-col items-center text-center">
          <h3 className="font-bold text-sm w-full text-left mb-6 uppercase tracking-wider opacity-60">Live Preview</h3>
          <RiskGauge score={previewScore} level={scoreToLevel(previewScore)} size={180} />
          <p className="text-sm mt-6 mb-2">
            A score of <span className="font-bold font-mono">{previewScore}</span> is classified as:
          </p>
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" 
            style={{ 
              background: previewScore >= criticalThreshold ? 'var(--risk-critical-bg)' : previewScore >= highThreshold ? 'var(--risk-high-bg)' : previewScore >= mediumThreshold ? 'var(--risk-medium-bg)' : 'var(--risk-low-bg)',
              color: previewScore >= criticalThreshold ? 'var(--risk-critical-text)' : previewScore >= highThreshold ? 'var(--risk-high-text)' : previewScore >= mediumThreshold ? 'var(--risk-medium-text)' : 'var(--risk-low-text)'
            }}
          >
            {previewScore >= criticalThreshold ? 'Critical' : previewScore >= highThreshold ? 'High' : previewScore >= mediumThreshold ? 'Medium' : 'Low'}
          </span>
          <p className="text-xs mt-6 opacity-50">
            Adjusting thresholds will immediately change how future and past invoices are classified.
          </p>
        </div>
      </div>
    </div>
  )
}
