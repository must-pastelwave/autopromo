import { sql } from '@/lib/db'
import { scorecard, TARGET_KEYS, TARGET_LABEL } from '@/lib/scorecard'

const fmt = (n: number) => new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)

/** The campaign vs the plan's targets: sign-ups first, then clicks, reach, engagement and followers. */
export async function Scorecard({ planId }: { planId: number }) {
  const s = await scorecard(planId)
  if (!s) return null
  const [sync] = await sql`select at, note from sync_state where key = 'metrics'`
  const pace = s.totalDays ? s.elapsedDays / s.totalDays : 0
  // Purchases only matter for products that sell directly; hide the tile until there's a target or a purchase.
  const keys = TARGET_KEYS.filter(k => k !== 'purchases' || s.targets.purchases || s.totals.purchases)
  const g = s.goal, goalUnit = g.kind === 'purchase' ? 'purchases' : 'sign-ups'
  const rows = (list: typeof s.byTheme) => list.map(r => (
    <tr key={r.key}><td>{r.key}</td><td>{r.published}</td><td>{r.signups}</td><td>{fmt(r.seen)}</td><td>{fmt(r.engaged)}</td><td>{r.clicks}</td>
      <td>{r.seen ? `${((r.clicks / r.seen) * 100).toFixed(2)}%` : '—'}</td></tr>
  ))
  return (
    <section>
      <h2>Campaign results <span className="muted" style={{ fontWeight: 400 }}>· day {s.elapsedDays} of {s.totalDays} · {s.totals.published} posts out</span></h2>
      {!!(g.month || g.threeMonths) && <p><b>Product goal</b> {[g.month && `${g.month.toLocaleString('en')} ${goalUnit} a month`, g.threeMonths && `${g.threeMonths.toLocaleString('en')} in 3 months`].filter(Boolean).join(' · ')}</p>}
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
        Sign-ups and purchases are counted when the product site reports them. Views and engagement come from each platform (via Zernio), clicks from our own links, followers per account. The bar&apos;s mark is where the plan should be today.
        {' '}{sync?.note ? <b>{sync.note}.</b> : sync ? `Last synced ${new Date(sync.at).toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} KST.` : 'First sync after the first post is published.'}
      </p>
      {s.totals.published > 0 && <div className="two">
        <section><h3>By theme</h3><div className="scroll"><table><thead><tr><th>Theme</th><th>Posts</th><th>Sign-ups</th><th>Seen</th><th>Engaged</th><th>Clicks</th><th>Click rate</th></tr></thead><tbody>{rows(s.byTheme)}</tbody></table></div></section>
        <section><h3>By channel</h3><div className="scroll"><table><thead><tr><th>Channel</th><th>Posts</th><th>Sign-ups</th><th>Seen</th><th>Engaged</th><th>Clicks</th><th>Click rate</th></tr></thead><tbody>{rows(s.byChannel)}</tbody></table></div></section>
      </div>}
    </section>
  )
}
