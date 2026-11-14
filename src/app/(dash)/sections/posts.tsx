import Link from 'next/link'
import { sql } from '@/lib/db'
import { postState, type Tab } from '@/lib/status'
import { isDirect } from '@/lib/direct'
import { retryPostAction } from '../actions'

const TABS: [Tab | 'all', string][] = [['all', 'All'], ['needs-you', 'Needs you'], ['upcoming', 'Upcoming'], ['published', 'Published'], ['blocked', 'Blocked'], ['set-aside', 'Set aside']]
const num = (n: number) => new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)

export async function PostsSection({ p, status: asked }: { p: Record<string, any>; status?: string }) {
  const tab = (TABS.map(t => t[0]) as string[]).includes(asked ?? '') ? asked! : 'all'
  const app = (process.env.APP_URL ?? '').replace(/\/$/, '')
  const rows = await sql`
    select x.*, c.platform, i.theme, to_char(i.day, 'YYYY-MM-DD') as plan_day, (i.day >= current_date - 1) as retryable_day,
      (select count(*)::int from clicks k where k.post_id = x.id) as clicks,
      coalesce(greatest(m.impressions, m.views, m.reach), 0)::int as seen, coalesce(m.likes + m.comments + m.shares + m.saves, 0)::int as engaged, m.post_url
    from posts x join channels c on c.id = x.channel_id left join post_metrics m on m.post_id = x.id left join plan_items i on i.id = x.plan_item_id
    where x.product_id = ${p.id}
    order by coalesce(i.day, x.created_at::date) desc, x.id desc limit 300`
  const all = rows.map((x): Record<string, any> => ({ ...x, state: postState(x as any, p.timezone) }))
  const count = (t: string) => (t === 'all' ? all.length : all.filter(x => x.state.tab === t).length)
  const shown = tab === 'all' ? all : all.filter(x => x.state.tab === tab)

  return (
    <>
      <nav className="tabs" aria-label="Filter posts">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === 'all' ? '/posts' : `/posts?status=${key}`} aria-current={key === tab ? 'page' : undefined}>
            {label} <span className="n">{count(key)}</span>
          </Link>
        ))}
      </nav>

      <div className="post-list">
        <div className="post-head"><span>Day</span><span>Channel</span><span>Post</span><span>Status</span><span>Results</span><span /></div>
        {shown.map(x => {
          const out = ['scheduled', 'published'].includes(x.status)
          const firstLine = String(x.caption).split('\n')[0]
          return (
            <details key={x.id} className="post-row">
              <summary>
                <span className="day">{(x.plan_day ?? '').slice(5) || '—'}</span>
                <span><span className="chip">{x.platform}</span></span>
                <span className="what"><b>{x.topic}</b><span className="muted">{firstLine}</span></span>
                <span><span className={`pill pill-${x.state.tone}`}>{x.state.label}</span></span>
                <span className="results">{out ? (isDirect(x.platform) ? <>{x.clicks} people <span className="muted">· no views on {x.platform}</span></> : <>{num(x.seen)} seen · {num(x.engaged)} engaged · {x.clicks} people</>) : <span className="muted">—</span>}</span>
                <span className="chev" aria-hidden>›</span>
              </summary>
              <div className="post-detail">
                {(x.review_reason || x.error) && ['blocked', 'dropped', 'failed', 'waiting', 'skipped'].includes(x.status) && (
                  <div className={`why why-${x.state.tone}`}><b>{x.status === 'failed' || x.error ? 'What happened' : 'Reviewer'}:</b> {x.error || x.review_reason}</div>
                )}
                {x.review_reason && out && <div className="why why-ok"><b>Reviewer:</b> {x.review_reason}</div>}
                <div className="caption">{x.caption}</div>
                {x.slides.length > 0 && (
                  <div className="thumbs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {x.slides.map((_: unknown, i: number) => <a key={i} href={`/api/slide/${x.id}/${i}.png?r=${x.revision}`} target="_blank" rel="noreferrer"><img src={`/api/slide/${x.id}/${i}.png?r=${x.revision}`} alt={`slide ${i + 1}`} loading="lazy" /></a>)}
                  </div>
                )}
                <div className="meta muted">
                  {x.plan_day && <>Plan: {x.plan_day} · {x.theme} · </>}
                  {x.kind}{x.revision > 0 ? ' · fixed once' : ''}
                  {x.kind === 'video' && <> · <a href={`/api/video/${x.id}?r=${x.revision}`} target="_blank" rel="noreferrer">play video</a></>}
                  {x.post_url && <> · <a href={x.post_url} target="_blank" rel="noreferrer">view on {x.platform}</a></>}
                  {' · '}tracked link <code>{app}/go/{x.link_code}</code>
                </div>
                <div className="row actions">
                  {x.status === 'waiting' && <Link className="button" href="/waiting">Review in Waiting for you</Link>}
                  {['blocked', 'dropped'].includes(x.status) && x.plan_item_id && x.retryable_day && !String(x.review_reason ?? '').includes('[retried]') && (
                    <form action={retryPostAction}>
                      <input type="hidden" name="id" value={x.id} />
                      <button type="submit">Write it again</button>
                      <span className="muted"> &nbsp;The writer starts a fresh version now; the reviewer checks it again.</span>
                    </form>
                  )}
                </div>
              </div>
            </details>
          )
        })}
        {shown.length === 0 && <p className="muted" style={{ padding: 16 }}>No posts here.</p>}
      </div>
    </>
  )
}
