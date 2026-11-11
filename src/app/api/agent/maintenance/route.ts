import { runMaintenance } from '@/lib/publish'

// Agents call this at the end of each run, so upkeep happens several times a day
// even on Vercel's free plan (which allows only a daily cron).
export async function POST() {
  await runMaintenance()
  return Response.json({ ok: true })
}
