import { sql } from '@/lib/db'
import { bad } from '@/lib/postInput'
import { planWithItems } from '@/lib/plans'

/** For the planner: the running confirmed plan and the open draft (with the owner's feedback), each with its calendar. */
export async function GET(req: Request) {
  const productId = Number(new URL(req.url).searchParams.get('product_id'))
  if (!Number.isInteger(productId)) return bad('product_id required')
  const [current] = await sql`select id from plans where product_id = ${productId} and status = 'confirmed' and ends_on >= current_date order by starts_on limit 1`
  const [draft] = await sql`select id from plans where product_id = ${productId} and status in ('draft', 'revising') order by id desc limit 1`
  return Response.json({
    current: current ? await planWithItems(current.id) : null,
    draft: draft ? await planWithItems(draft.id) : null,
  })
}
