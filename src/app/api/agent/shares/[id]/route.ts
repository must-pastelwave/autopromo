import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'
import { findBanned } from '@/lib/rules'

/** The writer's text for one place: {text}, or {skip: reason}. The app appends the tracked link. A banned word blocks it for good. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  // The writer can't write it within the rules (e.g. the place requires something the fact sheet doesn't have): skip it for good.
  if (typeof b?.skip === 'string' && b.skip.trim()) {
    const [x] = await sql`update shares set status = 'skipped', review_reason = ${`writer skipped: ${b.skip.trim().slice(0, 500)}`}
      where id = ${id} and status = 'todo' and text_status = 'needed' returning id`
    return x ? Response.json({ ok: true }) : bad('not a share waiting for its text', 409)
  }
  const text = typeof b?.text === 'string' ? b.text.trim() : ''
  if (!text || text.length > 4000) return bad('text required, at most 4000 characters')
  if (/https?:\/\//i.test(text)) return bad('no URLs: the app appends the tracked link')
  const [s] = await sql`
    select pr.banned_words from shares s join posts x on x.id = s.post_id join products pr on pr.id = x.product_id
    where s.id = ${id} and s.status = 'todo' and s.text_status = 'needed'`
  if (!s) return bad('not a share waiting for its text', 409)
  const hits = findBanned(text, s.banned_words ?? [])
  await sql`update shares set text = ${text}, text_status = ${hits.length ? 'blocked' : 'draft'},
    review_reason = ${hits.length ? `banned: ${hits.join(', ')}` : null}, status = ${hits.length ? 'skipped' : 'todo'} where id = ${id}`
  return Response.json({ ok: !hits.length, banned: hits })
}
