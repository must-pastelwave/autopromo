import { sql } from './db'

/** Where a product is on its way: research → channels → plan (confirm) → running. */
export type Step = 'research' | 'channels' | 'plan' | 'running'

export type Journey = {
  step: Step
  factCount: number
  channels: { id: number; platform: string; enabled: boolean; automatable: boolean; connected: boolean }[]
  /** Enabled, automatable channels with no account yet: their posts wait until connected. */
  unconnected: string[]
  /** The open draft (first plan, a revision, or the next plan while one runs). */
  draft: { id: number; status: string; starts: string } | null
  /** The confirmed plan running now, or starting soon. */
  running: { id: number; starts: string; ends: string } | null
}

export async function journeyFor(productId: number): Promise<Journey | null> {
  const [p] = await sql`select jsonb_array_length(fact_sheet) as n from products where id = ${productId}`
  if (!p) return null
  const channels = (await sql`
    select id, platform, enabled, automatable, zernio_account_id is not null as connected
    from channels where product_id = ${productId} order by id`) as unknown as Journey['channels']
  const [draft] = await sql`
    select id, status, to_char(starts_on, 'YYYY-MM-DD') as starts from plans
    where product_id = ${productId} and status in ('draft', 'revising') order by id desc limit 1`
  const [running] = await sql`
    select id, to_char(starts_on, 'YYYY-MM-DD') as starts, to_char(ends_on, 'YYYY-MM-DD') as ends from plans
    where product_id = ${productId} and status = 'confirmed' and ends_on >= current_date order by starts_on limit 1`
  const chosen = channels.filter(c => c.enabled)
  const step: Step = p.n === 0 ? 'research' : chosen.length === 0 ? 'channels' : running ? 'running' : 'plan'
  return {
    step, factCount: p.n, channels,
    unconnected: chosen.filter(c => c.automatable && !c.connected).map(c => c.platform),
    draft: draft ? { id: draft.id, status: draft.status, starts: draft.starts } : null,
    running: running ? { id: running.id, starts: running.starts, ends: running.ends } : null,
  }
}
