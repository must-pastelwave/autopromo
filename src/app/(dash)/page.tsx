import { WaitingSection } from './sections/waiting'
import { ChannelsSection } from './sections/channels'
import { PostsSection } from './sections/posts'
import { SettingsSection } from './sections/settings'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'

const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)

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

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string; status?: string; open?: string }> }) {
  const { msg, status, open } = await searchParams
  const p = await currentProduct()
  const notice = msg && <div className="notice" role="status">{msg}</div>
  if (!p) return <>{notice}<h2>Add your first product</h2><SettingsSection p={null} /></>

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
           count(*) filter (where status in ('blocked','dropped') and created_at > now() - interval '28 days')::int as blocked,
           count(*) filter (where status in ('scheduled','published') and scheduled_for > now() - interval '28 days')::int as live
    from posts where product_id = ${p.id}`
  const days = await sql<Day[]>`
    select to_char(d, 'MM-DD') as day,
      (select count(*)::int from clicks k join posts x on x.id = k.post_id
        where x.product_id = ${p.id} and (k.at at time zone ${p.timezone})::date = d) as clicks,
      (select count(*)::int from conversions v join posts x on x.id = v.post_id
        where x.product_id = ${p.id} and v.kind = 'signup' and (v.at at time zone ${p.timezone})::date = d) as signups
    from generate_series((now() at time zone ${p.timezone})::date - 89, (now() at time zone ${p.timezone})::date, '1 day') d
    order by d`
  const top = await sql`
    select x.id, x.topic, c.platform,
      (select count(*)::int from conversions v where v.post_id = x.id and v.kind = 'signup' and v.at > now() - interval '90 days') as signups,
      (select count(*)::int from clicks k where k.post_id = x.id and k.at > now() - interval '90 days') as clicks
    from posts x join channels c on c.id = x.channel_id
    where x.product_id = ${p.id} and x.status in ('scheduled','published')
    order by signups desc, clicks desc, x.id desc limit 5`
  const next = await sql`
    select x.id, x.topic, c.platform, x.scheduled_for from posts x join channels c on c.id = x.channel_id
    where x.product_id = ${p.id} and x.status = 'scheduled' and x.scheduled_for > now() order by x.scheduled_for limit 5`
  const week = windows[0]

  return (
    <>
      {notice}
      <div className="stats">
        <div className="stat"><div className="big">{week.signups}</div><div className="muted">sign-ups, 7 days</div></div>
        <div className="stat"><div className="big">{week.clicks}</div><div className="muted">clicks, 7 days</div></div>
        <div className="stat"><div className="big">{counts.live}</div><div className="muted">posts live, 28 days</div></div>
        <div className="stat"><div className="big">{counts.blocked}</div><div className="muted">blocked by reviewer</div></div>
        <a className="stat" href="#waiting"><div className="big">{counts.waiting}</div><div className="muted">waiting for you</div></a>
      </div>

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
        <p className="muted">Weekly numbers are signals for tuning. Judge month over month; the first real verdict comes after about 3 months.</p>
      </div>

      <h2 id="waiting">Waiting for you{counts.waiting > 0 ? ` (${counts.waiting})` : ''}</h2>
      <WaitingSection p={p} />

      <div className="two">
        <section>
          <h2>Top posts</h2>
          <table>
            <thead><tr><th>Channel</th><th>Topic</th><th>Sign-ups</th><th>Clicks</th></tr></thead>
            <tbody>
              {top.map(t => <tr key={t.id}><td>{t.platform}</td><td>{t.topic}</td><td>{t.signups}</td><td>{t.clicks}</td></tr>)}
              {top.length === 0 && <tr><td colSpan={4} className="muted">Nothing posted yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Coming up next</h2>
          <table><tbody>
            {next.map(n => <tr key={n.id}><td>{fmt(n.scheduled_for, p.timezone)}</td><td>{n.platform}</td><td>{n.topic}</td></tr>)}
            {next.length === 0 && <tr><td className="muted">Nothing scheduled.</td></tr>}
          </tbody></table>
        </section>
      </div>

      <h2 id="channels">Channels</h2>
      <ChannelsSection p={p} />

      <details id="posts" open={!!status || open === 'posts'}>
        <summary><h2>All posts</h2></summary>
        <PostsSection p={p} status={status} />
      </details>

      <details id="settings" open={open === 'settings'}>
        <summary><h2>Settings</h2></summary>
        <SettingsSection p={p} />
      </details>
    </>
  )
}
