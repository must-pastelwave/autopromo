import { test, expect } from 'vitest'
import { trackedUrl, isBot, newCode } from './links'

test('utm keeps existing params', () =>
  expect(trackedUrl('https://l2u.co.kr/?a=1', { channel: 'threads', postId: 7, topic: 'x' }))
    .toBe('https://l2u.co.kr/?a=1&utm_source=threads&utm_medium=social&utm_campaign=autopromo&utm_content=7'))
test.each(['facebookexternalhit/1.1', 'meta-externalagent/1.1', 'Threadsbot', 'Googlebot', null, ''])
  ('bot: %s', ua => expect(isBot(ua)).toBe(true))
test.each(['Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)', 'Daum/4.1', 'kakaotalk-scrap/1.0', 'WhatsApp/2.23.20.0'])
  ('korean and messenger previews: %s', ua => expect(isBot(ua)).toBe(true))
test('kakaotalk in-app browser is a real person', () =>
  expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) KAKAOTALK 10.4.5')).toBe(false))
test('real phone', () =>
  expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 350.0')).toBe(false))
test('code shape', () => expect(newCode()).toMatch(/^[a-z0-9]{8}$/))
test('codes differ', () => expect(new Set(Array.from({ length: 200 }, newCode)).size).toBe(200))

test('click id is passed on and the #fragment stays last', () =>
  expect(trackedUrl('https://stay2u.com/#membership', { channel: 'instagram', postId: 7, topic: 'x', clickId: 9 }))
    .toBe('https://stay2u.com/?utm_source=instagram&utm_medium=social&utm_campaign=autopromo&utm_content=7&ap_click=9#membership'))
