import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from './db'
import { publish, runMaintenance } from './publish'
import { resetDb, seed, insertPost } from '@/test/db'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'

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

test('channel not connected yet → the post waits, and goes out once the account is connected', async () => {
  const { productId, channelId } = await seed({ account: null })
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const p = await insertPost(productId, channelId)
  await publish(p.id)
  expect((await get(p.id))).toMatchObject({ status: 'waiting', error: 'connect your threads account to post this' })
  expect(f).not.toHaveBeenCalled()
  await runMaintenance()
  expect((await get(p.id)).status).toBe('waiting')
  await sql`update channels set zernio_account_id = 'acc1' where id = ${channelId}`
  await runMaintenance()
  expect((await get(p.id))).toMatchObject({ status: 'scheduled', error: null })
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
  const old = await insertPost(productId, channelId, { status: 'waiting', status_changed_at: new Date(Date.now() - 8 * 86400_000) })
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

/** Fake network for a video publish: slide PNGs from the app, Zernio presign + upload + post. */
async function videoNet() {
  const dir = await mkdtemp(join(tmpdir(), 'pub-'))
  await promisify(execFile)(ffmpeg!, ['-f', 'lavfi', '-i', 'color=c=navy:s=108x192', '-frames:v', '1', join(dir, 'p.png')])
  const png = await readFile(join(dir, 'p.png'))
  const f = vi.fn(async (url: string) => {
    if (url.startsWith('https://app.test/api/slide/')) return new Response(new Uint8Array(png))
    if (url.endsWith('/media/presign')) return Response.json({ uploadUrl: 'https://upload.test/v', publicUrl: 'https://media.zernio.com/temp/v.mp4' })
    if (url === 'https://upload.test/v') return new Response(null, { status: 200 })
    return Response.json({ post: { _id: 'zv', status: 'scheduled' } }, { status: 201 })
  })
  vi.stubGlobal('fetch', f)
  const postBody = () => JSON.parse(String((f.mock.calls.find(c => String(c[0]).endsWith('/posts')) as unknown as [string, RequestInit])[1].body))
  return { f, postBody }
}
const videoSlides = () => sql.json([{ text: '팁 1' }, { text: '팁 2' }, { text: '팁 3' }])

test('tiktok: slides rendered to one uploaded mp4, TikTok settings, link in bio', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok' })
  const { f, postBody } = await videoNet()
  const p = await insertPost(productId, channelId, { kind: 'video', slides: videoSlides() })
  await publish(p.id)
  expect((await get(p.id))).toMatchObject({ status: 'scheduled', zernio_post_id: 'zv', error: null })
  expect(f.mock.calls.filter(c => String(c[0]).startsWith('https://app.test/api/slide/'))).toHaveLength(3)
  const body = postBody()
  expect(body.mediaItems).toEqual([{ type: 'video', url: 'https://media.zernio.com/temp/v.mp4' }])
  expect(body.content).toBe('삿포로 겨울 여행 팁\n\n프로필 링크에서 확인하세요')
  expect(body.tiktokSettings).toMatchObject({
    privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true, allow_duet: false, allow_stitch: false,
    content_preview_confirmed: true, express_consent_given: true, video_made_with_ai: true,
  })
}, 60_000)

test('youtube: first caption line becomes the title, public, not made for kids', async () => {
  const { productId, channelId } = await seed({ platform: 'youtube' })
  const { postBody } = await videoNet()
  const p = await insertPost(productId, channelId, { kind: 'video', slides: videoSlides(), caption: '겨울 여행 숙박 팁 3가지\n본문' })
  await publish(p.id)
  expect(postBody().platforms[0].platformSpecificData).toEqual({ title: '겨울 여행 숙박 팁 3가지', visibility: 'public', madeForKids: false })
  expect(postBody()).not.toHaveProperty('tiktokSettings')
}, 60_000)

test('video: slide fetch fails → failed, nothing posted', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok' })
  const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response('nope', { status: 500 })); vi.stubGlobal('fetch', f)
  const p = await insertPost(productId, channelId, { kind: 'video', slides: videoSlides() })
  await publish(p.id)
  const row = await get(p.id)
  expect(row.status).toBe('failed')
  expect(row.error).toMatch(/slide/)
  expect(f.mock.calls.some(c => String(c[0]).endsWith('/posts'))).toBe(false)
})

