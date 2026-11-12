import Link from 'next/link'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { planWithItems } from '@/lib/plans'
import { journeyFor } from '@/lib/journey'
import { Page } from '../sections/frame'
import { RunStatus } from '../journey/run-status'
import { addItem, confirm, removeItem, revisePlan, saveItem, startPlanning } from './actions'

type Plan = NonNullable<Awaited<ReturnType<typeof planWithItems>>>

const weekOf = (start: string, day: string) => Math.floor((Date.parse(day) - Date.parse(start)) / (7 * 86400_000)) + 1
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

function Strategy({ s }: { s: Record<string, any> }) {
  return (
    <div className="card strategy">
      {s.positioning && <div style={{ marginBottom: 10 }}>
        <b>Positioning</b>
        <ul>
          {s.positioning.who && <li><b>Who</b>: {s.positioning.who}</li>}
          {s.positioning.problem && <li><b>Problem</b>: {s.positioning.problem}</li>}
          {s.positioning.promise && <li><b>Promise</b>: {s.positioning.promise}</li>}
          {s.positioning.proof && <li><b>Proof</b>: {s.positioning.proof}</li>}
          {list(s.positioning.objections).length > 0 && <li><b>Objections to answer</b>: {list(s.positioning.objections).join(' · ')}</li>}
        </ul>
      </div>}
      {s.funnel_focus && <p><b>Funnel focus</b> {typeof s.funnel_focus === 'string' ? s.funnel_focus : JSON.stringify(s.funnel_focus)}</p>}
      <p><b>Goal</b> {s.goal}</p>
      <p><b>Call to action</b> {s.cta}</p>
      {s.audience && <p><b>Audience</b> {s.audience}</p>}
      {list(s.channels).length > 0 && <><b>Channels</b><ul>{list(s.channels).map((c, i) => <li key={i}><b>{c.platform}</b>{c.per_week ? ` · ${c.per_week}/week` : ''}: {c.why}</li>)}</ul></>}
      {list(s.themes).length > 0 && <><b>Themes</b><ul>{list(s.themes).map((t, i) => <li key={i}><b>{t.name}</b>: {t.why}{t.hook ? <span className="muted"> · hook: {t.hook}</span> : null}</li>)}</ul></>}
      {list(s.rules).length > 0 && <><b>Rules</b><ul>{list(s.rules).map((r, i) => <li key={i}>{String(r)}</li>)}</ul></>}
    </div>
  )
}

