import { connection } from 'next/server'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { selectProduct } from './actions'
import { Tabs } from './tabs'

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  await connection() // always per request: never touch the database at build time
  const products = await sql`select slug, name from products order by id`
  const current = await currentProduct()
  const [{ n }] = current
    ? await sql`select count(*)::int as n from posts where product_id = ${current.id} and status = 'waiting'`
    : [{ n: 0 }]
  return (
    <>
      <header className="top">
        <strong>autopromo</strong>
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
      <Tabs waiting={n} />
      <main>{children}</main>
    </>
  )
}
