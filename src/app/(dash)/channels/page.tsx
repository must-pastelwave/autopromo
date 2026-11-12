import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { listAccounts } from '@/lib/zernio'
import { setChannelAccount, toggleAutoPublish, toggleChannel } from '../actions'

export default async function Channels() {
  const p = await currentProduct()
  if (!p) return <p>No product yet.</p>
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
      <p className="muted">Connect accounts in Zernio yourself (never by script), then pick them here. Every channel starts as &ldquo;Approve first&rdquo;: posts wait for you. Switch to Auto once posts go through cleanly. Keep new accounts at 1 post a day (Settings). One account can serve several products; they then share its daily posts.</p>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>On</th><th>Auto-publish</th><th>Zernio account</th><th>Status</th></tr></thead>
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
                      {accounts.filter(a => a.platform === c.platform || a._id === c.zernio_account_id)
                        .map(a => <option key={a._id} value={a._id}>{a.username ?? a._id}</option>)}
                    </select>
                    <button type="submit" className="ghost">Save</button>
                  </form>
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
