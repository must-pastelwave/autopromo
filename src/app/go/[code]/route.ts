import { createHash } from 'node:crypto'
import { sql } from '@/lib/db'
import { isBot, trackedUrl } from '@/lib/links'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  // A post's own link, or its link in one place (a share): same post, but people are counted per place.
  const [row] = await sql`
    select p.id, p.topic, pr.url, c.platform as source, null::int as share_id
    from posts p join products pr on pr.id = p.product_id join channels c on c.id = p.channel_id
    where p.link_code = ${code}
    union all
    select p.id, p.topic, pr.url, pl.kind, s.id
    from shares s join places pl on pl.id = s.place_id join posts p on p.id = s.post_id join products pr on pr.id = p.product_id
    where s.link_code = ${code}`
  if (!row) return new Response('Not found', { status: 404 })
  let clickId: number | undefined
  if (!isBot(req.headers.get('user-agent'))) {
    // ponytail: same IP + browser = one person, so people behind one office or mobile network with the same browser count once.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const visitor = createHash('sha256').update(`${process.env.CRON_SECRET ?? ''}|${ip}|${req.headers.get('user-agent') ?? ''}`).digest('hex').slice(0, 32)
    // Clicking again reuses the person's first click, so sign-ups still match it.
    const [click] = await sql`
      insert into clicks (post_id, share_id, visitor) values (${row.id}, ${row.share_id}, ${visitor})
      on conflict (post_id, (coalesce(share_id, 0)), visitor) do update set visitor = excluded.visitor returning id`
    clickId = Number(click.id)
  }
  return Response.redirect(trackedUrl(row.url, { channel: row.source, postId: row.id, topic: row.topic, code, clickId }), 302)
}
