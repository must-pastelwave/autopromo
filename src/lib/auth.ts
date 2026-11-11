import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ap_session'

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Agents send `Authorization: Bearer <AGENT_TOKEN>`. No token configured = nobody gets in. */
export function checkAgent(req: Request): boolean {
  const token = process.env.AGENT_TOKEN
  if (!token) return false
  return same(req.headers.get('authorization') ?? '', `Bearer ${token}`)
}

export function sessionValue(): string {
  return createHmac('sha256', process.env.DASHBOARD_PASSWORD ?? '').update('owner').digest('hex')
}

export function isOwnerCookie(v: string | undefined): boolean {
  return !!process.env.DASHBOARD_PASSWORD && !!v && same(v, sessionValue())
}
