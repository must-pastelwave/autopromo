import { sql } from '@/lib/db'
import { bad, readJson } from '@/lib/postInput'
import { reportRun } from '@/lib/runs'

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [])

/** The workflow reports a run starting and ending: {gh_run_id, jobs, product_ids, plan_ids, status, url}. */
export async function POST(req: Request) {
  const b = await readJson(req)
  if (!Number.isSafeInteger(b?.gh_run_id) || typeof b?.jobs !== 'string' || !['running', 'done', 'failed'].includes(b?.status)) {
    return bad('gh_run_id, jobs and status (running|done|failed) required')
  }
  const fromPlans = (await sql`select product_id from plans where id = any(${ids(b.plan_ids)}::int[])`).map(r => r.product_id as number)
  const productIds = [...new Set([...ids(b.product_ids), ...fromPlans])]
  await reportRun({ ghRunId: b.gh_run_id, jobs: b.jobs.slice(0, 100), productIds, status: b.status, url: typeof b.url === 'string' ? b.url.slice(0, 300) : undefined })
  return Response.json({ ok: true })
}
