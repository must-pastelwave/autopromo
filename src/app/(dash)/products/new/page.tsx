import { ProductForm } from '../../sections/settings'
import { Page } from '../../sections/frame'

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  return (
    <Page title="Add a product" msg={(await searchParams).msg}>
      <ProductForm />
    </Page>
  )
}
