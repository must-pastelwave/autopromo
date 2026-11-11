import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (typeof b?.playbook !== 'string' || b.playbook.length > 5000) return bad('playbook must be a string (max 5000 chars)')
  const [row] = await sql`update products set playbook = ${b.playbook} where id = ${id} returning id`
  return row ? Response.json({ ok: true }) : bad('not found', 404)
}
