import { sql } from '@/lib/db'

// Video posts whose edit isn't rendered yet, for the render step in agents.yml. A post that failed twice is left out
// (its error says why); it stays unpublished.
export async function GET() {
  const posts = await sql`
    select p.id, p.revision, p.slides, pr.language from posts p join products pr on pr.id = p.product_id
    where p.kind = 'video' and p.video_url is null and p.status in ('draft', 'passed')
      and coalesce(p.error, '') not like 'video failed twice%'
    order by p.id limit 5`
  return Response.json({ posts })
}
