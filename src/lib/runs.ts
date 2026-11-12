import { sql } from './db'

export type RunStatus = {
  status: 'queued' | 'running' | 'done' | 'failed'; jobs: string; url: string | null
  requestedAt: Date; startedAt: Date | null; finishedAt: Date | null; typicalMinutes: number | null
}

/** The owner asked for something (plan, revision, research, confirm): show it as queued until a run picks it up. */
export async function requestRun(productId: number, jobs: string): Promise<void> {
  await sql`delete from agent_runs where status = 'queued' and ${productId} = any(product_ids)`
  await sql`insert into agent_runs (jobs, product_ids, status) values (${jobs}, ${[productId]}, 'queued')`
}

/** The workflow reports a run starting ('running') or ending ('done' / 'failed'). Queued requests for its products merge into it. */
export async function reportRun(r: { ghRunId: number; jobs: string; productIds: number[]; status: 'running' | 'done' | 'failed'; url?: string }): Promise<void> {
  // Writer and reviewer runs started for due work aren't tied to one product: they serve every active product.
  if (r.productIds.length === 0) r = { ...r, productIds: (await sql`select id from products where active`).map(p => p.id as number) }
  if (r.status === 'running') {
    await sql`delete from agent_runs where status = 'queued' and product_ids && ${r.productIds}::int[]`
    await sql`
      insert into agent_runs (gh_run_id, jobs, product_ids, status, url, started_at)
      values (${r.ghRunId}, ${r.jobs}, ${r.productIds}, 'running', ${r.url ?? null}, now())
      on conflict (gh_run_id) do update set status = 'running', started_at = coalesce(agent_runs.started_at, now())`
  } else {
    await sql`
      insert into agent_runs (gh_run_id, jobs, product_ids, status, url, started_at, finished_at)
      values (${r.ghRunId}, ${r.jobs}, ${r.productIds}, ${r.status}, ${r.url ?? null}, now(), now())
      on conflict (gh_run_id) do update set status = ${r.status}, finished_at = now()`
  }
}

/** The latest run touching this product, with how long such runs usually take. */
export async function runStatus(productId: number): Promise<RunStatus | null> {
  const [r] = await sql`
    select status, jobs, url, requested_at, started_at, finished_at from agent_runs
    where ${productId} = any(product_ids) order by id desc limit 1`
  if (!r) return null
  const [t] = await sql`
    select round(avg(extract(epoch from finished_at - started_at)) / 60)::int as m from (
      select started_at, finished_at from agent_runs
      where status = 'done' and started_at is not null and finished_at is not null
        and (jobs = ${r.jobs} or jobs like ${'%' + r.jobs.split(' ')[0] + '%'})
      order by id desc limit 5) x`
  return {
    status: r.status, jobs: r.jobs, url: r.url, requestedAt: r.requested_at, startedAt: r.started_at,
    finishedAt: r.finished_at, typicalMinutes: t?.m ?? null,
  }
}
