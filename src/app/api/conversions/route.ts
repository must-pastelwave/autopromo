import { timingSafeEqual } from 'node:crypto'
import { sql } from '@/lib/db'
import { bad, readJson } from '@/lib/postInput'

function authorized(req: Request): boolean {
  const token = process.env.CONVERSION_TOKEN
  if (!token) return false
  const a = Buffer.from(req.headers.get('authorization') ?? ''), b = Buffer.from(`Bearer ${token}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Called server-to-server by the product site when a sign-up or purchase happens.
 * Body: {click_id?, post_id?, kind: 'signup'|'purchase', value?, external_id?}
 */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const b = await readJson(req)
  if (b?.kind !== 'signup' && b?.kind !== 'purchase') return bad("kind must be 'signup' or 'purchase'")
  if (b.value !== undefined && b.value !== null && (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0)) {
    return bad('value must be a non-negative number')
  }
  if (b.external_id !== undefined && b.external_id !== null && (typeof b.external_id !== 'string' || !b.external_id || b.external_id.length > 100)) {
    return bad('external_id must be a string of 1–100 chars (an opaque id, never an email or phone)')
  }
  const clickId = Number.isSafeInteger(b.click_id) ? b.click_id : null
  const postId = Number.isSafeInteger(b.post_id) ? b.post_id : null
  const [target] = clickId !== null
    ? await sql`select post_id, id as click_id from clicks where id = ${clickId}`
    : postId !== null ? await sql`select id as post_id, null::bigint as click_id from posts where id = ${postId}` : []
  if (!target) return bad('click_id or post_id must point at a known click or post')

  const [created] = await sql`
    insert into conversions (post_id, click_id, kind, value, external_id)
    values (${target.post_id}, ${target.click_id}, ${b.kind}, ${b.value ?? null}, ${b.external_id ?? null})
    on conflict (kind, external_id) do nothing returning id`
  return Response.json({ ok: true, duplicate: !created }, { status: created ? 201 : 200 })
}
