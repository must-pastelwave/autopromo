import { sql } from '@/lib/db'

export async function GET() {
  const products = await sql`
    select pr.*,
      -- An agent that tried a product in the last 3 hours isn't asked again, so a failing run can't loop.
      ((jsonb_array_length(pr.fact_sheet) = 0 or pr.researched_at is null or pr.researched_at < now() - interval '7 days')
        and coalesce((pr.agent_tried->>'researcher')::timestamptz < now() - interval '3 hours', true)) as needs_research,
      (jsonb_array_length(pr.fact_sheet) > 0
        and exists (select 1 from channels where product_id = pr.id and enabled)
        and coalesce((pr.agent_tried->>'planner')::timestamptz < now() - interval '3 hours', true)
        and (
          exists (select 1 from plans where product_id = pr.id and status = 'revising')
          or not exists (select 1 from plans where product_id = pr.id and status in ('draft', 'confirmed') and ends_on >= current_date + 7)
        )) as needs_plan,
      (select id from plans where product_id = pr.id and status = 'confirmed' and kicked_off_at is null
        and confirmed_at > now() - interval '2 days' order by id limit 1) as kickoff_plan_id,
      coalesce((
      select json_agg(json_build_object('id', c.id, 'platform', c.platform, 'enabled', c.enabled,
        'automatable', c.automatable, 'started_at', c.started_at, 'per_day', c.per_day) order by c.id)
      from channels c where c.product_id = pr.id and c.enabled), '[]') as channels
    from products pr where pr.active order by pr.id`
  return Response.json({ products })
}
