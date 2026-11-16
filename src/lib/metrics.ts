import { sql } from './db'
import { getAnalytics, getFollowerStats, ZernioError } from './zernio'

const DAYS = 90
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)

async function remember(note: string) {
  await sql`insert into sync_state (key, at, note) values ('metrics', now(), ${note}) on conflict (key) do update set at = now(), note = ${note}`
}

/**
 * Pull reach, engagement and platform clicks for our published posts, and follower counts per connected account,
 * from Zernio. Runs at most hourly (Zernio caches analytics for an hour). Never throws.
 */
export async function syncMetrics(o: { force?: boolean } = {}): Promise<'ok' | 'skipped' | 'nothing' | 'no-analytics' | 'error'> {
  if (!o.force) {
    const [s] = await sql`select 1 from sync_state where key = 'metrics' and at > now() - interval '1 hour'`
    if (s) return 'skipped'
  }
  const ours = await sql`
    select id, zernio_post_id from posts
    where zernio_post_id is not null and status in ('scheduled', 'published') and scheduled_for > now() - make_interval(days => ${DAYS})`
  if (ours.length === 0) return 'nothing'
  const byZernio = new Map(ours.map(p => [p.zernio_post_id as string, p.id as number]))
  const from = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10)
  try {
    for (let page = 1, seen = 0; page <= 10; page++) {
      const { posts, total } = await getAnalytics({ fromDate: from, page, limit: 100 })
      for (const z of posts) {
        // A list item's _id is Zernio's analytics record; latePostId is the post id we stored when publishing.
        const postId = byZernio.get(z.latePostId ?? z._id)
        if (!postId) continue
        const a = z.analytics ?? {}
        await sql`
          insert into post_metrics (post_id, impressions, reach, views, likes, comments, shares, saves, platform_clicks, engagement_rate, post_url, updated_at)
          values (${postId}, ${n(a.impressions)}, ${n(a.reach)}, ${n(a.views)}, ${n(a.likes)}, ${n(a.comments)}, ${n(a.shares)}, ${n(a.saves)},
            ${n(a.clicks)}, ${typeof a.engagementRate === 'number' ? a.engagementRate : 0}, ${z.platformPostUrl ?? null}, now())
          on conflict (post_id) do update set impressions = excluded.impressions, reach = excluded.reach, views = excluded.views,
            likes = excluded.likes, comments = excluded.comments, shares = excluded.shares, saves = excluded.saves,
            platform_clicks = excluded.platform_clicks, engagement_rate = excluded.engagement_rate,
            post_url = coalesce(excluded.post_url, post_metrics.post_url), updated_at = now()`
      }
      seen += posts.length
      if (posts.length === 0 || seen >= total) break
    }
    const channels = await sql`select id, zernio_account_id from channels where zernio_account_id is not null`
    const accounts = [...new Set(channels.map(c => c.zernio_account_id as string))]
    for (let i = 0; i < accounts.length; i += 25) {
      const stats = await getFollowerStats(accounts.slice(i, i + 25), from)
      for (const c of channels) {
        for (const d of stats[c.zernio_account_id] ?? []) {
          await sql`insert into follower_counts (channel_id, day, followers) values (${c.id}, ${d.date}, ${n(d.followers)})
            on conflict (channel_id, day) do update set followers = excluded.followers`
        }
      }
    }
    await remember('')
    return 'ok'
  } catch (e) {
    if (e instanceof ZernioError && (e.status === 402 || e.status === 403)) {
      await remember('analytics not available on this Zernio plan')
      return 'no-analytics'
    }
    await remember(`sync failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300))
    return 'error'
  }
}

/**
 * Views, reactions and comments of our Dev.to articles, read with each Dev.to channel's own key (Zernio doesn't cover Dev.to).
 * An article is matched to its post by our /go/<code> link in its body. At most hourly. Never throws.
 */
export async function syncDevto(o: { force?: boolean } = {}): Promise<'ok' | 'skipped' | 'nothing' | 'error'> {
  if (!o.force) {
    const [s] = await sql`select 1 from sync_state where key = 'devto' and at > now() - interval '1 hour'`
    if (s) return 'skipped'
  }
  const keys = await sql`select distinct target from channels where platform = 'devto' and target is not null`
  if (keys.length === 0) return 'nothing'
  const note = async (n: string) => sql`insert into sync_state (key, at, note) values ('devto', now(), ${n}) on conflict (key) do update set at = now(), note = ${n}`
  try {
    for (const { target } of keys) {
      const r = await fetch('https://dev.to/api/articles/me/published?per_page=100', {
        headers: { 'api-key': target, Accept: 'application/vnd.forem.api-v1+json' }, signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) throw new Error(`devto ${r.status}`)
      for (const a of (await r.json()) as any[]) {
        const code = String(a?.body_markdown ?? '').match(/\/go\/([a-z0-9]{8})\b/)?.[1]
        if (!code) continue
        await sql`
          insert into post_metrics (post_id, views, likes, comments, post_url, updated_at)
          select id, ${n(a.page_views_count)}, ${n(a.public_reactions_count)}, ${n(a.comments_count)}, ${a.url ?? null}, now() from posts where link_code = ${code}
          on conflict (post_id) do update set views = excluded.views, likes = excluded.likes, comments = excluded.comments,
            post_url = coalesce(excluded.post_url, post_metrics.post_url), updated_at = now()`
      }
    }
    await note('')
    return 'ok'
  } catch (e) {
    await note(`dev.to sync failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300))
    return 'error'
  }
}
