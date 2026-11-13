import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { sql } from './db'
import { publish, runMaintenance } from './publish'
import { resetDb, seed, insertPost } from '@/test/db'
import { checkDiscord, checkTelegram, sendDirect, validDiscordWebhook } from './direct'
import { GET as go } from '@/app/go/[code]/route'

const HOOK = 'https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz_-0123'
type Call = [string, RequestInit]

beforeEach(async () => { await resetDb(); process.env.TELEGRAM_BOT_TOKEN = '987654:TESTTOKEN' })
afterEach(() => vi.unstubAllGlobals())

const stub = (fn: (url: string, init?: RequestInit) => Response) => {
  const f = vi.fn(async (url: string, init?: RequestInit) => fn(url, init)); vi.stubGlobal('fetch', f); return f
}
const tgOk = () => stub(() => Response.json({ ok: true, result: { message_id: 42 } }))
const bodyOf = (c: Call) => JSON.parse(String(c[1].body))
const get = async (id: number) => (await sql`select * from posts where id = ${id}`)[0]

async function directPost(platform: 'telegram' | 'discord', target: string) {
  const { productId, channelId } = await seed({ platform, account: null })
  await sql`update channels set target = ${target} where id = ${channelId}`
  const p = await insertPost(productId, channelId)
  return { productId, channelId, p }
}
const makeDue = (id: number) => sql`update posts set scheduled_for = now() - interval '1 minute' where id = ${id}`

test('telegram: scheduled without sending, then sent when due with the tracked /go link', async () => {
  const { p } = await directPost('telegram', '@mpc_news')
  const f = tgOk()
  await publish(p.id)
  expect(await get(p.id)).toMatchObject({ status: 'scheduled', zernio_post_id: null })
  expect(f).not.toHaveBeenCalled()

  await makeDue(p.id)
  await runMaintenance()
  expect((await get(p.id)).status).toBe('published')
  const [url, init] = f.mock.calls[0] as unknown as Call
  expect(url).toBe('https://api.telegram.org/bot987654:TESTTOKEN/sendMessage')
  expect(bodyOf([url, init])).toEqual({ chat_id: '@mpc_news', text: `삿포로 겨울 여행 팁\n\nhttps://app.test/go/${p.link_code}` })

  // Runs again: nothing is sent twice.
  await runMaintenance()
  expect(f).toHaveBeenCalledTimes(1)
})

