import { currentProduct } from '@/lib/current'
import { WaitingSection } from '../sections/waiting'
import { Page } from '../sections/frame'

export default async function Waiting({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const p = await currentProduct()
  return <Page title="Waiting for you" msg={(await searchParams).msg}>{p ? <WaitingSection p={p} /> : <NoProduct />}</Page>
}
const NoProduct = () => <p>No product yet. Add one in <a href="/settings">Settings</a>.</p>
