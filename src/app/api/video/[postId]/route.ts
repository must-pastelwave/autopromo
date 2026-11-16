import { sql } from '@/lib/db'
import { idParam } from '@/lib/postInput'

// Owner-only (the proxy requires the dashboard cookie): watch a video post before approving it.
export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const id = idParam((await params).postId)
  const [post] = id === null ? [] : await sql`select video_url from posts where id = ${id} and kind = 'video'`
  if (!post) return new Response('Not found', { status: 404 })
  if (!post.video_url) return new Response('This video is still being made. Check again in about 15 minutes.', { status: 404 })
  return Response.redirect(post.video_url, 302)
}
