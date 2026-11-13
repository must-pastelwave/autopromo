import Link from 'next/link'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { planWithItems } from '@/lib/plans'
import { TARGET_KEYS, TARGET_LABEL } from '@/lib/scorecard'
import { journeyFor } from '@/lib/journey'
import { Page } from '../sections/frame'
import { RunStatus } from '../journey/run-status'
import { addItem, confirm, removeItem, revisePlan, saveItem, startPlanning } from './actions'

type Plan = NonNullable<Awaited<ReturnType<typeof planWithItems>>>

const weekOf = (start: string, day: string) => Math.floor((Date.parse(day) - Date.parse(start)) / (7 * 86400_000)) + 1
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const fmt = (n: number) => n.toLocaleString('en')
const STATUS: Record<string, { label: string; tone: string }> = {
  planned: { label: 'Planned', tone: 'muted' }, written: { label: 'Written', tone: 'ok' }, skipped: { label: 'Skipped', tone: 'bad' },
}

/** What matters at a glance: goal, call to action, targets, channels, themes. The long reasoning folds away. */
function Strategy({ s }: { s: Record<string, any> }) {
  const targets = s.targets ? TARGET_KEYS.filter(k => typeof s.targets[k] === 'number') : []
  const pos = s.positioning ?? {}
  return (
    <div className="card plan-summary">
      <dl className="facts">
        <div><dt>Goal</dt><dd>{s.goal}</dd></div>
        <div><dt>Call to action</dt><dd>{s.cta}</dd></div>
        {s.audience && <div><dt>Audience</dt><dd>{s.audience}</dd></div>}
        {list(s.channels).length > 0 && <div><dt>Channels</dt><dd>{list(s.channels).map(c => `${c.platform}${c.per_week ? ` ${c.per_week}/week` : ''}`).join(' · ')}</dd></div>}
      </dl>

      <h3>Targets for these 4 weeks</h3>
      {targets.length > 0
        ? <div className="target-chips">{targets.map(k => <span key={k} className="target"><b>{fmt(s.targets[k])}</b> {TARGET_LABEL[k]}</span>)}</div>
        : <p className="muted">This plan has no targets. Set goals in <Link href="/settings?tab=goals">Settings → Goals</Link>; the next plan will set targets from them.</p>}
      {s.targets_note && <p className="muted">{s.targets_note}</p>}

      {list(s.themes).length > 0 && <>
        <h3>Themes</h3>
        <ul className="themes">{list(s.themes).map((t, i) => <li key={i}><b>{t.name}</b><span className="muted">{t.why}</span></li>)}</ul>
      </>}

      <details className="help">
        <summary>Full strategy: positioning, funnel, rules</summary>
        {(pos.who || pos.problem || pos.promise || pos.proof) && <>
          <h3>Positioning</h3>
          <dl className="facts">
            {pos.who && <div><dt>Who</dt><dd>{pos.who}</dd></div>}
            {pos.problem && <div><dt>Problem</dt><dd>{pos.problem}</dd></div>}
            {pos.promise && <div><dt>Promise</dt><dd>{pos.promise}</dd></div>}
            {pos.proof && <div><dt>Proof</dt><dd>{pos.proof}</dd></div>}
          </dl>
        </>}
        {list(pos.objections).length > 0 && <><h3>Objections to answer</h3><ul>{list(pos.objections).map((o, i) => <li key={i}>{String(o)}</li>)}</ul></>}
        {s.funnel_focus && <><h3>Funnel focus</h3><p>{typeof s.funnel_focus === 'string' ? s.funnel_focus : JSON.stringify(s.funnel_focus)}</p></>}
        {list(s.channels).length > 0 && <><h3>Why these channels</h3><ul>{list(s.channels).map((c, i) => <li key={i}><b>{c.platform}</b>: {c.why}</li>)}</ul></>}
        {list(s.themes).some(t => t.hook) && <><h3>Hooks</h3><ul>{list(s.themes).filter(t => t.hook).map((t, i) => <li key={i}><b>{t.name}</b>: {t.hook}</li>)}</ul></>}
        {list(s.rules).length > 0 && <><h3>Rules</h3><ul>{list(s.rules).map((r, i) => <li key={i}>{String(r)}</li>)}</ul></>}
      </details>
    </div>
  )
}

