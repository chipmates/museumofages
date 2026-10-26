// The front's still, made again from nothing but this tree: every frame, its
// three encodings and stars.json.
//
//   node forge/agora-still/render.mjs <port> <outDir> [--look] [--only wide,tall] [--sub 16]
//
// --look draws half-size frames for a look round (PNG only, no data).
// The frames come from still.html at the film tier; the star data is projected
// in the same page through the same camera, then proved on the pixels.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { APP_ROOT, assertServer, browserArgs, waitForServer } from '../rig.mjs'
import LAYOUT from './layout.json' with { type: 'json' }
import { buildStars } from './stars.mjs'

const args = process.argv.slice(2)
const port = Number(args[0])
const out = resolve(args[1] ?? '')
const look = args.includes('--look')
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const only = flag('--only', look ? 'wide,tall' : 'wide,tall,zoom').split(',')
const SUB = Number(flag('--sub', look ? '6' : '24'))
if (!port || !args[1]) throw new Error('usage: render.mjs <port> <outDir> [--look] [--only wide,tall] [--sub n]')
mkdirSync(out, { recursive: true })

const BASE = `http://localhost:${port}`
const CHUNK = 3 << 20

/** a frame's page: its CSS size, its device ratio and the query that asks for it */
function pageFor(name) {
  const f = LAYOUT[name]
  const dpr = look ? f.dpr / 2 : f.dpr
  const extra = process.env.STILL_QUERY ? `&${process.env.STILL_QUERY}` : ''
  return { name, css: f.css, dpr, url: `${BASE}/forge/agora-still/still.html?frame=${name}&tier=max&pr=${dpr}${extra}` }
}

async function open(browser, p, problems) {
  const page = await browser.newPage({ viewport: { width: p.css[0], height: p.css[1] }, deviceScaleFactor: p.dpr })
  page.on('pageerror', (e) => {
    problems.push(`[${p.name}] pageerror: ${e.message}`)
    console.log(`[${p.name}] pageerror: ${e.message}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${p.name}] ${m.type()}: ${m.text().slice(0, 300)}`)
    if (m.type() === 'error') problems.push(`[${p.name}] console: ${m.text()}`)
    if (m.text().startsWith('backend=')) console.log(`[${p.name}] ${m.text()}`)
  })
  await page.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'export {}' }))
  await page.goto(p.url)
  await page.waitForFunction(() => document.body.dataset.still === 'ready', null, { timeout: Number(process.env.STILL_WAIT ?? 180000) })
  return page
}

/** draw a frame in the page and bring its pixels home as a tagged sRGB PNG */
async function shoot(page, file, sub) {
  const t = await page.evaluate(([n]) => window.__still.draw(n, 6), [sub])
  const info = await page.evaluate(() => window.__still.info())
  const bytes = await page.evaluate(() => window.__still.bytes())
  const parts = []
  for (let i = 0; i * CHUNK < bytes; i++) parts.push(Buffer.from(await page.evaluate(([j, c]) => window.__still.chunk(j, c), [i, CHUNK]), 'base64'))
  const raw = Buffer.concat(parts)
  if (raw.length !== info.width * info.height * 3) throw new Error(`${file}: ${raw.length} bytes for ${info.width}x${info.height}`)
  await sharp(raw, { raw: { width: info.width, height: info.height, channels: 3 } }).withIccProfile('srgb').png({ compressionLevel: 9 }).toFile(file)
  console.log(`${file} ${info.width}x${info.height} ${t.draws} draws ${t.ms} ms`)
  return { info, raw }
}

/** the three encodings of a master. The sky sits a few sRGB steps above black and
    the master carries the scene's dither there: below WebP q88, AVIF q68 or JPEG
    q88 the encoders flatten it into bands, so the WebP takes the highest quality
    from q90 its cap allows. */
async function encode(master, cap) {
  const base = master.replace(/\.png$/, '')
  const made = {}
  let q = 90
  for (;;) {
    const buf = await sharp(master).withIccProfile('srgb').webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer()
    if (buf.length <= cap || q <= 40) {
      writeFileSync(`${base}.webp`, buf)
      made.webp = { bytes: buf.length, quality: q }
      break
    }
    q -= 1
  }
  const avif = await sharp(master).withIccProfile('srgb').avif({ quality: 68, effort: 6, chromaSubsampling: '4:4:4' }).toBuffer()
  writeFileSync(`${base}.avif`, avif)
  made.avif = { bytes: avif.length, quality: 68 }
  const jpg = await sharp(master).withIccProfile('srgb').jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
  writeFileSync(`${base}.jpg`, jpg)
  made.jpg = { bytes: jpg.length, quality: 88 }
  console.log(`${base}: webp ${made.webp.bytes} (q${made.webp.quality}) avif ${made.avif.bytes} jpg ${made.jpg.bytes}`)
  return made
}
const CAP = { wide: 400 * 1024, tall: 250 * 1024 }

const server = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: APP_ROOT, stdio: 'ignore' })
const problems = []
try {
  await waitForServer(BASE)
  const said = await assertServer(BASE)
  console.log(`server ${said.head.slice(0, 8)}`)
  const browser = await chromium.launch({ args: browserArgs() })
  const sheet = { frames: {} }
  for (const name of ['wide', 'tall']) {
    if (!only.includes(name)) continue
    const p = pageFor(name)
    const page = await open(browser, p, problems)
    const samples = await page.evaluate(() => window.__still.samples())
    const info0 = await page.evaluate(() => window.__still.info())
    console.log(`[${name}] tier=${info0.tier} buffer ${info0.width}x${info0.height} msaa asked ${samples.asked} allocated ${samples.allocated} ratio ${samples.pixelRatio}`)
    const master = join(out, look ? `look-${name}.png` : `sky-${name}.png`)
    const shot = await shoot(page, master, SUB)
    if (!look) {
      const data = await buildStars({ page, name, frame: LAYOUT[name], shot, master, out, samples, sub: SUB, zoom: only.includes('zoom'), shootZoom: (file) => shoot(page, file, SUB), redraw: () => shoot(page, master, SUB) })
      data.files = { master: `sky-${name}.png`, encodings: await encode(master, CAP[name]) }
      for (const z of data.zooms ?? []) if (z) z.encodings = await encode(join(out, `${z.file}.png`), CAP.tall)
      sheet.frames[name] = data
    }
    await page.close()
  }
  if (!look) {
    sheet.made = { head: said.head, tool: 'museum/forge/agora-still/render.mjs', sub: SUB }
    writeFileSync(join(out, 'stars.json'), JSON.stringify(sheet, null, 1))
    console.log(`${join(out, 'stars.json')} written`)
  }
  await browser.close()
} finally {
  server.kill()
}
if (problems.length) {
  console.log('PROBLEMS:')
  for (const p of [...new Set(problems)]) console.log(' ·', p)
  process.exitCode = 1
} else console.log('clean: no console errors')
