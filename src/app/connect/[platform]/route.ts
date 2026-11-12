import { sql } from '@/lib/db'
import { CONNECTABLE, connectUrl, ensureProfile } from '@/lib/zernio'
import { toChannels } from '../to-channels'

const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '')

// Owner-only (proxy). Channels page → here → the platform's login (via Zernio) → ./done.
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const productId = Number(new URL(req.url).searchParams.get('product'))
  if (!CONNECTABLE.includes(platform)) return toChannels(req, `can't connect ${platform} from here`)
  const [p] = Number.isInteger(productId) ? await sql`select id, slug, name, zernio_profile_id from products where id = ${productId}` : []
  if (!p) return toChannels(req, 'unknown product')
  try {
    const profileId = p.zernio_profile_id ?? await ensureProfile(p.slug, p.name)
    if (!p.zernio_profile_id) await sql`update products set zernio_profile_id = ${profileId} where id = ${p.id}`
    const back = `${appUrl()}/connect/${platform}/done?product=${p.id}`
    return Response.redirect(await connectUrl(platform, profileId, back), 302)
  } catch (e) {
    return toChannels(req, `Zernio error: ${e instanceof Error ? e.message : e}. Check ZERNIO_API_KEY.`)
  }
}
