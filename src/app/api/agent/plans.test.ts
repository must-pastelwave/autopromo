import { test, expect, beforeEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed } from '@/test/db'
import { PUT as putPlan } from './products/[id]/plan/route'
import { GET as getPlans } from './plans/route'
import { GET as products } from './products/route'
import { GET as dueItems } from './plan-items/route'
import { runMaintenance } from '@/lib/publish'

beforeEach(resetDb)
const json = (method: string, body?: unknown) =>
  new Request('http://app.test/x', { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const strategy = { goal: 'Unity sign-ups', cta: 'Join MPC Unity', audience: 'RWA people', channels: [{ platform: 'threads', why: 'x' }], themes: [{ name: 'Explainers', why: 'y' }], rules: ['no token'] }
const item = (extra: Record<string, unknown> = {}) => ({ day: addDays(1), platform: 'threads', format: 'post', theme: 'Explainers', topic: 'Five layers', angle: 'from ground to record', facts: [0], ...extra })
const needsPlan = async () => (await (await products()).json()).products[0].needs_plan

test('a researched product without a plan needs one; a draft waits for the owner', async () => {
  const { productId } = await seed()
  expect(await needsPlan()).toBe(true)
  const r = await putPlan(json('PUT', { strategy, items: [item()] }), ctx(productId))
  expect(r.status).toBe(201)
  const [p] = await sql`select status, starts_on, ends_on, revision from plans`
  expect(p.status).toBe('draft')
  expect(p.revision).toBe(0)
  expect(Math.round((p.ends_on.getTime() - p.starts_on.getTime()) / 86400_000)).toBe(27)
  expect(await needsPlan()).toBe(false)
})

test('a product with no facts yet does not need a plan', async () => {
  const { productId } = await seed()
  await sql`update products set fact_sheet = '[]' where id = ${productId}`
  expect(await needsPlan()).toBe(false)
})

test('revising: owner feedback → needs_plan; the planner\'s next PUT replaces the draft and clears the feedback', async () => {
  const { productId } = await seed()
  await putPlan(json('PUT', { strategy, items: [item(), item({ topic: 'Second' })] }), ctx(productId))
  await sql`update plans set status = 'revising', feedback = 'no safety posts in week 1'`
  expect(await needsPlan()).toBe(true)
  const got = await (await getPlans(new Request(`http://app.test/x?product_id=${productId}`))).json()
  expect(got.draft).toMatchObject({ status: 'revising', feedback: 'no safety posts in week 1' })
  expect(got.draft.items).toHaveLength(2)
  expect((await putPlan(json('PUT', { strategy, items: [item({ topic: 'Revised' })] }), ctx(productId))).status).toBe(200)
  const [p] = await sql`select id, status, feedback, revision from plans`
  expect(p).toMatchObject({ status: 'draft', feedback: '', revision: 1 })
  expect((await sql`select topic from plan_items`).map(r => r.topic)).toEqual(['Revised'])
})

test('a confirmed plan ending within a week → the next plan starts the day after it ends', async () => {
  const { productId } = await seed()
  await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', ${addDays(-24)}, ${addDays(3)})`
  expect(await needsPlan()).toBe(true)
  const r = await putPlan(json('PUT', { strategy, items: [item({ day: addDays(4) })] }), ctx(productId))
  expect(r.status).toBe(201)
  const [next] = await sql`select starts_on from plans where status = 'draft'`
  expect(next.starts_on.toISOString().slice(0, 10)).toBe(addDays(4))
})

test('bad plans are refused', async () => {
  const { productId } = await seed()
  for (const bad of [
    { strategy, items: [] },
    { strategy: { ...strategy, cta: '' }, items: [item()] },
    { strategy, items: [item({ platform: 'myspace' })] },
    { strategy, items: [item({ format: 'video' })] },
    { strategy, items: [item({ day: addDays(40) })] },
    { strategy, items: [item({ facts: [9] })] },
    { strategy, items: [item({ topic: '' })] },
  ]) expect((await putPlan(json('PUT', bad), ctx(productId))).status, JSON.stringify(bad)).toBe(400)
  expect((await putPlan(json('PUT', { strategy, items: [item()] }), ctx(999))).status).toBe(404)
  expect(today()).toMatch(/^\d{4}-/)
})

test('due items: planned items of confirmed plans in the next days, with their channel; missed ones are skipped', async () => {
  const { productId, channelId } = await seed()
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', current_date - 5, current_date + 22) returning id`
  const [draft] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date + 23, current_date + 50) returning id`
  const add = (plan: number, offset: number, status = 'planned') =>
    sql`insert into plan_items (plan_id, day, platform, format, theme, topic, status) values (${plan}, current_date + ${offset}::int, 'threads', 'post', 't', ${`d${offset}`}, ${status})`
  await add(pl.id, -4); await add(pl.id, 0); await add(pl.id, 2); await add(pl.id, 5); await add(pl.id, 1, 'written'); await add(draft.id, 1)
  const { items } = await (await dueItems(new Request('http://app.test/x?days=2'))).json()
  expect(items.map((i: any) => i.topic)).toEqual(['d0', 'd2'])
  expect(items[0]).toMatchObject({ product_id: productId, channel_id: channelId, platform: 'threads' })
  await runMaintenance()
  expect((await sql`select status from plan_items where topic = 'd-4'`)[0].status).toBe('skipped')
})