function Calendar({ plan, platforms, editable }: { plan: Plan; platforms: string[]; editable: boolean }) {
  const items = plan.items as any[]
  const weeks = [...new Set(items.map(i => weekOf(plan.starts, i.day)))]
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      {weeks.map(w => {
        const inWeek = items.filter(i => weekOf(plan.starts, i.day) === w)
        const days = inWeek.map(i => i.day as string).sort()
        const past = days[days.length - 1] < today
        const done = inWeek.filter(i => i.status !== 'planned').length
        return (
        <details key={w} className="week" open={!past}>
          <summary><b>Week {w}</b><span className="muted">{days[0].slice(5)} → {days[days.length - 1].slice(5)} · {inWeek.length} posts{done ? ` · ${done} written` : ''}</span></summary>
          <div className="scroll"><table className="calendar">
            <thead><tr><th>Day</th><th>Channel</th><th>Topic and angle</th><th>Theme</th><th>Status</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {inWeek.map(i => {
                const open = editable && i.status === 'planned'
                return (
                  <tr key={i.id}>
                    <td className="day">{i.day.slice(5)}</td>
                    <td>{i.platform}<div className="muted">{i.format}</div></td>
                    <td className="topic">
                      <b>{i.topic}</b><div className="muted angle">{i.angle}</div>
                      {i.facts?.length > 0 && <div className="facts-used">Facts {i.facts.map((n: number) => n + 1).join(', ')}</div>}
                    </td>
                    <td className="theme"><span className="chip">{i.theme}</span></td>
                    <td><span className={`pill pill-${STATUS[i.status]?.tone ?? 'muted'}`}>{STATUS[i.status]?.label ?? i.status}</span></td>
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
        </details>
        )
      })}
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
      <p className="lead">Every post comes from a plan you confirm: 4 weeks of posts, drafted by the planner. Check the targets and calendar, edit items or ask for changes, then confirm.</p>

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
          <h2>{draft.status === 'revising' ? 'Next plan: being revised' : 'Next plan: waiting for your OK'} <span className="muted h-sub">{draft.starts} → {draft.ends}{draft.revision > 0 ? ` · revision ${draft.revision}` : ''}</span></h2>
          {draft.status === 'revising'
            ? <div className="notice">The planner is working on your feedback: &ldquo;{draft.feedback}&rdquo;. The new version appears here by itself (see the status above).</div>
            : <>
              <div className="card decide">
                <div>
                  <b>Happy with this plan?</b>
                  <p className="muted">Confirming starts it: each item is written, checked by the AI reviewer and published on its day.</p>
                </div>
                <form action={confirm}><input type="hidden" name="plan" value={draft.id} /><button type="submit">Confirm and start</button></form>
                <details className="feedback">
                  <summary>Ask for changes instead</summary>
                  <form action={revisePlan} className="stack wide">
                    <input type="hidden" name="plan" value={draft.id} />
                    <textarea name="feedback" rows={3} placeholder="e.g. No safety notices in week 1; more LinkedIn, less X; start with what the product is" aria-label="Feedback for the planner" />
                    <div><button className="ghost" type="submit">Send to the planner</button></div>
                  </form>
                </details>
              </div>
              <Strategy s={draft.strategy} />
              <h2>Calendar</h2>
              <Calendar plan={draft} platforms={platforms} editable />
            </>}
        </section>
      )}

      {current && !draft && (
        <section>
          <h2>Running plan <span className="muted h-sub">{current.starts} → {current.ends}</span></h2>
          <Strategy s={current.strategy} />
          <h2>Calendar</h2>
          <Calendar plan={current} platforms={platforms} editable />
        </section>
      )}
      {current && draft && (
        <details className="week running">
          <summary><b>Running plan</b><span className="muted">{current.starts} → {current.ends} · still running until the next one starts</span></summary>
          <Strategy s={current.strategy} />
          <h2>Calendar</h2>
          <Calendar plan={current} platforms={platforms} editable />
        </details>
      )}
    </Page>
  )
}
