import { currentProduct } from '@/lib/current'
import { sql } from '@/lib/db'
import { ONE_TIME_KINDS, placeStats, shareText } from '@/lib/places'
import { Page } from '../sections/frame'
import { CopyOpen } from '../sections/copy-open'
import { addPlace, connectPlace, findPlaces, markShare, setPerWeek, setPlaceStatus } from './actions'

const num = (n: number | null) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export default async function Places({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const p = await currentProduct()
  const msg = (await searchParams).msg
  if (!p) return <Page title="Places" msg={msg}><p>No product yet. Add one in <a href="/settings">Settings</a>.</p></Page>
  const places = await placeStats(p.id)
  const used = places.filter(x => x.status === 'approved'), suggested = places.filter(x => x.status === 'suggested')
  const todo = await sql`
    select s.id, s.link_code, x.caption, pl.name, pl.url, pl.kind, pl.rules
    from shares s join places pl on pl.id = s.place_id join posts x on x.id = s.post_id
    where pl.product_id = ${p.id} and s.status = 'todo' and pl.how = 'paste' and pl.status = 'approved'
    order by s.created_at`

  return (
    <Page title="Places" msg={msg}>
      <p className="muted">Communities beyond your own channels. Each place gets your recent posts with its own link, so you see how many people each one brings.</p>

      <h2>To paste now {todo.length > 0 && <span className="count">{todo.length}</span>}</h2>
      {todo.map(t => (
        <div key={t.id} className="card" style={{ marginBottom: 12 }}>
          <div className="muted"><a href={t.url} target="_blank" rel="noreferrer"><b>{t.name}</b></a> · {t.kind}{t.rules ? ` · rules: ${t.rules}` : ''}</div>
          <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{shareText(t.caption, t.link_code)}</div>
          <div className="row">
            <CopyOpen text={shareText(t.caption, t.link_code)} href={t.url} />
            <form action={markShare}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="outcome" value="posted" /><button type="submit">I posted it</button></form>
            <form action={markShare}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="outcome" value="skip" /><button type="submit" className="ghost">Skip</button></form>
          </div>
        </div>
      ))}
      {todo.length === 0 && <p className="muted">Nothing to paste. Approved places get a post as soon as one is published.</p>}

      <h2>Places in use</h2>
      <div className="scroll"><table>
        <thead><tr><th>Place</th><th>Posting</th><th>Per week</th><th>Posted</th><th>People</th><th>Sign-ups</th><th></th></tr></thead>
        <tbody>
          {used.map(x => (
            <tr key={x.id}>
              <td><a href={x.url} target="_blank" rel="noreferrer"><b>{x.name}</b></a><div className="muted">{x.kind}{x.members ? ` · ${num(x.members)} members` : ''}</div></td>
              <td>
                {x.how === 'auto' ? <span className="pill pill-ok">auto</span> : <span className="pill pill-muted">you paste</span>}
                {['telegram', 'discord'].includes(x.kind) && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted">{x.how === 'auto' ? 'Change' : 'Post by itself'}</summary>
                    <form action={connectPlace} className="row" style={{ marginTop: 6 }}>
                      <input type="hidden" name="id" value={x.id} />
                      <input name="target" placeholder={x.kind === 'telegram' ? 'Chat id (our bot must be in it)' : 'Webhook URL or channel id'} aria-label={`Connect ${x.name}`} style={{ width: 220 }} />
                      <button type="submit" className="ghost">Save</button>
                    </form>
                    <div className="muted">Only after the admin agrees: they add our bot{x.kind === 'discord' ? ' or give you a webhook' : ''}. Leave empty to go back to pasting.</div>
                  </details>
                )}
              </td>
              <td>
                {ONE_TIME_KINDS.includes(x.kind) ? <span className="muted">once</span> : <form action={setPerWeek} className="row">
                  <input type="hidden" name="id" value={x.id} />
                  <input name="per_week" type="number" min={1} max={14} defaultValue={x.per_week} style={{ width: 56 }} aria-label={`Posts a week in ${x.name}`} />
                  <button type="submit" className="ghost">Set</button>
                </form>}
              </td>
              <td>{x.posted}</td><td><strong>{x.people}</strong></td><td>{x.signups}</td>
              <td><form action={setPlaceStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="rejected" /><button type="submit" className="ghost">Remove</button></form></td>
            </tr>
          ))}
          {used.length === 0 && <tr><td colSpan={7} className="muted">No places yet. Approve some below, or add one.</td></tr>}
        </tbody>
      </table></div>

      <h2>Suggested <span className="muted" style={{ fontWeight: 400 }}>· found by the scout every Monday</span></h2>
      <form action={findPlaces} style={{ marginBottom: 12 }}><button type="submit" className="ghost">Find places now</button></form>
      <div className="scroll"><table>
        <thead><tr><th>Place</th><th>Why</th><th>Rules</th><th></th></tr></thead>
        <tbody>
          {suggested.map(x => (
            <tr key={x.id}>
              <td><a href={x.url} target="_blank" rel="noreferrer"><b>{x.name}</b></a><div className="muted">{x.kind}{x.members ? ` · ${num(x.members)} members` : ''}</div></td>
              <td className="muted">{x.why}</td>
              <td className="muted">{x.rules}</td>
              <td>
                <div className="row">
                  <form action={setPlaceStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="approved" /><button type="submit">Use</button></form>
                  <form action={setPlaceStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="rejected" /><button type="submit" className="ghost">No</button></form>
                </div>
              </td>
            </tr>
          ))}
          {suggested.length === 0 && <tr><td colSpan={4} className="muted">No suggestions right now.</td></tr>}
        </tbody>
      </table></div>

      <details style={{ marginTop: 16 }}>
        <summary>Add a place yourself</summary>
        <form action={addPlace} className="stack" style={{ marginTop: 8 }}>
          <input name="name" placeholder="Name (e.g. r/webdev, Web3 Builders Discord)" aria-label="Place name" />
          <input name="url" type="url" placeholder="https://…" aria-label="Place link" />
          <select name="kind" aria-label="Kind of place" defaultValue="other">
            {['telegram', 'discord', 'reddit', 'hackernews', 'producthunt', 'indiehackers', 'forum', 'facebook_group', 'naver_cafe', 'kakao_openchat', 'newsletter', 'list', 'devto', 'mastodon', 'bluesky', 'other']
              .map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input name="rules" placeholder="Its rules on promotion (optional)" aria-label="Rules" />
          <button type="submit">Add</button>
        </form>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary>What&apos;s possible</summary>
        <p className="muted">
          <b>By itself:</b> Telegram and Discord places whose admin added our bot or gave a webhook.<br />
          <b>You paste (about a minute):</b> subreddits, Hacker News, Product Hunt, Indie Hackers, self-promo channels in Discord servers, public Telegram groups, Facebook groups, Naver cafés, KakaoTalk open chats, forums, newsletters.<br />
          <b>Never:</b> automating your own account to post in other people&apos;s groups, posting in channels we don&apos;t admin, mass DMs, auto-joining or auto-commenting. Accounts get banned for these.
        </p>
      </details>
    </Page>
  )
}
