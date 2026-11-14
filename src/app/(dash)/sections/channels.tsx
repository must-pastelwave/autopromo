import { sql } from '@/lib/db'
import { CONNECTABLE, listAccounts, zernioPlatform } from '@/lib/zernio'
import { discordChannels, discordInvite, isDirect, maskWebhook, telegramBotName, telegramChats } from '@/lib/direct'
import { PLATFORMS } from '@/lib/plans'
import { setChannelAccount, setDirectTarget, setPerDay, toggleAutoPublish, toggleChannel } from '../actions'

export async function ChannelsSection({ p }: { p: Record<string, any> }) {
  const channels = await sql`
    select c.*, (
      select string_agg(pr.name, ', ') from channels o join products pr on pr.id = o.product_id
      where o.zernio_account_id = c.zernio_account_id and o.platform = c.platform and o.product_id <> c.product_id
    ) as shared_with
    from channels c where c.product_id = ${p.id} and c.platform = any(${PLATFORMS}) order by c.automatable desc, c.id`
  const on = channels.filter(c => c.enabled), off = channels.filter(c => !c.enabled)
  let accounts: Awaited<ReturnType<typeof listAccounts>> = []
  let zernioError = ''
  try { accounts = await listAccounts() } catch (e) { zernioError = e instanceof Error ? e.message : String(e) }
  const bot = on.some(c => c.platform === 'telegram') ? await telegramBotName() : null
  const tgChats = bot ? await telegramChats() : []
  const [dcInvite, dcChannels] = on.some(c => c.platform === 'discord') ? await Promise.all([discordInvite(), discordChannels()]) : [null, []]

  const status = (c: Record<string, any>) => {
    if (!c.automatable) return <span className="pill pill-muted">you post it</span>
    if (c.needs_reconnect) return <span className="pill pill-bad">{isDirect(c.platform) ? 'last post failed' : 'reconnect'}</span>
    if (!(isDirect(c.platform) ? c.target : c.zernio_account_id)) return <span className="pill pill-warn">not connected</span>
    return <span className="pill pill-ok">ready</span>
  }

  const account = (c: Record<string, any>) => {
    if (c.platform === 'telegram') return (
      <form action={setDirectTarget} className="row">
        <input type="hidden" name="id" value={c.id} />
        <input name="target" list="tg-chats" defaultValue={c.target ?? ''} placeholder="Pick your group or channel" aria-label="Telegram channel or group" style={{ width: 210 }} />
        <datalist id="tg-chats">{tgChats.map(t => <option key={t.id} value={t.id}>{`${t.title} (${t.type})`}</option>)}</datalist>
        <button type="submit" className="ghost">{c.target ? 'Save' : 'Connect'}</button>
        {!c.target && <div className="muted">{bot
          ? <>Add <b>@{bot}</b> to your group (or as a channel admin), then pick it. Not listed? Remove the bot and add it again.</>
          : 'Set TELEGRAM_BOT_TOKEN in Vercel first (see SETUP.md).'}</div>}
      </form>
    )
    if (c.platform === 'discord') return (
      <form action={setDirectTarget} className="row">
        <input type="hidden" name="id" value={c.id} />
        <input name="target" list="dc-channels" placeholder={c.target ? `Connected (${maskWebhook(c.target)})` : 'Pick a channel or paste a webhook URL'} aria-label="Discord channel or webhook URL" style={{ width: 240 }} />
        <datalist id="dc-channels">{dcChannels.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</datalist>
        <button type="submit" className="ghost">{c.target ? 'Change' : 'Connect'}</button>
        {!c.target && <div className="muted">{dcInvite
          ? <><a href={dcInvite} target="_blank" rel="noreferrer">Add the autopromo bot</a> to your server, then pick the channel.</>
          : 'Paste a webhook URL: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.'}</div>}
      </form>
    )
    if (!c.automatable) return <span className="muted">You post it yourself from Waiting.</span>
    const mine = accounts.filter(a => a.platform === zernioPlatform(c.platform) || a._id === c.zernio_account_id)
    return (<>
      <div className="row">
        {mine.length > 0 && (
          <form action={setChannelAccount} className="row">
            <input type="hidden" name="id" value={c.id} />
            <select name="account" defaultValue={c.zernio_account_id ?? ''} aria-label={`Account for ${c.platform}`}>
              <option value="">— none —</option>
              {mine.map(a => <option key={a._id} value={a._id}>{a.username ?? a._id}</option>)}
            </select>
            <button type="submit" className="ghost">Save</button>
          </form>
        )}
        {CONNECTABLE.includes(c.platform) && <a className="button ghost" href={`/connect/${c.platform}?product=${p.id}`}>{c.zernio_account_id ? 'Reconnect' : 'Connect'}</a>}
      </div>
      {c.shared_with && <div className="muted">Shared with {c.shared_with}.</div>}
    </>)
  }

  return (
    <>
      {zernioError && <div className="notice">Can&apos;t reach Zernio ({zernioError}). Check ZERNIO_API_KEY.</div>}
      <p className="muted">Connect each channel you use. New channels start as &ldquo;Approve first&rdquo;: posts wait for you until you switch to Auto.</p>
      <div className="scroll"><table>
        <thead><tr><th>Channel</th><th>Account</th><th>Posts a day</th><th>Publishing</th><th></th></tr></thead>
        <tbody>
          {on.map(c => (
            <tr key={c.id}>
              <td><b>{c.platform}</b><div style={{ marginTop: 4 }}>{status(c)}</div></td>
              <td>{account(c)}</td>
              <td>
                <form action={setPerDay} className="row">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="per_day" type="number" min={1} max={10} defaultValue={c.per_day} style={{ width: 56 }} aria-label={`Posts a day on ${c.platform}`} />
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
                <form action={toggleChannel}>
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value="false" />
                  <button type="submit" className="ghost" aria-label={`Turn off ${c.platform}`}>Turn off</button>
                </form>
              </td>
            </tr>
          ))}
          {on.length === 0 && <tr><td colSpan={5} className="muted">No channels on yet. Turn one on below.</td></tr>}
        </tbody>
      </table></div>
      {off.length > 0 && (
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted">Not used:</span>
          {off.map(c => (
            <form key={c.id} action={toggleChannel}>
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value="true" />
              <button type="submit" className="ghost">+ {c.platform}</button>
            </form>
          ))}
        </div>
      )}
      <details style={{ marginTop: 16 }}>
        <summary>How connecting works</summary>
        <p className="muted">Press <b>Connect</b> and log in to the account yourself (never by script); it links here automatically. Keep new accounts at 1 post a day. One account can serve several products; they then share its daily posts. Telegram and Discord post directly: clicks are tracked, but they don&apos;t report views.</p>
      </details>
    </>
  )
}
