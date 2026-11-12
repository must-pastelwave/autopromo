import { currentProduct } from '@/lib/current'
import { ChannelsSection } from '../sections/channels'
import { Page } from '../sections/frame'

export default async function Channels({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const p = await currentProduct()
  return <Page title="Channels" msg={(await searchParams).msg}>{p ? <ChannelsSection p={p} /> : <p>No product yet. Add one in <a href="/settings">Settings</a>.</p>}</Page>
}
