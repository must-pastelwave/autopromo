'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireOwner } from '@/lib/current'
import { dispatchAgent } from '@/lib/github'
import { confirmPlan, formatFor } from '@/lib/plans'

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const back = (msg: string): never => redirect(`/plan?msg=${encodeURIComponent(msg)}`)
const LATER = 'It will run at the next scheduled time (05:00–05:30 KST); add GITHUB_DISPATCH_TOKEN to start runs right away.'

/** Research the site (no facts yet) or draft a plan, now. */
export async function startPlanning(f: FormData) {
  await requireOwner()
  const [p] = await sql`select active, jsonb_array_length(fact_sheet) as n from products where id = ${Number(s(f, 'product'))}`
  if (!p) back('Unknown product')
  if (!p.active) back('This product is paused, so its agents don\'t run.')
  const agent = p.n > 0 ? 'planner' : 'researcher'
  await sql`update products set agent_tried = agent_tried - ${agent}::text where id = ${Number(s(f, 'product'))}`
  const started = await dispatchAgent(agent)
  back(started ? `The ${agent} has started; refresh in a few minutes.` : `Queued for the ${agent}. ${LATER}`)
}

/** The owner's feedback on a draft: the planner rewrites the plan with it. */
export async function revisePlan(f: FormData) {
  await requireOwner()
  const feedback = s(f, 'feedback').slice(0, 4000)
  if (!feedback) back('Write what to change first.')
  const [p] = await sql`update plans set status = 'revising', feedback = ${feedback} where id = ${Number(s(f, 'plan'))} and status in ('draft', 'revising') returning product_id`
  if (p) await sql`update products set agent_tried = agent_tried - 'planner' where id = ${p.product_id}`
  if (!p) back('Only a draft plan can be revised.')
  const started = await dispatchAgent('planner')
  back(started ? 'The planner is revising the plan; refresh in a few minutes.' : `Feedback saved. ${LATER}`)
}

/** Owner and AI agree: the campaign runs from this plan, publishing automatically once the AI reviewer passes each post. */
export async function confirm(f: FormData) {
  await requireOwner()
  if (!(await confirmPlan(Number(s(f, 'plan'))))) back('Only a draft (not one being revised) can be confirmed.')
  await dispatchAgent('writer')
  revalidatePath('/', 'layout')
  redirect(`/?msg=${encodeURIComponent('Plan confirmed: the campaign is running. Posts are written, reviewed and published on their days.')}`)
}

async function checkItem(f: FormData, planId: number) {
  const [plan] = await sql`
    select pl.id, to_char(pl.starts_on, 'YYYY-MM-DD') as s, to_char(pl.ends_on, 'YYYY-MM-DD') as e,
      array(select platform from channels where product_id = pl.product_id) as platforms
    from plans pl where pl.id = ${planId} and pl.status in ('draft', 'revising', 'confirmed')`
  if (!plan) back('That plan can no longer be edited.')
  const day = s(f, 'day'), platform = s(f, 'platform'), theme = s(f, 'theme'), topic = s(f, 'topic')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < plan.s || day > plan.e) back(`Pick a day between ${plan.s} and ${plan.e}.`)
  if (!plan.platforms.includes(platform)) back('Unknown channel.')
  if (!theme || !topic) back('Theme and topic are needed.')
  return { day, platform, format: formatFor(platform), theme: theme.slice(0, 200), topic: topic.slice(0, 200), angle: s(f, 'angle').slice(0, 500) }
}

export async function saveItem(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const [it] = await sql`select plan_id from plan_items where id = ${id} and status = 'planned'`
  if (!it) back('Only items not yet written can be changed.')
  const v = await checkItem(f, it.plan_id)
  await sql`update plan_items set ${sql(v)} where id = ${id}`
  back('Item saved.')
}

export async function addItem(f: FormData) {
  await requireOwner()
  const planId = Number(s(f, 'plan'))
  const v = await checkItem(f, planId)
  await sql`insert into plan_items ${sql({ ...v, plan_id: planId })}`
  back('Item added.')
}

/** Remove a draft's item; on a confirmed plan it is marked skipped so the history stays. */
export async function removeItem(f: FormData) {
  await requireOwner()
  const id = Number(s(f, 'id'))
  const [it] = await sql`select i.id, pl.status from plan_items i join plans pl on pl.id = i.plan_id where i.id = ${id} and i.status = 'planned'`
  if (!it) back('Only items not yet written can be removed.')
  if (it.status === 'confirmed') await sql`update plan_items set status = 'skipped' where id = ${id}`
  else await sql`delete from plan_items where id = ${id}`
  back('Item removed.')
}
