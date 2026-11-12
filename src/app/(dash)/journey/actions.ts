'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireOwner } from '@/lib/current'
import { dispatchAgent } from '@/lib/github'

/** Step 3: where to post. Choosing channels lets the planner draft the plan. */
export async function chooseChannels(f: FormData) {
  await requireOwner()
  const productId = Number(f.get('product'))
  const picked = f.getAll('platform').map(String)
  if (picked.length === 0) redirect(`/?msg=${encodeURIComponent('Pick at least one channel.')}`)
  await sql`update channels set enabled = platform = any(${picked}), started_at = case when platform = any(${picked}) then coalesce(started_at, now()) else started_at end where product_id = ${productId}`
  await sql`update products set agent_tried = agent_tried - 'planner' where id = ${productId}`
  await dispatchAgent('auto')
  revalidatePath('/', 'layout')
  redirect(`/?msg=${encodeURIComponent('Channels saved. The planner is drafting your 4-week plan.')}`)
}
