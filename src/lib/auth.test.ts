import { test, expect, beforeEach } from 'vitest'
import { checkAgent, sessionValue, isOwnerCookie, bearerMatches } from './auth'

const req = (h?: string) => new Request('http://x/api/agent/products', { headers: h ? { authorization: h } : {} })

beforeEach(() => { process.env.AGENT_TOKEN = 'secret-token'; process.env.DASHBOARD_PASSWORD = 'pw' })

test('right token', () => expect(checkAgent(req('Bearer secret-token'))).toBe(true))
test('wrong token', () => expect(checkAgent(req('Bearer nope'))).toBe(false))
test('missing header', () => expect(checkAgent(req())).toBe(false))
test('unset AGENT_TOKEN rejects everything', () => {
  delete process.env.AGENT_TOKEN
  expect(checkAgent(req('Bearer '))).toBe(false)
  expect(checkAgent(req('Bearer undefined'))).toBe(false)
})
test('owner cookie matches session value', () => expect(isOwnerCookie(sessionValue())).toBe(true))
test('owner cookie rejects junk and unset password', () => {
  expect(isOwnerCookie('junk')).toBe(false)
  expect(isOwnerCookie(undefined)).toBe(false)
  const v = sessionValue(); delete process.env.DASHBOARD_PASSWORD
  expect(isOwnerCookie(v)).toBe(false)
})

test('bearerMatches: exact secret only, unset secret never', () => {
  expect(bearerMatches(req('Bearer s3'), 's3')).toBe(true)
  expect(bearerMatches(req('Bearer s3x'), 's3')).toBe(false)
  expect(bearerMatches(req(), 's3')).toBe(false)
  expect(bearerMatches(req('Bearer '), undefined)).toBe(false)
  expect(bearerMatches(req('Bearer '), '')).toBe(false)
})
