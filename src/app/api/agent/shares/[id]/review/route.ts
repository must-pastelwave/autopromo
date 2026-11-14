import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'

/** The reviewer's verdict on a share's text: pass → ready to paste or send; block → skipped (no second try, there are other places). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (b?.verdict !== 'pass' && b?.verdict !== 'block') return bad("verdict must be 'pass' or 'block'")
  if (b.verdict === 'block' && !(typeof b.reason === 'string' && b.reason.trim())) return bad('a block needs a reason')
  const [s] = await sql`
    update shares set text_status = ${b.verdict === 'pass' ? 'ok' : 'blocked'}, review_reason = ${b.reason ?? null},
      status = ${b.verdict === 'pass' ? 'todo' : 'skipped'}
    where id = ${id} and text_status = 'draft' and status = 'todo' returning id`
  if (!s) return bad('not a share waiting for review', 409)
  return Response.json({ ok: true })
}
