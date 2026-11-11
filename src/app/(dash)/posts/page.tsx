import Link from 'next/link'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'

const STATUSES = ['all', 'scheduled', 'published', 'draft', 'blocked', 'dropped', 'failed', 'waiting', 'skipped', 'expired']

export default async function Posts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = await currentProduct()
  if (!p) return <p>No product yet.</p>
  const status = STATUSES.includes((await searchParams).status ?? '') ? (await searchParams).status! : 'all'
  const posts = await sql`
    select x.*, c.platform, (select count(*)::int from clicks k where k.post_id = x.id) as clicks,
      (select count(*)::int from conversions v where v.post_id = x.id and v.kind = 'signup') as signups,
      (select count(*)::int from conversions v where v.post_id = x.id and v.kind = 'purchase') as purchases
    from posts x join channels c on c.id = x.channel_id
    where x.product_id = ${p.id} and (${status} = 'all' or x.status = ${status})
    order by x.id desc limit 200`
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {STATUSES.map(s => <Link key={s} href={s === 'all' ? '/posts' : `/posts?status=${s}`} className="badge" aria-current={s === status ? 'page' : undefined}>{s}</Link>)}
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>Post</th><th>Status</th><th>Sign-ups</th><th>Purchases</th><th>Clicks</th><th>When</th></tr></thead>
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
              <td>{x.signups}</td>
              <td>{x.purchases}</td>
              <td>{x.clicks}</td>
              <td className="muted">{x.scheduled_for ? new Date(x.scheduled_for).toLocaleString('ko-KR', { timeZone: p.timezone }) : '—'}</td>
            </tr>
          ))}
          {posts.length === 0 && <tr><td colSpan={7} className="muted">No posts.</td></tr>}
        </tbody>
      </table></div>
    </>
  )
}
