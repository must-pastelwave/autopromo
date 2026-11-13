import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed, insertPost } from '@/test/db'
import { scorecard } from './scorecard'

beforeEach(resetDb)

test('plan results: seen, engaged, clicks, followers gained, vs targets, by theme and channel', async () => {
  const { productId, channelId } = await seed()
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on, strategy) values (${productId}, 'confirmed', current_date - 6, current_date + 21,
    ${sql.json({ goal: 'g', cta: 'c', targets: { signups: 10, seen: 10000, engaged: 300, clicks: 100, followers: 50 } })}) returning id`
  const item = async (theme: string) => (await sql`insert into plan_items (plan_id, day, platform, format, theme, topic, status) values (${pl.id}, current_date - 1, 'threads', 'post', ${theme}, 't', 'written') returning id`)[0].id
  const a = await insertPost(productId, channelId, { status: 'published', plan_item_id: await item('Explainers') })
  const b = await insertPost(productId, channelId, { status: 'published', plan_item_id: await item('Proof') })
  await sql`insert into post_metrics (post_id, impressions, views, likes, comments, shares, saves) values (${a.id}, 1000, 0, 20, 5, 3, 2), (${b.id}, 0, 4000, 50, 0, 0, 0)`
  await sql`insert into clicks (post_id) select ${a.id} from generate_series(1, 7)`
  await sql`insert into conversions (post_id, kind, external_id) values (${a.id}, 'signup', 's1'), (${a.id}, 'signup', 's2'), (${b.id}, 'purchase', 'p1')`
  await sql`update products set goal_1m = 20, goal_3m = 90 where id = ${productId}`
  await sql`insert into follower_counts (channel_id, day, followers) values (${channelId}, current_date - 8, 90), (${channelId}, current_date - 6, 100), (${channelId}, current_date, 130)`

  const s = (await scorecard(pl.id))!
  expect(s.totals).toMatchObject({ published: 2, signups: 2, purchases: 1, seen: 5000, engaged: 80, clicks: 7, followers: 30 })
  expect(s.targets).toEqual({ signups: 10, purchases: null, seen: 10000, engaged: 300, clicks: 100, followers: 50 })
  expect(s.goal).toEqual({ kind: 'signup', month: 20, threeMonths: 90 })
  expect(s.byTheme.map(t => [t.key, t.signups, t.seen, t.engaged, t.clicks])).toEqual([['Explainers', 2, 1000, 30, 7], ['Proof', 0, 4000, 50, 0]])
  expect(s.byChannel).toEqual([expect.objectContaining({ key: 'threads', published: 2, seen: 5000 })])
  expect(s.elapsedDays).toBe(7)
  expect(s.totalDays).toBe(28)
})

test('no plan → null; plan with nothing published → zeros', async () => {
  const { productId } = await seed()
  expect(await scorecard(999)).toBeNull()
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', current_date, current_date + 27) returning id`
  expect((await scorecard(pl.id))!.totals).toEqual({ published: 0, signups: 0, purchases: 0, seen: 0, engaged: 0, clicks: 0, followers: 0 })
})
