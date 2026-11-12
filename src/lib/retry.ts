import { sql } from './db'

/**
 * Write a plan item again after its post was blocked or dropped: the old post is set aside (its client key freed),
 * the item goes back to 'planned', and retry_at lets the writer run now despite its cool-down.
 * Only for plan posts whose day is not more than a day past.
 */
export async function retryPost(postId: number): Promise<boolean> {
  return sql.begin(async tx => {
    const [p] = await tx`
      select x.id, x.plan_item_id from posts x join plan_items i on i.id = x.plan_item_id
      where x.id = ${postId} and x.status in ('blocked', 'dropped') and i.day >= current_date - 1`
    if (!p) return false
    await tx`update posts set status = 'dropped', client_key = client_key || '-old-' || id,
      review_reason = coalesce(review_reason, '') || ' [retried]' where id = ${p.id}`
    await tx`update plan_items set status = 'planned', retry_at = now() where id = ${p.plan_item_id}`
    return true
  })
}
