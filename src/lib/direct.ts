/**
 * Channels we post to ourselves, without Zernio: Telegram (one autopromo bot, added as admin to each channel)
 * and Discord (one webhook per channel). Neither reports views or followers; clicks on our /go links are tracked as everywhere.
 */
export const DIRECT = ['telegram', 'discord']
export const isDirect = (platform: string) => DIRECT.includes(platform)

export class DirectError extends Error {
  constructor(public platform: string, public status: number, message: string) {
    super(`${platform} ${status}: ${message}`)
  }
}

const TIMEOUT = 15_000

// ---- Telegram ----

const TG_CHAT = /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d{5,20})$/
export const validTelegramChat = (v: string) => TG_CHAT.test(v)

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new DirectError('telegram', 0, 'TELEGRAM_BOT_TOKEN is not set')
  let r: Response
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch (e) {
    // Never echo the request URL: it holds the bot token.
    throw new DirectError('telegram', 0, `unreachable (${e instanceof Error ? e.name : 'error'})`)
  }
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new DirectError('telegram', r.status, j?.description ?? `HTTP ${r.status}`)
  return j.result
}

/** The bot's @username, to show the owner which bot to add. Null if no token or Telegram is unreachable. */
export async function telegramBotName(): Promise<string | null> {
  try { return (await tg('getMe', {}))?.username ?? null } catch { return null }
}

/** Can our bot post in this chat? Returns what's wrong, in plain words, or null when it can. */
export async function checkTelegram(chat: string): Promise<string | null> {
  if (!validTelegramChat(chat)) return 'Enter the channel as @name (or its numeric id).'
  const botId = Number((process.env.TELEGRAM_BOT_TOKEN ?? '').split(':')[0])
  if (!botId) return 'TELEGRAM_BOT_TOKEN is not set in Vercel yet.'
  try {
    const m = await tg('getChatMember', { chat_id: chat, user_id: botId })
    if (m?.status !== 'administrator' && m?.status !== 'creator') return 'The bot is not an admin of that channel yet. Add it as an admin with "Post messages".'
    if (m?.can_post_messages === false) return 'The bot is an admin but can\'t post. Turn on "Post messages" for it.'
    return null
  } catch (e) {
    return e instanceof DirectError && e.status === 400 ? 'Telegram can\'t find that channel, or the bot isn\'t in it. Check the @name.' : String(e instanceof Error ? e.message : e)
  }
}

// ---- Discord ----

// Only ever POST to Discord itself: the URL is typed by a person and must not point anywhere else.
const DISCORD_HOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,100}$/
export const validDiscordWebhook = (v: string) => DISCORD_HOOK.test(v)

async function discord(url: string, init: RequestInit = {}): Promise<any> {
  if (!validDiscordWebhook(url.split('?')[0])) throw new DirectError('discord', 0, 'not a Discord webhook URL')
  let r: Response
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
  } catch (e) {
    throw new DirectError('discord', 0, `unreachable (${e instanceof Error ? e.name : 'error'})`)
  }
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new DirectError('discord', r.status, j?.message ?? `HTTP ${r.status}`)
  return j
}

/** Is this a working Discord webhook? Reads it without posting. Returns what's wrong, or null. */
export async function checkDiscord(url: string): Promise<string | null> {
  if (!validDiscordWebhook(url)) return 'Paste the webhook URL from Discord: Channel settings → Integrations → Webhooks → Copy Webhook URL.'
  try {
    await discord(url)
    return null
  } catch (e) {
    return e instanceof DirectError && (e.status === 401 || e.status === 404) ? 'Discord says this webhook doesn\'t exist (deleted?). Make a new one and paste it.' : String(e instanceof Error ? e.message : e)
  }
}

/** Last 4 characters only: the webhook URL is a secret. */
export const maskWebhook = (url: string) => `…${url.slice(-4)}`

// ---- Sending ----

/** Send one post now. `text` already ends with the tracked link. Returns the platform's message id. */
export async function sendDirect(platform: string, target: string, text: string, imageUrl?: string): Promise<string> {
  if (platform === 'telegram') {
    const res = imageUrl
      ? await tg('sendPhoto', { chat_id: target, photo: imageUrl, caption: text })
      : await tg('sendMessage', { chat_id: target, text })
    return String(res?.message_id ?? '')
  }
  if (platform === 'discord') {
    const res = await discord(`${target}?wait=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // No @everyone/@here/role pings from post text, ever.
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] }, ...(imageUrl ? { embeds: [{ image: { url: imageUrl } }] } : {}) }),
    })
    return String(res?.id ?? '')
  }
  throw new DirectError(platform, 0, 'not a direct channel')
}
