import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { retryPost } from './retry'
import { workToDo } from './pending'

beforeEach(resetDb)

async function blockedPlanPost(dayOffset = 0) {
  const { productId, channelId } = await seed()
  await sql`update products set researched_at = now()`
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on, kicked_off_at) values (${productId}, 'confirmed', current_date - 5, current_date + 22, now()) returning id`
  const [it] = await sql`insert into plan_items (plan_id, day, platform, format, theme, topic, status) values (${pl.id}, current_date + ${dayOffset}::int, 'threads', 'post', 't', 'x', 'written') returning id`
  const p = await insertPost(productId, channelId, { status: 'blocked', revision: 1, plan_item_id: it.id, client_key: `item-${it.id}` })
  return { p, itemId: it.id as number }
}

test('retry: the blocked post is set aside, its plan item is planned again, and the writer runs despite its cool-down', async () => {
  const { p, itemId } = await blockedPlanPost()
  await sql`insert into agent_runs (jobs, status, started_at, finished_at) values ('writer reviewer', 'done', now() - interval '10 min', now() - interval '9 min')`
  expect((await workToDo()).write).toBe(false)
  expect(await retryPost(p.id)).toBe(true)
  const [post] = await sql`select status, client_key from posts where id = ${p.id}`
  expect(post.status).toBe('dropped')
  expect(post.client_key).not.toBe(`item-${itemId}`)
  expect((await sql`select status from plan_items where id = ${itemId}`)[0].status).toBe('planned')
  expect((await workToDo()).write).toBe(true)
})

test('retry refuses posts that are not blocked or dropped, not from the plan, or whose day is long past', async () => {
  const { p } = await blockedPlanPost(-3)
  expect(await retryPost(p.id)).toBe(false)
  const live = await insertPost(p.product_id, p.channel_id, { status: 'scheduled' })
  expect(await retryPost(live.id)).toBe(false)
  const loose = await insertPost(p.product_id, p.channel_id, { status: 'blocked' })
  expect(await retryPost(loose.id)).toBe(false)
})
