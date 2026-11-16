// A post's beats → one HyperFrames composition (index.html), rendered to a 9:16 mp4 by `hyperframes render`.
// Usage: node video/build.mjs <post.json> <outDir>   (post.json: {slides: [{text, look?, voice?}], language})
// With HYPERFRAMES_TTS=1 each beat is also narrated by Kokoro (`hyperframes tts`, free, on the runner) and held
// until its line is spoken; languages Kokoro can't speak (Korean) stay silent.
// House style follows the hyperframes skill (references/motion.md, types/vertical.md): the hook is on screen at
// frame 0, text lands and holds still, words blur in, exits are short, everything sits inside the safe band.
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 1080, H = 1920
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const round = n => Math.round(n * 100) / 100

/** How long a beat stays up. A line to read: 0.5 s + 0.3 s a word (motion.md "Holds"). */
export function beatSeconds(b, last) {
  if (b.look === 'terminal') {
    const lines = b.text.split('\n')
    const typed = lines.filter(l => l.startsWith('$ ')).reduce((n, l) => n + l.length - 2, 0)
    return round(Math.min(9, 0.4 + typed * 0.035 + lines.length * 0.15 + 1.6))
  }
  const words = b.text.replace(/\*/g, '').split(/\s+/).filter(Boolean).length
  const read = b.look === 'count' ? 1.4 + 0.5 + 0.3 * words : 0.5 + 0.3 * words
  return round(Math.max(last ? 2.6 : 1.3, Math.min(4, read + 0.2)))
}

/** "*word*" (or "*a few words*") marks the accent. */
const wordsHtml = text => {
  let on = false
  return text.split(/\s+/).filter(Boolean).map(w => {
    if (w.startsWith('*')) on = true
    const accent = on
    if (/\*[.,!?:]?$/.test(w)) on = false
    return `<span class="w${accent ? ' accent' : ''}">${esc(w.replace(/\*/g, ''))}</span>`
  }).join(' ')
}

const sizeFor = text => {
  const n = text.replace(/\*/g, '').length
  return n <= 14 ? 150 : n <= 26 ? 128 : n <= 40 ? 108 : 88
}

/** The first number in a count beat, and how to print it while it counts up. */
export function countParts(text) {
  const m = text.match(/(\d[\d,]*(?:\.\d+)?)/)
  if (!m) return null
  const raw = m[1], value = Number(raw.replace(/,/g, ''))
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0
  return { before: text.slice(0, m.index), value, decimals, commas: raw.includes(','), after: text.slice(m.index + raw.length) }
}

function beatHtml(b, i) {
  if (b.look === 'terminal') {
    const lines = b.text.split('\n').map((l, j) => l.startsWith('$ ')
      ? `<div class="tl cmd"><span class="ps">$</span> ${[...l.slice(2)].map(c => `<span class="ch">${esc(c)}</span>`).join('')}</div>`
      : `<div class="tl out" id="b${i}o${j}">${esc(l) || '&nbsp;'}</div>`).join('')
    return `<div class="term" id="b${i}t"><div class="bar"><i></i><i></i><i></i></div><div class="body">${lines}</div></div>`
  }
  if (b.look === 'count') {
    const c = countParts(b.text)
    return `<div class="line count"><div class="big"><span class="pre">${esc(c.before)}</span><span class="num" id="b${i}n">0</span><span class="pre">${esc(c.after.split(/\s+/)[0] ?? '')}</span></div>`
      + `<div class="sub" id="b${i}s">${wordsHtml(c.after.split(/\s+/).slice(1).join(' '))}</div></div>`
  }
  return `<div class="line" style="font-size:${sizeFor(b.text)}px">${wordsHtml(b.text)}</div>`
}

