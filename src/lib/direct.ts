/**
 * Channels we post to ourselves, without Zernio: Telegram (one autopromo bot, in each channel or group)
 * and Discord (one webhook per channel). Neither reports views or followers; clicks on our /go links are tracked as everywhere.
 */
export const DIRECT = ['telegram', 'discord']
export const isDirect = (platform: string) => DIRECT.includes(platform)

export class DirectError extends Error {
  constructor(public platform: string, public status: number, message: string, public migrateTo?: number) {
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
  if (!r.ok || !j?.ok) throw new DirectError('telegram', r.status, j?.description ?? `HTTP ${r.status}`, j?.parameters?.migrate_to_chat_id)
  return j.result
}

/** The bot's @username, to show the owner which bot to add. Null if no token or Telegram is unreachable. */
export async function telegramBotName(): Promise<string | null> {
  try { return (await tg('getMe', {}))?.username ?? null } catch { return null }
}

/**
 * Groups and channels the bot was recently added to or saw a message in (Telegram keeps these about 24 hours),
 * so the owner can pick one instead of hunting for its id.
 */
export async function telegramChats(): Promise<{ id: string; title: string; type: string }[]> {
  try {
    const updates: any[] = await tg('getUpdates', { allowed_updates: ['my_chat_member', 'message', 'channel_post'], limit: 100 })
    const chats = new Map<string, { id: string; title: string; type: string }>()
    for (const u of updates) {
      const chat = (u.my_chat_member ?? u.message ?? u.channel_post)?.chat
      if (chat && chat.type !== 'private') chats.set(String(chat.id), { id: String(chat.id), title: chat.title ?? String(chat.id), type: chat.type })
    }
    return [...chats.values()]
  } catch {
    return []
  }
}

/** Can our bot post in this channel or group? Returns what's wrong, in plain words, or null when it can. */
export async function checkTelegram(chat: string): Promise<string | null> {
  if (!validTelegramChat(chat)) return 'Enter the channel as @name, or pick the group or channel from the list (ids start with -).'
  const botId = Number((process.env.TELEGRAM_BOT_TOKEN ?? '').split(':')[0])
  if (!botId) return 'TELEGRAM_BOT_TOKEN is not set in Vercel yet.'
  try {
    const c = await tg('getChat', { chat_id: chat })
    const m = await tg('getChatMember', { chat_id: chat, user_id: botId })
    if (c?.type === 'channel') {
      if (m?.status !== 'administrator' && m?.status !== 'creator') return 'In a channel the bot must be an admin. Make it an admin with "Post messages".'
      if (m?.can_post_messages === false) return 'The bot is an admin but can\'t post. Turn on "Post messages" for it.'
      return null
    }
    // Groups: any member that may send messages can post.
    if (m?.status === 'left' || m?.status === 'kicked') return 'The bot is not in this group. Add it to the group first.'
    if (m?.status === 'restricted' && m?.can_send_messages === false) return 'The bot is muted in this group. Let it send messages.'
    return null
  } catch (e) {
    if (e instanceof DirectError && e.migrateTo) return `This group was upgraded by Telegram and has a new id: ${e.migrateTo}. Use that one.`
    if (e instanceof DirectError && e.status === 400) {
      return `Telegram can't find that chat (${e.message.replace(/^telegram 400: /, '')}). Pick it from the list, or check that the id starts with - and the bot is in it.`
    }
    return String(e instanceof Error ? e.message : e)
  }
}

// ---- Discord ----

// Only ever POST to Discord itself: the URL is typed by a person and must not point anywhere else.
const DISCORD_HOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,100}$/
export const validDiscordWebhook = (v: string) => DISCORD_HOOK.test(v)

async function call(platform: string, url: string, init: RequestInit = {}): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
  } catch (e) {
    throw new DirectError(platform, 0, `unreachable (${e instanceof Error ? e.name : 'error'})`)
  }
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new DirectError(platform, r.status, j?.message ?? j?.error ?? `HTTP ${r.status}`)
  return j
}
const discordFetch = (url: string, init: RequestInit = {}) => call('discord', url, init)

async function discord(url: string, init: RequestInit = {}): Promise<any> {
  if (!validDiscordWebhook(url.split('?')[0])) throw new DirectError('discord', 0, 'not a Discord webhook URL')
  return discordFetch(url, init)
}

// The autopromo Discord bot only lists channels and makes a webhook in the one the owner picks. Posting stays on that webhook.
async function bot(path: string, init: RequestInit = {}): Promise<any> {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new DirectError('discord', 0, 'DISCORD_BOT_TOKEN is not set in Vercel yet.')
  return discordFetch(`https://discord.com/api/v10${path}`, { ...init, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' } })
}

const DISCORD_CHANNEL = /^\d{5,25}$/
export const isDiscordChannelId = (v: string) => DISCORD_CHANNEL.test(v)

/** Link that adds the bot to a server, allowed to see channels and make webhooks. Null without a token. */
export async function discordInvite(): Promise<string | null> {
  try {
    const app = await bot('/applications/@me')
    return `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot&permissions=${(1 << 10) + (1 << 29)}`
  } catch {
    return null
  }
}

/** Text and announcement channels in every server the bot was added to, so the owner can pick one. */
export async function discordChannels(): Promise<{ id: string; title: string }[]> {
  try {
    const guilds: any[] = await bot('/users/@me/guilds')
    const lists = await Promise.all(guilds.map(async g => ((await bot(`/guilds/${g.id}/channels`)) as any[])
      .filter(c => c.type === 0 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: String(c.id), title: `${g.name} #${c.name}` }))))
    return lists.flat()
  } catch {
    return []
  }
}

