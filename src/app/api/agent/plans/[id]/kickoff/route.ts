import { sql } from '@/lib/db'
import { bad, idParam } from '@/lib/postInput'

/** The workflow started writing a newly confirmed plan; it is not kicked off again. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  const [p] = id === null ? [] : await sql`update plans set kicked_off_at = now() where id = ${id} and status = 'confirmed' returning id`
  return p ? Response.json({ ok: true }) : bad('not found', 404)
}
