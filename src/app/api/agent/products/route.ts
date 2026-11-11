import { sql } from '@/lib/db'

export async function GET() {
  const products = await sql`
    select pr.*, coalesce((
      select json_agg(json_build_object('id', c.id, 'platform', c.platform, 'enabled', c.enabled,
        'automatable', c.automatable, 'started_at', c.started_at) order by c.id)
      from channels c where c.product_id = pr.id and c.enabled), '[]') as channels
    from products pr where pr.active order by pr.id`
  return Response.json({ products })
}
