import { test, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
import { renderVideo, SECONDS_PER_SLIDE } from './video'

const run = promisify(execFile)

/** A solid-colour 1080x1920 PNG made by ffmpeg itself. */
async function png(color: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'png-'))
  const out = join(dir, 'p.png')
  await run(ffmpeg!, ['-f', 'lavfi', '-i', `color=c=${color}:s=1080x1920`, '-frames:v', '1', out])
  const { readFile } = await import('node:fs/promises')
  return readFile(out)
}

test('renders one vertical mp4 with audio, SECONDS_PER_SLIDE per slide', async () => {
  const mp4 = await renderVideo([await png('red'), await png('green'), await png('blue')])
  expect(mp4.subarray(4, 8).toString()).toBe('ftyp')
  const dir = await mkdtemp(join(tmpdir(), 'mp4-'))
  await writeFile(join(dir, 'v.mp4'), mp4)
  // ffmpeg -i prints stream info to stderr and exits non-zero (no output file); that's fine here.
  const info = await run(ffmpeg!, ['-i', join(dir, 'v.mp4')]).catch(e => e)
  const err = String(info.stderr)
  expect(err).toMatch(/1080x1920/)
  expect(err).toMatch(/Audio: aac/)
  const [, h, m, s] = err.match(/Duration: (\d+):(\d+):([\d.]+)/)!
  expect(Number(h) * 3600 + Number(m) * 60 + Number(s)).toBeCloseTo(3 * SECONDS_PER_SLIDE, 0)
}, 60_000)

test('refuses fewer than one slide', async () => {
  await expect(renderVideo([])).rejects.toThrow(/no slides/)
})
