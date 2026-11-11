import { sql } from '@/lib/db'
import { cancelPost } from '@/lib/zernio'
import { bad, idParam, readJson } from '@/lib/postInput'

type Fact = { fact: string; source_url: string }
const LIVE = ['draft', 'blocked', 'passed', 'scheduled', 'waiting', 'failed']

/**
 * Replace the fact sheet. Facts are identified by their text: a post that used a fact
 * no longer on the sheet is dropped; the others get their indexes remapped.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const b = await readJson(req)
  const facts: Fact[] | undefined = b?.facts
  if (!Array.isArray(facts) || facts.some(f => !f || typeof f.fact !== 'string' || !f.fact.trim()
    || typeof f.source_url !== 'string' || !/^https?:\/\/\S+$/.test(f.source_url))) {
    return bad('facts must be [{fact, source_url}] with an http(s) source_url')
  }
  const [product] = await sql`select fact_sheet from products where id = ${id}`
  if (!product) return bad('not found', 404)
  const oldFacts: Fact[] = product.fact_sheet
  const newIndex = new Map(facts.map((f, i) => [f.fact, i]))

  const toCancel: string[] = []
  await sql.begin(async tx => {
    await tx`update products set fact_sheet = ${tx.json(facts)} where id = ${id}`
    const posts = await tx`select id, status, facts_used, zernio_post_id from posts where product_id = ${id} and status in ${tx(LIVE)}`
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
  const failed: string[] = []
  for (const z of toCancel) await cancelPost(z).catch(() => failed.push(z))
  return Response.json({ ok: true, dropped_scheduled: toCancel.length, cancel_failed: failed })
}
