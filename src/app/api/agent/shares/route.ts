import { sql } from '@/lib/db'
import { bad } from '@/lib/postInput'

/**
 * Shares to adapt (`?status=needed`, for the writer) or to review (`?status=draft`, for the reviewer):
 * the place, the post it comes from, and the product's rules and facts.
 */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status')
  if (status !== 'needed' && status !== 'draft') return bad("status must be 'needed' or 'draft'")
  const shares = await sql`
    select s.id, s.text, s.review_reason,
      json_build_object('name', pl.name, 'kind', pl.kind, 'url', pl.url, 'rules', pl.rules, 'why', pl.why, 'members', pl.members) as place,
      json_build_object('id', x.id, 'kind', x.kind, 'caption', x.caption, 'slides', x.slides, 'topic', x.topic, 'facts_used', x.facts_used) as post,
      json_build_object('id', pr.id, 'name', pr.name, 'language', pr.language, 'audience', pr.audience, 'tone_notes', pr.tone_notes,
        'banned_words', pr.banned_words, 'fact_sheet', pr.fact_sheet) as product
    from shares s join places pl on pl.id = s.place_id join posts x on x.id = s.post_id join products pr on pr.id = x.product_id
    where s.status = 'todo' and s.text_status = ${status} and pl.status = 'approved' and pr.active
    order by s.id limit 40`
  return Response.json({ shares })
}
