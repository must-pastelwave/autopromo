'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { PRODUCT_COOKIE, requireOwner } from '@/lib/current'
import { parseFactLines, replaceFacts } from '@/lib/facts'
import { publish } from '@/lib/publish'
import { dispatchAgent } from '@/lib/github'
import { requestRun } from '@/lib/runs'
import { retryPost } from '@/lib/retry'
import { parseGoals, repoStars, saveSnapshot } from '@/lib/goals'
import { AUTOMATABLE, DRAFTS_ONLY } from '@/lib/plans'
import { checkDiscord, checkTelegram, discordWebhookFor, isDiscordChannelId } from '@/lib/direct'


const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const back = (msg: string, section = 'settings'): never => redirect(`/${section}${section.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`)

export async function selectProduct(f: FormData) {
  await requireOwner()
  ;(await cookies()).set(PRODUCT_COOKIE, s(f, 'slug'), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
}

export async function saveProduct(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id')) || null
  const url = s(f, 'url'), name = s(f, 'name'), audience = s(f, 'audience')
  if (!/^https?:\/\/\S+$/.test(url)) back('Enter the product page URL (https://…)', id ? 'settings' : 'products/new')
  const tz = s(f, 'timezone') || 'Asia/Seoul'
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { back(`Unknown timezone: ${tz}`, id ? 'settings' : 'products/new') }
  // Blank fields are filled by the researcher on its next run; a blank name starts as the site's host.
  const fields = {
    url, name: name || new URL(url).hostname.replace(/^www\./, ''), audience, language: s(f, 'language'), timezone: tz,
    tone_notes: s(f, 'tone_notes'), banned_words: s(f, 'banned_words').split(/[\n,]/).map(w => w.trim()).filter(Boolean),
  }
  if (id) {
    await sql`update products set ${sql(fields)} where id = ${id}`
  } else {
    const slug = (fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Date.now().toString(36).slice(-4)
    const [p] = await sql`insert into products ${sql({ ...fields, slug })} returning id, slug`
    const rows = [...AUTOMATABLE.map(platform => ({ platform, automatable: true })), ...DRAFTS_ONLY.map(platform => ({ platform, automatable: false }))]
      .map(r => ({ ...r, product_id: p.id }))
    await sql`insert into channels ${sql(rows)}`
    const picked = f.getAll('platform').map(String)
    if (picked.length) await sql`update channels set enabled = true, started_at = now() where product_id = ${p.id} and platform = any(${picked})`
    ;(await cookies()).set(PRODUCT_COOKIE, p.slug, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    await requestRun(p.id, 'researcher planner')
    const started = await dispatchAgent('auto')
    revalidatePath('/', 'layout')
    redirect(`/?msg=${encodeURIComponent(started
      ? 'Product added. The AI is reading the site now.'
      : 'Product added. The AI starts reading the site within 15–30 minutes.')}`)
  }
  revalidatePath('/', 'layout')
  back('Saved')
}

export async function saveGoals(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const col = (k: string) => f.getAll(k).map(v => String(v))
  const metric = col('metric'), source = col('source'), m1 = col('m1'), m3 = col('m3')
  const goals = parseGoals(metric.map((m, i) => ({ metric: m, source: source[i] ?? '', m1: m1[i] ?? '', m3: m3[i] ?? '' })))
  if (typeof goals === 'string') back(goals, 'settings?tab=goals')
  // A goal we can't measure is nonsense: check every GitHub repo exists now, and take its first star count.
  for (const g of goals as Exclude<typeof goals, string>) {
    if (g.metric !== 'github_stars') continue
    const stars = await repoStars(g.source)
    if (stars === null) back(`GitHub can't find the public repo ${g.source}. Check the name (owner/name).`, 'settings?tab=goals')
    await saveSnapshot(g.source, 'github_stars', stars!)
  }
  await sql.begin(async tx => {
    await tx`delete from goals where product_id = ${id}`
    for (const g of goals as Exclude<typeof goals, string>) await tx`insert into goals ${tx({ ...g, product_id: id })}`
  })
  revalidatePath('/', 'layout')
  back('Goals saved', 'settings?tab=goals')
}

export async function saveFacts(f: FormData) {
  await requireOwner()
  const facts = parseFactLines(String(f.get('facts') ?? ''))
  if (typeof facts === 'string') back(facts, 'settings?tab=facts')
  const r = await replaceFacts(Number(s(f, 'id')), facts as Exclude<typeof facts, string>)
  back(r ? `Fact sheet saved${r.dropped_scheduled ? `; ${r.dropped_scheduled} scheduled post(s) cancelled` : ''}` : 'Product not found', 'settings?tab=facts')
}

export async function savePlaybook(f: FormData) {
  await requireOwner()
  await sql`update products set playbook = ${String(f.get('playbook') ?? '').slice(0, 5000)} where id = ${Number(s(f, 'id'))}`
  back('Playbook saved', 'settings?tab=playbook')
}

export async function toggleChannel(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id')), on = s(f, 'enabled') === 'true'
  await sql`update channels set enabled = ${on}, started_at = case when ${on} then coalesce(started_at, now()) else started_at end where id = ${id}`
  revalidatePath('/')
}

export async function toggleAutoPublish(f: FormData) {
  await requireOwner()
  await sql`update channels set auto_publish = ${s(f, 'auto') === 'true'} where id = ${Number(s(f, 'id'))} and automatable`
  revalidatePath('/')
}

/** A person approved a reviewed post on an approve-first channel: schedule it in Zernio. */
export async function approveWaiting(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const [p] = await sql`select p.id from posts p join channels c on c.id = p.channel_id where p.id = ${id} and p.status = 'waiting' and c.automatable`
  if (p) await publish(id, { approved: true })
  revalidatePath('/', 'layout')
}

export async function setPerDay(f: FormData) {
  await requireOwner()
  const n = Math.min(Math.max(parseInt(s(f, 'per_day'), 10) || 1, 1), 10)
  await sql`update channels set per_day = ${n} where id = ${Number(s(f, 'id'))}`
  revalidatePath('/')
}

export async function setChannelAccount(f: FormData) {
  await requireOwner()
  await sql`update channels set zernio_account_id = ${s(f, 'account') || null}, needs_reconnect = false where id = ${Number(s(f, 'id'))}`
  revalidatePath('/')
}

/** Connect a Telegram channel (our bot must be its admin) or a Discord webhook. Checked before saving, so a saved channel can post. */
export async function setDirectTarget(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const [c] = await sql`select platform from channels where id = ${id}`
  if (!c || !['telegram', 'discord'].includes(c.platform)) back('Unknown channel', 'channels')
  let target = s(f, 'target')
  // A Discord channel picked from the list: the bot makes the webhook, so the owner never copies a URL.
  if (c.platform === 'discord' && isDiscordChannelId(target)) target = await discordWebhookFor(target).catch(e => back(`discord: ${e.message}`, 'channels'))
  const problem = c.platform === 'telegram' ? await checkTelegram(target) : await checkDiscord(target)
  if (problem) back(`${c.platform}: ${problem}`, 'channels')
  await sql`update channels set target = ${target}, needs_reconnect = false where id = ${id}`
  revalidatePath('/')
  back(`${c.platform === 'telegram' ? 'Telegram' : 'Discord'} connected. Waiting posts for it go out on the next run.`, 'channels')
}

export async function resolveWaiting(f: FormData) {
  await requireOwner()
  const status = s(f, 'outcome') === 'posted' ? 'published' : 'skipped'
  await sql`update posts set status = ${status}, scheduled_for = coalesce(scheduled_for, now()) where id = ${Number(s(f, 'id'))} and status = 'waiting'`
  revalidatePath('/', 'layout')
}

/** Pause or resume a product: paused products get no research, planning, writing or publishing runs. */
export async function setActive(f: FormData) {
  await requireOwner()
  const on = s(f, 'active') === 'true'
  await sql`update products set active = ${on} where id = ${Number(s(f, 'id'))}`
  if (on) await dispatchAgent('auto')
  revalidatePath('/', 'layout')
  back(on ? 'Resumed.' : 'Paused. Nothing runs for this product until you resume it.')
}

/** Write a blocked or dropped plan post again, now. */
export async function retryPostAction(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const [x] = await sql`select product_id from posts where id = ${id}`
  const ok = x && (await retryPost(id))
  if (ok) {
    await requestRun(x.product_id, 'writer reviewer')
    await dispatchAgent('auto')
  }
  revalidatePath('/', 'layout')
  redirect(`/posts?msg=${encodeURIComponent(ok ? 'Writing it again now; it appears here in a few minutes.' : 'That post can no longer be written again.')}`)
}
