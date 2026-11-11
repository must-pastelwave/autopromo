import Link from 'next/link'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'

const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)

function Chart({ days }: { days: { day: string; n: number }[] }) {
  const max = Math.max(1, ...days.map(d => d.n)), w = 600, h = 120
  const pts = days.map((d, i) => `${(i / Math.max(1, days.length - 1)) * w},${h - (d.n / max) * (h - 10) - 5}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Clicks per day, last ${days.length} days, max ${max}`}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default async function Overview() {
  const p = await currentProduct()
  if (!p) return <p>No product yet. <Link href="/settings">Add one in Settings</Link>.</p>
  const [week] = await sql`
    select count(*)::int as clicks from clicks k join posts x on x.id = k.post_id
    where x.product_id = ${p.id} and k.at > now() - interval '7 days'`
  const [counts] = await sql`
    select count(*) filter (where status in ('scheduled','published') and scheduled_for > now() - interval '7 days')::int as live,
           count(*) filter (where status in ('blocked','dropped') and created_at > now() - interval '7 days')::int as blocked,
           count(*) filter (where status = 'waiting')::int as waiting
    from posts where product_id = ${p.id}`
  const days = await sql<{ day: string; n: number }[]>`
    select to_char(d, 'MM-DD') as day, count(k.id)::int as n
    from generate_series((now() at time zone ${p.timezone})::date - 27, (now() at time zone ${p.timezone})::date, '1 day') d
    left join (clicks k join posts x on x.id = k.post_id and x.product_id = ${p.id})
      on (k.at at time zone ${p.timezone})::date = d
    group by d order by d`
  const top = await sql`
    select x.id, x.topic, c.platform, count(k.id)::int as clicks
    from posts x join channels c on c.id = x.channel_id left join clicks k on k.post_id = x.id and k.at > now() - interval '28 days'
    where x.product_id = ${p.id} and x.status in ('scheduled','published')
    group by x.id, c.platform order by clicks desc, x.id desc limit 5`
  const next = await sql`
    select x.id, x.topic, c.platform, x.scheduled_for from posts x join channels c on c.id = x.channel_id
    where x.product_id = ${p.id} and x.status = 'scheduled' and x.scheduled_for > now() order by x.scheduled_for limit 5`
  const channels = await sql`select platform, enabled, automatable, needs_reconnect from channels where product_id = ${p.id} and enabled order by id`

  return (
    <>
      <div className="grid">
        <div className="card"><div className="big">{week.clicks}</div><div className="muted">clicks, last 7 days</div></div>
        <div className="card"><div className="big">{counts.live}</div><div className="muted">posts live or scheduled, 7 days</div></div>
        <div className="card"><div className="big">{counts.blocked}</div><div className="muted">blocked by reviewer, 7 days</div></div>
        <div className="card"><div className="big">{counts.waiting}</div><div className="muted"><Link href="/waiting">waiting for you</Link></div></div>
      </div>
      <h2>Clicks per day (28 days)</h2>
      <div className="card"><Chart days={days} /><div className="row muted" style={{ justifyContent: 'space-between' }}><span>{days[0]?.day}</span><span>{days.at(-1)?.day}</span></div></div>
      <h2>Top posts (28 days)</h2>
      <div className="scroll"><table><tbody>
        {top.map(t => <tr key={t.id}><td>{t.platform}</td><td>{t.topic}</td><td style={{ textAlign: 'right' }}>{t.clicks}</td></tr>)}
        {top.length === 0 && <tr><td className="muted">Nothing posted yet.</td></tr>}
      </tbody></table></div>
      <h2>Coming up next</h2>
      <div className="scroll"><table><tbody>
        {next.map(n => <tr key={n.id}><td>{fmt(n.scheduled_for, p.timezone)}</td><td>{n.platform}</td><td>{n.topic}</td></tr>)}
        {next.length === 0 && <tr><td className="muted">Nothing scheduled.</td></tr>}
      </tbody></table></div>
      <h2>Channels</h2>
      <div className="row">
        {channels.map(c => (
          <span key={c.platform} className="badge">
            {c.platform} · {c.needs_reconnect ? 'reconnect in Zernio' : c.automatable ? 'auto' : 'drafts only'}
          </span>
        ))}
        {channels.length === 0 && <span className="muted">No channels on. <Link href="/channels">Turn some on</Link>.</span>}
      </div>
    </>
  )
}
