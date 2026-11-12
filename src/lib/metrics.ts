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
        const postId = byZernio.get(z._id)
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
