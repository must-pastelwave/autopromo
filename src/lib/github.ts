export type Agent = 'auto' | 'researcher' | 'planner' | 'writer' | 'reviewer' | 'analyst' | 'scout'

/**
 * Start one agent now via the agents workflow (GitHub workflow_dispatch). Needs GITHUB_DISPATCH_TOKEN
 * (fine-grained, Actions: read and write on this repo) and GITHUB_REPO ("owner/name").
 * Returns false instead of throwing; the schedule picks the work up later anyway.
 */
export async function dispatchAgent(agent: Agent): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN, repo = process.env.GITHUB_REPO
  if (!token || !repo) return false
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agents.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: process.env.GITHUB_REF || 'main', inputs: { agent } }),
    })
    return r.status === 204
  } catch {
    return false
  }
}

// The Claude account the agents run on lives in the repo's Actions secrets, never in our database.
// Needs GITHUB_DISPATCH_TOKEN to also have "Secrets: read and write".
const CLAUDE = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const
type ClaudeSecret = (typeof CLAUDE)[number]

/** `claude setup-token` prints sk-ant-oat…; a Console API key is sk-ant-api…. */
export function claudeSecretName(value: string): ClaudeSecret | null {
  if (/^sk-ant-oat\d*-\S+$/.test(value)) return 'CLAUDE_CODE_OAUTH_TOKEN'
  if (/^sk-ant-api\d*-\S+$/.test(value)) return 'ANTHROPIC_API_KEY'
  return null
}

/** GitHub wants secrets as a libsodium sealed box against the repo's public key. */
export async function seal(value: string, publicKey: string) {
  const sodium = (await import('libsodium-wrappers')).default
  await sodium.ready
  const v = sodium.base64_variants.ORIGINAL
  return sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(publicKey, v)), v)
}

function repoApi(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_DISPATCH_TOKEN, repo = process.env.GITHUB_REPO
  if (!token || !repo) return null
  return fetch(`https://api.github.com/repos/${repo}/actions/secrets${path}`, {
    ...init, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  })
}

/** Which Claude secret the agents use now. `error` when the app can't see the repo's secrets. */
export async function claudeAccount(): Promise<{ name: ClaudeSecret; updated: string } | null | { error: string }> {
  const r = await repoApi('?per_page=100')?.catch(() => null)
  if (r === undefined) return { error: 'GITHUB_REPO and GITHUB_DISPATCH_TOKEN are not set in Vercel.' }
  if (!r?.ok) return { error: `GitHub refused (${r?.status ?? 'no answer'}). Give GITHUB_DISPATCH_TOKEN "Secrets: Read and write" on the repo.` }
  const { secrets } = await r.json() as { secrets: { name: string; updated_at: string }[] }
  const s = secrets.find(s => (CLAUDE as readonly string[]).includes(s.name))
  return s ? { name: s.name as ClaudeSecret, updated: s.updated_at } : null
}

/** Saves the token as the repo secret and removes the other kind, so the agents use exactly one. Returns an error message or null. */
export async function saveClaudeAccount(value: string): Promise<string | null> {
  const name = claudeSecretName(value)
  if (!name) return 'That doesn\'t look like a Claude token (sk-ant-oat…) or API key (sk-ant-api…).'
  const k = await repoApi('/public-key')?.catch(() => null)
  if (k === undefined) return 'GITHUB_REPO and GITHUB_DISPATCH_TOKEN are not set in Vercel.'
  if (!k?.ok) return `GitHub refused (${k?.status ?? 'no answer'}). Give GITHUB_DISPATCH_TOKEN "Secrets: Read and write" on the repo.`
  const { key, key_id } = await k.json() as { key: string; key_id: string }
  const put = await repoApi(`/${name}`, { method: 'PUT', body: JSON.stringify({ encrypted_value: await seal(value, key), key_id }) })
  if (!put?.ok) return `GitHub didn't save it (${put?.status}).`
  await repoApi(`/${CLAUDE.find(n => n !== name)}`, { method: 'DELETE' })
  return null
}
