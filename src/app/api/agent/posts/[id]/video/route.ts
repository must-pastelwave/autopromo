import { sql } from '@/lib/db'
import { publish } from '@/lib/publish'
import { bad, idParam, readJson } from '@/lib/postInput'
import { presignMedia } from '@/lib/zernio'

/**
 * The render step's three calls for one video post:
 *   {}            → {upload_url}: an upload slot in Zernio's media store for this revision's mp4
 *   {done: true}  → the uploaded mp4 is the post's video; a post that already passed review goes out now
 *   {error: "…"}  → the render failed (the second failure is final)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id)
  if (id === null) return bad('not found', 404)
  const [post] = await sql`select id, kind, revision, status, error, video_upload from posts where id = ${id}`
  if (!post || post.kind !== 'video') return bad('not found', 404)
  const b = (await readJson(req)) ?? {}

  if (typeof b.error === 'string') {
    const twice = (post.error ?? '').startsWith('video failed')
    await sql`update posts set error = ${`video failed${twice ? ' twice' : ''}: ${b.error.slice(0, 300)}`} where id = ${id}`
    return Response.json({ ok: true })
  }
  if (b.done === true) {
    // A revision in between cleared video_upload: that render is stale, so nothing changes.
    if (!post.video_upload) return bad('no upload started for this revision', 409)
    await sql`update posts set video_url = video_upload, error = null where id = ${id}`
    if (post.status === 'passed') await publish(id)
    return Response.json({ ok: true })
  }
  const { uploadUrl, publicUrl } = await presignMedia(`post-${id}-r${post.revision}.mp4`, 'video/mp4')
  await sql`update posts set video_upload = ${publicUrl} where id = ${id}`
  return Response.json({ upload_url: uploadUrl })
}