function Calendar({ plan, platforms, editable }: { plan: Plan; platforms: string[]; editable: boolean }) {
  const items = plan.items as any[]
  const weeks = [...new Set(items.map(i => weekOf(plan.starts, i.day)))]
  return (
    <>
      {weeks.map(w => (
        <div key={w}>
          <h3>Week {w}</h3>
          <div className="scroll"><table className="calendar">
            <thead><tr><th>Day</th><th>Channel</th><th>Theme</th><th>Topic and angle</th><th>Status</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {items.filter(i => weekOf(plan.starts, i.day) === w).map(i => {
                const open = editable && i.status === 'planned'
                return (
                  <tr key={i.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.day.slice(5)}</td>
                    <td>{i.platform}<div className="muted">{i.format}</div></td>
                    <td>{i.theme}</td>
                    <td>
                      <b>{i.topic}</b><div className="muted">{i.angle}</div>
                      {i.facts?.length > 0 && <div className="muted">uses facts {i.facts.map((n: number) => n + 1).join(', ')}</div>}
                    </td>
                    <td className={`s-${i.status}`}>{i.status}</td>
                    {editable && <td>{open && (
                      <details className="edit">
                        <summary>Edit</summary>
                        <div className="pop">
                          <form action={saveItem} className="stack">
                            <input type="hidden" name="id" value={i.id} />
                            <div className="row">
                              <label>Day<input name="day" type="date" defaultValue={i.day} min={plan.starts} max={plan.ends} /></label>
                              <label>Channel<select name="platform" defaultValue={i.platform}>{platforms.map(p => <option key={p}>{p}</option>)}</select></label>
                            </div>
                            <label>Theme<input name="theme" defaultValue={i.theme} /></label>
                            <label>Topic<input name="topic" defaultValue={i.topic} /></label>
                            <label>Angle<textarea name="angle" defaultValue={i.angle} rows={4} /></label>
                            <div className="row"><button type="submit">Save</button></div>
                          </form>
                          <form action={removeItem} style={{ marginTop: 8 }}><input type="hidden" name="id" value={i.id} /><button className="ghost" type="submit">Remove item</button></form>
                        </div>
                      </details>
                    )}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      ))}
      {editable && (
        <details className="add-item">
          <summary>+ Add an item</summary>
          <form action={addItem} className="row" style={{ marginTop: 8 }}>
            <input type="hidden" name="plan" value={plan.id} />
            <input name="day" type="date" min={plan.starts} max={plan.ends} required aria-label="Day" />
            <select name="platform" aria-label="Channel">{platforms.map(p => <option key={p}>{p}</option>)}</select>
            <input name="theme" placeholder="Theme" required aria-label="Theme" />
            <input name="topic" placeholder="Topic" required style={{ minWidth: 240 }} aria-label="Topic" />
            <input name="angle" placeholder="Angle (optional)" style={{ minWidth: 240 }} aria-label="Angle" />
            <button type="submit">Add</button>
          </form>
        </details>
      )}
    </>
  )
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const msg = (await searchParams).msg
  const p = await currentProduct()
  if (!p) return <Page title="Plan" msg={msg}><p>No product yet. <Link href="/products/new">Add one</Link>.</p></Page>
  const j = await journeyFor(p.id)
  if (j && (j.step === 'research' || j.step === 'channels')) {
    return <Page title="Plan" msg={msg}><p>The plan comes after research and choosing channels. <Link href="/">Continue on Home</Link>.</p></Page>
  }
  const [cur] = await sql`select id from plans where product_id = ${p.id} and status = 'confirmed' and ends_on >= current_date order by starts_on limit 1`
  const [dr] = await sql`select id from plans where product_id = ${p.id} and status in ('draft', 'revising') order by id desc limit 1`
  const current = cur ? await planWithItems(cur.id) : null
  const draft = dr ? await planWithItems(dr.id) : null
  const platforms = (await sql`select platform from channels where product_id = ${p.id} order by enabled desc, id`).map(r => r.platform as string)
  const researched = p.fact_sheet.length > 0

  return (
    <Page title="Plan" msg={msg}>
      <RunStatus productId={p.id} />
      <p className="muted">Every post comes from a confirmed plan: a 4-week calendar the planner drafts and you agree on. Edit items, ask for changes, then confirm.</p>

      {!p.active && <div className="notice">{p.name} is paused, so its agents don&apos;t run. Switch to another product in the sidebar.</div>}

      {p.active && !researched && (
        <div className="card">
          <p>The researcher hasn&apos;t read {p.url} yet, so there are no facts to plan from.</p>
          <form action={startPlanning}><input type="hidden" name="product" value={p.id} /><button type="submit">Research the site now</button></form>
        </div>
      )}

      {p.active && researched && !draft && !current && (
        <div className="card">
          <p>No plan yet.</p>
          <form action={startPlanning}><input type="hidden" name="product" value={p.id} /><button type="submit">Draft a plan now</button></form>
        </div>
      )}

      {draft && (
        <section>
          <h2>{draft.status === 'revising' ? 'Being revised' : 'Draft for your confirmation'} · {draft.starts} → {draft.ends}{draft.revision > 0 ? ` · revision ${draft.revision}` : ''}</h2>
          {draft.status === 'revising'
            ? <div className="notice">The planner is working on your feedback: &ldquo;{draft.feedback}&rdquo;. The new version appears here by itself (see the status above).</div>
            : <>
              <Strategy s={draft.strategy} />
              <Calendar plan={draft} platforms={platforms} editable />
              <h3>Ask for changes</h3>
              <form action={revisePlan} className="stack">
                <input type="hidden" name="plan" value={draft.id} />
                <textarea name="feedback" rows={3} placeholder="e.g. No safety notices in week 1; more LinkedIn, less X; start with what the product is" aria-label="Feedback for the planner" />
                <div className="row"><button className="ghost" type="submit">Ask the planner to revise</button></div>
              </form>
              <form action={confirm} style={{ marginTop: 16 }}>
                <input type="hidden" name="plan" value={draft.id} />
                <button type="submit">Confirm and start the campaign</button>
                <span className="muted"> &nbsp;From then on every item is written, checked by the AI reviewer and published on its day.</span>
              </form>
            </>}
        </section>
      )}

      {current && (
        <section>
          <h2>Running plan · {current.starts} → {current.ends}</h2>
          <Strategy s={current.strategy} />
          <Calendar plan={current} platforms={platforms} editable />
        </section>
      )}
    </Page>
  )
}
