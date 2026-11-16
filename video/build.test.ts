import { test, expect } from 'vitest'
import { buildComposition, beatSeconds, countParts } from './build.mjs'

test('one timed clip per beat, the film as long as its beats, the hook on screen at frame 0', () => {
  const { html, duration } = buildComposition({ language: 'en', slides: [
    { text: 'Your AI writes *slow* code' },
    { look: 'terminal', text: '$ npx skills add x\nInstalled 12 skills' },
    { look: 'count', text: '3.2x faster' },
    { text: 'Part 2 tomorrow' },
  ] })
  expect(html.match(/class="clip beat"/g)).toHaveLength(4)
  expect(html).toContain(`data-composition-id="main" data-start="0" data-duration="${duration}"`)
  expect(html).not.toMatch(/fromTo\("#b0 \.(w|line)"/)   // beat 0 has no entrance: it is the thumbnail
  expect(html).toContain('<span class="w accent">slow</span>')
  expect(html).toContain('count("#b2n", 3.2, 1, false')
  expect(duration).toBeGreaterThan(8)
  expect(duration).toBeLessThan(25)
})

test('text is escaped, multi-word accents work', () => {
  const { html } = buildComposition({ language: 'ko', slides: [{ text: '<b>hi</b> *rate limits* now' }, { text: 'b' }, { text: 'c' }] })
  expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
  expect(html).toContain('<span class="w accent">rate</span> <span class="w accent">limits</span> <span class="w">now</span>')
})

test('holds: longer lines stay longer, the last line at least 2.6 s, terminals by what is typed', () => {
  expect(beatSeconds({ text: 'one two' }, false)).toBe(1.3)
  expect(beatSeconds({ text: 'one two three four five six seven' }, false)).toBeGreaterThan(2.5)
  expect(beatSeconds({ text: 'end' }, true)).toBe(2.6)
  expect(beatSeconds({ look: 'terminal', text: '$ ' + 'x'.repeat(40) }, false))
    .toBeGreaterThan(beatSeconds({ look: 'terminal', text: '$ ls' }, false))
})

test('countParts finds the number and its format', () => {
  expect(countParts('3.2x faster')).toMatchObject({ value: 3.2, decimals: 1, before: '', after: 'x faster' })
  expect(countParts('$1,200 saved')).toMatchObject({ value: 1200, commas: true, before: '$' })
  expect(countParts('no number')).toBeNull()
})
