export type Photo = { url: string; credit: string; source: 'unsplash' | 'pexels'; track?: string }

async function getJson(url: string, auth: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { Authorization: auth } })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

async function unsplash(q: string, n: number): Promise<Photo[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return []
  const u = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=portrait&per_page=${n}`
  const j = await getJson(u, `Client-ID ${key}`)
  return (j?.results ?? []).filter((p: any) => typeof p?.urls?.regular === 'string').map((p: any) => ({
    url: p.urls.regular, credit: `${p.user?.name ?? 'Unknown'} / Unsplash`, source: 'unsplash' as const, track: p.links?.download_location,
  }))
}

async function pexels(q: string, n: number): Promise<Photo[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []
  const u = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=${n}`
  const j = await getJson(u, key)
  return (j?.photos ?? []).filter((p: any) => typeof p?.src?.large2x === 'string')
    .map((p: any) => ({ url: p.src.large2x, credit: `${p.photographer ?? 'Unknown'} / Pexels`, source: 'pexels' as const }))
}

export async function searchPhotos(q: string, n: number): Promise<Photo[]> {
  const first = (await unsplash(q, n)).slice(0, n)
  if (first.length >= n) return first
  return [...first, ...(await pexels(q, n - first.length)).slice(0, n - first.length)]
}

/** Unsplash API terms: ping download_location when a photo is actually used. */
export async function trackUse(track: string | undefined | null): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key || !track?.startsWith('https://api.unsplash.com/')) return
  await getJson(track, `Client-ID ${key}`)
}
