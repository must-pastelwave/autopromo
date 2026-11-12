import { sql } from '@/lib/db'
import { CONNECTABLE, listAccounts, zernioPlatform } from '@/lib/zernio'
import { setChannelAccount, setPerDay, toggleAutoPublish, toggleChannel } from '../actions'

export async function ChannelsSection({ p }: { p: Record<string, any> }) {
  const channels = await sql`
    select c.*, (
      select string_agg(pr.name, ', ') from channels o join products pr on pr.id = o.product_id
      where o.zernio_account_id = c.zernio_account_id and o.platform = c.platform and o.product_id <> c.product_id
    ) as shared_with
    from channels c where c.product_id = ${p.id} order by c.automatable desc, c.id`
  let accounts: Awaited<ReturnType<typeof listAccounts>> = []
  let zernioError = ''
  try { accounts = await listAccounts() } catch (e) { zernioError = e instanceof Error ? e.message : String(e) }
  return (
    <>
      {zernioError && <div className="notice">Can&apos;t reach Zernio ({zernioError}). Check ZERNIO_API_KEY.</div>}
      <p className="muted">Press <b>Connect</b> and log in to the account yourself (never by script); it links here automatically. You can also pick an account another product already uses. Every channel starts as &ldquo;Approve first&rdquo;: posts wait for you. Switch to Auto once posts go through cleanly. Keep new accounts at 1 post a day. One account can serve several products; they then share its daily posts.</p>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>On</th><th>Posts / day</th><th>Auto-publish</th><th>Zernio account</th><th>Status</th></tr></thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id}>
              <td>{c.platform}<div className="muted">{c.automatable ? 'posts automatically' : 'drafts only'}</div></td>
              <td>
                <form action={toggleChannel}>
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value={String(!c.enabled)} />
                  <button type="submit" className={c.enabled ? '' : 'ghost'} aria-pressed={c.enabled}>{c.enabled ? 'On' : 'Off'}</button>
                </form>
              </td>
              <td>
                <form action={setPerDay} className="row">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="per_day" type="number" min={1} max={10} defaultValue={c.per_day} style={{ width: 64 }} aria-label={`Posts per day on ${c.platform}`} />
                  <button type="submit" className="ghost">Set</button>
                </form>
              </td>
              <td>
                {c.automatable ? (
                  <form action={toggleAutoPublish}>
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="auto" value={String(!c.auto_publish)} />
                    <button type="submit" className={c.auto_publish ? '' : 'ghost'} aria-pressed={c.auto_publish}>{c.auto_publish ? 'Auto' : 'Approve first'}</button>
                  </form>
                ) : <span className="muted">—</span>}
              </td>
              <td>
                {c.automatable ? (<>
                  <form action={setChannelAccount} className="row">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="account" defaultValue={c.zernio_account_id ?? ''} aria-label={`Zernio account for ${c.platform}`}>
                      <option value="">— none —</option>
                      {accounts.filter(a => a.platform === zernioPlatform(c.platform) || a._id === c.zernio_account_id)
                        .map(a => <option key={a._id} value={a._id}>{a.username ?? a._id}</option>)}
                    </select>
                    <button type="submit" className="ghost">Save</button>
                  </form>
                  {CONNECTABLE.includes(c.platform) && (
                    <a className="button ghost" href={`/connect/${c.platform}?product=${p.id}`}>{c.zernio_account_id ? 'Reconnect' : `Connect ${c.platform}`}</a>
                  )}
                  {c.shared_with && <div className="muted">Also posts for {c.shared_with}. They share this account&apos;s daily posts.</div>}
                </>) : <span className="muted">—</span>}
              </td>
              <td>{c.needs_reconnect ? <span className="s-failed">reconnect in Zernio</span> : c.enabled && c.automatable && !c.zernio_account_id ? <span className="s-waiting">pick an account</span> : <span className="muted">ok</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}
