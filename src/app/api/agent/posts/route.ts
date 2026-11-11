import { sql } from '@/lib/db'
import { newCode } from '@/lib/links'
import { bad, bannedReason, parsePostInput, readJson } from '@/lib/postInput'

async function context(productId: unknown, channelId: unknown) {
  if (!Number.isInteger(productId) || !Number.isInteger(channelId)) return null
  const [row] = await sql`
    select c.platform, pr.banned_words, jsonb_array_length(pr.fact_sheet) as fact_count
    from channels c join products pr on pr.id = c.product_id
    where c.id = ${channelId as number} and pr.id = ${productId as number}`
  return row ?? null
}

export async function POST(req: Request) {
  const b = await readJson(req)
  const ctx = await context(b?.product_id, b?.channel_id)
  if (!ctx) return bad('unknown product_id/channel_id pair')
  const p = parsePostInput(b, { platform: ctx.platform, factCount: ctx.fact_count })
  if (typeof p === 'string') return bad(p)
  const blocked = bannedReason(p, ctx.banned_words)
  const [created] = await sql`
    insert into posts ${sql({
      ...p, slides: sql.json(p.slides), link_code: newCode(),
      status: blocked ? 'blocked' : 'draft', review_reason: blocked,
    })}
    on conflict (product_id, client_key) do nothing
    returning *`
  if (created) return Response.json({ post: created }, { status: 201 })
  const [existing] = await sql`select * from posts where product_id = ${p.product_id} and client_key = ${p.client_key}`
  return Response.json({ post: existing }, { status: 200 })
}

const STATUSES = ['draft', 'blocked', 'dropped', 'passed', 'scheduled', 'published', 'failed', 'waiting', 'skipped', 'expired']

/** Posts by status, with the rules a reviewer or reviser needs alongside. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status') ?? 'draft'
  if (!STATUSES.includes(status)) return bad('unknown status')
  const posts = await sql`
    select p.*, c.platform, pr.slug as product_slug, pr.url as product_url, pr.fact_sheet, pr.banned_words, pr.tone_notes, pr.audience
    from posts p join channels c on c.id = p.channel_id join products pr on pr.id = p.product_id
    where p.status = ${status} and pr.active
    order by p.id limit 200`
  return Response.json({ posts })
}
