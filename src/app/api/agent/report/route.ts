import { bad } from '@/lib/postInput'

// Only ever POST to Slack itself: the URL comes from an env var, but a typo must not send the report elsewhere.
const SLACK_HOOK = /^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/

/** The analyst's weekly report, sent to the team's Slack channel (SLACK_WEBHOOK_URL). Without the URL it's skipped, not an error. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null)
  const text = typeof b?.text === 'string' ? b.text.trim() : ''
  if (!text) return bad('text required')
  const hook = process.env.SLACK_WEBHOOK_URL ?? ''
  if (!SLACK_HOOK.test(hook)) return Response.json({ sent: false, why: 'SLACK_WEBHOOK_URL is not set' })
  const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 3000) }) })
  return Response.json({ sent: r.ok, ...(r.ok ? {} : { why: `Slack ${r.status}` }) })
}
