import { redirect } from 'next/navigation'

// The dashboard is one page now; old tab addresses jump to their section.
export default async function Old({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString()
  redirect(`/${q ? `?${q}` : ''}#channels`)
}
