import { currentProduct } from '@/lib/current'
import { saveFacts, savePlaybook, saveProduct } from '../actions'

function ProductForm({ p }: { p?: Record<string, any> }) {
  return (
    <form action={saveProduct} className="stack">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label>Product URL<input name="url" type="url" required defaultValue={p?.url} placeholder="https://l2u.co.kr" /></label>
      <label>Name<input name="name" required defaultValue={p?.name} /></label>
      <label>Target users<textarea name="audience" required rows={2} defaultValue={p?.audience} placeholder="국내외 여행을 계획하는 20–40대 한국인" /></label>
      <div className="row">
        <label>Language<input name="language" defaultValue={p?.language ?? 'ko'} size={6} /></label>
        <label>Timezone<input name="timezone" defaultValue={p?.timezone ?? 'Asia/Seoul'} /></label>
        <label>Instagram / day<input name="ig_per_day" type="number" min={1} max={10} defaultValue={p?.ig_per_day ?? 1} /></label>
        <label>Threads / day<input name="threads_per_day" type="number" min={1} max={10} defaultValue={p?.threads_per_day ?? 1} /></label>
      </div>
      <label>Tone notes<textarea name="tone_notes" rows={3} defaultValue={p?.tone_notes} placeholder="정중하고 차분하게, 정보 위주로" /></label>
      <label>Extra banned words (one per line)<textarea name="banned_words" rows={3} defaultValue={p?.banned_words?.join('\n')} /></label>
      <button type="submit">{p ? 'Save' : 'Add product'}</button>
    </form>
  )
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams
  const p = await currentProduct()
  const app = (process.env.APP_URL ?? '').replace(/\/$/, '')
  return (
    <>
      {msg && <div className="notice" role="status">{msg}</div>}
      {p && (
        <>
          <h2>{p.name}</h2>
          <ProductForm p={p} />
          <h2>Profile bio link</h2>
          <p>Put this in the TikTok, YouTube and Instagram bio once: <code>{app}/l/{p.slug}</code></p>
          <h2>Fact sheet</h2>
          <p className="muted">The only claims posts may make. One per line: <code>fact | https://source-page</code>. Removing a fact cancels posts that used it.</p>
          <form action={saveFacts} className="stack">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="facts" rows={10} defaultValue={p.fact_sheet.map((f: { fact: string; source_url: string }) => `${f.fact} | ${f.source_url}`).join('\n')} aria-label="Fact sheet" />
            <button type="submit">Save fact sheet</button>
          </form>
          <h2>Playbook</h2>
          <p className="muted">Written weekly by the analyst from click numbers. Edit if you disagree.</p>
          <form action={savePlaybook} className="stack">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="playbook" rows={10} defaultValue={p.playbook} aria-label="Playbook" />
            <button type="submit">Save playbook</button>
          </form>
        </>
      )}
      <h2>Add a product</h2>
      <ProductForm />
    </>
  )
}
