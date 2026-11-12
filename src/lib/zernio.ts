const BASE = 'https://zernio.com/api/v1'

export class ZernioError extends Error {
  constructor(public status: number, message: string) {
    super(`zernio ${status}: ${message}`)
  }
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new ZernioError(0, 'ZERNIO_API_KEY is not set')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${key}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`${BASE}${path}`, { ...init, headers })
  const text = await r.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  if (!r.ok) throw new ZernioError(r.status, body?.error ?? body?.message ?? text.slice(0, 200))
  return { status: r.status, body }
}

/** First per-platform error Zernio reports on a post, if any. */
function platformError(post: any): string {
  return (post?.platforms ?? []).map((p: any) => p.error ?? p.errorMessage).find(Boolean) ?? ''
}

export async function createPost(p: {
  postId: number; accountId: string; platform: string; caption: string; mediaUrls: string[]; scheduledFor: Date
  mediaType?: 'video'; platformSpecificData?: Record<string, unknown>; extra?: Record<string, unknown>; idempotencyKey?: string
}): Promise<{ zernioId: string }> {
  const { status, body } = await call('/posts', {
    method: 'POST',
    headers: { 'Idempotency-Key': p.idempotencyKey ?? `post-${p.postId}` },
    body: JSON.stringify({
      content: p.caption,
      ...(p.mediaUrls.length ? { mediaItems: p.mediaUrls.map(url => (p.mediaType ? { type: p.mediaType, url } : { url })) } : {}),
      platforms: [{ platform: p.platform, accountId: p.accountId, ...(p.platformSpecificData ? { platformSpecificData: p.platformSpecificData } : {}) }],
      scheduledFor: p.scheduledFor.toISOString(),
      ...p.extra,
    }),
  })
  const post = body?.post
  // 207 is a 2xx that means "created but not fully published".
  if (status === 207 || ['partial', 'failed'].includes(post?.status)) {
    throw new ZernioError(status, `post ${post?.status ?? 'unknown'} ${platformError(post)}`.trim())
  }
  if (!post?._id) throw new ZernioError(status, 'no post id in response')
  return { zernioId: post._id }
}

/** Upload a file to Zernio's media store (presigned PUT) and return its public URL. */
export async function uploadMedia(data: Buffer, filename: string, contentType: string): Promise<string> {
  const { body } = await call('/media/presign', { method: 'POST', body: JSON.stringify({ filename, contentType }) })
  if (!body?.uploadUrl || !body?.publicUrl) throw new ZernioError(0, 'presign returned no upload url')
  const r = await fetch(body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Uint8Array(data) })
  if (!r.ok) throw new ZernioError(r.status, `upload ${r.status}`)
  return body.publicUrl
}

export async function getPost(zernioId: string): Promise<{ status: string; error: string }> {
  const { body } = await call(`/posts/${encodeURIComponent(zernioId)}`)
  return { status: body?.post?.status ?? 'unknown', error: platformError(body?.post) }
}

export async function cancelPost(zernioId: string): Promise<void> {
  await call(`/posts/${encodeURIComponent(zernioId)}`, { method: 'DELETE' })
}

export async function listAccounts(): Promise<{ _id: string; platform: string; username?: string }[]> {
  const { body } = await call('/accounts')
  return body?.accounts ?? []
}
