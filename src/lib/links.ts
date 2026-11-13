import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

// ponytail: byte % 36 has a tiny bias; irrelevant for 8-char link codes.
export function newCode(): string {
  return [...randomBytes(8)].map(b => ALPHABET[b % 36]).join('')
}

export function trackedUrl(productUrl: string, p: { channel: string; postId: number; topic: string; code?: string; clickId?: number }): string {
  const u = new URL(productUrl)
  u.searchParams.set('utm_source', p.channel)
  u.searchParams.set('utm_medium', 'social')
  u.searchParams.set('utm_campaign', 'autopromo')
  u.searchParams.set('utm_content', String(p.postId))
  // src: for sites and apps that already track a source param, so they count autopromo sign-ups with no change.
  if (p.code) u.searchParams.set('src', `autopromo-${p.code}`)
  // The product site keeps ap_click and sends it back with a sign-up (POST /api/conversions).
  if (p.clickId !== undefined) u.searchParams.set('ap_click', String(p.clickId))
  return u.toString()
}

/** Link-preview crawlers and scripts fetch every posted link; they are not clicks. */
export function isBot(ua: string | null): boolean {
  // Yeti = Naver, Daum = Kakao search, kakaotalk-scrap = KakaoTalk link previews (the in-app browser says KAKAOTALK).
  return !ua || /bot|crawl|spider|externalhit|externalagent|preview|curl|wget|yeti|daum|kakaotalk-scrap|whatsapp/i.test(ua)
}
