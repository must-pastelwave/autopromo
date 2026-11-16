import { currentProduct } from '@/lib/current'
import { sql } from '@/lib/db'
import { AUTO_KINDS, ONE_TIME_KINDS, placeStats, shareText } from '@/lib/places'
import { Page } from '../sections/frame'
import { CopyOpen } from '../sections/copy-open'
import { addPlace, connectPlace, findPlaces, markShare, setPerWeek, setPlaceStatus, setShareViews } from './actions'

const PLACEHOLDER: Record<string, string> = {
  telegram: 'Chat id (our bot must be in it)', discord: 'Webhook URL or channel id',
  mastodon: 'https://mastodon.social <access token>', bluesky: 'you.bsky.social <app password>',
}
const num = (n: number | null) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

const TABS = [['paste', 'To paste'], ['posted', 'Posted'], ['use', 'In use'], ['suggested', 'Suggested']] as const
type Tab = (typeof TABS)[number][0]

export default async function Places({ searchParams }: { searchParams: Promise<{ msg?: string; tab?: string }> }) {
  const p = await currentProduct()
  const { msg, tab: t0 } = await searchParams
  const tab: Tab = TABS.some(([k]) => k === t0) ? (t0 as Tab) : 'paste'
  if (!p) return <Page title="Places" msg={msg}><p>No product yet. Add one in <a href="/settings">Settings</a>.</p></Page>
  const places = await placeStats(p.id)
  const used = places.filter(x => x.status === 'approved'), suggested = places.filter(x => x.status === 'suggested')
  const todo = await sql`
    select s.id, s.link_code, s.text, pl.name, pl.url, pl.kind, pl.rules, pr.url as product_url
    from shares s join places pl on pl.id = s.place_id join products pr on pr.id = pl.product_id
    where pl.product_id = ${p.id} and s.status = 'todo' and s.text_status = 'ok' and pl.how = 'paste' and pl.status = 'approved'
    order by s.created_at`
  const posted = await sql`
    select s.id, s.post_url, s.views, s.posted_at::date::text as day, pl.name, pl.kind
    from shares s join places pl on pl.id = s.place_id
    where pl.product_id = ${p.id} and s.status = 'posted' and pl.how = 'paste'
    order by s.posted_at desc nulls last limit 30`

  return (
    <Page title="Places" msg={msg}>
      <p className="muted">Communities beyond your own channels. Each place gets your recent posts with its own link, so you see how many people each one brings.</p>
      <nav className="tabs">
        {TABS.map(([k, label]) => {
          const n = { paste: todo.length, posted: posted.length, use: used.length, suggested: suggested.length }[k]
          return <a key={k} href={`/places?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{label}{n > 0 && <span className="n">{n}</span>}</a>
        })}
      </nav>

      {tab === 'paste' && <>
      {todo.map(t => (
        <div key={t.id} className="card" style={{ marginBottom: 12 }}>
          <div className="muted"><a href={t.url} target="_blank" rel="noreferrer"><b>{t.name}</b></a> · {t.kind}{t.rules ? ` · rules: ${t.rules}` : ''}</div>
          <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{shareText(t.text, t.link_code, t.kind, t.product_url)}</div>
          <div className="row">
            <CopyOpen text={shareText(t.text, t.link_code, t.kind, t.product_url)} href={t.url} />
            <form action={markShare} className="row"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="outcome" value="posted" />
              <input name="post_url" type="url" placeholder="Link to your post" aria-label={`Link to the post in ${t.name}`} style={{ width: 220 }} />
              <button type="submit">I posted it</button></form>
            <form action={markShare}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="outcome" value="skip" /><button type="submit" className="ghost">Skip</button></form>
          </div>
        </div>
      ))}
      {todo.length === 0 && <p className="muted">Nothing to paste. Approved places get a post once one passes review; the writer then adapts it to each place, and the reviewer checks it.</p>}
      </>}

      {tab === 'use' && <>
      <div className="scroll"><table>
        <thead><tr><th>Place</th><th>Posting</th><th>Per week</th><th>Posted</th><th>Views</th><th>People</th><th>Sign-ups</th><th></th></tr></thead>
        <tbody>
          {used.map(x => (
            <tr key={x.id}>
              <td><a href={x.url} target="_blank" rel="noreferrer"><b>{x.name}</b></a><div className="muted">{x.kind}{x.members ? ` · ${num(x.members)} members` : ''}</div></td>
              <td>
                {x.how === 'auto' ? <span className="pill pill-ok">auto</span> : <span className="pill pill-muted">you paste</span>}
                {AUTO_KINDS.includes(x.kind) && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted">{x.how === 'auto' ? 'Change' : 'Post by itself'}</summary>
                    <form action={connectPlace} className="row" style={{ marginTop: 6 }}>
                      <input type="hidden" name="id" value={x.id} />
                      <input name="target" placeholder={PLACEHOLDER[x.kind]} aria-label={`Connect ${x.name}`} style={{ width: 220 }} />
                      <button type="submit" className="ghost">Save</button>
                    </form>
                    <div className="muted">{['mastodon', 'bluesky'].includes(x.kind) ? 'Your own account on it. ' : `Only after the admin agrees: they add our bot${x.kind === 'discord' ? ' or give you a webhook' : ''}. `}Leave empty to go back to pasting.</div>
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
              <td>{x.posted}</td><td>{x.views ? num(x.views) : '—'}</td><td><strong>{x.people}</strong></td><td>{x.signups}</td>
              <td><form action={setPlaceStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="rejected" /><button type="submit" className="ghost">Remove</button></form></td>
            </tr>
          ))}
          {used.length === 0 && <tr><td colSpan={8} className="muted">No places yet. Approve some under Suggested, or add one below.</td></tr>}
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
          <b>By itself (the only kind that gets posts):</b> Telegram and Discord places whose admin added our bot or gave a webhook, and your own Mastodon and Bluesky accounts (add them as a place). Dev.to is a channel: connect it in Channels.<br />
          <b>Not posted to:</b> subreddits, Hacker News, Product Hunt, forums and other places where only a person may post. Posting there by hand is up to you; autopromo doesn&apos;t queue it.<br />
          <b>Never:</b> automating your own account to post in other people&apos;s groups, posting in channels we don&apos;t admin, mass DMs, auto-joining or auto-commenting. Accounts get banned for these.
        </p>
      </details>
      </>}

      {tab === 'posted' && <>
        <p className="muted">Type in the views each platform shows; they count in the campaign&apos;s views.</p>
        {posted.length === 0 && <p className="muted">Nothing posted by hand yet.</p>}
        {posted.length > 0 && <div className="scroll"><table>
          <thead><tr><th>Place</th><th>Posted</th><th>Link</th><th>Views</th></tr></thead>
          <tbody>
            {posted.map(x => (
              <tr key={x.id}>
                <td><b>{x.name}</b><div className="muted">{x.kind}</div></td>
                <td className="muted">{x.day}</td>
                <td>{x.post_url ? <a href={x.post_url} target="_blank" rel="noreferrer">open</a> : <span className="muted">—</span>}</td>
                <td><form action={setShareViews} className="row">
                  <input type="hidden" name="id" value={x.id} />
                  {!x.post_url && <input name="post_url" type="url" placeholder="Link" aria-label={`Link to the post in ${x.name}`} style={{ width: 160 }} />}
                  <input name="views" type="number" min={0} defaultValue={x.views ?? ''} aria-label={`Views in ${x.name}`} style={{ width: 90 }} />
                  <button type="submit" className="ghost">Save</button>
                </form></td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      </>}

      {tab === 'suggested' && <>
      <p className="muted">Found by the scout every Monday.</p>
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
      </>}

    </Page>
  )
}
