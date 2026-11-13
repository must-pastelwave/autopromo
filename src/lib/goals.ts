import { sql } from './db'

/** Every number a goal can use. Each one is something autopromo actually measures; nothing else can be a goal. */
export const METRICS = {
  signups: { label: 'Sign-ups', how: 'reported by your site to /api/conversions' },
  purchases: { label: 'Purchases', how: 'reported by your site to /api/conversions' },
  clicks: { label: 'Link clicks', how: 'clicks on our tracked links' },
  seen: { label: 'Post views', how: 'views or impressions of our posts, from Zernio' },
  engaged: { label: 'Engagements', how: 'likes, comments, shares and saves on our posts, from Zernio' },
  followers: { label: 'Followers gained', how: 'follower counts of the connected accounts, from Zernio' },
  github_stars: { label: 'GitHub stars', how: "the repo's star count, read from GitHub every hour" },
} as const
export type Metric = keyof typeof METRICS
export const isMetric = (m: string): m is Metric => Object.hasOwn(METRICS, m)

export type GoalInput = { metric: Metric; source: string; target_1m: number | null; target_3m: number | null }
const REPO = /^[\w.-]+\/[\w.-]+$/

/** Validate goal rows from the settings form. Rows with no metric or no number are dropped. Returns an error string or the goals. */
export function parseGoals(rows: { metric: string; source: string; m1: string; m3: string }[]): GoalInput[] | string {
  const num = (v: string) => { const n = Math.round(Number(v)); return v.trim() && n > 0 ? n : null }
  const out: GoalInput[] = []
  for (const r of rows) {
    const m1 = num(r.m1), m3 = num(r.m3)
    if (!r.metric || (m1 === null && m3 === null)) continue
    if (!isMetric(r.metric)) return `Unknown goal: ${r.metric}`
    const source = r.metric === 'github_stars' ? r.source.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '') : ''
    if (r.metric === 'github_stars' && !REPO.test(source)) return 'GitHub stars needs the repo as owner/name, e.g. vercel/next.js'
    out.push({ metric: r.metric, source, target_1m: m1, target_3m: m3 })
  }
  return out
}

