import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { syncMetrics } from './metrics'

beforeEach(async () => { await resetDb(); process.env.ZERNIO_API_KEY = 'sk' })
afterEach(() => vi.unstubAllGlobals())

const analytics = (posts: unknown[], page = 1, total = posts.length) => ({ posts, pagination: { page, limit: 100, total } })
const zpost = (id: string, a: Record<string, number>) => ({ _id: id, platform: 'threads', platformPostUrl: `https://t.test/${id}`, analytics: { impressions: 0, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, engagementRate: 0, ...a } })

test('stores platform metrics for our published posts and follower counts per connected channel', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId, { status: 'published', zernio_post_id: 'z1', scheduled_for: new Date() })
  const f = vi.fn(async (url: string) => {
    if (url.includes('/analytics?')) return Response.json(analytics([zpost('z1', { impressions: 1500, views: 900, likes: 30, comments: 4, shares: 2, clicks: 11, engagementRate: 2.4 }), zpost('someone-else', { impressions: 9 })]))
    if (url.includes('/follower-stats')) return Response.json({ accounts: [{ _id: 'acc1', currentFollowers: 120 }], stats: { acc1: [{ date: '2026-11-10', followers: 100 }, { date: '2026-11-11', followers: 120 }] } })
    return new Response('?', { status: 404 })
  })
  vi.stubGlobal('fetch', f)
  expect(await syncMetrics({ force: true })).toBe('ok')
  const [m] = await sql`select * from post_metrics where post_id = ${p.id}`
  expect(m).toMatchObject({ impressions: 1500, views: 900, likes: 30, comments: 4, shares: 2, platform_clicks: 11, post_url: 'https://t.test/z1' })
  expect((await sql`select count(*)::int as n from post_metrics`)[0].n).toBe(1)
  const fc = await sql`select to_char(day, 'YYYY-MM-DD') as day, followers from follower_counts where channel_id = ${channelId} order by day`
  expect(fc).toEqual([{ day: '2026-11-10', followers: 100 }, { day: '2026-11-11', followers: 120 }])
})

test('matches analytics to our post by latePostId, since the list _id is a different id', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId, { status: 'published', zernio_post_id: 'z1', scheduled_for: new Date() })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/analytics?')
    ? Response.json(analytics([{ ...zpost('a-record-id', { impressions: 80, likes: 3 }), latePostId: 'z1' }]))
    : Response.json({ stats: {} })))
  expect(await syncMetrics({ force: true })).toBe('ok')
  expect((await sql`select impressions, likes from post_metrics where post_id = ${p.id}`)[0]).toEqual({ impressions: 80, likes: 3 })
})

test('runs at most hourly unless forced; a plan without analytics is remembered, not retried every time', async () => {
  const { productId, channelId } = await seed()
  await insertPost(productId, channelId, { status: 'published', zernio_post_id: 'z1', scheduled_for: new Date() })
  const f = vi.fn(async () => new Response('{"error":"analytics add-on required"}', { status: 402 }))
  vi.stubGlobal('fetch', f)
  expect(await syncMetrics()).toBe('no-analytics')
  expect(await syncMetrics()).toBe('skipped')
  expect((await sql`select note from sync_state where key = 'metrics'`)[0].note).toMatch(/analytics/)
})

test('nothing published yet → no calls', async () => {
  await seed()
  const f = vi.fn(); vi.stubGlobal('fetch', f)
  expect(await syncMetrics({ force: true })).toBe('nothing')
  expect(f).not.toHaveBeenCalled()
})
