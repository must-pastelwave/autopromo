import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'
import { parsePlanInput, planSlot, saveDraft } from '@/lib/plans'

// The planner's draft (or revised draft) of a product's next 4-week plan. The owner confirms it in the dashboard.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const slot = await planSlot(id)
  if (!slot) return bad('not found', 404)
  const [p] = await sql`select jsonb_array_length(fact_sheet) as n, array(select platform from channels where product_id = ${id}) as platforms from products where id = ${id}`
  const plan = parsePlanInput(await readJson(req), { platforms: p.platforms, factCount: p.n, window: slot.window })
  if (typeof plan === 'string') return bad(plan)
  const how = await saveDraft(id, slot, plan)
  return Response.json({ ok: true, window: slot.window }, { status: how === 'created' ? 201 : 200 })
}
