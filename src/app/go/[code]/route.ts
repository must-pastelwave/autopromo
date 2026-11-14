import { createHash } from 'node:crypto'
import { sql } from '@/lib/db'
import { isBot, trackedUrl } from '@/lib/links'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [row] = await sql`
    select p.id, p.topic, pr.url, c.platform
    from posts p join products pr on pr.id = p.product_id join channels c on c.id = p.channel_id
    where p.link_code = ${code}`
  if (!row) return new Response('Not found', { status: 404 })
  let clickId: number | undefined
  if (!isBot(req.headers.get('user-agent'))) {
    // ponytail: same IP + browser = one person, so people behind one office or mobile network with the same browser count once.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const visitor = createHash('sha256').update(`${process.env.CRON_SECRET ?? ''}|${ip}|${req.headers.get('user-agent') ?? ''}`).digest('hex').slice(0, 32)
    // Clicking again reuses the person's first click, so sign-ups still match it.
    const [click] = await sql`
      insert into clicks (post_id, visitor) values (${row.id}, ${visitor})
      on conflict (post_id, visitor) do update set visitor = excluded.visitor returning id`
    clickId = Number(click.id)
  }
  return Response.redirect(trackedUrl(row.url, { channel: row.platform, postId: row.id, topic: row.topic, code, clickId }), 302)
}
