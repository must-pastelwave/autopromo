import { test, expect, beforeEach, vi, afterEach } from 'vitest'
import { sql } from '@/lib/db'
import { resetDb, seed } from '@/test/db'
import { GET as products } from './products/route'
import { POST as tried } from './products/[id]/tried/route'
import { POST as kickoff } from './plans/[id]/kickoff/route'
import { confirmPlan } from '@/lib/plans'

beforeEach(resetDb)
afterEach(() => vi.unstubAllGlobals())
const post = (body?: unknown) => new Request('http://app.test/x', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const first = async () => (await (await products()).json()).products[0]

test('an agent tried in the last 3 hours is not asked again (no retry loops); older tries are', async () => {
  const { productId } = await seed()
  await sql`update products set fact_sheet = '[]' where id = ${productId}`
  expect((await first()).needs_research).toBe(true)
  expect((await tried(post({ agent: 'researcher' }), ctx(productId))).status).toBe(200)
  expect((await first()).needs_research).toBe(false)
  await sql`update products set agent_tried = jsonb_set(agent_tried, '{researcher}', to_jsonb(now() - interval '4 hours'))`
  expect((await first()).needs_research).toBe(true)
})

test('planning needs at least one chosen channel, and respects the retry guard', async () => {
  const { productId } = await seed()
  await sql`update channels set enabled = false`
  expect((await first()).needs_plan).toBe(false)
  await sql`update channels set enabled = true`
  expect((await first()).needs_plan).toBe(true)
  await tried(post({ agent: 'planner' }), ctx(productId))
  expect((await first()).needs_plan).toBe(false)
})

test('tried: only known agents, known products', async () => {
  const { productId } = await seed()
  expect((await tried(post({ agent: 'hacker' }), ctx(productId))).status).toBe(400)
  expect((await tried(post({ agent: 'planner' }), ctx(999))).status).toBe(404)
})

test('a newly confirmed plan is listed for kickoff once', async () => {
  const { productId } = await seed()
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date, current_date + 27) returning id`
  expect((await first()).kickoff_plan_id).toBeNull()
  expect(await confirmPlan(pl.id)).toBe(true)
  expect((await first()).kickoff_plan_id).toBe(pl.id)
  expect((await kickoff(post(), ctx(pl.id))).status).toBe(200)
  expect((await first()).kickoff_plan_id).toBeNull()
})

test('confirming is the approval: the product\'s chosen channels publish automatically', async () => {
  const { productId } = await seed({ auto: false })
  await sql`insert into channels (product_id, platform, automatable, enabled) values (${productId}, 'x', true, false)`
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date, current_date + 27) returning id`
  expect(await confirmPlan(pl.id)).toBe(true)
  const ch = await sql`select platform, auto_publish from channels order by id`
  expect(ch).toEqual([{ platform: 'threads', auto_publish: true }, { platform: 'x', auto_publish: false }])
  expect(await confirmPlan(pl.id)).toBe(false)
})
