'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [['/', 'Dashboard'], ['/plan', 'Plan'], ['/waiting', 'Waiting for you'], ['/posts', 'Posts'], ['/channels', 'Channels'], ['/settings', 'Settings']]

export function Nav({ waiting, planDraft }: { waiting: number; planDraft: boolean }) {
  const path = usePathname()
  return (
    <nav className="side-nav" aria-label="Admin">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          {label}{href === '/waiting' && waiting > 0 && <span className="count">{waiting}</span>}{href === '/plan' && planDraft && <span className="count">!</span>}
        </Link>
      ))}
    </nav>
  )
}