/** GSAP for one beat, in film time. Entrances vary by beat (motion.md "Titles"); beat 0 is already on screen. */
function beatJs(b, i, t, d) {
  const sel = `#b${i}`, end = round(t + d)
  // A spoken line: its words arrive as they are said (an estimate spread over the clip; Kokoro gives no word times).
  if (b.spoken && b.look === 'say' && i > 0) {
    const words = b.text.split(/\s+/).filter(Boolean).length
    const stagger = round(Math.min(0.35, Math.max(0.067, (b.spoken * 0.85) / words)))
    const out = [`tl.fromTo("${sel} .w", {opacity: 0, filter: "blur(6px)"}, {opacity: 1, filter: "blur(0px)", duration: 0.13, stagger: ${stagger}}, ${round(t + 0.05)});`]
    if (/\*/.test(b.text)) out.push(`tl.fromTo("${sel} .accent", {color: "#ffffff"}, {color: "#ffd23f", duration: 0.2}, ${round(t + 0.6)});`)
    if (!b.last) out.push(`tl.to("${sel} .line", {opacity: 0, filter: "blur(8px)", duration: 0.15, ease: "power3.in"}, ${round(end - 0.17)});`)
    return out.join('\n')
  }
  const out = []
  if (b.look === 'terminal') {
    const lines = b.text.split('\n')
    out.push(`tl.fromTo("${sel} .term", {x: 220, filter: "blur(14px)", opacity: 0}, {x: 0, filter: "blur(0px)", opacity: 1, duration: 0.3, ease: "expo.out"}, ${t});`)
    let at = t + 0.4
    lines.forEach((l, j) => {
      if (l.startsWith('$ ')) {
        out.push(`tl.fromTo(${JSON.stringify(`${sel} .tl:nth-child(${j + 1}) .ch`)}, {opacity: 0}, {opacity: 1, duration: 0.01, stagger: 0.035}, ${round(at)});`)
        at += (l.length - 2) * 0.035 + 0.3
      } else {
        out.push(`tl.fromTo("#b${i}o${j}", {opacity: 0}, {opacity: 1, duration: 0.01}, ${round(at)});`)
        at += 0.15
      }
    })
    // A punch-in on the result: a camera move, not a creeping scale.
    out.push(`tl.to("${sel} .term", {scale: 1.04, duration: 0.45, ease: "power2.inOut"}, ${round(Math.min(at, end - 0.9))});`)
    out.push(`tl.to("${sel} .term", {x: -220, filter: "blur(14px)", opacity: 0, duration: 0.18, ease: "power3.in"}, ${round(end - 0.2)});`)
    return out.join('\n')
  }
  if (b.look === 'count') {
    const c = countParts(b.text)
    out.push(`tl.fromTo("${sel} .big", {scale: 1.25, filter: "blur(10px)", opacity: 0}, {scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.35, ease: "expo.out"}, ${t});`)
    out.push(`count("#b${i}n", ${c.value}, ${c.decimals}, ${c.commas}, ${round(t + 0.1)}, 1.3);`)
    out.push(`tl.fromTo("${sel} .sub .w", {opacity: 0, filter: "blur(6px)"}, {opacity: 1, filter: "blur(0px)", duration: 0.13, stagger: 0.067}, ${round(t + 1.2)});`)
  } else if (i > 0) {
    const kind = i % 3
    if (kind === 1) out.push(`tl.fromTo("${sel} .w", {opacity: 0, filter: "blur(6px)"}, {opacity: 1, filter: "blur(0px)", duration: 0.13, stagger: 0.067}, ${t});`)
    if (kind === 2) out.push(`tl.fromTo("${sel} .w", {color: "#4a5368"}, {color: "#ffffff", duration: 0.1, stagger: 0.08}, ${t});`)
    if (kind === 0) out.push(`tl.fromTo("${sel} .line", {opacity: 0, filter: "blur(8px)", scale: 1.06}, {opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.2, ease: "expo.out"}, ${t});`)
  }
  // The accent word gets its colour a beat after the line lands (the hook too, so frame 0 still shows the whole line).
  if (/\*/.test(b.text)) out.push(`tl.fromTo("${sel} .accent", {color: "#ffffff"}, {color: "#ffd23f", duration: 0.2}, ${round(t + (i === 0 ? 0.4 : 0.6))});`)
  if (!b.last) out.push(`tl.to("${sel} .line", {opacity: 0, filter: "blur(8px)", duration: 0.15, ease: "power3.in"}, ${round(end - 0.17)});`)
  return out.join('\n')
}

/** What the narrator says on a beat: its `voice`, else a say/count line as written; a terminal is silent unless given one. */
export const spokenText = s => typeof s.voice === 'string' ? s.voice : s.look === 'terminal' ? '' : s.text.replace(/\*/g, '')

