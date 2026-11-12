import { sql } from './db'

export type Numbers = { published: number; seen: number; engaged: number; clicks: number; followers: number }
type Row = Omit<Numbers, 'followers'> & { key: string }

/**
 * How a plan's campaign is doing, measured by autopromo itself (no help from the product's site):
 * seen (impressions or views), engaged (likes, comments, shares, saves), clicks on our tracked links,
 * and followers gained on its channels since the plan started, with the plan's own targets.
 */
export async function scorecard(planId: number) {
  const [plan] = await sql`
    select product_id, strategy, starts_on, ends_on,
      (least(current_date, ends_on) - starts_on + 1)::int as elapsed, (ends_on - starts_on + 1)::int as total
    from plans where id = ${planId}`
  if (!plan) return null
  const per = (group: 'theme' | 'platform') => sql<Row[]>`
    select i.${sql(group)} as key, count(x.id)::int as published,
      coalesce(sum(greatest(m.impressions, m.views, m.reach)), 0)::int as seen,
      coalesce(sum(m.likes + m.comments + m.shares + m.saves), 0)::int as engaged,
      coalesce(sum((select count(*) from clicks k where k.post_id = x.id)), 0)::int as clicks
    from plan_items i
    join posts x on x.plan_item_id = i.id and x.status in ('scheduled', 'published')
    left join post_metrics m on m.post_id = x.id
    where i.plan_id = ${planId}
    group by 1 order by seen desc, clicks desc`
  const byTheme = await per('theme'), byChannel = await per('platform')
  const [f] = await sql`
    select coalesce(sum(now_f - base_f), 0)::int as gained from (
      select
        (select followers from follower_counts fc where fc.channel_id = c.id order by day desc limit 1) as now_f,
        coalesce(
          (select followers from follower_counts fc where fc.channel_id = c.id and day <= ${plan.starts_on} order by day desc limit 1),
          (select followers from follower_counts fc where fc.channel_id = c.id order by day limit 1)) as base_f
      from channels c where c.product_id = ${plan.product_id} and c.enabled) x
    where now_f is not null and base_f is not null`
  const sum = (k: keyof Row) => byChannel.reduce((a, r) => a + (r[k] as number), 0)
  const t = plan.strategy?.targets ?? {}
  const target = (k: string) => (typeof t[k] === 'number' && t[k] > 0 ? t[k] : null)
  return {
    totals: { published: sum('published'), seen: sum('seen'), engaged: sum('engaged'), clicks: sum('clicks'), followers: f.gained } as Numbers,
    targets: { seen: target('seen'), engaged: target('engaged'), clicks: target('clicks'), followers: target('followers') },
    byTheme, byChannel, elapsedDays: Math.max(0, plan.elapsed), totalDays: plan.total,
  }
}
