const DAY = 86_400_000
const SLOW_START_DAYS = 14
const LEAD_MS = 10 * 60_000

/** Wall-clock parts of an instant in a timezone. */
function partsIn(tz: string, d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(d).map(x => [x.type, Number(x.value)]),
  )
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute }
}

/** The instant when the clock in `tz` shows y-m-d h:mi. */
function zoned(tz: string, y: number, m: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const p = partsIn(tz, new Date(guess))
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess
  return new Date(guess - offset)
}

/**
 * Next free publish time: perDay slots spread over 09:00–21:00 local, each at +7 min.
 * First 14 days after startedAt run at half volume (at least 1/day).
 */
export function nextSlot(o: { now: Date; tz: string; perDay: number; startedAt: Date | null; taken: Date[] }): Date {
  const earliest = o.now.getTime() + LEAD_MS
  const taken = new Set(o.taken.map(t => t.getTime()))
  const today = partsIn(o.tz, o.now)
  for (let day = 0; day < 366; day++) {
    // Date.UTC normalises day overflow (e.g. Nov 31 → Dec 1).
    const cal = new Date(Date.UTC(today.y, today.m - 1, today.d + day))
    const y = cal.getUTCFullYear(), m = cal.getUTCMonth() + 1, d = cal.getUTCDate()
    const dayStart = zoned(o.tz, y, m, d, 0, 0).getTime()
    const slow = o.startedAt && dayStart < o.startedAt.getTime() + SLOW_START_DAYS * DAY
    const n = Math.max(1, slow ? Math.ceil(o.perDay / 2) : o.perDay)
    const step = (12 * 60) / n
    for (let i = 0; i < n; i++) {
      const minutes = 9 * 60 + Math.round(i * step) + 7
      const t = zoned(o.tz, y, m, d, Math.floor(minutes / 60), minutes % 60)
      if (t.getTime() >= earliest && !taken.has(t.getTime())) return t
    }
  }
  throw new Error('no free slot within a year')
}
