import { test, expect, beforeEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost } from '@/test/db'
import { GET } from './route'

beforeEach(resetDb)
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 350.0'
const go = (code: string, ua?: string) =>
  GET(new Request(`http://app.test/go/${code}`, { headers: ua ? { 'user-agent': ua } : {} }), { params: Promise.resolve({ code }) })

test('a person: click counted, redirect carries utm + ap_click', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId)
  const r = await go(p.link_code, PHONE)
  expect(r.status).toBe(302)
  const [click] = await sql`select id, post_id from clicks`
  expect(click.post_id).toBe(p.id)
  const to = new URL(r.headers.get('location')!)
  expect(to.origin + to.pathname).toBe('https://l2u.co.kr/')
  expect(to.searchParams.get('ap_click')).toBe(String(click.id))
  expect(to.searchParams.get('utm_source')).toBe('threads')
  expect(to.searchParams.get('src')).toBe(`autopromo-${p.link_code}`)
})

test('a bot: redirected, not counted, no click id', async () => {
  const { productId, channelId } = await seed()
  const p = await insertPost(productId, channelId)
  const r = await go(p.link_code, 'facebookexternalhit/1.1')
  expect(r.status).toBe(302)
  expect(new URL(r.headers.get('location')!).searchParams.has('ap_click')).toBe(false)
  expect((await sql`select count(*)::int as n from clicks`)[0].n).toBe(0)
})

test('unknown code → 404', async () => expect((await go('nope0000', PHONE)).status).toBe(404))
