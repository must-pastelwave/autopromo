import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'autopromo', description: 'Hands-off social promotion' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
