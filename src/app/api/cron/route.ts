import { runMaintenance } from '@/lib/publish'

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  await runMaintenance()
  return Response.json({ ok: true })
}