/** A public repo's star count, or null if GitHub doesn't know the repo. */
export async function repoStars(repo: string): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_DISPATCH_TOKEN
  const get = (auth: boolean) => fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  try {
    let r = await get(true)
    if (!r.ok && token) r = await get(false)   // a token scoped to one repo may not see others
    if (!r.ok) return null
    const n = (await r.json())?.stargazers_count
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

export async function saveSnapshot(source: string, metric: string, value: number) {
  await sql`insert into counter_snapshots (source, metric, day, value) values (${source}, ${metric}, current_date, ${value})
    on conflict (source, metric, day) do update set value = excluded.value`
}

/** Read every goal's outside counter (GitHub stars). At most hourly. Never throws. */
export async function syncCounters(o: { force?: boolean } = {}) {
  if (!o.force) {
    const [s] = await sql`select 1 from sync_state where key = 'counters' and at > now() - interval '1 hour'`
    if (s) return 'skipped'
  }
  const repos = await sql`select distinct source from goals where metric = 'github_stars'`
  let failed = 0
  for (const { source } of repos) {
    const n = await repoStars(source)
    if (n === null) failed++
    else await saveSnapshot(source, 'github_stars', n)
  }
  const note = failed ? `${failed} GitHub repo(s) could not be read` : ''
  await sql`insert into sync_state (key, at, note) values ('counters', now(), ${note}) on conflict (key) do update set at = now(), note = ${note}`
  return failed ? 'partial' : 'ok'
}

/**
 * How much of a metric this product got since `from` (a date). Counters (followers, stars) count the gain since
 * the last value on or before `from`, or since the first value we have; `since` says which day that was.
 */
export async function measure(productId: number, metric: Metric, source: string, from: string): Promise<{ value: number; since: string | null }> {
  const one = async (q: Promise<{ n: number }[]>) => ({ value: (await q)[0]?.n ?? 0, since: from })
  switch (metric) {
    case 'clicks':
      return one(sql`select count(*)::int as n from clicks k join posts p on p.id = k.post_id where p.product_id = ${productId} and k.at >= ${from}`)
    case 'signups':
    case 'purchases':
      return one(sql`select count(*)::int as n from conversions v join posts p on p.id = v.post_id
        where p.product_id = ${productId} and v.kind = ${metric === 'signups' ? 'signup' : 'purchase'} and v.at >= ${from}`)
    case 'seen':
    case 'engaged':
      return one(sql`select coalesce(sum(${metric === 'seen' ? sql`greatest(m.impressions, m.views, m.reach)` : sql`m.likes + m.comments + m.shares + m.saves`}), 0)::int as n
        from post_metrics m join posts p on p.id = m.post_id
        where p.product_id = ${productId} and p.status in ('scheduled', 'published') and p.scheduled_for >= ${from}`)
    case 'followers': {
      const [r] = await sql`
        select coalesce(sum(now_f - base_f), 0)::int as n, min(base_day)::text as since from (
          select
            (select followers from follower_counts fc where fc.channel_id = c.id order by day desc limit 1) as now_f,
            b.followers as base_f, b.day as base_day
          from channels c
          cross join lateral (
            select followers, day from follower_counts fc where fc.channel_id = c.id
            order by (day <= ${from}) desc, case when day <= ${from} then day end desc, day limit 1) b
          where c.product_id = ${productId} and c.enabled) x`
      return { value: r.n, since: r.since }
    }
    case 'github_stars': {
      const [r] = await sql`
        select
          (select value from counter_snapshots where source = ${source} and metric = 'github_stars' order by day desc limit 1) as now_v,
          b.value as base_v, b.day::text as since
        from (select value, day from counter_snapshots where source = ${source} and metric = 'github_stars'
          order by (day <= ${from}) desc, case when day <= ${from} then day end desc, day limit 1) b`
      return r ? { value: r.now_v - r.base_v, since: r.since } : { value: 0, since: null }
    }
  }
}

/** Can autopromo measure this goal right now? If not, `why` says what's missing, in plain words. */
export async function tracking(productId: number, metric: Metric, source: string): Promise<{ ok: boolean; why: string }> {
  switch (metric) {
    case 'clicks':
      return { ok: true, why: 'Counted by autopromo on every tracked link, on every channel (Telegram and Discord included).' }
    case 'signups':
    case 'purchases': {
      const kind = metric === 'signups' ? 'signup' : 'purchase'
      const [r] = await sql`select count(*)::int as n from conversions v join posts p on p.id = v.post_id where p.product_id = ${productId} and v.kind = ${kind}`
      return r.n > 0
        ? { ok: true, why: `Your site has reported ${r.n} ${kind}${r.n === 1 ? '' : 's'}.` }
        : { ok: false, why: `Not tracked: your site hasn't reported any ${kind} yet. It must send them to /api/conversions (SETUP.md step 7).` }
    }
    case 'seen':
    case 'engaged': {
      const [c] = await sql`select count(*)::int as n from channels where product_id = ${productId} and enabled and zernio_account_id is not null`
      if (!c.n) return { ok: false, why: 'Not tracked: no connected account yet. Connect one in Channels.' }
      const [s] = await sql`select note from sync_state where key = 'metrics'`
      if (s?.note?.startsWith('analytics not available')) return { ok: false, why: "Not tracked: this Zernio plan doesn't include analytics." }
      return { ok: true, why: `Read from each platform through Zernio, hourly.${await directNote(productId)}` }
    }
    case 'followers': {
      const [r] = await sql`select count(*)::int as n from follower_counts fc join channels c on c.id = fc.channel_id where c.product_id = ${productId} and c.enabled`
      return r.n > 0
        ? { ok: true, why: `Follower counts read through Zernio, hourly.${await directNote(productId)}` }
        : { ok: false, why: 'Not tracked yet: no follower counts. Connect an account in Channels; counts arrive with the hourly sync.' }
    }
    case 'github_stars': {
      const [r] = await sql`select count(*)::int as n from counter_snapshots where source = ${source} and metric = 'github_stars'`
      return r.n > 0
        ? { ok: true, why: `Stars of github.com/${source}, read hourly.` }
        : { ok: false, why: `Not tracked yet: github.com/${source} hasn't been read. Check the repo name.` }
    }
  }
}

/** Telegram and Discord report no views or followers; say so where those goals are shown. */
async function directNote(productId: number) {
  const rows = await sql`select platform from channels where product_id = ${productId} and enabled and target is not null order by platform`
  return rows.length ? ` ${rows.map(r => r.platform[0].toUpperCase() + r.platform.slice(1)).join(' and ')} ${rows.length === 1 ? "doesn't" : "don't"} report this; only their clicks count.` : ''
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)

/** A product's goals with whether each is tracked and how far it is: last 30 days vs the 1-month number, last 90 vs the 3-month one. */
export async function goalsWithProgress(productId: number) {
  const goals = await sql<{ id: number; metric: Metric; source: string; target_1m: number | null; target_3m: number | null }[]>`
    select id, metric, source, target_1m, target_3m from goals where product_id = ${productId} order by id`
  return Promise.all(goals.map(async g => ({
    ...g,
    label: METRICS[g.metric].label,
    tracking: await tracking(productId, g.metric, g.source),
    last30: await measure(productId, g.metric, g.source, daysAgo(30)),
    last90: await measure(productId, g.metric, g.source, daysAgo(90)),
  })))
}
