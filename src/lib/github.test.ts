import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchAgent, claudeSecretName, seal, saveClaudeAccount } from './github'
import sodium from 'libsodium-wrappers'

beforeEach(() => { process.env.GITHUB_DISPATCH_TOKEN = 'ghp_test'; process.env.GITHUB_REPO = 'owner/repo'; delete process.env.GITHUB_REF })
afterEach(() => vi.unstubAllGlobals())

test('starts the agents workflow for one agent on main', async () => {
  const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', f)
  expect(await dispatchAgent('planner')).toBe(true)
  const [url, init] = f.mock.calls[0]
  expect(url).toBe('https://api.github.com/repos/owner/repo/actions/workflows/agents.yml/dispatches')
  expect(new Headers(init!.headers).get('authorization')).toBe('Bearer ghp_test')
  expect(JSON.parse(String(init!.body))).toEqual({ ref: 'main', inputs: { agent: 'planner' } })
})

test('no token or repo → false, no network call', async () => {
  delete process.env.GITHUB_DISPATCH_TOKEN
  const f = vi.fn(); vi.stubGlobal('fetch', f)
  expect(await dispatchAgent('researcher')).toBe(false)
  expect(f).not.toHaveBeenCalled()
})

test('GitHub refusing or unreachable → false, never throws', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
  expect(await dispatchAgent('planner')).toBe(false)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
  expect(await dispatchAgent('planner')).toBe(false)
})

test('tells a subscription token from an API key', () => {
  expect(claudeSecretName('sk-ant-oat01-abc')).toBe('CLAUDE_CODE_OAUTH_TOKEN')
  expect(claudeSecretName('sk-ant-api03-abc')).toBe('ANTHROPIC_API_KEY')
  expect(claudeSecretName('hello')).toBeNull()
  expect(claudeSecretName('sk-ant-oat01-a b')).toBeNull()
})

test('sealed value opens with the repo key pair', async () => {
  await sodium.ready
  const kp = sodium.crypto_box_keypair(), v = sodium.base64_variants.ORIGINAL
  const sealed = await seal('sk-ant-oat01-secret', sodium.to_base64(kp.publicKey, v))
  expect(sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(sealed, v), kp.publicKey, kp.privateKey))).toBe('sk-ant-oat01-secret')
})

test('saves the token as a repo secret and removes the other kind', async () => {
  await sodium.ready
  const pk = sodium.to_base64(sodium.crypto_box_keypair().publicKey, sodium.base64_variants.ORIGINAL)
  const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url =>
    url.endsWith('/public-key') ? Response.json({ key: pk, key_id: 'k1' }) : new Response(null, { status: 201 }))
  vi.stubGlobal('fetch', f)
  expect(await saveClaudeAccount('sk-ant-api03-xyz')).toBeNull()
  const calls = f.mock.calls.map(([u, i]) => `${i?.method ?? 'GET'} ${u.replace('https://api.github.com/repos/owner/repo/actions/secrets', '')}`)
  expect(calls).toEqual(['GET /public-key', 'PUT /ANTHROPIC_API_KEY', 'DELETE /CLAUDE_CODE_OAUTH_TOKEN'])
  expect(JSON.parse(String(f.mock.calls[1][1]!.body)).key_id).toBe('k1')
})
