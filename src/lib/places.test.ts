import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { distribute, placeStats, suggestPlaces } from './places'
import { GET as go } from '@/app/go/[code]/route'

beforeEach(async () => { await resetDb(); process.env.TELEGRAM_BOT_TOKEN = '987654:TESTTOKEN' })
afterEach(() => vi.unstubAllGlobals())

const open = (code: string, ip: string) => go(
  new Request(`http://app.test/go/${code}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': ip } }),
  { params: Promise.resolve({ code }) })

test('places: suggested → approved → each gets the newest post with its own link; people counted per place', async () => {
  const { productId, channelId } = await seed()
  const post = await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date() })

  const r = await suggestPlaces(productId, [
    { name: 'r/travel', url: 'https://www.reddit.com/r/travel', kind: 'reddit', members: 9000000, rules: 'self-promo on Sundays', why: 'travellers' },
    { name: 'Travel deals TG', url: 'https://t.me/traveldeals', kind: 'telegram', members: '12000' },
    { name: 'no url' },
  ])
  expect(r).toEqual({ added: 2, errors: ['places[2]: name and an http(s) url are required'] })
  expect((await suggestPlaces(productId, [{ name: 'again', url: 'https://www.reddit.com/r/travel' }])).added).toBe(0)

  await distribute()
  expect((await sql`select count(*)::int as n from shares`)[0].n).toBe(0)   // nothing until the owner approves

  await sql`update places set status = 'approved'`
  await distribute()
  await distribute()   // runs again: one share per place, not two
  const shares = await sql`select s.*, pl.kind from shares s join places pl on pl.id = s.place_id order by pl.id`
  expect(shares.map(s => [s.kind, s.post_id, s.status])).toEqual([['reddit', post.id, 'todo'], ['telegram', post.id, 'todo']])

  // Two people via reddit (one of them twice), one via the post's own link.
  const reddit = shares[0].link_code
  const res = await open(reddit, '1.1.1.1')
  expect(new URL(res.headers.get('location')!).searchParams.get('utm_source')).toBe('reddit')
  await open(reddit, '1.1.1.1')
  await open(reddit, '2.2.2.2')
  await open(post.link_code, '1.1.1.1')
  const stats = await placeStats(productId)
  expect(stats.map(s => [s.name, s.people])).toEqual([['r/travel', 2], ['Travel deals TG', 0]])
  expect((await sql`select count(*)::int as n from clicks where post_id = ${post.id}`)[0].n).toBe(3)
})

test('auto places post by themselves, once; per_week caps how often a place gets a post', async () => {
  const { productId, channelId } = await seed()
  const older = await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date(Date.now() - 86400_000) })
  const newer = await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date() })
  await suggestPlaces(productId, [{ name: 'Partner TG', url: 'https://t.me/partner', kind: 'telegram' }])
  await sql`update places set status = 'approved', how = 'auto', target = '-1001234567890', per_week = 1`

  const f = vi.fn(async () => Response.json({ ok: true, result: { message_id: 7 } })); vi.stubGlobal('fetch', f)
  await distribute()
  await distribute()
  expect(f).toHaveBeenCalledTimes(1)
  const [s] = await sql`select * from shares`
  expect(s).toMatchObject({ post_id: newer.id, status: 'posted' })
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body).toEqual({ chat_id: '-1001234567890', text: `삿포로 겨울 여행 팁\n\nhttps://app.test/go/${s.link_code}` })

  await sql`update places set per_week = 2`
  await distribute()
  expect((await sql`select post_id from shares order by id`).map(r => r.post_id)).toEqual([newer.id, older.id])
})