/** The bot's webhook in this channel (made once, then reused). Returns its URL, or throws what's wrong in plain words. */
export async function discordWebhookFor(channelId: string): Promise<string> {
  if (!isDiscordChannelId(channelId)) throw new Error('Pick the channel from the list.')
  try {
    const [app, hooks] = await Promise.all([bot('/applications/@me'), bot(`/channels/${channelId}/webhooks`) as Promise<any[]>])
    const h = hooks.find(w => w.application_id === app.id && w.token)
      ?? await bot(`/channels/${channelId}/webhooks`, { method: 'POST', body: JSON.stringify({ name: 'autopromo' }) })
    return `https://discord.com/api/webhooks/${h.id}/${h.token}`
  } catch (e) {
    const why = e instanceof Error ? e.message.replace(/^discord \d+: /, '') : String(e)
    if (e instanceof DirectError && e.status === 403) throw new Error(`The bot can't make a webhook in that channel (${why}). Give it "Manage Webhooks" there, or add it to the server again with the link.`)
    if (e instanceof DirectError && e.status === 404) throw new Error(`Discord can't find that channel (${why}). Pick it from the list.`)
    throw new Error(why)
  }
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

// ---- Mastodon and Bluesky: our own accounts, posted to as places. The target holds the login. ----

// "https://<instance> <access token>" (Preferences → Development → New application, scope write:statuses)
const MASTODON = /^(https:\/\/[a-z0-9.-]+\.[a-z]{2,}) (\S{20,})$/i
// "<handle> <app password>" (Settings → Privacy and security → App passwords)
const BLUESKY = /^([a-z0-9.-]+\.[a-z]{2,}) ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/i

/** Short networks: keep the link (the last line) whole and shorten the text before it. */
export function fit(text: string, max: number): { body: string; link: string } {
  const i = text.lastIndexOf('\n\n')
  const body = text.slice(0, i), link = text.slice(i + 2)
  const room = max - [...link].length - 2
  const chars = [...body]
  return { body: chars.length > room ? `${chars.slice(0, room - 1).join('').trimEnd()}…` : body, link }
}

async function bskySession(target: string) {
  const [, identifier, password] = target.match(BLUESKY)!
  return call('bluesky', 'https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }),
  })
}

export async function checkMastodon(target: string): Promise<string | null> {
  const m = target.match(MASTODON)
  if (!m) return 'Enter the server and access token with a space between: https://mastodon.social abc123…'
  try {
    await call('mastodon', `${m[1]}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${m[2]}` } })
    return null
  } catch (e) {
    return `Mastodon didn't accept that token (${e instanceof Error ? e.message.replace(/^mastodon \d+: /, '') : e}).`
  }
}

export async function checkBluesky(target: string): Promise<string | null> {
  if (!BLUESKY.test(target)) return 'Enter your handle and an app password with a space between: you.bsky.social abcd-efgh-ijkl-mnop'
  try {
    await bskySession(target)
    return null
  } catch (e) {
    return `Bluesky didn't accept that login (${e instanceof Error ? e.message.replace(/^bluesky \d+: /, '') : e}). Use an app password, not your real one.`
  }
}

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
  if (platform === 'mastodon') {
    const m = target.match(MASTODON)
    if (!m) throw new DirectError('mastodon', 0, 'not a Mastodon login')
    const { body, link } = fit(text, 500)
    const res = await call('mastodon', `${m[1]}/api/v1/statuses`, {
      method: 'POST', headers: { Authorization: `Bearer ${m[2]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: `${body}\n\n${link}` }),
    })
    return String(res?.id ?? '')
  }
  if (platform === 'bluesky') {
    if (!BLUESKY.test(target)) throw new DirectError('bluesky', 0, 'not a Bluesky login')
    const session = await bskySession(target)
    const { body, link } = fit(text, 300)
    // Bluesky links are clickable only through a facet, with UTF-8 byte offsets.
    const byteStart = Buffer.byteLength(`${body}\n\n`)
    const res = await call('bluesky', 'https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'POST', headers: { Authorization: `Bearer ${session.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record: {
        $type: 'app.bsky.feed.post', text: `${body}\n\n${link}`, createdAt: new Date().toISOString(),
        facets: [{ index: { byteStart, byteEnd: byteStart + Buffer.byteLength(link) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }] }],
      } }),
    })
    return String(res?.uri ?? '')
  }
  throw new DirectError(platform, 0, 'not a direct channel')
}
