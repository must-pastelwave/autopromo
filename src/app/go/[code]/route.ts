import { sql } from '@/lib/db'
import { isBot, trackedUrl } from '@/lib/links'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [row] = await sql`
    select p.id, p.topic, pr.url, c.platform
    from posts p join products pr on pr.id = p.product_id join channels c on c.id = p.channel_id
    where p.link_code = ${code}`
  if (!row) return new Response('Not found', { status: 404 })
  if (!isBot(req.headers.get('user-agent'))) await sql`insert into clicks (post_id) values (${row.id})`
  return Response.redirect(trackedUrl(row.url, { channel: row.platform, postId: row.id, topic: row.topic }), 302)
}
