import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost } from '@/test/db'
import { GET as needed } from './videos/route'
import { POST as video } from './posts/[id]/video/route'

beforeEach(async () => { await resetDb(); process.env.ZERNIO_API_KEY = 'sk' })
afterEach(() => vi.unstubAllGlobals())

const call = (id: number, body: unknown) =>
  video(new Request('http://app.test/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(id) }) })
const row = async (id: number) => (await sql`select * from posts where id = ${id}`)[0]
const slides = () => sql.json([{ text: 'a' }, { text: 'b' }, { text: 'c' }])

test('render step: list → upload slot → done publishes a post that passed review', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok' })
  const p = await insertPost(productId, channelId, { kind: 'video', slides: slides(), revision: 1 })
  await insertPost(productId, channelId, { kind: 'video', slides: slides(), video_url: 'https://done' })
  await insertPost(productId, channelId)   // not a video
  expect((await (await needed()).json()).posts.map((x: { id: number }) => x.id)).toEqual([p.id])

  const f = vi.fn(async (url: string) => url.endsWith('/media/presign')
    ? Response.json({ uploadUrl: 'https://upload.test/x', publicUrl: 'https://media.zernio.com/x.mp4' })
    : Response.json({ post: { _id: 'zv', status: 'scheduled' } }, { status: 201 }))
  vi.stubGlobal('fetch', f)
  expect(await (await call(p.id, {})).json()).toEqual({ upload_url: 'https://upload.test/x' })
  expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).filename).toBe(`post-${p.id}-r1.mp4`)
  expect((await row(p.id)).video_url).toBeNull()   // not the post's video until the upload is confirmed

  expect((await call(p.id, { done: true })).status).toBe(200)
  expect(await row(p.id)).toMatchObject({ video_url: 'https://media.zernio.com/x.mp4', status: 'scheduled', zernio_post_id: 'zv' })
  expect((await (await needed()).json()).posts).toEqual([])
})

test('done without a started upload (a revision cleared it) → 409, nothing changes', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok' })
  const p = await insertPost(productId, channelId, { kind: 'video', slides: slides() })
  expect((await call(p.id, { done: true })).status).toBe(409)
  expect((await row(p.id)).video_url).toBeNull()
})

test('a render that fails twice is left out, with the reason', async () => {
  const { productId, channelId } = await seed({ platform: 'youtube' })
  const p = await insertPost(productId, channelId, { kind: 'video', slides: slides(), status: 'draft' })
  await call(p.id, { error: 'chrome crashed' })
  expect((await row(p.id)).error).toBe('video failed: chrome crashed')
  expect((await (await needed()).json()).posts).toHaveLength(1)
  await call(p.id, { error: 'chrome crashed again' })
  expect((await row(p.id)).error).toBe('video failed twice: chrome crashed again')
  expect((await (await needed()).json()).posts).toEqual([])
})

test('not a video post → 404', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId)
  expect((await call(p.id, {})).status).toBe(404)
})
