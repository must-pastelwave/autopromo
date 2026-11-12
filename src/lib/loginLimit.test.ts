import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { loginAllowed, recordLoginFailure, LOGIN_MAX_FAILURES } from './loginLimit'

beforeEach(async () => { await sql`delete from login_failures` })

test(`allowed until ${'LOGIN_MAX_FAILURES'} recent failures, old failures don't count`, async () => {
  await sql`insert into login_failures (at) select now() - interval '1 hour' from generate_series(1, 50)`
  expect(await loginAllowed()).toBe(true)
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await recordLoginFailure()
  expect(await loginAllowed()).toBe(true)
  await recordLoginFailure()
  expect(await loginAllowed()).toBe(false)
})
