import { sql } from './db'

export const PLAN_DAYS = 28
const DRAFTS_ONLY = ['naver_blog', 'naver_cafe', 'reddit', 'hackernews']

/** The one format each channel takes. */
export function formatFor(platform: string): 'post' | 'carousel' | 'video' | 'draft' {
  if (platform === 'instagram') return 'carousel'
  if (platform === 'youtube' || platform === 'tiktok') return 'video'
  if (DRAFTS_ONLY.includes(platform)) return 'draft'
  return 'post'
}

export type PlanItem = { day: string; platform: string; format: string; theme: string; topic: string; angle: string; facts: number[] }
export type PlanInput = { strategy: Record<string, unknown>; items: PlanItem[] }

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Shape check of a planner's plan. `window` is the plan's first and last day (YYYY-MM-DD). */
export function parsePlanInput(b: any, ctx: { platforms: string[]; factCount: number; window: [string, string] }): PlanInput | string {
  if (!b || typeof b !== 'object') return 'body must be a JSON object'
  const st = b.strategy
  if (!st || typeof st !== 'object' || !str(st.goal, 500) || !str(st.cta, 300)) return 'strategy needs goal and cta'
  for (const k of ['channels', 'themes', 'rules']) if (st[k] !== undefined && !Array.isArray(st[k])) return `strategy.${k} must be an array`
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 200) return 'items: 1–200 calendar items'
  for (const it of b.items) {
    if (!it || !DAY.test(it.day ?? '') || it.day < ctx.window[0] || it.day > ctx.window[1]) return `item day must be within ${ctx.window[0]}..${ctx.window[1]}`
    if (!ctx.platforms.includes(it.platform)) return `item platform must be one of: ${ctx.platforms.join(', ')}`
    if (it.format !== formatFor(it.platform)) return `${it.platform} items use format '${formatFor(it.platform)}'`
    if (!str(it.theme, 200) || !str(it.topic, 200)) return 'every item needs theme and topic (max 200 chars)'
    if (it.angle !== undefined && (typeof it.angle !== 'string' || it.angle.length > 500)) return 'angle max 500 chars'
    const facts = it.facts ?? []
    if (!Array.isArray(facts) || facts.some((i: unknown) => !Number.isInteger(i) || (i as number) < 0 || (i as number) >= ctx.factCount)) {
      return 'item facts must be indexes into the fact sheet'
    }
  }
  return {
    strategy: st,
    items: b.items.map((it: any) => ({ day: it.day, platform: it.platform, format: it.format, theme: it.theme.trim(), topic: it.topic.trim(), angle: (it.angle ?? '').trim(), facts: it.facts ?? [] })),
  }
}

/**
 * Where the planner's next plan goes: the open draft (replaced in place), or a new draft that starts
 * today, or the day after the confirmed plan that is still running.
 */
export async function planSlot(productId: number): Promise<{ openId: number | null; window: [string, string] } | null> {
  const [p] = await sql`select id, timezone from products where id = ${productId}`
  if (!p) return null
  const [open] = await sql`
    select id, to_char(starts_on, 'YYYY-MM-DD') as s, to_char(ends_on, 'YYYY-MM-DD') as e from plans
    where product_id = ${productId} and status in ('draft', 'revising') order by id desc limit 1`
  if (open) return { openId: open.id, window: [open.s, open.e] }
  const [w] = await sql`
    with base as (
      select greatest((now() at time zone ${p.timezone})::date,
        coalesce((select max(ends_on) + 1 from plans where product_id = ${productId} and status = 'confirmed'), '-infinity'::date)) as d)
    select to_char(d, 'YYYY-MM-DD') as s, to_char(d + ${PLAN_DAYS - 1}::int, 'YYYY-MM-DD') as e from base`
  return { openId: null, window: [w.s, w.e] }
}

/** Save the planner's plan as the product's draft. Returns whether it replaced an open draft. */
export async function saveDraft(productId: number, slot: { openId: number | null; window: [string, string] }, plan: PlanInput): Promise<'created' | 'replaced'> {
  return sql.begin(async tx => {
    let planId = slot.openId
    if (planId) {
      await tx`update plans set strategy = ${tx.json(plan.strategy as any)}, status = 'draft', feedback = '', revision = revision + 1 where id = ${planId}`
      await tx`delete from plan_items where plan_id = ${planId}`
    } else {
      const [p] = await tx`insert into plans (product_id, starts_on, ends_on, strategy) values (${productId}, ${slot.window[0]}, ${slot.window[1]}, ${tx.json(plan.strategy as any)}) returning id`
      planId = p.id
    }
    await tx`insert into plan_items ${tx(plan.items.map(i => ({ ...i, plan_id: planId })))}`
    return slot.openId ? 'replaced' : 'created'
  })
}

export type PlanRow = Record<string, any> & { id: number; status: string; starts: string; ends: string; revision: number; feedback: string; strategy: Record<string, any>; items: Record<string, any>[] }

/** A plan with its calendar, oldest day first. */
export async function planWithItems(planId: number): Promise<PlanRow | null> {
  const [plan] = await sql`select *, to_char(starts_on, 'YYYY-MM-DD') as starts, to_char(ends_on, 'YYYY-MM-DD') as ends from plans where id = ${planId}`
  if (!plan) return null
  const items = await sql`select *, to_char(day, 'YYYY-MM-DD') as day from plan_items where plan_id = ${planId} order by plan_items.day, plan_items.id`
  return { ...plan, items: [...items] } as unknown as PlanRow
}

/** The owner agrees: the plan runs, and the product's chosen channels publish once the AI reviewer passes a post. */
export async function confirmPlan(planId: number): Promise<boolean> {
  return sql.begin(async tx => {
    const [p] = await tx`update plans set status = 'confirmed', confirmed_at = now() where id = ${planId} and status = 'draft' returning product_id`
    if (!p) return false
    await tx`update channels set auto_publish = true where product_id = ${p.product_id} and enabled and automatable`
    return true
  })
}
