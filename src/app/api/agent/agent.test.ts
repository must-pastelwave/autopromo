import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost, planItem } from '@/test/db'
import { proxy } from '@/proxy'
import { POST as createPost, GET as listPosts } from './posts/route'
import { PUT as revisePost } from './posts/[id]/route'
import { POST as review } from './posts/[id]/review/route'
import { PUT as putFacts } from './products/[id]/facts/route'
import { GET as products } from './products/route'
import { PUT as putProfile } from './products/[id]/profile/route'
import { GET as stats } from './stats/route'

beforeEach(async () => { await resetDb(); process.env.AGENT_TOKEN = 'tok'; process.env.ZERNIO_API_KEY = 'sk' })
afterEach(() => vi.unstubAllGlobals())

const json = (method: string, body?: unknown) =>
  new Request('http://app.test/x', { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const ctx = (params: { id: string }) => ({ params: Promise.resolve(params) })
/** Attach a fresh planned item of a confirmed plan for the body's channel. */
async function withItem<T extends { product_id: number; channel_id: number }>(b: T): Promise<T & { plan_item_id?: number }> {
  const [c] = await sql`select platform from channels where id = ${b.channel_id}`
  return c ? { ...b, plan_item_id: await planItem(b.product_id, c.platform) } : b
}

const textPost = (productId: number, channelId: number, extra: Record<string, unknown> = {}) => ({
  product_id: productId, channel_id: channelId, client_key: '2026-11-12-threads-1', kind: 'text',
  caption: '겨울 삿포로 여행 팁', slides: [], topic: 'sapporo', format_tag: 'tip', is_experiment: false, facts_used: [0], ...extra,
})

test('no token → 401 from proxy', async () => {
  const r = proxy(new NextRequest('http://app.test/api/agent/products'))
  expect(r.status).toBe(401)
})

test('products lists active products with enabled channels', async () => {
  const { productId } = await seed()
  const body = await (await products()).json()
  expect(body.products).toHaveLength(1)
  expect(body.products[0]).toMatchObject({ id: productId, slug: 'l2u' })
  expect(body.products[0].channels[0]).toMatchObject({ platform: 'threads', enabled: true })
})

test('create: clean post → draft with a link code', async () => {
  const { productId, channelId } = await seed()
  const r = await createPost(json('POST', await withItem(textPost(productId, channelId))))
  expect(r.status).toBe(201)
  const { post } = await r.json()
  expect(post).toMatchObject({ status: 'draft', revision: 0 })
  expect(post.link_code).toMatch(/^[a-z0-9]{8}$/)
})

test('create: banned phrase → blocked with reason', async () => {
  const { productId, channelId } = await seed()
  const { post } = await (await createPost(json('POST', await withItem(textPost(productId, channelId, { caption: '최저가 보장 호텔' }))))).json()
  expect(post).toMatchObject({ status: 'blocked', review_reason: 'banned: 최저가 보장' })
})

test('create: banned phrase inside a slide is caught too', async () => {
  const { productId } = await seed()
  const [ig] = await sql`insert into channels (product_id, platform, automatable, enabled, zernio_account_id) values (${productId}, 'instagram', true, true, 'ig1') returning id`
  const slides = ['팁 1', '팁 2', '마감 임박', '팁 4', '팁 5'].map(text => ({ text }))
  const { post } = await (await createPost(json('POST', await withItem(textPost(productId, ig.id, { kind: 'carousel', slides }))))).json()
  expect(post.status).toBe('blocked')
})

test('create: same client_key twice → one row, second returns 200', async () => {
  const { productId, channelId } = await seed()
  expect((await createPost(json('POST', await withItem(textPost(productId, channelId))))).status).toBe(201)
  expect((await createPost(json('POST', await withItem(textPost(productId, channelId))))).status).toBe(200)
  expect((await sql`select count(*)::int as n from posts`)[0].n).toBe(1)
})

test('create: bad input → 400', async () => {
  const { productId, channelId } = await seed()
  for (const bad of [
    { kind: 'video' }, { caption: '' }, { kind: 'carousel', slides: [{ text: 'a' }] },
    { facts_used: [9] }, { channel_id: 9999 }, { slides: [{ text: 'x', photo_url: 'javascript:alert(1)' }] },
  ]) {
    expect((await createPost(json('POST', await withItem(textPost(productId, channelId, bad))))).status, JSON.stringify(bad)).toBe(400)
  }
  expect((await createPost(new Request('http://app.test/x', { method: 'POST', body: 'not json' }))).status).toBe(400)
})

test('instagram needs a carousel', async () => {
  const { productId } = await seed({ platform: 'instagram' })
  const [c] = await sql`select id from channels`
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id))))).status).toBe(400)
})

