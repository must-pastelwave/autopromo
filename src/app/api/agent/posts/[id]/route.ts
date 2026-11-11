import { sql } from '@/lib/db'
import { bad, idParam, bannedReason, parsePostInput, readJson } from '@/lib/postInput'

/** The writer's one revision of a blocked post. A second revision drops it. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const [cur] = await sql`
    select p.*, c.platform, pr.banned_words, jsonb_array_length(pr.fact_sheet) as fact_count
    from posts p join channels c on c.id = p.channel_id join products pr on pr.id = p.product_id where p.id = ${id}`
  if (!cur) return bad('not found', 404)
  if (cur.status !== 'blocked') return bad(`only blocked posts can be revised (status: ${cur.status})`, 409)
  if (cur.revision >= 1) {
    await sql`update posts set status = 'dropped' where id = ${id}`
    return bad('already revised once; post dropped', 409)
  }
  const b = await readJson(req)
  const p = parsePostInput({ ...b, product_id: cur.product_id, channel_id: cur.channel_id, client_key: cur.client_key },
    { platform: cur.platform, factCount: cur.fact_count })
  if (typeof p === 'string') return bad(p)
  const blocked = bannedReason(p, cur.banned_words)
  const [post] = await sql`
    update posts set kind = ${p.kind}, caption = ${p.caption}, slides = ${sql.json(p.slides)}, topic = ${p.topic},
      format_tag = ${p.format_tag}, is_experiment = ${p.is_experiment}, facts_used = ${p.facts_used},
      revision = revision + 1, status = ${blocked ? 'blocked' : 'draft'}, review_reason = ${blocked}
    where id = ${id} returning *`
  return Response.json({ post })
}
