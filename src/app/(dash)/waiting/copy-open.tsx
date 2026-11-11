'use client'
import { useState } from 'react'

export function CopyOpen({ text, href }: { text: string; href: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true) } catch { setDone(false) }
      window.open(href, '_blank', 'noopener')
    }}>
      {done ? 'Copied ✓ — paste it there' : 'Copy & open'}
    </button>
  )
}
