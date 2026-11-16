'use client'
import { selectProduct } from './actions'

/** Picking a product switches right away. Keyed by the current product, so the list always shows the one the pages show. */
export function ProductSwitch({ products, current }: { products: { slug: string; name: string }[]; current?: string }) {
  return (
    <form action={selectProduct} className="switch" key={current}>
      <label htmlFor="product">Product</label>
      <select id="product" name="slug" defaultValue={current} onChange={e => e.currentTarget.form?.requestSubmit()}>
        {products.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
      </select>
    </form>
  )
}
