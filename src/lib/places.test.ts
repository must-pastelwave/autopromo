import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { distribute, placeStats, shareText, suggestPlaces } from './places'
import { PUT as writeShare } from '@/app/api/agent/shares/[id]/route'
import { POST as reviewShare } from '@/app/api/agent/shares/[id]/review/route'
import { GET as go } from '@/app/go/[code]/route'

beforeEach(async () => { await resetDb(); process.env.TELEGRAM_BOT_TOKEN = '987654:TESTTOKEN' })
afterEach(() => vi.unstubAllGlobals())

const call = (fn: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>, id: number, body: object) =>
  fn(new Request('http://app.test', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(id) }) })

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
  const older = await insertPost(productId, channelId, { status: 'published', created_at: new Date(Date.now() - 86400_000) })
  const newer = await insertPost(productId, channelId, { status: 'waiting', created_at: new Date() })   // passed review, own channel not connected
  await insertPost(productId, channelId, { status: 'blocked', created_at: new Date() })   // never shared
  await suggestPlaces(productId, [{ name: 'Partner TG', url: 'https://t.me/partner', kind: 'telegram' }])
  await sql`update places set status = 'approved', how = 'auto', target = '-1001234567890', per_week = 1`

  const f = vi.fn(async () => Response.json({ ok: true, result: { message_id: 7 } })); vi.stubGlobal('fetch', f)
  await distribute()
  expect(f).not.toHaveBeenCalled()   // nothing goes out before its text is written for the place and reviewed
  let [s] = await sql`select * from shares`
  expect(s).toMatchObject({ post_id: newer.id, status: 'todo', text_status: 'needed' })
  expect((await call(writeShare, s.id, { text: 'see https://x.com' })).status).toBe(400)   // the app adds the link
  expect((await call(writeShare, s.id, { text: '삿포로 여행 팁, 그룹 회원분들께' })).status).toBe(200)
  await distribute()
  expect(f).not.toHaveBeenCalled()
  expect((await call(reviewShare, s.id, { verdict: 'pass', reason: 'ok' })).status).toBe(200)
  await distribute()
  await distribute()
  expect(f).toHaveBeenCalledTimes(1)
  ;[s] = await sql`select * from shares`
  expect(s).toMatchObject({ post_id: newer.id, status: 'posted' })
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body).toEqual({ chat_id: '-1001234567890', text: `삿포로 여행 팁, 그룹 회원분들께\n\nhttps://app.test/go/${s.link_code}` })

  await sql`update places set per_week = 2`
  await distribute()
  expect((await sql`select post_id from shares order by id`).map(r => r.post_id)).toEqual([newer.id, older.id])
})

test('launches and listings (Show HN, Product Hunt, lists) get one post, ever', async () => {
  const { productId, channelId } = await seed()
  await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date(Date.now() - 86400_000) })
  await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date() })
  await suggestPlaces(productId, [{ name: 'Show HN', url: 'https://news.ycombinator.com/show', kind: 'hackernews' }])
  await sql`update places set status = 'approved', per_week = 5`
  await distribute()
  await distribute()
  expect((await sql`select count(*)::int as n from shares`)[0].n).toBe(1)
})

test('share text: a banned word skips it; list entries get the link inline', async () => {
  const { productId, channelId } = await seed()
  await insertPost(productId, channelId, { status: 'published', created_at: new Date() })
  await sql`update products set banned_words = ${['공짜']} where id = ${productId}`
  await suggestPlaces(productId, [{ name: 'Travel forum', url: 'https://forum.test/travel', kind: 'forum' }])
  await sql`update places set status = 'approved'`
  await distribute()
  const [s] = await sql`select id from shares`
  expect(await (await call(writeShare, s.id, { text: '공짜 여행' })).json()).toEqual({ ok: false, banned: ['공짜'] })
  expect((await sql`select status, text_status from shares`)[0]).toEqual({ status: 'skipped', text_status: 'blocked' })

  expect(shareText('- [L2U](LINK) - 회원 숙박 할인', 'abc')).toBe('- [L2U](https://app.test/go/abc) - 회원 숙박 할인')
  expect(shareText('hello', 'abc')).toBe('hello\n\nhttps://app.test/go/abc')
  // Show HN, lists, Product Hunt, newsletters: the product's own link with our tag, no redirect.
  expect(shareText('[L2U](LINK) - 할인', 'abc', 'list', 'https://l2u.co.kr/')).toBe('[L2U](https://l2u.co.kr/?utm_source=list&utm_medium=social&utm_campaign=autopromo&utm_content=0&src=autopromo-abc) - 할인')
})