test('maintenance: a post stuck at passed (publish crashed) is published', async () => {
  const { productId, channelId } = await seed()
  const stuck = await insertPost(productId, channelId, { status: 'passed', status_changed_at: new Date(Date.now() - 3600_000) })
  const justPassed = await insertPost(productId, channelId, { status: 'passed' })
  zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  await runMaintenance()
  expect((await get(stuck.id)).status).toBe('scheduled')
  expect((await get(justPassed.id)).status).toBe('passed')
})

test('status changes stamp status_changed_at; waiting expires 7 days after it started waiting', async () => {
  const { productId, channelId } = await seed()
  const oldButNewlyWaiting = await insertPost(productId, channelId, { status: 'passed', created_at: new Date(Date.now() - 30 * 86400_000), status_changed_at: new Date(Date.now() - 30 * 86400_000) })
  await sql`update posts set status = 'waiting' where id = ${oldButNewlyWaiting.id}`
  const stale = await insertPost(productId, channelId, { status: 'waiting', status_changed_at: new Date(Date.now() - 8 * 86400_000) })
  vi.stubGlobal('fetch', vi.fn())
  await runMaintenance()
  expect((await get(oldButNewlyWaiting.id)).status).toBe('waiting')
  expect((await get(stale.id)).status).toBe('expired')
})

test('a retry uses a fresh Zernio idempotency key, so a failed attempt is not replayed', async () => {
  const { productId, channelId } = await seed()
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const p = await insertPost(productId, channelId, { revision: 1 })
  await publish(p.id)
  await sql`update posts set status = 'passed' where id = ${p.id}`
  await publish(p.id, { retry: true, approved: true })
  const keys = f.mock.calls.map(c => new Headers((c as unknown as [string, RequestInit])[1].headers).get('idempotency-key'))
  expect(keys).toEqual([`post-${p.id}-r1`, `post-${p.id}-r1-retry`])
})

test('shared account: another product\'s post on the same Zernio account takes the slot', async () => {
  const a = await seed()
  const [pb] = await sql`insert into products (slug, url, name, audience) values ('b', 'https://b.test/', 'B', 'x') returning id`
  const [cb] = await sql`insert into channels (product_id, platform, automatable, enabled, zernio_account_id, auto_publish) values (${pb.id}, 'threads', true, true, 'acc1', true) returning id`
  zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const first = await insertPost(a.productId, a.channelId)
  await publish(first.id)
  const second = await insertPost(pb.id, cb.id)
  await publish(second.id)
  const [x, y] = [await get(first.id), await get(second.id)]
  expect(y.status).toBe('scheduled')
  expect(y.scheduled_for.getTime()).not.toBe(x.scheduled_for.getTime())
})

test('posts per day come from the channel: per_day 2 → two slots the same day', async () => {
  const { productId, channelId } = await seed()
  await sql`update channels set per_day = 2 where id = ${channelId}`
  zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const a = await insertPost(productId, channelId), b = await insertPost(productId, channelId)
  await publish(a.id); await publish(b.id)
  const [x, y] = [(await get(a.id)).scheduled_for, (await get(b.id)).scheduled_for]
  // One a day would put them exactly 24h apart.
  expect(Math.abs(y.getTime() - x.getTime())).toBeLessThan(86400_000)
})

test('link-in-bio note follows the product language', async () => {
  const { productId, channelId } = await seed({ platform: 'instagram' })
  await sql`update products set language = 'en' where id = ${productId}`
  const f = zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const slides = Array.from({ length: 5 }, (_, i) => ({ text: `tip ${i}` }))
  const p = await insertPost(productId, channelId, { kind: 'carousel', slides: sql.json(slides), caption: 'Winter tips' })
  await publish(p.id)
  expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).content).toBe('Winter tips\n\nLink in our profile')
})

test('a post is never scheduled before its plan item\'s day', async () => {
  const { productId, channelId } = await seed()
  zernio(201, { post: { _id: 'z1', status: 'scheduled' } })
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', current_date, current_date + 27) returning id`
  const [it] = await sql`insert into plan_items (plan_id, day, platform, format, theme, topic, status) values (${pl.id}, current_date + 5, 'threads', 'post', 't', 'x', 'written') returning id, to_char(day, 'YYYY-MM-DD') as day`
  const p = await insertPost(productId, channelId, { plan_item_id: it.id })
  await publish(p.id)
  const when = (await get(p.id)).scheduled_for as Date
  expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(when) >= it.day).toBe(true)
})
