import { sql } from './db'
import { newCode } from './links'
import { checkBluesky, checkDiscord, checkMastodon, checkTelegram, discordWebhookFor, isDiscordChannelId, sendDirect } from './direct'

/**
 * Places: communities beyond our own channels. Each approved place gets our recent published posts, up to its
 * per_week, each with its own tracked link (a share). 'auto' places are sent here; 'paste' places wait on the Places page.
 */

export const AUTO_KINDS = ['telegram', 'discord', 'mastodon', 'bluesky']
// Launches and listings take one post, ever: a second Show HN or Product Hunt launch of the same thing is spam.
export const ONE_TIME_KINDS = ['hackernews', 'producthunt', 'list', 'newsletter']
const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '')

/** A share's text (written for its place and reviewed) with its tracked link. */
export function shareText(text: string, code: string): string {
  const link = `${appUrl()}/go/${code}`
  // List entries carry the link inline: "[Name](LINK) - what it does."
  return text.includes('(LINK)') ? text.replaceAll('(LINK)', `(${link})`) : `${text}\n\n${link}`
}

/** Make shares for places that are due one, then send the auto ones. Called by maintenance every few minutes. */
export async function distribute(): Promise<void> {
  // Newest post from the last week that passed review and this place hasn't had; text posts first (they read well anywhere).
  // Passed review is enough: a post waiting for its own channel (not connected yet, or approve-first) can still go to places.
  const due = await sql`
    select pl.id as place_id, (
      select x.id from posts x
      where x.product_id = pl.product_id and x.status in ('published', 'scheduled', 'waiting') and x.created_at > now() - interval '7 days'
        and not exists (select 1 from shares s where s.post_id = x.id and s.place_id = pl.id)
      order by (x.kind = 'text') desc, x.created_at desc limit 1) as post_id
    from places pl
    where pl.status = 'approved' and (pl.how = 'paste' or pl.target is not null)
      and (select count(*) from shares s where s.place_id = pl.id and s.created_at > now() - interval '7 days') < pl.per_week
      and not (pl.kind = any(${ONE_TIME_KINDS}) and exists (select 1 from shares s where s.place_id = pl.id))`
  for (const d of due) {
    if (d.post_id) await sql`insert into shares (post_id, place_id, link_code) values (${d.post_id}, ${d.place_id}, ${newCode()}) on conflict do nothing`
  }
  await sendAutoShares()
}

async function sendAutoShares(): Promise<void> {
  const todo = await sql`
    select s.id, s.link_code, s.text, pl.kind, pl.target
    from shares s join places pl on pl.id = s.place_id
    where s.status = 'todo' and s.text_status = 'ok' and pl.how = 'auto' and pl.target is not null and pl.status = 'approved'`
  for (const s of todo) {
    // Claim first, so two overlapping runs can't both send it.
    const [claimed] = await sql`update shares set status = 'posted', posted_at = now() where id = ${s.id} and status = 'todo' returning id`
    if (!claimed) continue
    try {
      await sendDirect(s.kind, s.target, shareText(s.text, s.link_code))
    } catch (e) {
      await sql`update shares set status = 'failed', error = ${e instanceof Error ? e.message : String(e)} where id = ${s.id}`
    }
  }
}

/** Connect an auto place: a Telegram chat our bot is in, a Discord channel (bot) or webhook, or our Mastodon / Bluesky login. Returns the target or what's wrong. */
export async function placeTarget(kind: string, input: string): Promise<{ target?: string; problem?: string }> {
  if (!AUTO_KINDS.includes(kind)) return { problem: 'Only Telegram, Discord, Mastodon and Bluesky places can post by themselves.' }
  let target = input.trim()
  if (kind === 'discord' && isDiscordChannelId(target)) {
    try { target = await discordWebhookFor(target) } catch (e) { return { problem: e instanceof Error ? e.message : String(e) } }
  }
  const check = { telegram: checkTelegram, discord: checkDiscord, mastodon: checkMastodon, bluesky: checkBluesky }[kind]!
  const problem = await check(target)
  return problem ? { problem } : { target }
}

const KINDS = ['telegram', 'discord', 'reddit', 'hackernews', 'producthunt', 'indiehackers', 'forum', 'facebook_group',
  'naver_cafe', 'kakao_openchat', 'newsletter', 'list', 'devto', 'mastodon', 'bluesky', 'other']

/** The scout's suggestions. Places already known (any status) are left alone, so a rejected place never comes back. */
export async function suggestPlaces(productId: number, places: unknown[]): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = []
  let added = 0
  for (const [i, p] of places.entries()) {
    const x = (p ?? {}) as Record<string, unknown>
    const name = String(x.name ?? '').trim().slice(0, 200), url = String(x.url ?? '').trim()
    const kind = KINDS.includes(String(x.kind)) ? String(x.kind) : 'other'
    if (!name || !/^https?:\/\/\S+$/.test(url)) { errors.push(`places[${i}]: name and an http(s) url are required`); continue }
    const members = Number.isFinite(Number(x.members)) && Number(x.members) > 0 ? Math.round(Number(x.members)) : null
    const [row] = await sql`
      insert into places (product_id, name, url, kind, members, rules, why)
      values (${productId}, ${name}, ${url}, ${kind}, ${members}, ${String(x.rules ?? '').slice(0, 1000)}, ${String(x.why ?? '').slice(0, 1000)})
      on conflict (product_id, url) do nothing returning id`
    if (row) added++
  }
  return { added, errors }
}

/** Per place: shares posted, people, sign-ups. For the Places page and the agents. */
export async function placeStats(productId: number) {
  return sql`
    select pl.id, pl.name, pl.url, pl.kind, pl.how, pl.target is not null as connected, pl.members, pl.rules, pl.why, pl.per_week, pl.status,
      (select count(*)::int from shares s where s.place_id = pl.id and s.status = 'posted') as posted,
      (select count(*)::int from clicks k join shares s on s.id = k.share_id where s.place_id = pl.id) as people,
      (select count(*)::int from conversions v join clicks k on k.id = v.click_id join shares s on s.id = k.share_id
        where s.place_id = pl.id and v.kind = 'signup') as signups
    from places pl where pl.product_id = ${productId}
    order by pl.status = 'approved' desc, pl.status = 'suggested' desc, people desc, pl.members desc nulls last, pl.id`
}
