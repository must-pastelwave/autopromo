'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Step } from '@/lib/journey'

// Each page opens at the step where it starts to make sense; earlier, it is shown locked with the reason.
const ITEMS: { href: string; label: string; from: Step | null; why: string }[] = [
  { href: '/', label: 'Home', from: null, why: '' },
  { href: '/plan', label: 'Plan', from: 'plan', why: 'after research and channels' },
  { href: '/waiting', label: 'Waiting for you', from: 'running', why: 'once a plan is confirmed' },
  { href: '/posts', label: 'Posts', from: 'running', why: 'once a plan is confirmed' },
  { href: '/channels', label: 'Channels', from: 'channels', why: 'after research' },
  { href: '/settings', label: 'Settings', from: null, why: '' },
]
const ORDER: Step[] = ['research', 'channels', 'plan', 'running']

export function Nav({ waiting, planDraft, step }: { waiting: number; planDraft: boolean; step: Step | null }) {
  const path = usePathname()
  const reached = (from: Step | null) => from === null || (step !== null && ORDER.indexOf(step) >= ORDER.indexOf(from))
  return (
    <nav className="side-nav" aria-label="Admin">
      {ITEMS.map(({ href, label, from, why }) => reached(from) ? (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          {label}{href === '/waiting' && waiting > 0 && <span className="count">{waiting}</span>}{href === '/plan' && planDraft && <span className="count">!</span>}
        </Link>
      ) : (
        <span key={href} className="locked" title={`Opens ${why}`}>{label}<span className="lock" aria-label={`opens ${why}`}>🔒</span></span>
      ))}
    </nav>
  )
}
