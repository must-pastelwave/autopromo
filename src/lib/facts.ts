import { sql } from './db'
import { cancelPost } from './zernio'

export type Fact = { fact: string; source_url: string }
const LIVE = ['draft', 'blocked', 'passed', 'scheduled', 'waiting', 'failed']

export function validFacts(facts: unknown): facts is Fact[] {
  return Array.isArray(facts) && facts.every(f => f && typeof f.fact === 'string' && f.fact.trim()
    && typeof f.source_url === 'string' && /^https?:\/\/\S+$/.test(f.source_url))
}

/**
 * Replace a product's fact sheet. Facts are identified by their text: a live post that used
 * a fact no longer on the sheet is dropped (and cancelled in Zernio); others get indexes remapped.
 * Returns null when the product doesn't exist.
 */
export async function replaceFacts(productId: number, facts: Fact[]) {
  const [product] = await sql`select fact_sheet from products where id = ${productId}`
  if (!product) return null
  const oldFacts: Fact[] = product.fact_sheet
  const newIndex = new Map(facts.map((f, i) => [f.fact, i]))
  const toCancel: string[] = []
  await sql.begin(async tx => {
    await tx`update products set fact_sheet = ${tx.json(facts)} where id = ${productId}`
    const posts = await tx`select id, status, facts_used, zernio_post_id from posts where product_id = ${productId} and status in ${tx(LIVE)}`
    for (const p of posts) {
      const mapped = (p.facts_used as number[]).map(i => newIndex.get(oldFacts[i]?.fact))
      if (mapped.some(i => i === undefined)) {
        await tx`update posts set status = 'dropped', review_reason = 'a fact it used is no longer on the product site' where id = ${p.id}`
        if (p.status === 'scheduled' && p.zernio_post_id) toCancel.push(p.zernio_post_id)
      } else {
        await tx`update posts set facts_used = ${mapped as number[]} where id = ${p.id}`
      }
    }
  })
  const cancelFailed: string[] = []
  for (const z of toCancel) await cancelPost(z).catch(() => cancelFailed.push(z))
  return { dropped_scheduled: toCancel.length, cancel_failed: cancelFailed }
}

/** Settings textarea format: one fact per line, "fact text | https://source". */
export function parseFactLines(text: string): Fact[] | string {
  const facts: Fact[] = []
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.trim()
    if (!line) continue
    const cut = line.lastIndexOf('|')
    const f = { fact: line.slice(0, cut).trim(), source_url: line.slice(cut + 1).trim() }
    if (cut < 0 || !validFacts([f])) return `line ${i + 1}: use "fact | https://source-page"`
    facts.push(f)
  }
  return facts
}
