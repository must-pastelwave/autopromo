import Link from 'next/link'
import { sql } from '@/lib/db'

const STATUSES = ['all', 'scheduled', 'published', 'draft', 'blocked', 'dropped', 'failed', 'waiting', 'skipped', 'expired']

export async function PostsSection({ p, status: asked }: { p: Record<string, any>; status?: string }) {
  const status = STATUSES.includes(asked ?? '') ? asked! : 'all'
  const posts = await sql`
    select x.*, c.platform, (select count(*)::int from clicks k where k.post_id = x.id) as clicks,
      coalesce(greatest(m.impressions, m.views, m.reach), 0) as seen, coalesce(m.likes + m.comments + m.shares + m.saves, 0) as engaged, m.post_url,
      (select count(*)::int from conversions v where v.post_id = x.id and v.kind = 'signup') as signups,
      (select count(*)::int from conversions v where v.post_id = x.id and v.kind = 'purchase') as purchases
    from posts x join channels c on c.id = x.channel_id left join post_metrics m on m.post_id = x.id
    where x.product_id = ${p.id} and (${status} = 'all' or x.status = ${status})
    order by x.id desc limit 200`
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {STATUSES.map(s => <Link key={s} href={s === 'all' ? '/posts' : `/posts?status=${s}`} className="badge" aria-current={s === status ? 'page' : undefined}>{s}</Link>)}
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>Post</th><th>Status</th><th>Seen</th><th>Engaged</th><th>Clicks</th><th>Sign-ups</th><th>When</th></tr></thead>
        <tbody>
          {posts.map(x => (
            <tr key={x.id}>
              <td>{x.platform}{x.is_experiment ? <div className="muted">experiment</div> : null}</td>
              <td>
                <strong>{x.topic}</strong>
                <div style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{x.caption}</div>
                {x.slides.length > 0 && (
                  <div className="thumbs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {x.slides.map((_: unknown, i: number) => <img key={i} src={`/api/slide/${x.id}/${i}.png?r=${x.revision}`} alt={`slide ${i + 1}`} loading="lazy" />)}
                  </div>
                )}
              </td>
              <td>
                <span className={`s-${x.status}`}>{x.status}</span>
                {x.review_reason && <div className="muted">{x.review_reason}</div>}
                {x.error && <div className="muted">{x.error}</div>}
              </td>
              <td>{x.seen}{x.post_url && <div><a className="muted" href={x.post_url} target="_blank" rel="noreferrer">view</a></div>}</td>
              <td>{x.engaged}</td>
              <td>{x.clicks}</td>
              <td>{x.signups}</td>
              <td className="muted">{x.scheduled_for ? new Date(x.scheduled_for).toLocaleString('ko-KR', { timeZone: p.timezone }) : '—'}</td>
            </tr>
          ))}
          {posts.length === 0 && <tr><td colSpan={7} className="muted">No posts.</td></tr>}
        </tbody>
      </table></div>
    </>
  )
}