/** voices: seconds of narration per beat index (files at assets/voice/b<i>.wav). A beat lasts until its line is said. */
export function buildComposition(post, voices = {}) {
  const beats = post.slides.map((s, i, all) => ({ text: s.text, look: s.look ?? 'say', last: i === all.length - 1, spoken: voices[i] }))
  let t = 0
  const timed = beats.map((b, i) => {
    const d = round(Math.max(beatSeconds(b, b.last), b.spoken ? b.spoken + 0.35 : 0))
    const x = { b, i, t: round(t), d }; t += d; return x
  })
  const duration = round(t)
  const clips = timed.map(({ b, i, t, d }) =>
    `<div id="b${i}" class="clip beat" data-start="${t}" data-duration="${d}" data-track-index="1">${beatHtml(b, i)}</div>`
    + (b.spoken ? `\n      <audio id="v${i}" src="assets/voice/b${i}.wav" data-start="${t}" data-duration="${b.spoken}" data-track-index="2"></audio>` : '')).join('\n      ')
  const js = timed.map(({ b, i, t, d }) => beatJs(b, i, t, d)).join('\n')
  const html = `<!doctype html>
<html lang="${esc(post.language || 'en')}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Noto Sans KR"; src: url("assets/fonts/NotoSansKR-Bold.otf"); font-weight: 700; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0a0e1a; }
      #root { width: 100%; height: 100%; font-family: "Inter", "Noto Sans KR", sans-serif; font-weight: 900; color: #fff; }
      .ground { position: absolute; inset: 0; overflow: hidden; }
      .blob { position: absolute; width: 1400px; height: 1400px; border-radius: 50%; opacity: 0.55; }
      .blob.a { left: -500px; top: -300px; background: radial-gradient(circle, #2b4fd8 0%, rgba(43,79,216,0) 65%); }
      .blob.b { left: 200px; top: 900px; background: radial-gradient(circle, #7a2bd8 0%, rgba(122,43,216,0) 65%); }
      .progress { position: absolute; left: 60px; right: 60px; top: 184px; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.15); overflow: hidden; }
      .progress i { display: block; width: 100%; height: 100%; background: #ffd23f; transform-origin: 0 50%; }
      /* Text lives between 168 px and 1330 px and clear of the right-hand action rail (types/vertical.md). */
      .beat .line { position: absolute; left: 60px; width: 840px; top: 430px; height: 760px; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; column-gap: 0.28em; text-align: center; line-height: 1.12; letter-spacing: -0.02em; word-break: keep-all; }
      .count { flex-direction: column; align-items: center; }
      .big { display: flex; align-items: baseline; font-size: 230px; line-height: 1; color: #ffd23f; }
      .big .pre { font-size: 130px; }
      .sub { margin-top: 36px; font-size: 76px; display: flex; flex-wrap: wrap; justify-content: center; column-gap: 0.28em; }
      .term { position: absolute; left: 60px; width: 840px; top: 470px; border-radius: 28px; background: #0d1117; border: 2px solid #283041; box-shadow: 0 40px 120px rgba(0,0,0,0.6); overflow: hidden; }
      .term .bar { height: 64px; display: flex; gap: 14px; align-items: center; padding-left: 28px; background: #161b26; }
      .term .bar i { width: 20px; height: 20px; border-radius: 50%; background: #ff5f57; }
      .term .bar i:nth-child(2) { background: #febc2e; } .term .bar i:nth-child(3) { background: #28c840; }
      .term .body { padding: 36px 36px 44px; font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 40px; line-height: 1.45; }
      .tl { white-space: pre-wrap; word-break: break-all; }
      .tl.out { color: #9aa4b8; font-weight: 400; }
      .ps { color: #28c840; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${W}" data-height="${H}">
      <div class="ground"><div class="blob a"></div><div class="blob b"></div></div>
      <div class="progress"><i></i></div>
      ${clips}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // A count-up that is a function of timeline time (seek-safe).
      function count(sel, value, decimals, commas, at, dur) {
        const el = document.querySelector(sel), o = { v: 0 };
        const show = () => { const s = o.v.toFixed(decimals); el.textContent = commas ? Number(s).toLocaleString("en", { minimumFractionDigits: decimals }) : s; };
        tl.fromTo(o, { v: 0 }, { v: value, duration: dur, ease: "power2.out", onUpdate: show }, at);
      }
      // The ground drifts slowly the whole film: motion behind still text.
      tl.fromTo(".blob.a", { x: 0, y: 0 }, { x: 260, y: 180, duration: ${duration}, ease: "none" }, 0);
      tl.fromTo(".blob.b", { x: 0, y: 0 }, { x: -240, y: -220, duration: ${duration}, ease: "none" }, 0);
      tl.fromTo(".progress i", { scaleX: 0 }, { scaleX: 1, duration: ${duration}, ease: "none" }, 0);
${js}
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
  return { html, duration }
}

/** Kokoro voices by product language (Kokoro has no Korean). */
const VOICES = { en: 'am_michael', es: 'ef_dora', fr: 'ff_siwis', ja: 'jf_alpha', zh: 'zf_xiaobei' }

/** Narrate each beat into outDir/assets/voice; returns seconds per beat. A failed line is left silent, not fatal. */
async function narrate(post, outDir) {
  const voice = VOICES[(post.language || 'en').slice(0, 2)]
  if (!voice || process.env.HYPERFRAMES_TTS !== '1') return {}
  await mkdir(join(outDir, 'assets/voice'), { recursive: true })
  const out = {}
  for (const [i, s] of post.slides.entries()) {
    const text = spokenText(s).trim()
    if (!text) continue
    try {
      const { stdout } = await promisify(execFile)(process.env.HYPERFRAMES_BIN || 'hyperframes',
        ['tts', text, '-v', voice, '-s', '1.1', '-o', join(outDir, `assets/voice/b${i}.wav`), '--json'], { maxBuffer: 1 << 20 })
      const r = JSON.parse(stdout.trim().split('\n').pop())
      if (r.ok && r.durationSeconds > 0) out[i] = round(r.durationSeconds)
    } catch (e) {
      console.error(`beat ${i}: no voice (${e instanceof Error ? e.message.slice(0, 200) : e})`)
    }
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [postFile, outDir] = process.argv.slice(2)
  const post = JSON.parse(await readFile(postFile, 'utf8'))
  const { html, duration } = buildComposition(post, await narrate(post, outDir))
  await mkdir(join(outDir, 'assets/fonts'), { recursive: true })
  await writeFile(join(outDir, 'index.html'), html)
  await copyFile(join(dirname(fileURLToPath(import.meta.url)), '../assets/fonts/NotoSansKR-Bold.otf'), join(outDir, 'assets/fonts/NotoSansKR-Bold.otf'))
  console.log(`${outDir}/index.html: ${duration}s`)
}
