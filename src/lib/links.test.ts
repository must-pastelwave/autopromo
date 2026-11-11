import { test, expect } from 'vitest'
import { trackedUrl, isBot, newCode } from './links'

test('utm keeps existing params', () =>
  expect(trackedUrl('https://l2u.co.kr/?a=1', { channel: 'threads', postId: 7, topic: 'x' }))
    .toBe('https://l2u.co.kr/?a=1&utm_source=threads&utm_medium=social&utm_campaign=autopromo&utm_content=7'))
test.each(['facebookexternalhit/1.1', 'meta-externalagent/1.1', 'Threadsbot', 'Googlebot', null, ''])
  ('bot: %s', ua => expect(isBot(ua)).toBe(true))
test('real phone', () =>
  expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 350.0')).toBe(false))
test('code shape', () => expect(newCode()).toMatch(/^[a-z0-9]{8}$/))
test('codes differ', () => expect(new Set(Array.from({ length: 200 }, newCode)).size).toBe(200))
