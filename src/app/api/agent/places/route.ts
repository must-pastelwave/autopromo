import { bad } from '@/lib/postInput'
import { placeStats, suggestPlaces } from '@/lib/places'

/** Every place known for a product (suggested, approved, rejected) with its results, so the scout doesn't suggest one twice. */
export async function GET(req: Request) {
  const productId = parseInt(new URL(req.url).searchParams.get('product_id') ?? '', 10)
  if (!Number.isInteger(productId)) return bad('product_id required')
  return Response.json({ places: await placeStats(productId) })
}

/** The scout's suggestions: {product_id, places: [{name, url, kind, members, rules, why}]}. The owner approves them. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null)
  const productId = Number(b?.product_id)
  if (!Number.isInteger(productId) || !Array.isArray(b?.places)) return bad('product_id and places[] required')
  if (b.places.length > 50) return bad('at most 50 places per call')
  return Response.json(await suggestPlaces(productId, b.places))
}
