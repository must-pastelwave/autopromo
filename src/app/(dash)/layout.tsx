import { connection } from 'next/server'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { selectProduct } from './actions'

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  await connection() // always per request: never touch the database at build time
  const products = await sql`select slug, name from products order by id`
  const current = await currentProduct()
  return (
    <>
      <header className="top">
        <div className="brand"><span className="title">autopromo</span>{current && <span className="muted"> · {current.name}</span>}</div>
        <nav className="jump" aria-label="Sections">
          <a href="#waiting">Waiting</a><a href="#channels">Channels</a><a href="#posts">Posts</a><a href="#settings">Settings</a>
        </nav>
        {products.length > 0 && (
          <form action={selectProduct} className="row">
            <label htmlFor="product" style={{ display: 'contents' }}>Product</label>
            <select id="product" name="slug" defaultValue={current?.slug}>
              {products.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
            <button className="ghost" type="submit">Switch</button>
          </form>
        )}
      </header>
      <main>{children}</main>
    </>
  )
}