test('clicks: a person on the posted link is counted; Telegram and Discord preview bots are not', async () => {
  const { p } = await directPost('telegram', '@mpc_news')
  const open = (ua: string) => go(new Request(`http://app.test/go/${p.link_code}`, { headers: { 'user-agent': ua } }), { params: Promise.resolve({ code: p.link_code }) })
  await open('TelegramBot (like TwitterBot)')
  await open('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')
  const r = await open('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
  expect(new URL(r.headers.get('location')!).searchParams.get('utm_source')).toBe('telegram')
  expect((await sql`select count(*)::int as n from clicks where post_id = ${p.id}`)[0].n).toBe(1)
})

test('telegram with one photo: sendPhoto, the link in the caption', async () => {
  const { productId, channelId } = await seed({ platform: 'telegram', account: null })
  await sql`update channels set target = '@mpc_news' where id = ${channelId}`
  const p = await insertPost(productId, channelId, { slides: sql.json([{ text: '팁', photo_url: 'https://images.example/a.jpg' }]) })
  const f = tgOk()
  await publish(p.id); await makeDue(p.id); await runMaintenance()
  const [url, init] = f.mock.calls[0] as unknown as Call
  expect(url).toMatch(/\/sendPhoto$/)
  expect(bodyOf([url, init])).toMatchObject({ photo: `https://app.test/api/slide/${p.id}/0.png?r=0`, caption: expect.stringContaining(`/go/${p.link_code}`) })
})

test('discord: posts to the webhook, link included, no @everyone pings', async () => {
  const { p } = await directPost('discord', HOOK)
  const f = stub(() => Response.json({ id: '111' }))
  await publish(p.id); await makeDue(p.id); await runMaintenance()
  expect((await get(p.id)).status).toBe('published')
  const [url, init] = f.mock.calls[0] as unknown as Call
  expect(url).toBe(`${HOOK}?wait=true`)
  expect(bodyOf([url, init])).toEqual({ content: `삿포로 겨울 여행 팁\n\nhttps://app.test/go/${p.link_code}`, allowed_mentions: { parse: [] } })
})

test('not connected yet → waits; goes out once the channel is connected', async () => {
  const { channelId, p } = await directPost('telegram', '@x')
  await sql`update channels set target = null where id = ${channelId}`
  const f = tgOk()
  await publish(p.id)
  expect(await get(p.id)).toMatchObject({ status: 'waiting', error: 'connect your telegram account to post this' })
  await sql`update channels set target = '@mpc_news' where id = ${channelId}`
  await runMaintenance()
  expect((await get(p.id)).status).toBe('scheduled')
  expect(f).not.toHaveBeenCalled()
})

test('a 5xx is retried once; a second failure is final (no loop)', async () => {
  const { p } = await directPost('telegram', '@mpc_news')
  const f = stub(() => Response.json({ ok: false, description: 'Internal Server Error' }, { status: 500 }))
  await publish(p.id); await makeDue(p.id)
  await runMaintenance()
  expect(await get(p.id)).toMatchObject({ status: 'failed', error: 'telegram 500: Internal Server Error' })

  await runMaintenance()   // retry: scheduled again with "retried:" kept
  const again = await get(p.id)
  expect(again.status).toBe('scheduled')
  expect(again.error).toMatch(/^retried:/)
  await makeDue(p.id); await runMaintenance()
  expect(await get(p.id)).toMatchObject({ status: 'failed', error: 'retried: telegram 500: Internal Server Error' })
  await runMaintenance()
  expect((await get(p.id)).status).toBe('failed')
  expect(f).toHaveBeenCalledTimes(2)
})

test('a 4xx (bot removed) is not retried and flags the channel', async () => {
  const { channelId, p } = await directPost('telegram', '@mpc_news')
  stub(() => Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 }))
  await publish(p.id); await makeDue(p.id); await runMaintenance(); await runMaintenance()
  expect(await get(p.id)).toMatchObject({ status: 'failed', error: 'telegram 400: Bad Request: chat not found' })
  expect((await sql`select needs_reconnect from channels where id = ${channelId}`)[0].needs_reconnect).toBe(true)
})

test('channel switched Off after scheduling → the post goes back to waiting, unsent', async () => {
  const { channelId, p } = await directPost('discord', HOOK)
  const f = stub(() => Response.json({ id: '1' }))
  await publish(p.id); await makeDue(p.id)
  await sql`update channels set enabled = false where id = ${channelId}`
  await runMaintenance()
  expect((await get(p.id)).status).toBe('waiting')
  expect(f).not.toHaveBeenCalled()
})

test('connect checks: telegram bot must be an admin that can post; discord URL must be a real Discord webhook', async () => {
  stub(() => Response.json({ ok: true, result: { status: 'administrator', can_post_messages: true } }))
  expect(await checkTelegram('@mpc_news')).toBeNull()
  stub(() => Response.json({ ok: true, result: { status: 'member' } }))
  expect(await checkTelegram('@mpc_news')).toMatch(/not an admin/)
  expect(await checkTelegram('mpc news')).toMatch(/@name/)

  expect(validDiscordWebhook(HOOK)).toBe(true)
  expect(validDiscordWebhook('https://evil.example/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz')).toBe(false)
  expect(validDiscordWebhook('https://discord.com.evil.example/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz')).toBe(false)
  stub(() => Response.json({ message: 'Unknown Webhook' }, { status: 404 }))
  expect(await checkDiscord(HOOK)).toMatch(/doesn't exist/)
  const f = stub(() => Response.json({ id: '1' }))
  expect(await checkDiscord(HOOK)).toBeNull()
  expect((f.mock.calls[0] as unknown as Call)[1].method).toBeUndefined()   // a GET: checking never posts
  await expect(sendDirect('discord', 'https://evil.example/hook', 'x')).rejects.toThrow(/not a Discord webhook/)
})
