import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed } from '@/test/db'
import { pendingWork, workToDo } from './pending'

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

test('writer work: a due plan item or a blocked post to fix; not again within 3 hours of a writer run', async () => {
  const { productId } = await seed()
  await sql`update products set researched_at = now()`
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on, kicked_off_at) values (${productId}, 'confirmed', current_date, current_date + 27, now()) returning id`
  expect(await workToDo()).toMatchObject({ write: false, review: false })
  await sql`insert into plan_items (plan_id, day, platform, format, theme, topic) values (${pl.id}, current_date + 1, 'threads', 'post', 't', 'x')`
  expect((await workToDo()).write).toBe(true)
  await sql`insert into agent_runs (jobs, status, started_at, finished_at) values ('writer reviewer', 'done', now() - interval '1 hour', now() - interval '50 min')`
  expect((await workToDo()).write).toBe(false)
  expect(await pendingWork()).toBe(false)
})

test('review work: drafts waiting, not within an hour of a reviewer run', async () => {
  const { productId, channelId } = await seed()
  await sql`update products set researched_at = now()`
  await sql`insert into plans (product_id, status, starts_on, ends_on, kicked_off_at) values (${productId}, 'confirmed', current_date, current_date + 27, now())`
  await sql`insert into posts (product_id, channel_id, client_key, kind, caption, topic, format_tag, link_code, status) values (${productId}, ${channelId}, 'k', 'text', 'c', 't', 'f', 'code9999', 'draft')`
  expect((await workToDo()).review).toBe(true)
  expect(await pendingWork()).toBe(true)
  await sql`insert into agent_runs (jobs, status, started_at, finished_at) values ('reviewer', 'done', now() - interval '20 min', now() - interval '18 min')`
  expect((await workToDo()).review).toBe(false)
})
