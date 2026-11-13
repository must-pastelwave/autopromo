import { test, expect, beforeEach, vi, afterEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { parseGoals, tracking, goalsWithProgress, syncCounters, repoStars } from './goals'

beforeEach(resetDb)
afterEach(() => vi.unstubAllGlobals())

test('parseGoals: keeps filled rows, drops empty ones, cleans repo urls, rejects nonsense', () => {
  expect(parseGoals([
    { metric: 'signups', source: 'x', m1: '20', m3: '' },
    { metric: 'github_stars', source: 'https://github.com/vercel/next.js/', m1: '', m3: '300' },
    { metric: '', source: '', m1: '5', m3: '' },
    { metric: 'seen', source: '', m1: '', m3: '' },
  ])).toEqual([
    { metric: 'signups', source: '', target_1m: 20, target_3m: null },
    { metric: 'github_stars', source: 'vercel/next.js', target_1m: null, target_3m: 300 },
  ])
  expect(parseGoals([{ metric: 'revenue', source: '', m1: '1', m3: '' }])).toMatch(/Unknown goal/)
  expect(parseGoals([{ metric: 'github_stars', source: 'not a repo', m1: '1', m3: '' }])).toMatch(/owner\/name/)
})

test('sign-ups are only "tracked" once the site has reported one', async () => {
  const { productId, channelId } = await seed()
  expect((await tracking(productId, 'signups', '')).ok).toBe(false)
  const p = await insertPost(productId, channelId, { status: 'published' })
  await sql`insert into conversions (post_id, kind, external_id) values (${p.id}, 'signup', 'a')`
  expect(await tracking(productId, 'signups', '')).toMatchObject({ ok: true })
  expect((await tracking(productId, 'purchases', '')).ok).toBe(false)
})

test('github stars: gain since the window start, or since the first reading', async () => {
  const { productId } = await seed()
  await sql`insert into goals (product_id, metric, source, target_1m, target_3m) values (${productId}, 'github_stars', 'o/r', 50, 200)`
  expect((await goalsWithProgress(productId))[0].tracking.ok).toBe(false)
  await sql`insert into counter_snapshots (source, metric, day, value) values
    ('o/r', 'github_stars', current_date - 40, 100), ('o/r', 'github_stars', current_date - 30, 120), ('o/r', 'github_stars', current_date, 150)`
  const [g] = await goalsWithProgress(productId)
  expect(g.tracking.ok).toBe(true)
  expect(g.last30.value).toBe(30)   // 150 - 120 (the reading on the window's first day)
  expect(g.last90.value).toBe(50)   // 150 - 100 (first reading; started tracking 40 days ago)
})

test('syncCounters reads each repo once and notes failures', async () => {
  const { productId } = await seed()
  await sql`insert into goals (product_id, metric, source, target_1m) values (${productId}, 'github_stars', 'o/r', 5), (${productId}, 'github_stars', 'o/gone', 5)`
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('o/r')
    ? new Response(JSON.stringify({ stargazers_count: 42 }))
    : new Response('{}', { status: 404 })))
  expect(await syncCounters({ force: true })).toBe('partial')
  expect(await sql`select source, value from counter_snapshots`).toEqual([{ source: 'o/r', value: 42 }])
  expect(await repoStars('o/gone')).toBeNull()
})
