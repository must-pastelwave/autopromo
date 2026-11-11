import { test, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { resetDb, seed, insertPost } from '@/test/db'
import { proxy } from '@/proxy'
import { POST } from './route'
import { GET as stats } from '../agent/stats/route'

beforeEach(async () => { await resetDb(); process.env.CONVERSION_TOKEN = 'conv-secret' })

const req = (body: unknown, token: string | null = 'conv-secret') => new Request('http://app.test/api/conversions', {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
})

async function clickOnPost() {
  const { productId, channelId } = await seed()
  const post = await insertPost(productId, channelId, { status: 'published', scheduled_for: new Date() })
  const [click] = await sql`insert into clicks (post_id) values (${post.id}) returning id`
  return { productId, post, clickId: Number(click.id) }
}

test('proxy lets the conversion endpoint through without an owner session', () => {
  expect(proxy(new NextRequest('http://app.test/api/conversions', { method: 'POST' })).status).not.toBe(307)
})

test('signup by click id → 201, tied to the post', async () => {
  const { post, clickId } = await clickOnPost()
  const r = await POST(req({ click_id: clickId, kind: 'signup', external_id: 'lead-1' }))
  expect(r.status).toBe(201)
  const [c] = await sql`select post_id, click_id, kind from conversions`
  expect(c).toEqual({ post_id: post.id, click_id: String(clickId), kind: 'signup' })
})

test('same external_id twice → 200, one row', async () => {
  const { clickId } = await clickOnPost()
  await POST(req({ click_id: clickId, kind: 'signup', external_id: 'lead-1' }))
  const r = await POST(req({ click_id: clickId, kind: 'signup', external_id: 'lead-1' }))
  expect(r.status).toBe(200)
  expect((await sql`select count(*)::int as n from conversions`)[0].n).toBe(1)
})

test('purchase by post id with a value', async () => {
  const { post } = await clickOnPost()
  expect((await POST(req({ post_id: post.id, kind: 'purchase', value: 10000000 }))).status).toBe(201)
})

test('bad input → 400', async () => {
  const { clickId } = await clickOnPost()
  for (const bad of [{ click_id: 999999, kind: 'signup' }, { kind: 'signup' }, { click_id: clickId, kind: 'refund' },
    { click_id: clickId, kind: 'signup', value: 'lots' }, { click_id: clickId, kind: 'signup', external_id: 'x'.repeat(101) }]) {
    expect((await POST(req(bad))).status, JSON.stringify(bad)).toBe(400)
  }
})

test('wrong or missing token → 401; no token configured → 401', async () => {
  const { clickId } = await clickOnPost()
  expect((await POST(req({ click_id: clickId, kind: 'signup' }, 'nope'))).status).toBe(401)
  expect((await POST(req({ click_id: clickId, kind: 'signup' }, null))).status).toBe(401)
  delete process.env.CONVERSION_TOKEN
  expect((await POST(req({ click_id: clickId, kind: 'signup' }, 'conv-secret'))).status).toBe(401)
})

test('stats include signups and purchases per post', async () => {
  const { productId, post, clickId } = await clickOnPost()
  await POST(req({ click_id: clickId, kind: 'signup', external_id: 'a' }))
  await POST(req({ click_id: clickId, kind: 'purchase', external_id: 'b' }))
  const body = await (await stats(new Request(`http://app.test/x?product_id=${productId}`))).json()
  expect(body.posts[0]).toMatchObject({ id: post.id, clicks: 1, signups: 1, purchases: 1 })
})
