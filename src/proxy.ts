import { NextResponse, type NextRequest } from 'next/server'
import { checkAgent, isOwnerCookie, SESSION_COOKIE } from '@/lib/auth'

// Public: tracked links, link-in-bio, slide images (Zernio fetches them), login.
// /api/cron checks CRON_SECRET itself.
const PUBLIC = /^\/(go|l|login)(\/|$)|^\/api\/(slide|cron)(\/|$)/

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (path.startsWith('/api/agent')) {
    return checkAgent(req) ? NextResponse.next() : Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (PUBLIC.test(path)) return NextResponse.next()
  if (isOwnerCookie(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = { matcher: '/((?!_next/|favicon.ico).*)' }
