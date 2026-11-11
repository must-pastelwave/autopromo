import { sql } from './db'
import { nextSlot } from './slots'
import { createPost, getPost } from './zernio'
import { trackUse } from './photos'

const IG_LINK_NOTE = '프로필 링크에서 확인하세요'
const NEEDS_RECONNECT = /token|reconnect|unauthori[sz]ed|expired|permission|auth/i
const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '')

function captionFor(platform: string, caption: string, code: string): string {
  // Instagram captions can't hold clickable links; the bio links to /l/<slug>.
  return platform === 'instagram' ? `${caption}\n\n${IG_LINK_NOTE}` : `${caption}\n\n${appUrl()}/go/${code}`
}

/** Schedule a reviewed post in Zernio, or park it in "Waiting for you" for a person to approve or post. */
export async function publish(postId: number, opts: { retry?: boolean; approved?: boolean } = {}): Promise<void> {
  const [row] = await sql`
    select p.*, c.platform, c.enabled, c.automatable, c.auto_publish, c.zernio_account_id, c.started_at, pr.timezone, pr.ig_per_day, pr.threads_per_day
    from posts p join channels c on c.id = p.channel_id join products pr on pr.id = p.product_id
    where p.id = ${postId}`
  if (!row) return
  // Drafts-only channels always wait; automatable ones wait until auto-publish is on or a person approves.
  // A channel switched Off is the owner's kill switch: park the post, never send it.
  if (!row.enabled || !row.automatable || (!row.auto_publish && !opts.approved)) {
    await sql`update posts set status = 'waiting' where id = ${postId}`
    return
  }
  const fail = async (msg: string) => {
    await sql`update posts set status = 'failed', error = ${opts.retry ? `retried: ${msg}` : msg} where id = ${postId}`
    if (NEEDS_RECONNECT.test(msg)) await sql`update channels set needs_reconnect = true where id = ${row.channel_id}`
  }
  if (!row.zernio_account_id) return fail('channel not connected to Zernio')
  if (!appUrl()) return fail('APP_URL is not set')

  const taken = await sql`
    select scheduled_for from posts
    where channel_id = ${row.channel_id} and id <> ${postId} and status in ('scheduled', 'published')
      and scheduled_for > now() - interval '1 day'`
  // ponytail: two publishes racing on one channel could pick the same slot; agents run one at a time.
  const when = nextSlot({
    now: new Date(), tz: row.timezone,
    perDay: row.platform === 'instagram' ? row.ig_per_day : row.platform === 'threads' ? row.threads_per_day : 1,
    startedAt: row.started_at, taken: taken.map(t => t.scheduled_for),
  })
  const slides: { photo_track?: string }[] = row.slides ?? []
  try {
    const { zernioId } = await createPost({
      postId, accountId: row.zernio_account_id, platform: row.platform,
      caption: captionFor(row.platform, row.caption, row.link_code),
      // ?r= busts the 24h image cache when a revised post reuses the same id.
      mediaUrls: slides.map((_, i) => `${appUrl()}/api/slide/${postId}/${i}.png?r=${row.revision}`),
      scheduledFor: when,
    })
    await sql`update posts set status = 'scheduled', scheduled_for = ${when}, zernio_post_id = ${zernioId}, error = null where id = ${postId}`
    await sql`update channels set needs_reconnect = false where id = ${row.channel_id}`
    await Promise.all(slides.map(s => trackUse(s.photo_track)))
  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e))
  }
}

/** Periodic upkeep: retry transient failures once, sync published state, expire old drafts. */
export async function runMaintenance(): Promise<void> {
  await sql`update posts set status = 'expired' where status = 'waiting' and created_at < now() - interval '7 days'`

  const retry = await sql`
    select id from posts where status = 'failed'
      and error is not null and error not like 'retried:%' and error !~ '^zernio 4[0-9][0-9]'`
  // Only posts that already got past approval can be 'failed', so the retry counts as approved.
  for (const r of retry) await publish(r.id, { retry: true, approved: true })

  const due = await sql`
    select id, zernio_post_id from posts
    where status = 'scheduled' and zernio_post_id is not null and scheduled_for < now() - interval '5 minutes'`
  for (const d of due) {
    try {
      const z = await getPost(d.zernio_post_id)
      if (z.status === 'published') await sql`update posts set status = 'published' where id = ${d.id}`
      else if (['failed', 'partial', 'cancelled'].includes(z.status)) {
        await sql`update posts set status = 'failed', error = ${`retried: zernio post ${z.status} ${z.error}`.trim()} where id = ${d.id}`
      }
    } catch {
      // Zernio unreachable: try again next run.
    }
  }
}
