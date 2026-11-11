import { test, expect } from 'vitest'
import { parseFactLines } from './facts'

test('parses fact lines', () =>
  expect(parseFactLines('회원 할인가 제공 | https://l2u.co.kr/\n\n국내외 호텔 | https://l2u.co.kr/a'))
    .toEqual([{ fact: '회원 할인가 제공', source_url: 'https://l2u.co.kr/' }, { fact: '국내외 호텔', source_url: 'https://l2u.co.kr/a' }]))
test('fact text may contain a pipe; the last one splits', () =>
  expect(parseFactLines('A | B | https://x.kr/')).toEqual([{ fact: 'A | B', source_url: 'https://x.kr/' }]))
test('missing source → error naming the line', () =>
  expect(parseFactLines('ok | https://x.kr/\nno source here')).toBe('line 2: use "fact | https://source-page"'))
