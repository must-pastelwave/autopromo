export const DEFAULT_BANNED = ['최저가 보장', '마감 임박', '100%']

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** Every banned phrase found in text: case-insensitive, whitespace ignored. */
export function findBanned(text: string, extra: string[]): string[] {
  const t = norm(text)
  return [...DEFAULT_BANNED, ...extra].filter(p => norm(p) && t.includes(norm(p)))
}
