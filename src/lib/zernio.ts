import { sql } from './db'

const BASE = 'https://zernio.com/api/v1'

export class ZernioError extends Error {
  constructor(public status: number, message: string) {
    super(`zernio ${status}: ${message}`)
  }
}

/** The Zernio key saved in Settings, else ZERNIO_API_KEY from Vercel. */
export async function zernioKey(): Promise<{ key: string; saved: Date | null } | null> {
  const [r] = await sql`select value, updated_at from settings where key = 'zernio_api_key'`
  if (r) return { key: r.value, saved: r.updated_at }
  return process.env.ZERNIO_API_KEY ? { key: process.env.ZERNIO_API_KEY, saved: null } : null
}

async function call(path: string, init: RequestInit = {}, useKey?: string): Promise<{ status: number; body: any }> {
  const key = useKey ?? (await zernioKey())?.key
  if (!key) throw new ZernioError(0, 'no Zernio API key: add one in Settings → Zernio')
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

/** A one-time upload slot in Zernio's media store: PUT the bytes to uploadUrl (no auth), then use publicUrl. */
export async function presignMedia(filename: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const { body } = await call('/media/presign', { method: 'POST', body: JSON.stringify({ filename, contentType }) })
  if (!body?.uploadUrl || !body?.publicUrl) throw new ZernioError(0, 'presign returned no upload url')
  return { uploadUrl: body.uploadUrl, publicUrl: body.publicUrl }
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

export type ZernioPostMetrics = { _id: string; latePostId?: string; platformPostUrl?: string; analytics?: Record<string, number> }

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

/**
 * Switch to another Zernio account (or save the first key). The key must work. Accounts and profiles from the old
 * account mean nothing in the new one: posts queued there are cancelled (best effort, with the old key) and wait
 * again, and every channel is unlinked until the owner connects it again. Returns what's wrong, or null.
 */
export async function saveZernioKey(value: string): Promise<string | null> {
  const key = value.trim()
  if (!/^\S{20,}$/.test(key)) return 'Paste the API key from Zernio (Settings → API keys).'
  try { await call('/accounts', {}, key) } catch (e) {
    return e instanceof ZernioError && e.status === 401 ? 'Zernio doesn\'t accept that key. Copy it again from Zernio.' : `Can't check the key now: ${e instanceof Error ? e.message : e}`
  }
  const old = (await zernioKey())?.key
  if (old && old !== key) {
    const queued = await sql`select zernio_post_id from posts where status = 'scheduled' and zernio_post_id is not null`
    for (const q of queued) await call(`/posts/${encodeURIComponent(q.zernio_post_id)}`, { method: 'DELETE' }, old).catch(() => {})
    await sql.begin(async tx => {
      await tx`update posts p set status = 'waiting', zernio_post_id = null, error = 'connect your ' || c.platform || ' account to post this'
        from channels c where c.id = p.channel_id and p.status = 'scheduled' and p.zernio_post_id is not null`
      await tx`update channels set zernio_account_id = null, needs_reconnect = false where zernio_account_id is not null`
      await tx`update products set zernio_profile_id = null where zernio_profile_id is not null`
    })
  }
  await sql`insert into settings (key, value) values ('zernio_api_key', ${key})
    on conflict (key) do update set value = excluded.value, updated_at = now()`
  return null
}
