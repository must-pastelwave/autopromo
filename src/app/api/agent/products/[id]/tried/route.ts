import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'

const AGENTS = ['researcher', 'planner']

/** The workflow records that an agent ran for a product, so the 15-minute check doesn't ask again for 3 hours. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  const agent = (await readJson(req))?.agent
  if (!AGENTS.includes(agent)) return bad(`agent must be one of ${AGENTS.join(', ')}`)
  const [p] = id === null ? [] : await sql`update products set agent_tried = agent_tried || jsonb_build_object(${agent}::text, now()) where id = ${id} returning id`
  return p ? Response.json({ ok: true }) : bad('not found', 404)
}
