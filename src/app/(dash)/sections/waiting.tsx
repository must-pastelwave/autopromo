import { sql } from '@/lib/db'
import { approveWaiting, resolveWaiting } from '../actions'
import { CopyOpen } from './copy-open'

const WRITE_PAGE: Record<string, string> = {
  naver_blog: 'https://blog.naver.com/GoBlogWrite.naver',
  naver_cafe: 'https://cafe.naver.com/',
  reddit: 'https://www.reddit.com/submit',
  hackernews: 'https://news.ycombinator.com/submit',
}

export async function WaitingSection({ p }: { p: Record<string, any> }) {
  const app = (process.env.APP_URL ?? '').replace(/\/$/, '')
  const posts = await sql`
    select x.*, c.platform, c.automatable from posts x join channels c on c.id = x.channel_id
    where x.product_id = ${p.id} and x.status = 'waiting' order by x.id`
  return (
    <>
      <p className="muted">Posts the reviewer passed. Approve-first channels wait for you here until you turn on auto-publish in Channels. Anything left here expires after 7 days.</p>
      {posts.map(x => {
        const text = `${x.caption}\n\n${app}/go/${x.link_code}`
        return (
          <div key={x.id} className="card" style={{ marginBottom: 12 }}>
            <div className="muted">{x.platform} · {x.topic}{x.review_reason ? ` · reviewer: ${x.review_reason}` : ''}</div>
            <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{x.automatable ? x.caption : text}</div>
            {x.slides.length > 0 && (
              <div className="thumbs" style={{ marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.slides.map((_: unknown, i: number) => <a key={i} href={`/api/slide/${x.id}/${i}.png?r=${x.revision}`} target="_blank"><img src={`/api/slide/${x.id}/${i}.png?r=${x.revision}`} alt={`slide ${i + 1}`} loading="lazy" /></a>)}
              </div>
            )}
            {x.kind === 'video' && (
              <details style={{ marginBottom: 8 }}>
                <summary>Preview video</summary>
                <video src={`/api/video/${x.id}?r=${x.revision}`} controls preload="none" style={{ width: 270, height: 480, background: '#000' }} />
              </details>
            )}
            <div className="row">
              {x.automatable ? (
                <form action={approveWaiting}><input type="hidden" name="id" value={x.id} /><button type="submit">Approve &amp; schedule</button></form>
              ) : (
                <>
                  <CopyOpen text={text} href={WRITE_PAGE[x.platform] ?? p.url} />
                  <form action={resolveWaiting}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="outcome" value="posted" /><button type="submit">I posted it</button></form>
                </>
              )}
              <form action={resolveWaiting}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="outcome" value="skip" /><button type="submit" className="ghost">Skip</button></form>
            </div>
          </div>
        )
      })}
      {posts.length === 0 && <p>Nothing waiting.</p>}
    </>
  )
}
