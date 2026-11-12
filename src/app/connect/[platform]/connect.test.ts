import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed } from '@/test/db'
import { GET as start } from './route'
import { GET as done } from './done/route'

beforeEach(async () => { await resetDb(); process.env.ZERNIO_API_KEY = 'sk' })
afterEach(() => vi.unstubAllGlobals())
const call = (h: typeof start, platform: string, query: string) =>
  h(new Request(`http://app.test/connect/${platform}?${query}`), { params: Promise.resolve({ platform }) })
const where = (r: Response) => new URL(r.headers.get('location')!)

test('start: makes the product a Zernio profile once and sends the owner to the login page', async () => {
  const { productId } = await seed({ platform: 'tiktok', account: null })
  const f = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes('/profiles?') ? Response.json({ profiles: [] })
      : init?.method === 'POST' ? Response.json({ profile: { _id: 'pf1' } }, { status: 201 })
        : Response.json({ authUrl: 'https://www.tiktok.com/auth?x=1' }))
  vi.stubGlobal('fetch', f)
  const r = await call(start, 'tiktok', `product=${productId}`)
  expect(r.status).toBe(302)
  expect(r.headers.get('location')).toBe('https://www.tiktok.com/auth?x=1')
  expect((await sql`select zernio_profile_id from products`)[0].zernio_profile_id).toBe('pf1')
  const connect = new URL(String(f.mock.calls.at(-1)![0]))
  expect(connect.searchParams.get('redirect_url')).toBe(`https://app.test/connect/tiktok/done?product=${productId}`)
})

test('start: unknown platform or product → back to Channels with a message, no Zernio call', async () => {
  const { productId } = await seed()
  const f = vi.fn(); vi.stubGlobal('fetch', f)
  expect(where(await call(start, 'myspace', `product=${productId}`)).searchParams.get('msg')).toMatch(/can't connect/)
  expect(where(await call(start, 'tiktok', 'product=999')).pathname).toBe('/channels')
  expect(f).not.toHaveBeenCalled()
})

test('done: links the new account to the channel and says so', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok', account: null })
  await sql`update products set zernio_profile_id = 'pf1'`
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ accounts: [
    { _id: 'yt1', platform: 'youtube', username: 'tube' }, { _id: 'tt1', platform: 'tiktok', username: '@stay' }] })))
  const r = await call(done, 'tiktok', `product=${productId}`)
  expect(where(r).pathname).toBe('/channels')
  expect(where(r).searchParams.get('msg')).toBe('Connected tiktok: @stay')
  const [c] = await sql`select zernio_account_id, needs_reconnect from channels where id = ${channelId}`
  expect(c).toEqual({ zernio_account_id: 'tt1', needs_reconnect: false })
})

test('done: an error from the platform is shown, nothing changes', async () => {
  const { productId, channelId } = await seed({ platform: 'tiktok', account: null })
  await sql`update products set zernio_profile_id = 'pf1'`
  const f = vi.fn(); vi.stubGlobal('fetch', f)
  const r = await call(done, 'tiktok', `product=${productId}&error=access_denied`)
  expect(where(r).searchParams.get('msg')).toBe('tiktok was not connected (access_denied)')
  expect((await sql`select zernio_account_id from channels where id = ${channelId}`)[0].zernio_account_id).toBeNull()
  expect(f).not.toHaveBeenCalled()
})
