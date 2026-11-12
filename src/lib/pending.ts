import { sql } from './db'

/** Active products with what the agents should do for each (needs_research, needs_plan, kickoff_plan_id) and their enabled channels. */
export async function agentProducts() {
  return sql`
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
}

/**
 * What the agents should do now. Research, planning and kickoff come from the products;
 * writing and reviewing are global, with a cool-down so a stuck item can't start a run every 5 minutes.
 */
export async function workToDo(): Promise<{ research: number[]; plan: number[]; kickoff: number[]; write: boolean; review: boolean }> {
  const products = await agentProducts()
  const [w] = await sql`
    select
      (exists (
        select 1 from plan_items i join plans pl on pl.id = i.plan_id join products pr on pr.id = pl.product_id
        join channels c on c.product_id = pl.product_id and c.platform = i.platform and c.enabled
        where pl.status = 'confirmed' and pr.active and i.status = 'planned' and i.day between current_date - 1 and current_date + 2)
       or exists (select 1 from posts x join products pr on pr.id = x.product_id where pr.active and x.status = 'blocked' and x.revision = 0))
      and not exists (select 1 from agent_runs where jobs like '%writer%' and coalesce(started_at, requested_at) > now() - interval '3 hours'
        and status in ('running', 'done', 'failed')) as write,
      exists (select 1 from posts x join products pr on pr.id = x.product_id where pr.active and x.status = 'draft')
      and not exists (select 1 from agent_runs where jobs like '%reviewer%' and coalesce(started_at, requested_at) > now() - interval '1 hour'
        and status in ('running', 'done', 'failed')) as review`
  return {
    research: products.filter(p => p.needs_research).map(p => p.id),
    plan: products.filter(p => p.needs_plan).map(p => p.id),
    kickoff: products.filter(p => p.kickoff_plan_id !== null).map(p => p.kickoff_plan_id),
    write: w.write, review: w.review,
  }
}

/** Is there agent work waiting, with no run already going? (Started runs older than 45 minutes count as gone.) */
export async function pendingWork(): Promise<boolean> {
  const [busy] = await sql`select 1 from agent_runs where status = 'running' and started_at > now() - interval '45 minutes' limit 1`
  if (busy) return false
  const w = await workToDo()
  return w.research.length > 0 || w.plan.length > 0 || w.kickoff.length > 0 || w.write || w.review
}
