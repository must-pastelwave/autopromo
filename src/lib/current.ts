import { cookies } from 'next/headers'
import { sql } from './db'
import { isOwnerCookie, SESSION_COOKIE } from './auth'

export const PRODUCT_COOKIE = 'ap_product'

/** The product picked in the switcher, or the first one. Null when none exist yet. */
export async function currentProduct() {
  const slug = (await cookies()).get(PRODUCT_COOKIE)?.value ?? ''
  const [p] = await sql`select * from products order by (slug = ${slug}) desc, active desc, id limit 1`
  return p ?? null
}

/** Server actions re-check the owner session; the proxy check alone is optimistic. */
export async function requireOwner() {
  if (!isOwnerCookie((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error('not signed in')
}
