import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed } from '@/test/db'
import { pendingWork } from './pending'

beforeEach(resetDb)

test('work is pending when a product needs a plan; not when a run is already going', async () => {
  await seed()
  expect(await pendingWork()).toBe(true)
  await sql`insert into agent_runs (jobs, status, started_at) values ('planner', 'running', now() - interval '2 min')`
  expect(await pendingWork()).toBe(false)
  await sql`update agent_runs set started_at = now() - interval '50 min'`
  expect(await pendingWork()).toBe(true)
})

test('nothing pending: researched, planned, not revising, nothing to kick off; paused products never count', async () => {
  const { productId } = await seed()
  await sql`update products set researched_at = now()`
  await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date, current_date + 27)`
  expect(await pendingWork()).toBe(false)
  await sql`update plans set status = 'revising'`
  expect(await pendingWork()).toBe(true)
  await sql`update products set active = false`
  expect(await pendingWork()).toBe(false)
})
