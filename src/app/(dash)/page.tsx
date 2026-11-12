import Link from 'next/link'
import { sql } from '@/lib/db'
import { Page } from './sections/frame'
import { currentProduct } from '@/lib/current'
import { journeyFor } from '@/lib/journey'
import { Stepper } from './journey/stepper'
import { RunStatus } from './journey/run-status'
import { chooseChannels } from './journey/actions'
import { startPlanning } from './plan/actions'
import { ProductForm } from './sections/settings'

type Day = { day: string; clicks: number; signups: number }

function Chart({ days }: { days: Day[] }) {
  const w = 600, h = 120
  const line = (key: 'clicks' | 'signups') => {
    const max = Math.max(1, ...days.map(d => d[key]))
    return days.map((d, i) => `${(i / Math.max(1, days.length - 1)) * w},${h - (d[key] / max) * (h - 10) - 5}`).join(' ')
  }
  const total = (key: 'clicks' | 'signups') => days.reduce((a, d) => a + d[key], 0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img"
      aria-label={`Last ${days.length} days: ${total('clicks')} clicks, ${total('signups')} sign-ups. Each line is scaled to its own maximum.`}>
      <polyline points={line('clicks')} fill="none" stroke="var(--muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <polyline points={line('signups')} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// What each plan item is doing right now, in plain words.
function live(i: Record<string, any>): [string, string] {
  if (i.status === 'skipped') return ['skipped', 's-skipped']
  if (!i.post_status) return [i.day > i.today ? 'planned' : 'being written', 's-planned']
  if (i.post_status === 'waiting') return i.post_error?.startsWith('connect your') ? ['needs the account connected', 's-waiting'] : ['waiting for you', 's-waiting']
  const m: Record<string, [string, string]> = {
    draft: ['AI review', 's-draft'], blocked: ['being fixed', 's-blocked'], passed: ['publishing', 's-passed'],
    scheduled: ['scheduled', 's-scheduled'], published: ['published', 's-published'], failed: ['failed', 's-failed'],
    dropped: ['dropped', 's-dropped'], skipped: ['skipped', 's-skipped'], expired: ['expired', 's-skipped'],
  }
  return m[i.post_status] ?? [i.post_status, '']
}

export default async function Home({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams
  const p = await currentProduct()
  if (!p) {
    return (
      <Page title="Start a campaign" msg={msg}>
        <Stepper step="product" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1. Your product</h2>
          <p className="muted">Enter the product&apos;s web page. The AI reads it, then you choose channels and agree on a plan.</p>
          <ProductForm />
        </div>
      </Page>
    )
  }
  const j = (await journeyFor(p.id))!
  const paused = !p.active && <div className="notice">{p.name} is paused, so its agents don&apos;t run. <Link href="/settings">Resume it in Settings</Link>.</div>
  if (!p.active && j.step !== 'running') return <Page title={p.name} msg={msg}>{paused}<Stepper step={j.step} /></Page>

  if (j.step === 'research') return (
    <Page title={p.name} msg={msg}>
      {paused}
      <Stepper step="research" />
      <RunStatus productId={p.id} />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>2. Research</h2>
        <p>The AI is reading <a href={p.url} target="_blank" rel="noreferrer">{p.url}</a>: what the product is, who it&apos;s for, prices and conditions, and the rules posts must follow. It usually starts within 15–30 minutes and takes a few more.</p>
        <p className="muted">This page moves to the next step by itself once the facts are in. Refresh to check.</p>
        {p.active && <form action={startPlanning}><input type="hidden" name="product" value={p.id} /><button className="ghost" type="submit">Start research now</button></form>}
      </div>
    </Page>
  )

  if (j.step === 'channels') return (
    <Page title={p.name} msg={msg}>
      {paused}
      <Stepper step="channels" />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>3. Where should we post?</h2>
        <p className="muted">The AI found {j.factCount} facts about {p.name}. Pick 2–4 channels where its audience is. You can connect the accounts later; posts wait until you do.</p>
        <form action={chooseChannels}>
          <input type="hidden" name="product" value={p.id} />
          <div className="choices">
            {j.channels.map(c => (
              <label key={c.id} className="choice">
                <input type="checkbox" name="platform" value={c.platform} defaultChecked={c.enabled} />
                <span><b>{c.platform}</b><span className="muted">{c.automatable ? 'posts automatically' : 'AI drafts, you post'}</span></span>
              </label>
            ))}
          </div>
          <button type="submit" style={{ marginTop: 16 }}>Save and draft the plan</button>
        </form>
      </div>
    </Page>
  )

  if (j.step === 'plan') return (
    <Page title={p.name} msg={msg}>
      {paused}
      <Stepper step="plan" />
      <RunStatus productId={p.id} />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>4. Agree on the plan</h2>
        {!j.draft && <>
          <p>The planner is drafting a 4-week plan for {j.channels.filter(c => c.enabled).map(c => c.platform).join(', ')}: positioning, themes and a day-by-day calendar. It usually starts within 15–30 minutes.</p>
          {p.active && <form action={startPlanning}><input type="hidden" name="product" value={p.id} /><button className="ghost" type="submit">Start planning now</button></form>}
        </>}
        {j.draft?.status === 'revising' && <p>The planner is revising the plan with your feedback. Refresh in a few minutes.</p>}
        {j.draft?.status === 'draft' && <>
          <p>Your plan is ready. Read it, change anything, then confirm. <b>Nothing is posted until you confirm</b>; after that the campaign runs by itself.</p>
          <Link className="button" href="/plan">Review the plan</Link>
        </>}
      </div>
    </Page>
  )

  // Running
  const items = await sql`
    select i.id, to_char(i.day, 'YYYY-MM-DD') as day, i.platform, i.topic, i.status, x.status as post_status, x.error as post_error,
      to_char(current_date, 'YYYY-MM-DD') as today
    from plan_items i left join posts x on x.plan_item_id = i.id
    where i.plan_id = ${j.running!.id} and i.day between current_date - 2 and current_date + 7
    order by i.day, i.id`
  const windows = await sql`
    select w.label,
      (select count(*)::int from clicks k join posts x on x.id = k.post_id where x.product_id = ${p.id} and k.at > now() - w.span) as clicks,
      (select count(*)::int from conversions v join posts x on x.id = v.post_id where x.product_id = ${p.id} and v.kind = 'signup' and v.at > now() - w.span) as signups,
      (select count(*)::int from conversions v join posts x on x.id = v.post_id where x.product_id = ${p.id} and v.kind = 'purchase' and v.at > now() - w.span) as purchases
    from (values (1, '7 days', interval '7 days'), (2, '28 days', interval '28 days'), (3, '90 days', interval '90 days'),
                 (4, 'Since start', interval '100 years')) as w(o, label, span)
    order by w.o`
  const [counts] = await sql`
    select count(*) filter (where status = 'waiting')::int as waiting,
           count(*) filter (where status in ('scheduled','published') and scheduled_for > now() - interval '28 days')::int as live
    from posts where product_id = ${p.id}`
  const [progress] = await sql`
    select count(*)::int as total, count(*) filter (where status = 'written')::int as written from plan_items where plan_id = ${j.running!.id}`
  const days = await sql<Day[]>`
    select to_char(d, 'MM-DD') as day,
      (select count(*)::int from clicks k join posts x on x.id = k.post_id
        where x.product_id = ${p.id} and (k.at at time zone ${p.timezone})::date = d) as clicks,
      (select count(*)::int from conversions v join posts x on x.id = v.post_id
        where x.product_id = ${p.id} and v.kind = 'signup' and (v.at at time zone ${p.timezone})::date = d) as signups
    from generate_series((now() at time zone ${p.timezone})::date - 89, (now() at time zone ${p.timezone})::date, '1 day') d
    order by d`
  const week = windows[0]

  return (
    <Page title={p.name} msg={msg}>
      {paused}
      <Stepper step="running" />
      <RunStatus productId={p.id} />
      {j.draft?.status === 'draft' && <div className="notice"><b>Your next plan is ready</b> (from {j.draft.starts}). <Link href="/plan">Review and confirm it</Link> so the campaign continues.</div>}
      {j.unconnected.length > 0 && <div className="notice"><b>Connect {j.unconnected.join(', ')}</b> so those posts can go out; they wait until then. <Link href="/channels">Connect in Channels</Link>.</div>}

      <div className="stats">
        <div className="stat"><div className="big">{week.signups}</div><div className="muted">sign-ups, 7 days</div></div>
        <div className="stat"><div className="big">{week.clicks}</div><div className="muted">clicks, 7 days</div></div>
        <div className="stat"><div className="big">{counts.live}</div><div className="muted">posts out, 28 days</div></div>
        <div className="stat"><div className="big">{progress.written}/{progress.total}</div><div className="muted">plan items written</div></div>
        <Link className="stat" href="/waiting"><div className="big">{counts.waiting}</div><div className="muted">waiting</div></Link>
      </div>

      <h2>This week in the plan <span className="muted" style={{ fontWeight: 400 }}>· {j.running!.starts} → {j.running!.ends} · <Link href="/plan">whole plan</Link></span></h2>
      <div className="scroll"><table>
        <thead><tr><th>Day</th><th>Channel</th><th>Topic</th><th>Now</th></tr></thead>
        <tbody>
          {items.map(i => { const [label, cls] = live(i); return (
            <tr key={i.id}><td style={{ whiteSpace: 'nowrap' }}>{i.day.slice(5)}{i.day === i.today ? ' · today' : ''}</td><td>{i.platform}</td><td>{i.topic}</td><td className={cls}>{label}</td></tr>
          ) })}
          {items.length === 0 && <tr><td colSpan={4} className="muted">Nothing planned this week.</td></tr>}
        </tbody>
      </table></div>

      <h2>Sign-ups and clicks per day</h2>
      <div className="card">
        <Chart days={days} />
        <div className="row muted" style={{ justifyContent: 'space-between' }}>
          <span>{days[0]?.day}</span>
          <span><span style={{ color: 'var(--accent)' }}>━</span> sign-ups &nbsp; <span>━</span> clicks</span>
          <span>{days.at(-1)?.day}</span>
        </div>
        <table className="compact" style={{ marginTop: 12 }}>
          <thead><tr><th></th><th>Sign-ups</th><th>Purchases</th><th>Clicks</th></tr></thead>
          <tbody>{windows.map(w => <tr key={w.label}><td>{w.label}</td><td><strong>{w.signups}</strong></td><td>{w.purchases}</td><td>{w.clicks}</td></tr>)}</tbody>
        </table>
        <p className="muted" style={{ marginTop: 8 }}>Weekly numbers are signals for tuning. Judge month over month; the first real verdict comes after about 3 months.</p>
      </div>
    </Page>
  )
}
