import { test, expect } from 'vitest'
import { fontSizeFor, clip } from './fit'

test('short text is large', () => expect(fontSizeFor('가'.repeat(20))).toBe(64))
test('medium text', () => expect(fontSizeFor('가'.repeat(60))).toBe(52))
test('long text', () => expect(fontSizeFor('가'.repeat(120))).toBe(44))
test('boundaries', () => { expect(fontSizeFor('가'.repeat(40))).toBe(64); expect(fontSizeFor('가'.repeat(80))).toBe(52) })
test('clip over 140', () => { const c = clip('가'.repeat(150)); expect(c.length).toBe(141); expect(c.endsWith('…')).toBe(true) })
test('clip leaves short text', () => expect(clip('짧은 팁')).toBe('짧은 팁'))
