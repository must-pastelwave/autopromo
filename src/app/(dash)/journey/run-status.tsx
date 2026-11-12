import { runStatus } from '@/lib/runs'
import { AutoRefresh } from './auto-refresh'
import { startPlanning } from '../plan/actions'

const mins = (from: Date) => Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000))
const NAMES: Record<string, string> = { researcher: 'Research', planner: 'Planning', writer: 'Writing', reviewer: 'Review', analyst: 'Analysis' }
const label = (jobs: string) => jobs.split(' ').map(j => NAMES[j] ?? j).join(' → ')

/** What the agents are doing for this product right now, in minutes, refreshing itself while something is in progress. */
export async function RunStatus({ productId }: { productId: number }) {
  const r = await runStatus(productId)
  if (!r) return null
  const typical = r.typicalMinutes ? `usually takes about ${Math.max(1, r.typicalMinutes)} min` : 'usually takes 2–5 min'
  if (r.status === 'queued') {
    const waited = mins(r.requestedAt)
    return (
      <div className="run run-queued">
        <AutoRefresh />
        <span className="pulse" /> <b>{label(r.jobs)}: waiting to start</b> · queued {waited} min ago
        {waited < 20
          ? <span className="muted"> · starts within 15 min, then {typical}</span>
          : <form action={startPlanning} style={{ display: 'inline' }}><input type="hidden" name="product" value={productId} /> <span className="muted">· hasn&apos;t started yet.</span> <button className="ghost" type="submit">Start now</button></form>}
      </div>
    )
  }
  if (r.status === 'running') return (
    <div className="run run-running">
      <AutoRefresh />
      <span className="pulse" /> <b>{label(r.jobs)}: running</b> · {mins(r.startedAt ?? r.requestedAt)} min so far · {typical}
      {r.url && <> · <a href={r.url} target="_blank" rel="noreferrer">live log</a></>}
    </div>
  )
  const ago = r.finishedAt ? mins(r.finishedAt) : 0
  if (ago > 120) return null
  return r.status === 'done'
    ? <div className="run run-done">✓ <b>{label(r.jobs)}: done</b> · {ago} min ago</div>
    : <div className="run run-failed"><b>{label(r.jobs)}: failed</b> · {ago} min ago{r.url && <> · <a href={r.url} target="_blank" rel="noreferrer">log</a></>} · it retries by itself in 3 hours, or <form action={startPlanning} style={{ display: 'inline' }}><input type="hidden" name="product" value={productId} /><button className="ghost" type="submit">try again now</button></form></div>
}
