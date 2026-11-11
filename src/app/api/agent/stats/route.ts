import { sql } from '@/lib/db'
import { bad } from '@/lib/postInput'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const productId = parseInt(u.searchParams.get('product_id') ?? '', 10)
  const days = Math.min(Math.max(parseInt(u.searchParams.get('days') ?? '28', 10) || 28, 1), 365)
  if (!Number.isInteger(productId)) return bad('product_id required')
  const posts = await sql`
    select p.id, p.topic, p.format_tag, p.is_experiment, c.platform as channel, p.scheduled_for, p.status,
      (select count(*)::int from clicks k where k.post_id = p.id) as clicks
    from posts p join channels c on c.id = p.channel_id
    where p.product_id = ${productId} and p.status in ('scheduled', 'published')
      and p.scheduled_for > now() - make_interval(days => ${days})
    order by p.scheduled_for desc`
  return Response.json({ posts })
}
