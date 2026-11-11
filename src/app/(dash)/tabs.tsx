'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [['/', 'Overview'], ['/posts', 'Posts'], ['/waiting', 'Waiting for you'], ['/channels', 'Channels'], ['/settings', 'Settings']]

export function Tabs({ waiting }: { waiting: number }) {
  const path = usePathname()
  return (
    <nav className="tabs">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          {label}{href === '/waiting' && waiting > 0 ? ` (${waiting})` : ''}
        </Link>
      ))}
    </nav>
  )
}
