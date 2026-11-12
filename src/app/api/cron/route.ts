import { runMaintenance } from '@/lib/publish'
import { bearerMatches } from '@/lib/auth'
import { pendingWork } from '@/lib/pending'
import { dispatchAgent } from '@/lib/github'

// Vercel Cron (every 5 minutes) sends `Authorization: Bearer <CRON_SECRET>`.
// GitHub's own schedule can run hours late, so this is what reliably starts the agents when work is waiting.
export async function GET(req: Request) {
  if (!bearerMatches(req, process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const started = (await pendingWork()) ? await dispatchAgent('auto') : false
  await runMaintenance()
  return Response.json({ ok: true, started })
}
