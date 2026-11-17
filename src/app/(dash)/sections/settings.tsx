import Link from 'next/link'
import { METRICS, goalsWithProgress } from '@/lib/goals'
import { claudeAccount } from '@/lib/github'
import { PLATFORMS } from '@/lib/plans'
import { listAccounts, zernioKey } from '@/lib/zernio'
import { saveClaude, saveZernio, saveFacts, saveGoals, savePlaybook, saveProduct, setActive } from '../actions'

export function ProductForm({ p }: { p?: Record<string, any> }) {
  return (
    <form action={saveProduct} className="stack">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label>Product page URL<input name="url" type="url" required defaultValue={p?.url} placeholder="https://your-product.com" /></label>
      {!p && <p className="muted">Only the URL is required. Leave the rest blank and the researcher fills it in from the site on its next morning run; whatever you type is never overwritten.</p>}
      <label>Name<input name="name" defaultValue={p?.name} /></label>
      <label>Target users<textarea name="audience" rows={2} defaultValue={p?.audience} placeholder="Who it's for, in a sentence" /></label>
      <div className="row">
        <label>Language<input name="language" defaultValue={p?.language} size={6} placeholder="ko, en…" /></label>
        <label>Timezone<input name="timezone" defaultValue={p?.timezone ?? 'Asia/Seoul'} /></label>
      </div>
      {!p && (
        <fieldset className="choices-field">
          <legend>Where to post (optional; you can choose after research)</legend>
          <div className="choices">
            {PLATFORMS.map(pl => (
              <label key={pl} className="choice"><input type="checkbox" name="platform" value={pl} /><span><b>{pl}</b></span></label>
            ))}
          </div>
        </fieldset>
      )}
      <label>Tone notes and cautions<textarea name="tone_notes" rows={3} defaultValue={p?.tone_notes} placeholder="How posts should sound, and anything they must always say or never say" /></label>
      <label>Extra banned words (one per line)<textarea name="banned_words" rows={3} defaultValue={p?.banned_words?.join('\n')} /></label>
      <div><button type="submit">{p ? 'Save product' : 'Add product'}</button></div>
    </form>
  )
}

const TABS = [
  { key: 'product', label: 'Product' },
  { key: 'goals', label: 'Goals' },
  { key: 'facts', label: 'Fact sheet' },
  { key: 'playbook', label: 'Playbook' },
  { key: 'claude', label: 'Claude account' },
  { key: 'zernio', label: 'Zernio' },
] as const
export type SettingsTab = (typeof TABS)[number]['key']
export const settingsTab = (v?: string): SettingsTab => (TABS.some(t => t.key === v) ? v as SettingsTab : 'product')

