'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { currentProduct, requireOwner } from '@/lib/current'
import { dispatchAgent } from '@/lib/github'
import { placeTarget, suggestPlaces } from '@/lib/places'

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const back = (msg: string): never => redirect(`/places?msg=${encodeURIComponent(msg)}`)
const id = (f: FormData) => Number(s(f, 'id'))

/** Approve (or reject, or bring back) a place. */
export async function setPlaceStatus(f: FormData) {
  await requireOwner()
  const status = s(f, 'status')
  if (!['approved', 'rejected', 'suggested'].includes(status)) back('Unknown status')
  await sql`update places set status = ${status} where id = ${id(f)}`
  revalidatePath('/places')
}

export async function setPerWeek(f: FormData) {
  await requireOwner()
  const n = Math.min(Math.max(Number(s(f, 'per_week')) || 1, 1), 14)
  await sql`update places set per_week = ${n} where id = ${id(f)}`
  revalidatePath('/places')
}

/** Auto: the place's admin added our bot or gave a webhook, so we post there ourselves. Empty input = back to paste. */
export async function connectPlace(f: FormData) {
  await requireOwner()
  const [pl] = await sql`select kind from places where id = ${id(f)}`
  if (!pl) back('Unknown place')
  const input = s(f, 'target')
  if (!input) {
    await sql`update places set how = 'paste', target = null where id = ${id(f)}`
    revalidatePath('/places')
    back('Back to paste: its posts show up here for you to paste.')
  }
  const r = await placeTarget(pl.kind, input)
  if (r.problem) back(`${pl.kind}: ${r.problem}`)
  await sql`update places set how = 'auto', target = ${r.target!} where id = ${id(f)}`
  revalidatePath('/places')
  back('Connected: posts go to this place by themselves now.')
}

/** Add a place by hand (approved straight away). */
export async function addPlace(f: FormData) {
  await requireOwner()
  const p = await currentProduct()
  if (!p) back('Add a product first.')
  const r = await suggestPlaces(p!.id, [{ name: s(f, 'name'), url: s(f, 'url'), kind: s(f, 'kind'), rules: s(f, 'rules') }])
  if (r.errors.length) back('Give the place a name and its link (https://…).')
  await sql`update places set status = 'approved' where product_id = ${p!.id} and url = ${s(f, 'url')}`
  revalidatePath('/places')
  back(r.added ? 'Place added.' : 'That place is already on the list.')
}

/** The owner pasted a share (or skipped it). */
export async function markShare(f: FormData) {
  await requireOwner()
  const status = s(f, 'outcome') === 'posted' ? 'posted' : 'skipped'
  await sql`update shares set status = ${status}, posted_at = case when ${status} = 'posted' then now() end where id = ${id(f)} and status = 'todo'`
  revalidatePath('/places')
}

export async function findPlaces() {
  await requireOwner()
  const started = await dispatchAgent('scout')
  back(started ? 'The scout is looking for places; new ones show up under "Suggested" in about 15 minutes.' : 'Couldn\'t start the scout now; it runs every Monday by itself.')
}
