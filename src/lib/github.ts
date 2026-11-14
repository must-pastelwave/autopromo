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
