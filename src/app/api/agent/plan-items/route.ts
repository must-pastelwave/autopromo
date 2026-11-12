import { sql } from '@/lib/db'

/** For the writer: confirmed-plan items still to write, due within `days` (default 2), each with its channel. */
export async function GET(req: Request) {
  const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('days') ?? '2', 10) || 2, 0), 14)
  const items = await sql`
    select i.id, to_char(i.day, 'YYYY-MM-DD') as day, i.platform, i.format, i.theme, i.topic, i.angle, i.facts,
      pl.id as plan_id, pl.product_id, c.id as channel_id, c.enabled as channel_enabled
    from plan_items i join plans pl on pl.id = i.plan_id join products pr on pr.id = pl.product_id
    left join channels c on c.product_id = pl.product_id and c.platform = i.platform
    where pl.status = 'confirmed' and pr.active and i.status = 'planned'
      and i.day between current_date - 1 and current_date + ${days}::int
    order by i.day, i.id`
  return Response.json({ items })
}
