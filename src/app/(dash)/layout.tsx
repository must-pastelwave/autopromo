import Link from 'next/link'
import { connection } from 'next/server'
import { sql } from '@/lib/db'
import { currentProduct } from '@/lib/current'
import { selectProduct } from './actions'
import { Nav } from './nav'

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  await connection() // always per request: never touch the database at build time
  const products = await sql`select slug, name from products order by id`
  const current = await currentProduct()
  const [{ n, draft }] = current
    ? await sql`select count(*)::int as n, exists (select 1 from plans where product_id = ${current.id} and status = 'draft') as draft
        from posts where product_id = ${current.id} and status = 'waiting'`
    : [{ n: 0, draft: false }]
  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="title">autopromo</div>
        {products.length > 0 && (
          <form action={selectProduct} className="switch">
            <label htmlFor="product">Product</label>
            <div className="row">
              <select id="product" name="slug" defaultValue={current?.slug}>
                {products.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
              <button className="ghost" type="submit">Go</button>
            </div>
          </form>
        )}
        <Link href="/products/new" className="add-product">+ Add product</Link>
        <Nav waiting={n} planDraft={draft} />
      </aside>
      <main>{children}</main>
    </div>
  )
}
