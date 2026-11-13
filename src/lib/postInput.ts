import { findBanned } from './rules'

export type Slide = { text: string; photo_url?: string; photo_credit?: string; photo_track?: string }
export type PostInput = {
  product_id: number; channel_id: number; client_key: string; kind: 'carousel' | 'text' | 'video'
  caption: string; slides: Slide[]; topic: string; format_tag: string; is_experiment: boolean; facts_used: number[]
}

export const VIDEO_PLATFORMS = ['tiktok', 'youtube']

const str = (v: unknown, max = 5000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const https = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v))

/** Shape check at the trust boundary. Returns an error message, or the clean input. */
export function parsePostInput(b: any, ctx: { platform: string; factCount: number }): PostInput | string {
  if (!b || typeof b !== 'object') return 'body must be a JSON object'
  if (!Number.isInteger(b.product_id) || !Number.isInteger(b.channel_id)) return 'product_id and channel_id must be integers'
  if (!str(b.client_key, 200)) return 'client_key required'
  if (!['carousel', 'text', 'video'].includes(b.kind)) return "kind must be 'carousel', 'text' or 'video'"
  if (!str(b.caption, 2200)) return 'caption required (max 2200 chars)'
  if (!str(b.topic, 200) || !str(b.format_tag, 100)) return 'topic and format_tag required'
  const slides = b.slides ?? []
  if (!Array.isArray(slides)) return 'slides must be an array'
  for (const s of slides) {
    if (!s || !str(s.text, 300)) return 'every slide needs text (max 300 chars)'
    if (!https(s.photo_url) || !https(s.photo_track)) return 'photo urls must be https'
    if (s.photo_credit !== undefined && s.photo_credit !== null && typeof s.photo_credit !== 'string') return 'photo_credit must be a string'
  }
  if (b.kind === 'carousel' && (slides.length < 5 || slides.length > 7)) return 'a carousel needs 5–7 slides'
  if (b.kind === 'text' && slides.length > 1) return 'a text post has at most 1 image'
  if (ctx.platform === 'instagram' && b.kind !== 'carousel') return 'instagram posts must be carousels'
  const isVideoChannel = VIDEO_PLATFORMS.includes(ctx.platform)
  if (isVideoChannel !== (b.kind === 'video')) return `video posts are for ${VIDEO_PLATFORMS.join(' and ')} only, and those take only video`
  if (b.kind === 'video' && (slides.length < 3 || slides.length > 8)) return 'a video needs 3–8 slides'
  // X counts a link as 23 characters; the app appends one, so 250 keeps the whole post under 280.
  if (ctx.platform === 'x' && b.caption.length > 250) return 'x: caption max 250 chars (the app adds the link)'
  // Telegram photo captions stop at 1024 chars and Discord messages at 2000; the app appends the link.
  if (ctx.platform === 'telegram' && b.caption.length > 900) return 'telegram: caption max 900 chars (the app adds the link)'
  if (ctx.platform === 'discord' && b.caption.length > 1800) return 'discord: caption max 1800 chars (the app adds the link)'
  if (ctx.platform === 'youtube' && b.caption.split('\n')[0].trim().length > 100) return 'youtube: the first caption line is the title, max 100 chars'
  const facts = b.facts_used ?? []
  if (!Array.isArray(facts) || facts.some((i: unknown) => !Number.isInteger(i) || (i as number) < 0 || (i as number) >= ctx.factCount)) {
    return 'facts_used must be indexes into the fact sheet'
  }
  return {
    product_id: b.product_id, channel_id: b.channel_id, client_key: b.client_key.trim(), kind: b.kind,
    caption: b.caption, slides: slides.map((s: Slide) => ({ text: s.text, photo_url: s.photo_url, photo_credit: s.photo_credit, photo_track: s.photo_track })),
    topic: b.topic, format_tag: b.format_tag, is_experiment: b.is_experiment === true, facts_used: facts,
  }
}

/** Banned-phrase verdict for a post: null when clean. */
export function bannedReason(p: Pick<PostInput, 'caption' | 'slides'>, extra: string[]): string | null {
  const hits = [...new Set([p.caption, ...p.slides.map(s => s.text)].flatMap(t => findBanned(t, extra)))]
  return hits.length ? `banned: ${hits.join(', ')}` : null
}

export async function readJson(req: Request): Promise<any> {
  try { return await req.json() } catch { return undefined }
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status })

/** Route `[id]` param as a positive integer, or null. */
export function idParam(v: string): number | null {
  return /^\d{1,9}$/.test(v) ? Number(v) : null
}
