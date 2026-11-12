import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed } from '@/test/db'
import { journeyFor } from './journey'

beforeEach(resetDb)
const step = async (id: number) => (await journeyFor(id))!.step

test('research → channels → plan → running, in that order', async () => {
  const { productId } = await seed({ account: null })
  await sql`update products set fact_sheet = '[]'`
  await sql`update channels set enabled = false`
  expect(await step(productId)).toBe('research')
  await sql`update products set fact_sheet = ${sql.json([{ fact: 'a', source_url: 'https://x.test/' }])}`
  expect(await step(productId)).toBe('channels')
  await sql`update channels set enabled = true`
  expect(await step(productId)).toBe('plan')
  const [pl] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date, current_date + 27) returning id`
  const j = await journeyFor(productId)
  expect(j).toMatchObject({ step: 'plan', draft: { id: pl.id, status: 'draft' } })
  await sql`update plans set status = 'confirmed'`
  expect(await journeyFor(productId)).toMatchObject({ step: 'running', running: { id: pl.id }, unconnected: ['threads'] })
})

test('running with the next plan waiting for confirmation', async () => {
  const { productId } = await seed()
  await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', current_date - 24, current_date + 3)`
  const [next] = await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'draft', current_date + 4, current_date + 31) returning id`
  expect(await journeyFor(productId)).toMatchObject({ step: 'running', draft: { id: next.id }, unconnected: [] })
})

test('a confirmed plan that starts later still counts as running', async () => {
  const { productId } = await seed()
  await sql`insert into plans (product_id, status, starts_on, ends_on) values (${productId}, 'confirmed', current_date + 2, current_date + 29)`
  expect(await step(productId)).toBe('running')
})

test('unknown product → null', async () => expect(await journeyFor(999)).toBeNull())
