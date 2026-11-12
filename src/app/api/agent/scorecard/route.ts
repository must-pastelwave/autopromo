import { bad } from '@/lib/postInput'
import { scorecard } from '@/lib/scorecard'

/** A plan's results so far (seen, engaged, clicks, followers) against its targets, by theme and channel. */
export async function GET(req: Request) {
  const planId = Number(new URL(req.url).searchParams.get('plan_id'))
  if (!Number.isInteger(planId)) return bad('plan_id required')
  const s = await scorecard(planId)
  return s ? Response.json(s) : bad('not found', 404)
}
