import { test, expect } from 'vitest'
import { nextSlot } from './slots'

const D = (s: string) => new Date(s)

test('Seoul day starts before UTC day: 23:30Z is 08:30 KST next day', () =>
  expect(nextSlot({ now: D('2026-11-11T23:30:00Z'), tz: 'Asia/Seoul', perDay: 2, startedAt: null, taken: [] }))
    .toEqual(D('2026-11-12T00:07:00Z')))

test('taken slot rolls to the next slot the same day', () =>
  expect(nextSlot({ now: D('2026-11-11T23:30:00Z'), tz: 'Asia/Seoul', perDay: 2, startedAt: null, taken: [D('2026-11-12T00:07:00Z')] }))
    .toEqual(D('2026-11-12T06:07:00Z')))   // 15:07 KST

test('slow start halves perDay, so the second post rolls to the next day', () =>
  expect(nextSlot({ now: D('2026-11-11T23:30:00Z'), tz: 'Asia/Seoul', perDay: 2, startedAt: D('2026-11-10T00:00:00Z'), taken: [D('2026-11-12T00:07:00Z')] }))
    .toEqual(D('2026-11-13T00:07:00Z')))

test('slow start ends after 14 days', () =>
  expect(nextSlot({ now: D('2026-11-11T23:30:00Z'), tz: 'Asia/Seoul', perDay: 2, startedAt: D('2026-10-01T00:00:00Z'), taken: [D('2026-11-12T00:07:00Z')] }))
    .toEqual(D('2026-11-12T06:07:00Z')))

test('perDay 1 → 09:07 only; past it means tomorrow', () =>
  expect(nextSlot({ now: D('2026-11-12T01:00:00Z'), tz: 'Asia/Seoul', perDay: 1, startedAt: null, taken: [] }))
    .toEqual(D('2026-11-13T00:07:00Z')))

test('needs 10 minutes of lead time', () =>
  expect(nextSlot({ now: D('2026-11-12T00:00:00Z'), tz: 'Asia/Seoul', perDay: 1, startedAt: null, taken: [] }))
    .toEqual(D('2026-11-13T00:07:00Z')))

test('other timezones work (New York, EST)', () =>
  expect(nextSlot({ now: D('2026-11-11T12:00:00Z'), tz: 'America/New_York', perDay: 1, startedAt: null, taken: [] }))
    .toEqual(D('2026-11-11T14:07:00Z')))
