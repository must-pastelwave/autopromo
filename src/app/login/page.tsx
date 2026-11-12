import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHash, timingSafeEqual } from 'node:crypto'
import { SESSION_COOKIE, sessionValue } from '@/lib/auth'
import { loginAllowed, recordLoginFailure } from '@/lib/loginLimit'

const digest = (s: string) => createHash('sha256').update(s).digest()

async function login(form: FormData) {
  'use server'
  const pw = process.env.DASHBOARD_PASSWORD
  const given = String(form.get('password') ?? '')
  if (!(await loginAllowed())) redirect('/login?e=wait')
  if (!pw || !timingSafeEqual(digest(given), digest(pw))) {
    await recordLoginFailure()
    redirect('/login?e=1')
  }
  ;(await cookies()).set(SESSION_COOKIE, sessionValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  redirect('/')
}

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams
  return (
    <main style={{ maxWidth: 320, margin: '20vh auto', padding: 16 }}>
      <h1>autopromo</h1>
      <form action={login} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" autoFocus required />
        <button type="submit">Sign in</button>
        {e && <p role="alert">{e === 'wait' ? 'Too many wrong passwords. Try again in 15 minutes.' : 'Wrong password.'}</p>}
      </form>
    </main>
  )
}
