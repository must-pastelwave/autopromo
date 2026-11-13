import { currentProduct } from '@/lib/current'
import { SettingsSection, settingsTab } from '../sections/settings'
import { Page } from '../sections/frame'

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; tab?: string }> }) {
  const { msg, tab } = await searchParams
  return <Page title="Settings" msg={msg}><SettingsSection p={await currentProduct()} tab={settingsTab(tab)} /></Page>
}
