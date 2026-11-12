import { saveFacts, savePlaybook, saveProduct } from '../actions'

function ProductForm({ p }: { p?: Record<string, any> }) {
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
          <h3>Product</h3>
          <ProductForm p={p} />
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
      <h3>Add a product</h3>
      <ProductForm />
    </>
  )
}
