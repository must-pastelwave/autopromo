import { searchPhotos } from '@/lib/photos'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const q = u.searchParams.get('q')?.trim()
  const n = Math.min(Math.max(parseInt(u.searchParams.get('n') ?? '5', 10) || 5, 1), 20)
  if (!q) return Response.json({ error: 'q required' }, { status: 400 })
  return Response.json({ photos: await searchPhotos(q, n) })
}
