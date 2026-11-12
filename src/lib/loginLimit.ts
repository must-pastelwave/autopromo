import { sql } from './db'

export const LOGIN_MAX_FAILURES = 10
// ponytail: one global limit (no per-IP tracking). Locks out the owner too during an attack, for at most 15 minutes.

/** Fewer than LOGIN_MAX_FAILURES failed logins in the last 15 minutes. */
export async function loginAllowed(): Promise<boolean> {
  const [r] = await sql`select count(*)::int as n from login_failures where at > now() - interval '15 minutes'`
  return r.n < LOGIN_MAX_FAILURES
}

export async function recordLoginFailure(): Promise<void> {
  await sql`delete from login_failures where at < now() - interval '1 day'`
  await sql`insert into login_failures default values`
}
