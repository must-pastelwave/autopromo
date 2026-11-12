import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'
import { replaceFacts, validFacts } from '@/lib/facts'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (!validFacts(b?.facts)) return bad('facts must be [{fact, source_url}] with an http(s) source_url')
  const r = await replaceFacts(id, b.facts)
  if (r) await sql`update products set researched_at = now() where id = ${id}`
  return r ? Response.json({ ok: true, ...r }) : bad('not found', 404)
}
