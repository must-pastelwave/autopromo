import { sql } from '@/lib/db'
import { idParam } from '@/lib/postInput'
import { renderPostVideo } from '@/lib/publish'

// Owner-only (the proxy requires the dashboard cookie): watch a video post before approving it.
export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const id = idParam((await params).postId)
  const [post] = id === null ? [] : await sql`select id, slides, revision from posts where id = ${id} and kind = 'video'`
  if (!post) return new Response('Not found', { status: 404 })
  const mp4 = await renderPostVideo(post.id, post.slides.length, post.revision)
  return new Response(new Uint8Array(mp4), { headers: { 'content-type': 'video/mp4', 'cache-control': 'private, max-age=3600' } })
}
