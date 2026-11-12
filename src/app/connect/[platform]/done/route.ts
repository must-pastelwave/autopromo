import { sql } from '@/lib/db'
import { listAccounts, zernioPlatform } from '@/lib/zernio'
import { toChannels } from '../../to-channels'

// Zernio sends the browser here after the platform login, with ?error= when it failed.
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params
  const q = new URL(req.url).searchParams
  if (q.get('error')) return toChannels(req, `${platform} was not connected (${q.get('error')})`)
  const productId = Number(q.get('product'))
  const [p] = Number.isInteger(productId) ? await sql`select id, zernio_profile_id from products where id = ${productId}` : []
  if (!p?.zernio_profile_id) return toChannels(req, 'unknown product')
  try {
    const mine = (await listAccounts(p.zernio_profile_id)).filter(a => a.platform === zernioPlatform(platform))
    // Prefer an account no channel uses yet (the one just connected); else the latest one.
    const used = new Set((await sql`select zernio_account_id from channels where zernio_account_id is not null`).map(r => r.zernio_account_id))
    const pick = mine.find(a => !used.has(a._id)) ?? mine.at(-1)
    if (!pick) return toChannels(req, `${platform}: no account came back from Zernio. Try again.`)
    await sql`update channels set zernio_account_id = ${pick._id}, needs_reconnect = false where product_id = ${p.id} and platform = ${platform}`
    return toChannels(req, `Connected ${platform}: ${pick.username ?? pick._id}`)
  } catch (e) {
    return toChannels(req, `Zernio error: ${e instanceof Error ? e.message : e}`)
  }
}
