import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchPhotos } from './photos'

const unsplash = { results: [{ urls: { regular: 'https://u/1.jpg' }, user: { name: 'Kim' }, links: { download_location: 'https://api.unsplash.com/photos/a/download' } }] }
const pexels = { photos: [1, 2, 3].map(i => ({ src: { large2x: `https://p/${i}.jpg` }, photographer: `P${i}` })) }

beforeEach(() => { process.env.UNSPLASH_ACCESS_KEY = 'u'; process.env.PEXELS_API_KEY = 'p' })
afterEach(() => vi.unstubAllGlobals())

const mockFetch = () => vi.fn(async (url: string) =>
  Response.json(String(url).includes('unsplash') ? unsplash : pexels))

test('unsplash first, pexels fills the rest', async () => {
  const f = mockFetch(); vi.stubGlobal('fetch', f)
  const r = await searchPhotos('sapporo winter', 3)
  expect(r.map(p => p.url)).toEqual(['https://u/1.jpg', 'https://p/1.jpg', 'https://p/2.jpg'])
  expect(r[0]).toMatchObject({ credit: 'Kim / Unsplash', source: 'unsplash', track: 'https://api.unsplash.com/photos/a/download' })
  expect(r[1]).toMatchObject({ credit: 'P1 / Pexels', source: 'pexels' })
  expect(String(f.mock.calls[0][0])).toContain('orientation=portrait')
})

test('no keys → empty, no calls', async () => {
  delete process.env.UNSPLASH_ACCESS_KEY; delete process.env.PEXELS_API_KEY
  const f = mockFetch(); vi.stubGlobal('fetch', f)
  expect(await searchPhotos('x', 3)).toEqual([])
  expect(f).not.toHaveBeenCalled()
})

test('a failing source is skipped', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    String(url).includes('unsplash') ? new Response('err', { status: 500 }) : Response.json(pexels)))
  expect((await searchPhotos('x', 2)).map(p => p.source)).toEqual(['pexels', 'pexels'])
})
