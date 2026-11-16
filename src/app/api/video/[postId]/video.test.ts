import { test, expect, beforeEach } from 'vitest'
import { resetDb, seed, insertPost } from '@/test/db'
import { GET } from './route'

beforeEach(resetDb)
const get = (id: string) => GET(new Request('http://app.test/x'), { params: Promise.resolve({ postId: id }) })

test('a rendered video → redirect to the mp4; not rendered yet → 404 that says so', async () => {
  const { productId, channelId } = await seed({ platform: 'youtube' })
  const done = await insertPost(productId, channelId, { kind: 'video', video_url: 'https://media.zernio.com/v.mp4' })
  const r = await get(String(done.id))
  expect(r.status).toBe(302)
  expect(r.headers.get('location')).toBe('https://media.zernio.com/v.mp4')
  const pending = await insertPost(productId, channelId, { kind: 'video' })
  const p = await get(String(pending.id))
  expect(p.status).toBe(404)
  expect(await p.text()).toMatch(/being made/)
})

test('not a video post, or bad id → 404', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId)
  expect((await get(String(p.id))).status).toBe(404)
  expect((await get('abc')).status).toBe(404)
})
