import { test, expect, beforeEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost } from '@/test/db'
import { GET } from './route'

beforeEach(resetDb)
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]
const get = async (id: number) =>
  Buffer.from(await (await GET(new Request('http://app.test/x'), { params: Promise.resolve({ postId: String(id), n: '0.png' }) })).arrayBuffer())

test('carousel slides are 1080x1350, video slides 1080x1920', async () => {
  const { productId, channelId } = await seed({ platform: 'instagram' })
  const slides = sql.json([{ text: '팁' }, { text: '팁 2' }, { text: '팁 3' }])
  const carousel = await insertPost(productId, channelId, { kind: 'carousel', slides })
  const video = await insertPost(productId, channelId, { kind: 'video', slides })
  expect(size(await get(carousel.id))).toEqual([1080, 1350])
  expect(size(await get(video.id))).toEqual([1080, 1920])
}, 30_000)