export async function SettingsSection({ p, tab = 'product' }: { p: Record<string, any> | null; tab?: SettingsTab }) {
  if (!p) return <ProductForm />
  const app = (process.env.APP_URL ?? '').replace(/\/$/, '')
  return (
    <>
      <nav className="tabs" aria-label="Settings">
        {TABS.map(t => <Link key={t.key} href={`/settings?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>{t.label}</Link>)}
      </nav>

      {tab === 'product' && (
        <div className="settings-pane">
          <p className="lead">What the product is and how posts should sound. Blank fields are filled in by the researcher from the site; what you type is never overwritten.</p>
          <ProductForm p={p} />
          <div className="setting-block">
            <h3>Profile bio link</h3>
            <p className="muted">TikTok, YouTube and Instagram don&apos;t make links in captions clickable. Put this in each profile&apos;s bio once:</p>
            <code>{app}/l/{p.slug}</code>
          </div>
          <div className="setting-block">
            <h3>{p.active ? 'Pause this product' : 'Resume this product'}</h3>
            <p className="muted">{p.active ? 'Stops all agents and posting for this product until you resume it.' : 'Nothing runs for this product right now.'}</p>
            <form action={setActive}>
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} />
              <button className="ghost" type="submit">{p.active ? 'Pause' : 'Resume'}</button>
            </form>
          </div>
        </div>
      )}

      {tab === 'goals' && (
        <div className="settings-pane">
          <p className="lead">What this campaign is for. Each plan sets its targets from these, working backwards to the clicks and views needed. Only numbers autopromo can measure are offered.</p>
          <GoalsForm productId={p.id} />
        </div>
      )}

      {tab === 'facts' && (
        <div className="settings-pane">
          <p className="lead">The only claims posts may make. One fact per line, with the page it comes from: <code>fact | https://source-page</code>. Removing a fact cancels scheduled posts that used it.</p>
          <form action={saveFacts} className="stack wide">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="facts" rows={18} defaultValue={p.fact_sheet.map((f: { fact: string; source_url: string }) => `${f.fact} | ${f.source_url}`).join('\n')} aria-label="Fact sheet" />
            <div><button type="submit">Save fact sheet</button> <span className="muted">&nbsp;{p.fact_sheet.length} facts</span></div>
          </form>
        </div>
      )}

      {tab === 'claude' && <ClaudePane />}
      {tab === 'zernio' && <ZernioPane />}

      {tab === 'playbook' && (
        <div className="settings-pane">
          <p className="lead">What works for this product, written each week by the analyst from the results. The planner and writer follow it. Edit it if you disagree.</p>
          <form action={savePlaybook} className="stack wide">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="playbook" rows={14} defaultValue={p.playbook} aria-label="Playbook" placeholder="Empty until the analyst's first weekly run." />
            <div><button type="submit">Save playbook</button></div>
          </form>
        </div>
      )}
    </>
  )
}

async function GoalsForm({ productId }: { productId: number }) {
  const goals = await goalsWithProgress(productId)
  const rows: Partial<(typeof goals)[number]>[] = [...goals, {}]
  const fmt = (n: number) => n.toLocaleString('en')
  return (
    <form action={saveGoals} className="goals-form">
      <input type="hidden" name="id" value={productId} />
      <div className="goal-row goal-head"><span>Goal</span><span>GitHub repo (stars only)</span><span>In 1 month</span><span>In 3 months</span></div>
      {rows.map((g, i) => (
        <div className="goal-item" key={i}>
          <div className="goal-row">
            <select name="metric" defaultValue={g.metric ?? ''} aria-label="Goal">
              <option value="">{g.metric ? 'Remove this goal' : 'Add a goal…'}</option>
              {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <input className="repo" name="source" defaultValue={g.source ?? ''} placeholder="owner/name" aria-label="GitHub repo" />
            <input name="m1" type="number" min={1} defaultValue={g.target_1m ?? ''} placeholder="—" aria-label="Target in 1 month" />
            <input name="m3" type="number" min={1} defaultValue={g.target_3m ?? ''} placeholder="—" aria-label="Target in 3 months" />
          </div>
          {g.tracking && (
            <p className={`goal-status ${g.tracking.ok ? 'ok' : 'bad'}`}>
              {g.tracking.ok ? `✓ Tracked · ${fmt(g.last30!.value)} in the last 30 days, ${fmt(g.last90!.value)} in 90` : '✗ '}{!g.tracking.ok && g.tracking.why}
            </p>
          )}
        </div>
      ))}
      <div><button type="submit">Save goals</button></div>
      <details className="help">
        <summary>How each goal is measured</summary>
        <ul>{Object.values(METRICS).map(m => <li key={m.label}><b>{m.label}</b>: {m.how}</li>)}</ul>
      </details>
    </form>
  )
}

// One Claude account runs the agents for every product. The token goes straight into the repo's GitHub secret.
async function ClaudePane() {
  const now = await claudeAccount()
  return (
    <div className="settings-pane">
      <p className="lead">The agents write, review and plan on a Claude account. It is shared by every product.</p>
      <p className={`goal-status ${now && !('error' in now) ? 'ok' : 'bad'}`}>
        {now === null ? '✗ No Claude account yet: the agents can\'t run.'
          : 'error' in now ? `✗ ${now.error}`
          : `✓ Using a ${now.name === 'ANTHROPIC_API_KEY' ? 'Claude API key (pay per use)' : 'Claude subscription'}, saved ${new Date(now.updated).toLocaleDateString('en')}.`}
      </p>
      <form action={saveClaude} className="stack">
        <label>Claude token or API key<input name="token" type="password" required autoComplete="off" placeholder="sk-ant-…" /></label>
        <div><button type="submit">{now && !('error' in now) ? 'Replace' : 'Save'}</button></div>
      </form>
      <details className="help" open={!now || 'error' in now}>
        <summary>Where to get it</summary>
        <ul>
          <li><b>Your Claude subscription (Pro or Max)</b>: install Claude Code, run <code>claude setup-token</code> in a terminal, log in, and paste what it prints. Runs count toward your plan&apos;s limits.</li>
          <li><b>Or pay per use</b>: make an API key at console.anthropic.com → API keys.</li>
        </ul>
        <p className="muted">It is saved encrypted as a GitHub Actions secret of this app&apos;s repo, not in our database, and can&apos;t be read back here.</p>
      </details>
    </div>
  )
}

// One Zernio account posts to TikTok, YouTube, Threads, LinkedIn and the rest, for every product.
async function ZernioPane() {
  const now = await zernioKey()
  let check = ''
  if (now) {
    try { const a = await listAccounts(); check = `${a.length} social account${a.length === 1 ? '' : 's'} connected in it` }
    catch (e) { check = `✗ ${e instanceof Error ? e.message : e}` }
  }
  const ok = !!now && !check.startsWith('✗')
  return (
    <div className="settings-pane">
      <p className="lead">Zernio posts to TikTok, YouTube, Threads, LinkedIn, Instagram, Facebook and X. One Zernio account serves every product.</p>
      <p className={`goal-status ${ok ? 'ok' : 'bad'}`}>
        {!now ? '✗ No Zernio key yet: those channels can\'t post.'
          : !ok ? check
          : `✓ ${now.saved ? `Saved here ${new Date(now.saved).toLocaleDateString('en')}` : 'Using the key set in Vercel'}, ${check}.`}
      </p>
      <form action={saveZernio} className="stack">
        <label>Zernio API key<input name="key" type="password" required autoComplete="off" placeholder="sk_…" /></label>
        <div><button type="submit">{now ? 'Replace' : 'Save'}</button></div>
      </form>
      <details className="help" open={!ok}>
        <summary>Where to get it, and what replacing does</summary>
        <ul>
          <li>zernio.com → log in → Settings → API keys → create a key, and paste it here. It&apos;s checked with Zernio before it&apos;s saved.</li>
          <li><b>A key from another Zernio account</b> unlinks every connected social account. Posts already queued in the old account are cancelled and wait here; connect your accounts again in <Link href="/channels">Channels</Link> and they go out.</li>
        </ul>
      </details>
    </div>
  )
}
