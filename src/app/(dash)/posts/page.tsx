import { currentProduct } from '@/lib/current'
import { PostsSection } from '../sections/posts'
import { Page } from '../sections/frame'
import { RunStatus } from '../journey/run-status'

export default async function Posts({ searchParams }: { searchParams: Promise<{ msg?: string; status?: string }> }) {
  const { msg, status } = await searchParams
  const p = await currentProduct()
  return <Page title="Posts" msg={msg}>{p ? <><RunStatus productId={p.id} /><PostsSection p={p} status={status} /></> : <p>No product yet. Add one in <a href="/settings">Settings</a>.</p>}</Page>
}
