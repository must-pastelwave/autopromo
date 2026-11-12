import { test, expect, beforeEach } from 'vitest'
import { sql } from './db'
import { resetDb, seed } from '@/test/db'
import { requestRun, reportRun, runStatus } from './runs'

beforeEach(resetDb)

test('queued by the owner → running when the workflow starts → done, with times', async () => {
  const { productId } = await seed()
  await requestRun(productId, 'planner')
  expect(await runStatus(productId)).toMatchObject({ status: 'queued', jobs: 'planner' })
  await reportRun({ ghRunId: 77, jobs: 'planner', productIds: [productId], status: 'running', url: 'https://github.test/run/77' })
  const r = await runStatus(productId)
  expect(r).toMatchObject({ status: 'running', jobs: 'planner', url: 'https://github.test/run/77' })
  expect(r!.startedAt).toBeInstanceOf(Date)
  expect((await sql`select count(*)::int as n from agent_runs`)[0].n).toBe(1)
  await reportRun({ ghRunId: 77, jobs: 'planner', productIds: [productId], status: 'done' })
  expect(await runStatus(productId)).toMatchObject({ status: 'done' })
})

test('typical duration comes from recent finished runs of the same job', async () => {
  const { productId } = await seed()
  await sql`insert into agent_runs (jobs, product_ids, status, started_at, finished_at) values
    ('planner', ${[productId]}, 'done', now() - interval '10 min', now() - interval '7 min'),
    ('researcher planner', ${[productId]}, 'done', now() - interval '30 min', now() - interval '25 min')`
  await requestRun(productId, 'planner')
  const r = await runStatus(productId)
  expect(r!.typicalMinutes).toBe(4)
})

test('a run for another product does not show here; no runs → null', async () => {
  const a = await seed()
  expect(await runStatus(a.productId)).toBeNull()
  await reportRun({ ghRunId: 5, jobs: 'writer', productIds: [a.productId + 100], status: 'running' })
  expect(await runStatus(a.productId)).toBeNull()
})

test('a writer/reviewer run with no product ids counts for every active product and clears their queued requests', async () => {
  const { productId } = await seed()
  await requestRun(productId, 'writer reviewer')
  await reportRun({ ghRunId: 9, jobs: 'writer reviewer', productIds: [], status: 'running' })
  expect(await runStatus(productId)).toMatchObject({ status: 'running', jobs: 'writer reviewer' })
  await reportRun({ ghRunId: 9, jobs: 'writer reviewer', productIds: [], status: 'done' })
  expect(await runStatus(productId)).toMatchObject({ status: 'done' })
})
