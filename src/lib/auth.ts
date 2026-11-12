import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ap_session'

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** `Authorization: Bearer <secret>`, compared in constant time. An unset or empty secret matches nothing. */
export function bearerMatches(req: Request, secret: string | undefined): boolean {
  return !!secret && same(req.headers.get('authorization') ?? '', `Bearer ${secret}`)
}

/** Agents send `Authorization: Bearer <AGENT_TOKEN>`. No token configured = nobody gets in. */
export function checkAgent(req: Request): boolean {
  return bearerMatches(req, process.env.AGENT_TOKEN)
}

export function sessionValue(): string {
  return createHmac('sha256', process.env.DASHBOARD_PASSWORD ?? '').update('owner').digest('hex')
}

export function isOwnerCookie(v: string | undefined): boolean {
  return !!process.env.DASHBOARD_PASSWORD && !!v && same(v, sessionValue())
}
