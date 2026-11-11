import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from './db'
import { publish, runMaintenance } from './publish'
import { resetDb, seed, insertPost } from '@/test/db'

beforeEach(async () => { await resetDb(); process.env.ZERNIO_API_KEY = 'sk' })
afterEach(() => vi.unstubAllGlobals())

const zernio = (status: number, body: unknown) => {
  const f = vi.fn(async () => Response.json(body, { status })); vi.stubGlobal('fetch', f); return f
}
const get = async (id: number) => (await sql`select * from posts where id = ${id}`)[0]

test('non-automatable channel → waiting, no Zernio call', async () => {
  const { productId, channelId } = await seed({ platform: 'naver_blog', automatable: false })
  const f = zernio(201, {})
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  expect((await get(p.id)).status).toBe('waiting')
  expect(f).not.toHaveBeenCalled()
})

test('threads: scheduled with tracked link in caption', async () => {
  const { productId, channelId } = await seed()
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  const row = await get(p.id)
  expect(row).toMatchObject({ status: 'scheduled', zernio_post_id: 'z1', error: null })
  expect(row.scheduled_for).toBeInstanceOf(Date)
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body.content).toBe(`삿포로 겨울 여행 팁\n\nhttps://app.test/go/${p.link_code}`)
})

test('instagram carousel: bio pointer instead of link, one .png per slide', async () => {
  const { productId, channelId } = await seed({ platform: 'instagram' })
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const slides = Array.from({ length: 5 }, (_, i) => ({ text: `팁 ${i}` }))
  const p = await insertPost(productId, channelId, { kind: 'carousel', slides: sql.json(slides) })
  await publish(p.id)
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body.content).toBe('삿포로 겨울 여행 팁\n\n프로필 링크에서 확인하세요')
  expect(body.mediaItems).toEqual([0, 1, 2, 3, 4].map(i => ({ url: `https://app.test/api/slide/${p.id}/${i}.png?r=0` })))
})

test('207 → failed with the error kept', async () => {
  const { productId, channelId } = await seed()
  zernio(207, { post: { _id: 'z1', status: 'partial', platforms: [{ error: 'media rejected' }] } })
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  const row = await get(p.id)
  expect(row.status).toBe('failed')
  expect(row.error).toMatch(/zernio 207.*media rejected/)
})

test('channel without Zernio account → failed, not sent', async () => {
  const { productId, channelId } = await seed({ account: null })
  const f = zernio(201, {})
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  expect((await get(p.id))).toMatchObject({ status: 'failed', error: 'channel not connected to Zernio' })
  expect(f).not.toHaveBeenCalled()
})

test('auth-looking error flags the channel for reconnect', async () => {
  const { productId, channelId } = await seed()
  zernio(403, { error: 'Instagram token expired' })
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  expect((await sql`select needs_reconnect from channels where id = ${channelId}`)[0].needs_reconnect).toBe(true)
})

test('second post on a channel takes a different slot', async () => {
  const { productId, channelId } = await seed()
  zernio(201, { post: { _id: 'z', status: 'scheduled' } })
  const a = await insertPost(productId, channelId), b = await insertPost(productId, channelId)
  await publish(a.id); await publish(b.id)
  expect((await get(a.id)).scheduled_for.getTime()).not.toBe((await get(b.id)).scheduled_for.getTime())
})

test('maintenance: expires old waiting, retries 5xx once, leaves 4xx, syncs published', async () => {
  const { productId, channelId } = await seed()
  const old = await insertPost(productId, channelId, { status: 'waiting', created_at: new Date(Date.now() - 8 * 86400_000) })
  const fresh = await insertPost(productId, channelId, { status: 'waiting' })
  const f5 = await insertPost(productId, channelId, { status: 'failed', error: 'zernio 503: down' })
  const f4 = await insertPost(productId, channelId, { status: 'failed', error: 'zernio 400: bad media' })
  const f5again = await insertPost(productId, channelId, { status: 'failed', error: 'retried: zernio 503: down' })
  const due = await insertPost(productId, channelId, { status: 'scheduled', zernio_post_id: 'zz', scheduled_for: new Date(Date.now() - 3600_000) })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === 'POST' ? Response.json({ post: { _id: 'z9', status: 'scheduled' } }, { status: 201 })
      : Response.json({ post: { _id: 'zz', status: 'published' } })))
  await runMaintenance()
  expect((await get(old.id)).status).toBe('expired')
  expect((await get(fresh.id)).status).toBe('waiting')
  expect((await get(f5.id)).status).toBe('scheduled')
  expect((await get(f4.id)).status).toBe('failed')
  expect((await get(f5again.id)).status).toBe('failed')
  expect((await get(due.id)).status).toBe('published')
})

test('approve-first channel: reviewed post waits, approval schedules it', async () => {
  const { productId, channelId } = await seed({ auto: false })
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  expect((await get(p.id)).status).toBe('waiting')
  expect(f).not.toHaveBeenCalled()
  await publish(p.id, { approved: true })
  expect((await get(p.id))).toMatchObject({ status: 'scheduled', zernio_post_id: 'z1' })
})

test('drafts-only channel stays waiting even when approved', async () => {
  const { productId, channelId } = await seed({ platform: 'naver_blog', automatable: false })
  const f = zernio(201, {})
  const p = await insertPost(productId, channelId)
  await publish(p.id, { approved: true })
  expect((await get(p.id)).status).toBe('waiting')
  expect(f).not.toHaveBeenCalled()
})

test('new channels default to approve-first and products to 1 Threads post a day', async () => {
  const [p] = await sql`insert into products (slug, url, name, audience) values ('x', 'https://x.kr/', 'X', 'a') returning threads_per_day, id`
  const [c] = await sql`insert into channels (product_id, platform, automatable) values (${p.id}, 'threads', true) returning auto_publish`
  expect(p.threads_per_day).toBe(1)
  expect(c.auto_publish).toBe(false)
})

test('channel switched Off → passed post is parked, never sent', async () => {
  const { productId, channelId } = await seed()
  await sql`update channels set enabled = false where id = ${channelId}`
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const p = await insertPost(productId, channelId)
  await publish(p.id, { approved: true })
  expect((await get(p.id)).status).toBe('waiting')
  expect(f).not.toHaveBeenCalled()
})

test('maintenance retry on an approve-first channel schedules, not back to waiting', async () => {
  const { productId, channelId } = await seed({ auto: false })
  const p = await insertPost(productId, channelId, { status: 'failed', error: 'zernio 503: down' })
  zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  await runMaintenance()
  expect((await get(p.id)).status).toBe('scheduled')
})

test('APP_URL unset → failed, nothing sent with a broken link', async () => {
  const { productId, channelId } = await seed()
  const f = zernio(201, {})
  const saved = process.env.APP_URL; delete process.env.APP_URL
  try {
    const p = await insertPost(productId, channelId)
    await publish(p.id)
    expect((await get(p.id))).toMatchObject({ status: 'failed', error: 'APP_URL is not set' })
    expect(f).not.toHaveBeenCalled()
  } finally { process.env.APP_URL = saved }
})

test('slide URLs carry the revision so a revised post never gets a cached old image', async () => {
  const { productId, channelId } = await seed({ platform: 'instagram' })
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const slides = Array.from({ length: 5 }, (_, i) => ({ text: `팁 ${i}` }))
  const p = await insertPost(productId, channelId, { kind: 'carousel', slides: sql.json(slides), revision: 1 })
  await publish(p.id)
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body.mediaItems[0].url).toBe(`https://app.test/api/slide/${p.id}/0.png?r=1`)
})
