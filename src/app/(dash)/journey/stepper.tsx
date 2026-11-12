import type { Step } from '@/lib/journey'

const STEPS: { key: Step | 'product'; label: string; hint: string }[] = [
  { key: 'product', label: 'Product', hint: 'Its website' },
  { key: 'research', label: 'Research', hint: 'AI reads the site' },
  { key: 'channels', label: 'Channels', hint: 'Where to post' },
  { key: 'plan', label: 'Plan', hint: 'Agree on 4 weeks' },
  { key: 'running', label: 'Running', hint: 'Follows the plan' },
]

export function Stepper({ step }: { step: Step | 'product' }) {
  const at = STEPS.findIndex(s => s.key === step)
  return (
    <ol className="steps" aria-label="Your campaign, step by step">
      {STEPS.map((s, i) => {
        const state = i < at || (step === 'running' && i === at) ? 'done' : i === at ? 'current' : 'todo'
        return (
          <li key={s.key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="dot">{state === 'done' ? '✓' : i + 1}</span>
            <span><span className="label">{s.label}</span><span className="hint">{s.hint}</span></span>
          </li>
        )
      })}
    </ol>
  )
}
