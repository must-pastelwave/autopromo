import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'

const run = promisify(execFile)
export const SECONDS_PER_SLIDE = 3.5

/** Slide PNGs (1080x1920) → a silent-audio H.264 mp4 for TikTok and YouTube Shorts. */
export async function renderVideo(slides: Buffer[]): Promise<Buffer> {
  if (!slides.length) throw new Error('no slides to render')
  if (!ffmpeg) throw new Error('ffmpeg binary missing')
  const dir = await mkdtemp(join(tmpdir(), 'video-'))
  try {
    await Promise.all(slides.map((s, i) => writeFile(join(dir, `s${i}.png`), s)))
    const out = join(dir, 'out.mp4')
    await run(ffmpeg, [
      '-y', '-framerate', `1/${SECONDS_PER_SLIDE}`, '-i', join(dir, 's%d.png'),
      // A silent track: some players and apps treat audio-less videos as broken.
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', 'scale=1080:1920,format=yuv420p', '-r', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '23',
      '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out,
    ], { maxBuffer: 10 * 1024 * 1024 })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
