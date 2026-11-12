import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchAgent } from './github'

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
