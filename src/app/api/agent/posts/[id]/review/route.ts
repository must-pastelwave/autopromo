import { sql } from '@/lib/db'
import { publish } from '@/lib/publish'
import { bad, idParam, readJson } from '@/lib/postInput'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (b?.verdict !== 'pass' && b?.verdict !== 'block') return bad("verdict must be 'pass' or 'block'")
  if (b.verdict === 'block' && !(typeof b.reason === 'string' && b.reason.trim())) return bad('a block needs a reason')
  // Only drafts can be reviewed; the status check in the update makes this race-safe.
  const [post] = await sql`
    -- A revised post that fails review again is dropped: the writer gets one fix.
    update posts set status = case when ${b.verdict} = 'pass' then 'passed' when revision >= 1 then 'dropped' else 'blocked' end,
      review_reason = ${b.reason ?? null}
    where id = ${id} and status = 'draft' returning id`
  if (!post) return bad('not a draft', 409)
  if (b.verdict === 'pass') await publish(id)
  const [after] = await sql`select * from posts where id = ${id}`
  return Response.json({ post: after })
}
