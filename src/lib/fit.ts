const MAX = 140

export function fontSizeFor(text: string): number {
  const n = [...text].length
  return n <= 40 ? 64 : n <= 80 ? 52 : 44
}

export function clip(text: string): string {
  const chars = [...text]
  return chars.length > MAX ? chars.slice(0, MAX).join('') + '…' : text
}
