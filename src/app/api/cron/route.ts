import { runMaintenance } from '@/lib/publish'
import { bearerMatches } from '@/lib/auth'

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  if (!bearerMatches(req, process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  await runMaintenance()
  return Response.json({ ok: true })
}
