import { sql } from '@/lib/db'
import { bad, idParam, readJson } from '@/lib/postInput'

const text = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max)

/**
 * The researcher's guess at the product's profile. It only fills what the owner left blank
 * (a name still equal to the site's host counts as blank), and only ever adds banned words.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  if (!b || typeof b !== 'object') return bad('body must be a JSON object')
  if (!text(b.name, 100) || !text(b.audience, 500) || !text(b.language, 10) || !text(b.tone_notes, 2000)) {
    return bad('name ≤100, audience ≤500, language ≤10, tone_notes ≤2000 chars, all strings')
  }
  if (b.banned_words !== undefined && !(Array.isArray(b.banned_words) && b.banned_words.every((w: unknown) => typeof w === 'string' && w.trim() && w.length <= 50))) {
    return bad('banned_words must be an array of short strings')
  }
  const fill = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const [p] = await sql`
    update products set
      name = case when ${fill(b.name)} <> '' and name = regexp_replace(split_part(split_part(url, '://', 2), '/', 1), '^www\\.', '') then ${fill(b.name)} else name end,
      audience = case when audience = '' then ${fill(b.audience)} else audience end,
      language = case when language = '' then ${fill(b.language)} else language end,
      tone_notes = case when tone_notes = '' then ${fill(b.tone_notes)} else tone_notes end,
      banned_words = array(select distinct w from unnest(banned_words || ${(b.banned_words ?? []).map((w: string) => w.trim())}::text[]) w order by w)
    where id = ${id} returning id`
  return p ? Response.json({ ok: true }) : bad('not found', 404)
}
