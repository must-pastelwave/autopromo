'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { PRODUCT_COOKIE, requireOwner } from '@/lib/current'
import { parseFactLines, replaceFacts } from '@/lib/facts'
import { publish } from '@/lib/publish'

const AUTOMATABLE = ['instagram', 'threads', 'facebook', 'x', 'youtube', 'tiktok', 'linkedin', 'bluesky']
const DRAFTS_ONLY = ['naver_blog', 'naver_cafe', 'reddit', 'hackernews']

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const back = (msg: string, section = 'settings'): never => redirect(`/${section}?msg=${encodeURIComponent(msg)}`)

export async function selectProduct(f: FormData) {
  await requireOwner()
  ;(await cookies()).set(PRODUCT_COOKIE, s(f, 'slug'), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
}

export async function saveProduct(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id')) || null
  const url = s(f, 'url'), name = s(f, 'name'), audience = s(f, 'audience')
  if (!/^https?:\/\/\S+$/.test(url)) back('Enter the product page URL (https://…)')
  const tz = s(f, 'timezone') || 'Asia/Seoul'
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { back(`Unknown timezone: ${tz}`) }
  // Blank fields are filled by the researcher on its next run; a blank name starts as the site's host.
  const fields = {
    url, name: name || new URL(url).hostname.replace(/^www\./, ''), audience, language: s(f, 'language'), timezone: tz,
    tone_notes: s(f, 'tone_notes'), banned_words: s(f, 'banned_words').split(/[\n,]/).map(w => w.trim()).filter(Boolean),
  }
  if (id) {
    await sql`update products set ${sql(fields)} where id = ${id}`
  } else {
    const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Date.now().toString(36).slice(-4)
    const [p] = await sql`insert into products ${sql({ ...fields, slug })} returning id, slug`
    const rows = [...AUTOMATABLE.map(platform => ({ platform, automatable: true })), ...DRAFTS_ONLY.map(platform => ({ platform, automatable: false }))]
      .map(r => ({ ...r, product_id: p.id }))
    await sql`insert into channels ${sql(rows)}`
    ;(await cookies()).set(PRODUCT_COOKIE, p.slug, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  }
  revalidatePath('/', 'layout')
  back('Saved')
}

export async function saveFacts(f: FormData) {
  await requireOwner()
  const facts = parseFactLines(String(f.get('facts') ?? ''))
  if (typeof facts === 'string') back(facts)
  const r = await replaceFacts(Number(s(f, 'id')), facts as Exclude<typeof facts, string>)
  back(r ? `Fact sheet saved${r.dropped_scheduled ? `; ${r.dropped_scheduled} scheduled post(s) cancelled` : ''}` : 'Product not found')
}

export async function savePlaybook(f: FormData) {
  await requireOwner()
  await sql`update products set playbook = ${String(f.get('playbook') ?? '').slice(0, 5000)} where id = ${Number(s(f, 'id'))}`
  back('Playbook saved')
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

export async function resolveWaiting(f: FormData) {
  await requireOwner()
  const status = s(f, 'outcome') === 'posted' ? 'published' : 'skipped'
  await sql`update posts set status = ${status}, scheduled_for = coalesce(scheduled_for, now()) where id = ${Number(s(f, 'id'))} and status = 'waiting'`
  revalidatePath('/', 'layout')
}
