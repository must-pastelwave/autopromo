import { currentProduct } from '@/lib/current'
import { SettingsSection } from '../sections/settings'
import { Page } from '../sections/frame'

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  return <Page title="Settings" msg={(await searchParams).msg}><SettingsSection p={await currentProduct()} /></Page>
}
