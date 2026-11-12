import { test, expect, vi, afterEach, beforeEach } from 'vitest'
import { createPost, listAccounts, uploadMedia, ZernioError } from './zernio'

const args = { postId: 42, accountId: 'acc1', platform: 'threads', caption: 'hi', mediaUrls: ['https://app.test/api/slide/42/0.png'], scheduledFor: new Date('2026-11-12T00:07:00Z') }
beforeEach(() => { process.env.ZERNIO_API_KEY = 'sk_test' })
afterEach(() => vi.unstubAllGlobals())

const respond = (status: number, body: unknown) => { const f = vi.fn(async () => Response.json(body, { status })); vi.stubGlobal('fetch', f); return f }

test('scheduled → returns id, sends idempotency key and body', async () => {
  const f = respond(201, { post: { _id: 'z1', status: 'scheduled' } })
  expect(await createPost(args)).toEqual({ zernioId: 'z1' })
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://zernio.com/api/v1/posts')
  const h = new Headers(init.headers)
  expect(h.get('idempotency-key')).toBe('post-42')
  expect(h.get('authorization')).toBe('Bearer sk_test')
  expect(JSON.parse(String(init.body))).toEqual({
    content: 'hi', mediaItems: [{ url: 'https://app.test/api/slide/42/0.png' }],
    platforms: [{ platform: 'threads', accountId: 'acc1' }], scheduledFor: '2026-11-12T00:07:00.000Z',
  })
})
test('207 throws', async () => { respond(207, { post: { _id: 'z1', status: 'scheduled' } }); await expect(createPost(args)).rejects.toThrow(ZernioError) })
test('partial throws', async () => { respond(201, { post: { _id: 'z1', status: 'partial' } }); await expect(createPost(args)).rejects.toThrow(/partial/) })
test('failed throws', async () => { respond(201, { post: { _id: 'z1', status: 'failed' } }); await expect(createPost(args)).rejects.toThrow(/failed/) })
test('4xx error carries status', async () => {
  respond(400, { error: 'bad media' })
  await expect(createPost(args)).rejects.toMatchObject({ status: 400 })
})
test('no media → no mediaItems field', async () => {
  const f = respond(201, { post: { _id: 'z2', status: 'scheduled' } })
  await createPost({ ...args, mediaUrls: [] })
  expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty('mediaItems')
})

test('no API key → clear error, no network call', async () => {
  delete process.env.ZERNIO_API_KEY
  const f = vi.fn(); vi.stubGlobal('fetch', f)
  await expect(listAccounts()).rejects.toThrow('ZERNIO_API_KEY is not set')
  expect(f).not.toHaveBeenCalled()
})

test('video post: typed media item, platform data and root settings in the body', async () => {
  const f = respond(201, { post: { _id: 'z3', status: 'scheduled' } })
  await createPost({
    ...args, platform: 'youtube', mediaUrls: ['https://media.zernio.com/temp/v.mp4'], mediaType: 'video',
    platformSpecificData: { title: 't' }, extra: { tiktokSettings: { draft: false } },
  })
  const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
  expect(body.mediaItems).toEqual([{ type: 'video', url: 'https://media.zernio.com/temp/v.mp4' }])
  expect(body.platforms).toEqual([{ platform: 'youtube', accountId: 'acc1', platformSpecificData: { title: 't' } }])
  expect(body.tiktokSettings).toEqual({ draft: false })
})

test('uploadMedia: presign, then PUT the bytes, returns the public url', async () => {
  const f = vi.fn(async (url: string) => url.endsWith('/media/presign')
    ? Response.json({ uploadUrl: 'https://upload.test/x', publicUrl: 'https://media.zernio.com/temp/x.mp4' })
    : new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', f)
  const bytes = Buffer.from('mp4')
  expect(await uploadMedia(bytes, 'post-7.mp4', 'video/mp4')).toBe('https://media.zernio.com/temp/x.mp4')
  const [u1, i1] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(u1).toBe('https://zernio.com/api/v1/media/presign')
  expect(JSON.parse(String(i1.body))).toEqual({ filename: 'post-7.mp4', contentType: 'video/mp4' })
  const [u2, i2] = f.mock.calls[1] as unknown as [string, RequestInit]
  expect(u2).toBe('https://upload.test/x')
  expect(i2.method).toBe('PUT')
  expect(new Headers(i2.headers).get('content-type')).toBe('video/mp4')
  expect(new Headers(i2.headers).get('authorization')).toBeNull()
})

test('uploadMedia: failed PUT throws', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/media/presign')
    ? Response.json({ uploadUrl: 'https://upload.test/x', publicUrl: 'https://media.zernio.com/temp/x.mp4' })
    : new Response('denied', { status: 403 })))
  await expect(uploadMedia(Buffer.from('x'), 'a.mp4', 'video/mp4')).rejects.toThrow(/upload 403/)
})
