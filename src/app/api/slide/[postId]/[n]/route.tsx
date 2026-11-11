import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from '@/lib/db'
import { clip, fontSizeFor } from '@/lib/fit'

type Slide = { text: string; photo_url?: string | null; photo_credit?: string | null }

const AREA_NOTE = '이미지는 지역 사진입니다'
let font: Promise<Buffer> | undefined

// GET /api/slide/<postId>/<n>.png — the ".png" suffix lets Zernio infer the media type.
export async function GET(_req: Request, { params }: { params: Promise<{ postId: string; n: string }> }) {
  const { postId, n } = await params
  const id = parseInt(postId, 10), idx = parseInt(n, 10)
  if (!Number.isInteger(id) || !Number.isInteger(idx)) return new Response('Not found', { status: 404 })
  const [post] = await sql`select slides from posts where id = ${id}`
  const slide: Slide | undefined = post?.slides?.[idx]
  if (!slide) return new Response('Not found', { status: 404 })

  font ??= readFile(join(process.cwd(), 'assets/fonts/NotoSansKR-Bold.otf'))
  const text = clip(slide.text)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#1f3a5f', fontFamily: 'Noto Sans KR' }}>
        {slide.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.photo_url} alt="" width={1080} height={1350} style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />
        )}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', padding: 72,
          ...(slide.photo_url ? { backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.78))' } : {}),
        }}>
          <div style={{ color: 'white', fontSize: fontSizeFor(text), lineHeight: 1.35, display: 'flex', flexWrap: 'wrap' }}>{text}</div>
          {slide.photo_url && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, color: 'rgba(255,255,255,0.8)', fontSize: 22 }}>
              <span>{slide.photo_credit ? `Photo: ${slide.photo_credit}` : ''}</span>
              <span>{AREA_NOTE}</span>
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1080, height: 1350,
      fonts: [{ name: 'Noto Sans KR', data: await font, weight: 700, style: 'normal' }],
      headers: { 'cache-control': 'public, max-age=86400' },
    },
  )
}
