import { sql } from '@/lib/db'
import { scorecard, TARGET_KEYS, TARGET_LABEL } from '@/lib/scorecard'
import { Goals } from './goals'

const fmt = (n: number) => new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)

/** The campaign vs the plan's targets: sign-ups first, then clicks, reach, engagement and followers. */
export async function Scorecard({ planId, productId }: { planId: number; productId: number }) {
  const s = await scorecard(planId)
  if (!s) return null
  const [sync] = await sql`select at, note from sync_state where key = 'metrics'`
  const pace = s.totalDays ? s.elapsedDays / s.totalDays : 0
  // Purchases and stars only matter for some products; show their tiles once there's a target or a number.
  // Sign-ups and purchases show only once the site reports them: a "0 / 50 · behind" we can't measure says nothing.
  const reported = await sql`select distinct v.kind from conversions v join posts p on p.id = v.post_id where p.product_id = ${productId}`
  const isReported = (k: string) => reported.some(r => r.kind === (k === 'signups' ? 'signup' : 'purchase'))
  const keys = TARGET_KEYS.filter(k => (!['purchases', 'github_stars'].includes(k) || s.targets[k] || s.totals[k])
    && (!['signups', 'purchases'].includes(k) || isReported(k)))
  const rows = (list: typeof s.byTheme) => list.map(r => (
    <tr key={r.key}><td>{r.key}</td><td>{r.published}</td><td>{r.signups}</td><td>{fmt(r.seen)}</td><td>{fmt(r.engaged)}</td><td>{r.clicks}</td>
      <td>{r.seen ? `${((r.clicks / r.seen) * 100).toFixed(2)}%` : '—'}</td></tr>
  ))
  return (
    <section>
      <h2>Campaign results <span className="muted" style={{ fontWeight: 400 }}>· day {s.elapsedDays} of {s.totalDays} · {s.totals.published} posts out</span></h2>
      <Goals productId={productId} />
      <div className="stats">
        {keys.map(k => {
          const actual = s.totals[k], target = s.targets[k]
          const share = target ? actual / target : null
          const state = share === null ? '' : share >= pace ? 'on track' : 'behind'
          return (
            <div key={k} className="stat">
              <div className="big">{fmt(actual)}{target && <span className="of"> / {fmt(target)}</span>}</div>
              <div className="muted">{TARGET_LABEL[k]}{state && <> · <span className={state === 'on track' ? 's-published' : 's-waiting'}>{state}</span></>}</div>
              {target && <div className="bar"><span style={{ width: `${Math.min(100, (share ?? 0) * 100)}%` }} /><i style={{ left: `${pace * 100}%` }} /></div>}
            </div>
          )
        })}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Sign-ups and purchases are counted when the product site reports them; GitHub stars are read from GitHub. Views and engagement come from each platform (via Zernio), people from our own links (each counted once per post), followers per account. The bar&apos;s mark is where the plan should be today.
        {' '}{sync?.note ? <b>{sync.note}.</b> : sync ? `Last synced ${new Date(sync.at).toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} KST.` : 'First sync after the first post is published.'}
      </p>
      {s.totals.published > 0 && <div className="two">
        <section><h3>By theme</h3><div className="scroll"><table><thead><tr><th>Theme</th><th>Posts</th><th>Sign-ups</th><th>Seen</th><th>Engaged</th><th>People</th><th>People / seen</th></tr></thead><tbody>{rows(s.byTheme)}</tbody></table></div></section>
        <section><h3>By channel</h3><div className="scroll"><table><thead><tr><th>Channel</th><th>Posts</th><th>Sign-ups</th><th>Seen</th><th>Engaged</th><th>People</th><th>People / seen</th></tr></thead><tbody>{rows(s.byChannel)}</tbody></table></div></section>
      </div>}
    </section>
  )
}
