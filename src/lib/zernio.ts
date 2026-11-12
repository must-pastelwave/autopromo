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
      platforms: [{ platform: zernioPlatform(p.platform), accountId: p.accountId, ...(p.platformSpecificData ? { platformSpecificData: p.platformSpecificData } : {}) }],
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

export async function listAccounts(profileId?: string): Promise<{ _id: string; platform: string; username?: string }[]> {
  const { body } = await call(profileId ? `/accounts?profileId=${encodeURIComponent(profileId)}` : '/accounts')
  return body?.accounts ?? []
}

/** Our channel names → Zernio's platform names. */
export const zernioPlatform = (platform: string) => (platform === 'x' ? 'twitter' : platform)

/** Platforms the owner can connect from our Channels page (Zernio's OAuth flow). */
export const CONNECTABLE = ['tiktok', 'youtube', 'instagram', 'threads', 'facebook', 'linkedin', 'x', 'pinterest']

/** The Zernio profile for one product (one profile per product keeps each business's accounts apart). */
export async function ensureProfile(externalId: string, name: string): Promise<string> {
  const { body } = await call(`/profiles?externalId=${encodeURIComponent(externalId)}`)
  const found = body?.profiles?.[0]?._id
  if (found) return found
  const created = await call('/profiles', { method: 'POST', body: JSON.stringify({ name, externalId }) })
  const id = created.body?.profile?._id ?? created.body?._id
  if (!id) throw new ZernioError(created.status, 'no profile id in response')
  return id
}

/** Zernio's login link for a platform; after login Zernio sends the browser to redirectUrl (with ?error= on failure). */
export async function connectUrl(platform: string, profileId: string, redirectUrl: string): Promise<string> {
  const q = new URLSearchParams({ profileId, redirect_url: redirectUrl })
  const { body } = await call(`/connect/${encodeURIComponent(zernioPlatform(platform))}?${q}`)
  if (!body?.authUrl) throw new ZernioError(0, 'no login link in response')
  return body.authUrl
}

export type ZernioPostMetrics = { _id: string; platformPostUrl?: string; analytics?: Record<string, number> }

/** One page of post analytics (posts made through Zernio), newest first. */
export async function getAnalytics(q: { fromDate: string; page: number; limit: number }): Promise<{ posts: ZernioPostMetrics[]; total: number }> {
  const qs = new URLSearchParams({ source: 'late', fromDate: q.fromDate, page: String(q.page), limit: String(q.limit) })
  const { body } = await call(`/analytics?${qs}`)
  return { posts: body?.posts ?? [], total: body?.pagination?.total ?? 0 }
}

/** Daily follower counts per account (up to 25 accounts a call). */
export async function getFollowerStats(accountIds: string[], fromDate: string): Promise<Record<string, { date: string; followers: number }[]>> {
  const qs = new URLSearchParams({ accountIds: accountIds.join(','), fromDate, granularity: 'daily' })
  const { body } = await call(`/accounts/follower-stats?${qs}`)
  return body?.stats ?? {}
}
