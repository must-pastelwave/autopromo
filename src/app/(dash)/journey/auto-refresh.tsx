'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-render the page every 15 seconds while an agent run is in progress. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
