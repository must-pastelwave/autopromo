import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost } from '@/test/db'
import { GET } from './route'

beforeEach(resetDb)
afterEach(() => vi.unstubAllGlobals())
const get = (id: string) => GET(new Request('http://app.test/x'), { params: Promise.resolve({ postId: id }) })

test('video post → the same mp4 that would be posted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'))
  await promisify(execFile)(ffmpeg!, ['-f', 'lavfi', '-i', 'color=c=navy:s=108x192', '-frames:v', '1', join(dir, 'p.png')])
  const png = await readFile(join(dir, 'p.png'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(png))))
  const { productId, channelId } = await seed({ platform: 'youtube' })
  const p = await insertPost(productId, channelId, { kind: 'video', slides: sql.json([{ text: 'a' }, { text: 'b' }, { text: 'c' }]) })
  const r = await get(String(p.id))
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toBe('video/mp4')
  expect(Buffer.from(await r.arrayBuffer()).subarray(4, 8).toString()).toBe('ftyp')
}, 60_000)

test('not a video post, or bad id → 404', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId)
  expect((await get(String(p.id))).status).toBe(404)
  expect((await get('abc')).status).toBe(404)
})
