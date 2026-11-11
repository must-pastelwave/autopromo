import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { listAccounts } from '@/lib/zernio'
import { setChannelAccount, toggleChannel } from '../actions'

export default async function Channels() {
  const p = await currentProduct()
  if (!p) return <p>No product yet.</p>
  const channels = await sql`select * from channels where product_id = ${p.id} order by automatable desc, id`
  let accounts: Awaited<ReturnType<typeof listAccounts>> = []
  let zernioError = ''
  try { accounts = await listAccounts() } catch (e) { zernioError = e instanceof Error ? e.message : String(e) }
  return (
    <>
      {zernioError && <div className="notice">Can&apos;t reach Zernio ({zernioError}). Check ZERNIO_API_KEY.</div>}
      <p className="muted">Connect accounts in Zernio yourself (never by script), then pick them here. New channels post at half volume for 14 days.</p>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>On</th><th>Zernio account</th><th>Status</th></tr></thead>
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
                  <form action={setChannelAccount} className="row">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="account" defaultValue={c.zernio_account_id ?? ''} aria-label={`Zernio account for ${c.platform}`}>
                      <option value="">— none —</option>
                      {accounts.filter(a => a.platform === c.platform || a._id === c.zernio_account_id)
                        .map(a => <option key={a._id} value={a._id}>{a.username ?? a._id}</option>)}
                    </select>
                    <button type="submit" className="ghost">Save</button>
                  </form>
                ) : <span className="muted">—</span>}
              </td>
              <td>{c.needs_reconnect ? <span className="s-failed">reconnect in Zernio</span> : c.enabled && c.automatable && !c.zernio_account_id ? <span className="s-waiting">pick an account</span> : <span className="muted">ok</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}
