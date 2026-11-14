import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'

/** The reviewer's verdict on a share's text: pass → ready to paste or send; block → the writer fixes it once, then it's skipped. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (b?.verdict !== 'pass' && b?.verdict !== 'block') return bad("verdict must be 'pass' or 'block'")
  if (b.verdict === 'block' && !(typeof b.reason === 'string' && b.reason.trim())) return bad('a block needs a reason')
  const [s] = await sql`
    update shares set review_reason = ${b.reason ?? null},
      text_status = case when ${b.verdict} = 'pass' then 'ok' when revision = 0 then 'needed' else 'blocked' end,
      status = case when ${b.verdict} = 'pass' or revision = 0 then 'todo' else 'skipped' end,
      revision = case when ${b.verdict} = 'block' then revision + 1 else revision end
    where id = ${id} and text_status = 'draft' and status = 'todo' returning id`
  if (!s) return bad('not a share waiting for review', 409)
  return Response.json({ ok: true })
}