test('tiktok and youtube take video posts only, 3–8 slides', async () => {
  const { productId } = await seed({ platform: 'tiktok' })
  const [c] = await sql`select id from channels`
  const slides = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `팁 ${i}` }))
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id))))).status).toBe(400)
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id, { kind: 'video', slides: slides(2) }))))).status).toBe(400)
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id, { kind: 'video', slides: slides(9) }))))).status).toBe(400)
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id, { kind: 'video', slides: slides(4) }))))).status).toBe(201)
})

test('youtube: first caption line is the title, max 100 chars', async () => {
  const { productId } = await seed({ platform: 'youtube' })
  const [c] = await sql`select id from channels`
  const slides = Array.from({ length: 4 }, (_, i) => ({ text: `팁 ${i}` }))
  const long = await withItem(textPost(productId, c.id, { kind: 'video', slides, caption: 'a'.repeat(101) + '\n본문' }))
  expect((await createPost(json('POST', long))).status).toBe(400)
  const ok = await withItem(textPost(productId, c.id, { kind: 'video', slides, caption: '제목\n본문' }))
  expect((await createPost(json('POST', ok))).status).toBe(201)
})

test('review: a revised post blocked again is dropped, not left blocked', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId, { status: 'draft', revision: 1 })
  const r = await review(json('POST', { verdict: 'block', reason: 'still wrong' }), ctx({ id: String(p.id) }))
  expect((await r.json()).post.status).toBe('dropped')
})

test('profile: the researcher fills only what the owner left blank; banned words are added, never removed', async () => {
  const { productId } = await seed()
  await sql`update products set url = 'https://www.example.com/x', name = 'example.com', audience = '', language = '', tone_notes = '내 톤', banned_words = '{공짜}' where id = ${productId}`
  const r = await putProfile(json('PUT', {
    name: 'Example', audience: '30대 직장인', language: 'ko', tone_notes: 'researcher tone', banned_words: ['수익', '공짜'],
  }), ctx({ id: String(productId) }))
  expect(r.status).toBe(200)
  const [p] = await sql`select name, audience, language, tone_notes, banned_words from products where id = ${productId}`
  expect(p).toEqual({ name: 'Example', audience: '30대 직장인', language: 'ko', tone_notes: '내 톤', banned_words: ['공짜', '수익'] })
})

test('profile: a name the owner typed is kept', async () => {
  const { productId } = await seed()
  await putProfile(json('PUT', { name: 'Other' }), ctx({ id: String(productId) }))
  expect((await sql`select name from products where id = ${productId}`)[0].name).toBe('L2U')
})

test('profile: bad input → 400, unknown product → 404', async () => {
  const { productId } = await seed()
  expect((await putProfile(json('PUT', { banned_words: 'x' }), ctx({ id: String(productId) }))).status).toBe(400)
  expect((await putProfile(json('PUT', { language: 'a'.repeat(20) }), ctx({ id: String(productId) }))).status).toBe(400)
  expect((await putProfile(json('PUT', {}), ctx({ id: '999' }))).status).toBe(404)
})

test('products: needs_research for a new product, not after the researcher saved facts', async () => {
  const { productId } = await seed()
  const first = (await (await products()).json()).products[0]
  expect(first.needs_research).toBe(true)
  await putFacts(json('PUT', { facts: [{ fact: 'a', source_url: 'https://l2u.co.kr/' }] }), ctx({ id: String(productId) }))
  const after = (await (await products()).json()).products[0]
  expect(after.needs_research).toBe(false)
  expect(after.channels[0]).toHaveProperty('per_day', 1)
})

test('x: caption must leave room for the link (max 250 chars)', async () => {
  const { productId } = await seed({ platform: 'x' })
  const [c] = await sql`select id from channels`
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id, { caption: 'a'.repeat(251) }))))).status).toBe(400)
  expect((await createPost(json('POST', await withItem(textPost(productId, c.id, { caption: 'a'.repeat(250) }))))).status).toBe(201)
})

test('posts come only from a planned item of the confirmed plan for that channel', async () => {
  const { productId, channelId } = await seed()
  const status = async (extra: Record<string, unknown>) => (await createPost(json('POST', textPost(productId, channelId, extra)))).status
  expect(await status({})).toBe(400)
  expect(await status({ plan_item_id: await planItem(productId, 'threads', { planStatus: 'draft' }) })).toBe(400)
  expect(await status({ plan_item_id: await planItem(productId, 'threads', { itemStatus: 'written' }) })).toBe(400)
  expect(await status({ plan_item_id: await planItem(productId, 'linkedin') })).toBe(400)
  const id = await planItem(productId, 'threads')
  const r = await createPost(json('POST', textPost(productId, channelId, { plan_item_id: id })))
  expect(r.status).toBe(201)
  expect((await r.json()).post.plan_item_id).toBe(id)
  expect((await sql`select status from plan_items where id = ${id}`)[0].status).toBe('written')
})

