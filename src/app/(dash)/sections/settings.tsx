import { sql } from '@/lib/db'
import { METRICS } from '@/lib/goals'
import { Goals } from '../journey/goals'
import { saveFacts, saveGoals, savePlaybook, saveProduct, setActive } from '../actions'

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
            {['x', 'linkedin', 'youtube', 'instagram', 'threads', 'tiktok', 'facebook', 'reddit', 'naver_blog'].map(pl => (
              <label key={pl} className="choice"><input type="checkbox" name="platform" value={pl} /><span><b>{pl}</b></span></label>
            ))}
          </div>
        </fieldset>
      )}
      <label>Tone notes and cautions<textarea name="tone_notes" rows={3} defaultValue={p?.tone_notes} placeholder="How posts should sound, and anything they must always say or never say" /></label>
      <label>Extra banned words (one per line)<textarea name="banned_words" rows={3} defaultValue={p?.banned_words?.join('\n')} /></label>
      <button type="submit">{p ? 'Save' : 'Add product'}</button>
    </form>
  )
}

export async function SettingsSection({ p }: { p: Record<string, any> | null }) {
  const app = (process.env.APP_URL ?? '').replace(/\/$/, '')
  return (
    <>
      {p && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Product</h3>
            <form action={setActive}>
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} />
              <button className="ghost" type="submit">{p.active ? 'Pause this product' : 'Resume this product'}</button>
            </form>
          </div>
          <ProductForm p={p} />
          <h3 id="goals">Goals</h3>
          <p className="muted">What this campaign is for. Add as many as you like; the planner works backwards from them. Only numbers autopromo can measure are offered, and each goal shows whether it is actually being tracked.</p>
          <GoalsForm productId={p.id} />
          <Goals productId={p.id} />
          <h3>Profile bio link</h3>
          <p>Put this in the TikTok, YouTube and Instagram bio once: <code>{app}/l/{p.slug}</code></p>
          <h3>Fact sheet</h3>
          <p className="muted">The only claims posts may make. One per line: <code>fact | https://source-page</code>. Removing a fact cancels posts that used it.</p>
          <form action={saveFacts} className="stack">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="facts" rows={10} defaultValue={p.fact_sheet.map((f: { fact: string; source_url: string }) => `${f.fact} | ${f.source_url}`).join('\n')} aria-label="Fact sheet" />
            <button type="submit">Save fact sheet</button>
          </form>
          <h3>Playbook</h3>
          <p className="muted">Written weekly by the analyst from click numbers. Edit if you disagree.</p>
          <form action={savePlaybook} className="stack">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="playbook" rows={10} defaultValue={p.playbook} aria-label="Playbook" />
            <button type="submit">Save playbook</button>
          </form>
        </>
      )}
      {!p && <ProductForm />}
    </>
  )
}

async function GoalsForm({ productId }: { productId: number }) {
  const goals = await sql`select metric, source, target_1m, target_3m from goals where product_id = ${productId} order by id`
  const rows = [...goals, {}, {}] as Record<string, any>[]
  return (
    <form action={saveGoals} className="stack">
      <input type="hidden" name="id" value={productId} />
      {rows.map((g, i) => (
        <div className="row" key={i}>
          <label>Goal<select name="metric" defaultValue={g.metric ?? ''}>
            <option value="">—</option>
            {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select></label>
          <label>GitHub repo (stars only)<input name="source" defaultValue={g.source ?? ''} placeholder="owner/name" size={18} /></label>
          <label>In 1 month<input name="m1" type="number" min={1} defaultValue={g.target_1m ?? ''} size={6} /></label>
          <label>In 3 months<input name="m3" type="number" min={1} defaultValue={g.target_3m ?? ''} size={6} /></label>
        </div>
      ))}
      <p className="muted">How each is measured: {Object.values(METRICS).map(m => `${m.label}: ${m.how}`).join(' · ')}. Clear a row to remove that goal.</p>
      <button type="submit">Save goals</button>
    </form>
  )
}
