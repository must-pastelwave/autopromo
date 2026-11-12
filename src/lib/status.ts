/** A post's status in plain words, its colour, and which Posts tab it belongs to. */
export type Tab = 'needs-you' | 'upcoming' | 'published' | 'blocked' | 'set-aside'

export function postState(x: { status: string; revision?: number; error?: string | null; scheduled_for?: Date | string | null }, tz: string): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' | 'info'; tab: Tab } {
  const when = x.scheduled_for
    ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(x.scheduled_for))
    : ''
  switch (x.status) {
    case 'waiting': return x.error?.startsWith('connect your')
      ? { label: 'Needs the account connected', tone: 'warn', tab: 'needs-you' }
      : { label: 'Needs your OK', tone: 'warn', tab: 'needs-you' }
    case 'draft': return { label: 'In AI review', tone: 'info', tab: 'upcoming' }
    case 'passed': return { label: 'Publishing', tone: 'info', tab: 'upcoming' }
    case 'scheduled': return { label: `Scheduled · ${when}`, tone: 'ok', tab: 'upcoming' }
    case 'published': return { label: `Published · ${when}`, tone: 'ok', tab: 'published' }
    case 'blocked': return (x.revision ?? 0) === 0
      ? { label: 'Blocked · being fixed', tone: 'bad', tab: 'blocked' }
      : { label: 'Blocked', tone: 'bad', tab: 'blocked' }
    case 'failed': return { label: 'Failed to publish', tone: 'bad', tab: 'blocked' }
    case 'dropped': return { label: 'Dropped', tone: 'muted', tab: 'set-aside' }
    case 'skipped': return { label: 'Skipped', tone: 'muted', tab: 'set-aside' }
    case 'expired': return { label: 'Expired', tone: 'muted', tab: 'set-aside' }
    default: return { label: x.status, tone: 'muted', tab: 'set-aside' }
  }
}
