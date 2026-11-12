import { sql } from './db'
import { nextSlot, startOfDay } from './slots'
import { createPost, getPost, uploadMedia } from './zernio'
import { renderVideo } from './video'
import { trackUse } from './photos'

// Shown where captions can't hold a clickable link. Keyed by the product's language.
const BIO_NOTE: Record<string, string> = { ko: '프로필 링크에서 확인하세요', en: 'Link in our profile' }
const NEEDS_RECONNECT = /token|reconnect|unauthori[sz]ed|expired|permission|auth/i
const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '')

// These apps don't make caption links clickable; the profile bio links to /l/<slug> instead.
const LINK_IN_BIO = ['instagram', 'tiktok', 'youtube']

function captionFor(platform: string, caption: string, code: string, language: string): string {
  return LINK_IN_BIO.includes(platform) ? `${caption}\n\n${BIO_NOTE[language] ?? BIO_NOTE.ko}` : `${caption}\n\n${appUrl()}/go/${code}`
}

/** Per-platform fields Zernio needs for video posts. */
function videoFields(platform: string, caption: string) {
  if (platform === 'youtube') {
    return { platformSpecificData: { title: caption.split('\n')[0].trim().slice(0, 100), visibility: 'public', madeForKids: false } }
  }
  if (platform === 'tiktok') {
    // Consent flags: the owner reviewed this channel's posts and chose auto-publish (or approved this one).
    // ponytail: commercial disclosure fixed to brand_organic; make it a product setting when promoting paid partners.
    return { extra: { tiktokSettings: {
      privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, allow_duet: false, allow_stitch: false,
      content_preview_confirmed: true, express_consent_given: true, video_made_with_ai: true,
      commercialContentType: 'brand_organic',
    } } }
  }
  return {}
}

const slideUrlsFor = (postId: number, count: number, revision: number) =>
  // ?r= busts the 24h image cache when a revised post reuses the same id.
  Array.from({ length: count }, (_, i) => `${appUrl()}/api/slide/${postId}/${i}.png?r=${revision}`)

/** Fetch the post's rendered slides and make the mp4 (what gets posted, and the owner's preview). */
export async function renderPostVideo(postId: number, slideCount: number, revision: number): Promise<Buffer> {
  const pngs = await Promise.all(slideUrlsFor(postId, slideCount, revision).map(async u => {
    const r = await fetch(u)
    if (!r.ok) throw new Error(`slide ${u} returned ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  }))
  return renderVideo(pngs)
}

/** Schedule a reviewed post in Zernio, or park it in "Waiting for you" for a person to approve or post. */
export async function publish(postId: number, opts: { retry?: boolean; approved?: boolean } = {}): Promise<void> {
  const [row] = await sql`
    select p.*, c.platform, c.enabled, c.automatable, c.auto_publish, c.zernio_account_id, c.started_at, c.per_day, pr.timezone, pr.language, to_char(i.day, 'YYYY-MM-DD') as plan_day
    from posts p join channels c on c.id = p.channel_id join products pr on pr.id = p.product_id
    left join plan_items i on i.id = p.plan_item_id
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

  // Slots are per Zernio account, so products sharing one account share its daily posts (the cap is this channel's per-day).
  const taken = await sql`
    select p.scheduled_for from posts p join channels c on c.id = p.channel_id
    where (p.channel_id = ${row.channel_id} or (c.zernio_account_id = ${row.zernio_account_id} and c.platform = ${row.platform}))
      and p.id <> ${postId} and p.status in ('scheduled', 'published')
      and p.scheduled_for > now() - interval '1 day'`
  // ponytail: two publishes racing on one account could pick the same slot; agents run one at a time.
  // Never before the plan item's day.
  const notBefore = row.plan_day ? startOfDay(row.timezone, row.plan_day) : new Date(0)
  const when = nextSlot({
    now: new Date(Math.max(Date.now(), notBefore.getTime())), tz: row.timezone,
    perDay: row.per_day,
    startedAt: row.started_at, taken: taken.map(t => t.scheduled_for),
  })
  const slides: { photo_track?: string }[] = row.slides ?? []
  const slideUrls = slideUrlsFor(postId, slides.length, row.revision)
  const isVideo = row.kind === 'video'
  try {
    const { zernioId } = await createPost({
      postId, accountId: row.zernio_account_id, platform: row.platform,
      caption: captionFor(row.platform, row.caption, row.link_code, row.language),
      mediaUrls: isVideo
        ? [await uploadMedia(await renderPostVideo(postId, slides.length, row.revision), `post-${postId}-r${row.revision}.mp4`, 'video/mp4')]
        : slideUrls,
      scheduledFor: when,
      // A new key per revision and for the retry: Zernio would replay a failed attempt under the same key.
      idempotencyKey: `post-${postId}-r${row.revision}${opts.retry ? '-retry' : ''}`,
      ...(isVideo ? { mediaType: 'video' as const, ...videoFields(row.platform, row.caption) } : {}),
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
  await sql`update posts set status = 'expired' where status = 'waiting' and status_changed_at < now() - interval '7 days'`

  // Plan items more than a day overdue are skipped: a late post on an old plan date helps nobody.
  await sql`update plan_items set status = 'skipped' where status = 'planned' and day < current_date - 1`

  // Passed review but publish never ran to the end (a crash or timeout): try again.
  const stuck = await sql`select id from posts where status = 'passed' and status_changed_at < now() - interval '10 minutes'`
  for (const s of stuck) await publish(s.id)

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