test('list drafts includes the rules the reviewer needs', async () => {
  const { productId, channelId } = await seed()
  await insertPost(productId, channelId, { status: 'draft' })
  const body = await (await listPosts(new Request('http://app.test/x?status=draft'))).json()
  expect(body.posts).toHaveLength(1)
  expect(body.posts[0]).toHaveProperty('fact_sheet')
  expect(body.posts[0]).toHaveProperty('banned_words')
  expect(body.posts[0].platform).toBe('threads')
})

test('review pass → scheduled via Zernio; block → blocked; non-draft → 409', async () => {
  const { productId, channelId } = await seed()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ post: { _id: 'z1', status: 'scheduled' } }, { status: 201 })))
  const a = await insertPost(productId, channelId, { status: 'draft' })
  const b = await insertPost(productId, channelId, { status: 'draft' })
  expect((await review(json('POST', { verdict: 'pass', reason: 'ok' }), ctx({ id: String(a.id) }))).status).toBe(200)
  expect((await sql`select status from posts where id = ${a.id}`)[0].status).toBe('scheduled')
  await review(json('POST', { verdict: 'block', reason: 'claim not in fact sheet' }), ctx({ id: String(b.id) }))
  expect((await sql`select status, review_reason from posts where id = ${b.id}`)[0]).toEqual({ status: 'blocked', review_reason: 'claim not in fact sheet' })
  expect((await review(json('POST', { verdict: 'pass', reason: '' }), ctx({ id: String(a.id) }))).status).toBe(409)
  expect((await review(json('POST', { verdict: 'block', reason: 'x' }), ctx({ id: String(b.id) }))).status).toBe(409)
  expect((await review(json('POST', { verdict: 'block' }), ctx({ id: String(b.id) }))).status).toBe(400)
})

test('revision: first goes back to draft, second → 409 + dropped', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId, { status: 'blocked' })
  const fixed = textPost(productId, channelId, { caption: '수정한 겨울 여행 팁' })
  expect((await revisePost(json('PUT', fixed), ctx({ id: String(p.id) }))).status).toBe(200)
  expect((await sql`select status, revision, caption from posts where id = ${p.id}`)[0]).toEqual({ status: 'draft', revision: 1, caption: '수정한 겨울 여행 팁' })
  await sql`update posts set status = 'blocked' where id = ${p.id}`
  expect((await revisePost(json('PUT', fixed), ctx({ id: String(p.id) }))).status).toBe(409)
  expect((await sql`select status from posts where id = ${p.id}`)[0].status).toBe('dropped')
})

test('removing a fact drops posts that used it, keeps and re-indexes the rest', async () => {
  const { productId, channelId } = await seed()   // facts: [0] 회원 할인가 제공, [1] 국내외 호텔 예약
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
  const uses0 = await insertPost(productId, channelId, { status: 'scheduled', zernio_post_id: 'z1', facts_used: [0] })
  const uses1 = await insertPost(productId, channelId, { status: 'draft', facts_used: [1] })
  const published = await insertPost(productId, channelId, { status: 'published', facts_used: [0] })
  const r = await putFacts(json('PUT', { facts: [{ fact: '국내외 호텔 예약', source_url: 'https://l2u.co.kr/' }] }), ctx({ id: String(productId) }))
  expect(r.status).toBe(200)
  const rows = Object.fromEntries((await sql`select id, status, facts_used from posts`).map(r => [r.id, r]))
  expect(rows[uses0.id].status).toBe('dropped')
  expect(rows[uses1.id]).toMatchObject({ status: 'draft', facts_used: [0] })
  expect(rows[published.id].status).toBe('published')
})

test('facts must have a source url', async () => {
  const { productId } = await seed()
  const r = await putFacts(json('PUT', { facts: [{ fact: '무언가' }] }), ctx({ id: String(productId) }))
  expect(r.status).toBe(400)
})

test('stats: clicks per post', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date() })
  await sql`insert into clicks (post_id) values (${p.id}), (${p.id})`
  const body = await (await stats(new Request(`http://app.test/x?product_id=${productId}`))).json()
  expect(body.posts[0]).toMatchObject({ id: p.id, clicks: 2, channel: 'threads', topic: 'sapporo' })
})

test('non-numeric id → 404, not a crash', async () => {
  expect((await review(json('POST', { verdict: 'pass' }), ctx({ id: 'abc' }))).status).toBe(404)
  expect((await revisePost(json('PUT', {}), ctx({ id: 'abc' }))).status).toBe(404)
  expect((await putFacts(json('PUT', { facts: [] }), ctx({ id: 'abc' }))).status).toBe(404)
})
