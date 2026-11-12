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
  // A retry of a post that already exists answers 200 before the plan item (now 'written') is checked.
  const [existing] = await sql`select * from posts where product_id = ${p.product_id} and client_key = ${p.client_key}`
  if (existing) return Response.json({ post: existing }, { status: 200 })
  // Every post comes from a planned item of the product's confirmed plan, for this channel's platform.
  const itemId = Number.isInteger(b?.plan_item_id) ? b.plan_item_id : null
  const [item] = itemId === null ? [] : await sql`
    select i.id from plan_items i join plans pl on pl.id = i.plan_id
    where i.id = ${itemId} and pl.product_id = ${p.product_id} and pl.status = 'confirmed'
      and i.status = 'planned' and i.platform = ${ctx.platform}`
  if (!item) return bad('plan_item_id must be a planned item of the confirmed plan, for this channel')
  const blocked = bannedReason(p, ctx.banned_words)
  const [created] = await sql`
    insert into posts ${sql({
      ...p, slides: sql.json(p.slides), link_code: newCode(), plan_item_id: item.id,
      status: blocked ? 'blocked' : 'draft', review_reason: blocked,
    })}
    on conflict (product_id, client_key) do nothing
    returning *`
  if (created) {
    await sql`update plan_items set status = 'written' where id = ${item.id}`
    return Response.json({ post: created }, { status: 201 })
  }
  // Lost a race with a concurrent retry: return the row that won.
  const [raced] = await sql`select * from posts where product_id = ${p.product_id} and client_key = ${p.client_key}`
  return Response.json({ post: raced }, { status: 200 })
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
