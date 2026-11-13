import { sql } from './db'

export type Numbers = { published: number; signups: number; purchases: number; seen: number; engaged: number; clicks: number; followers: number }
type Row = Omit<Numbers, 'followers'> & { key: string }

/** Plan targets, most important first: sign-ups are what the campaign is for. */
export const TARGET_KEYS = ['signups', 'purchases', 'clicks', 'seen', 'engaged', 'followers'] as const
export const TARGET_LABEL: Record<(typeof TARGET_KEYS)[number], string> = {
  signups: 'sign-ups', purchases: 'purchases', clicks: 'link clicks', seen: 'seen', engaged: 'engagements', followers: 'followers gained',
}

/**
 * How a plan's campaign is doing: sign-ups and purchases (reported by the product site),
 * seen (impressions or views), engaged (likes, comments, shares, saves), clicks on our tracked links,
 * and followers gained on its channels since the plan started, with the plan's own targets
 * and the owner's goal for the product.
 */
export async function scorecard(planId: number) {
  const [plan] = await sql`
    select pl.product_id, pl.strategy, pl.starts_on, pl.ends_on, pr.goal_kind, pr.goal_1m, pr.goal_3m,
      (least(current_date, pl.ends_on) - pl.starts_on + 1)::int as elapsed, (pl.ends_on - pl.starts_on + 1)::int as total
    from plans pl join products pr on pr.id = pl.product_id where pl.id = ${planId}`
  if (!plan) return null
  const per = (group: 'theme' | 'platform') => sql<Row[]>`
    select i.${sql(group)} as key, count(x.id)::int as published,
      coalesce(sum((select count(*) from conversions v where v.post_id = x.id and v.kind = 'signup')), 0)::int as signups,
      coalesce(sum((select count(*) from conversions v where v.post_id = x.id and v.kind = 'purchase')), 0)::int as purchases,
      coalesce(sum(greatest(m.impressions, m.views, m.reach)), 0)::int as seen,
      coalesce(sum(m.likes + m.comments + m.shares + m.saves), 0)::int as engaged,
      coalesce(sum((select count(*) from clicks k where k.post_id = x.id)), 0)::int as clicks
    from plan_items i
    join posts x on x.plan_item_id = i.id and x.status in ('scheduled', 'published')
    left join post_metrics m on m.post_id = x.id
    where i.plan_id = ${planId}
    group by 1 order by signups desc, seen desc, clicks desc`
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
    totals: {
      published: sum('published'), signups: sum('signups'), purchases: sum('purchases'),
      seen: sum('seen'), engaged: sum('engaged'), clicks: sum('clicks'), followers: f.gained,
    } as Numbers,
    targets: Object.fromEntries(TARGET_KEYS.map(k => [k, target(k)])) as Record<(typeof TARGET_KEYS)[number], number | null>,
    goal: { kind: plan.goal_kind as 'signup' | 'purchase', month: plan.goal_1m as number | null, threeMonths: plan.goal_3m as number | null },
    byTheme, byChannel, elapsedDays: Math.max(0, plan.elapsed), totalDays: plan.total,
  }
}
