import Link from 'next/link'
import { goalsWithProgress } from '@/lib/goals'

const fmt = (n: number) => n.toLocaleString('en')
const sinceNote = (since: string | null, from: number) =>
  since && Date.parse(since) > Date.now() - from * 86400_000 + 86400_000 ? ` (since ${since})` : ''

/** The owner's goals: tracked or not (and why), last 30 days vs the 1-month number, last 90 vs the 3-month one. */
export async function Goals({ productId }: { productId: number }) {
  const goals = await goalsWithProgress(productId)
  if (!goals.length) return <p className="muted">No goals yet. <Link href="/settings#goals">Set goals in Settings</Link> so the plan works towards them.</p>
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>Goal</th><th>Last 30 days</th><th>Last 90 days</th><th>Tracking</th></tr></thead>
        <tbody>
          {goals.map(g => (
            <tr key={g.id}>
              <td><b>{g.label}</b>{g.source && <span className="muted"> · {g.source}</span>}</td>
              <td>{g.tracking.ok ? fmt(g.last30.value) + sinceNote(g.last30.since, 30) : '—'}{g.target_1m ? ` / ${fmt(g.target_1m)}` : ''}</td>
              <td>{g.tracking.ok ? fmt(g.last90.value) + sinceNote(g.last90.since, 90) : '—'}{g.target_3m ? ` / ${fmt(g.target_3m)}` : ''}</td>
              <td className={g.tracking.ok ? 's-published' : 's-waiting'}>{g.tracking.ok ? '✓ ' : '✗ '}{g.tracking.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
