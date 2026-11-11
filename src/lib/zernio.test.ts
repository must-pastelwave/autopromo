import { test, expect, vi, afterEach, beforeEach } from 'vitest'
import { createPost, listAccounts, ZernioError } from './zernio'

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
