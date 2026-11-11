import { test, expect } from 'vitest'
import { findBanned, DEFAULT_BANNED } from './rules'

test('finds defaults', () => expect(findBanned('지금 최저가 보장!', [])).toEqual(['최저가 보장']))
test('ignores spacing', () => expect(findBanned('마감임박', [])).toEqual(['마감 임박']))
test('product words', () => expect(findBanned('Best DEAL ever', ['best deal'])).toEqual(['best deal']))
test('clean text', () => expect(findBanned('겨울 삿포로 여행 팁', [])).toEqual([]))
test('defaults list', () => expect(DEFAULT_BANNED).toEqual(['최저가 보장', '마감 임박', '100%']))
test('blank product word never matches everything', () => expect(findBanned('hello', ['', '  '])).toEqual([]))
