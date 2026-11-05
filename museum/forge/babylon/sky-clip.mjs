// THE MAP FILM AS FRAMES OVER A SPAN, for the shade light's refits: the page's own clip call (8 frames a second), JPEG
// frames and the per-frame log; `--refit <second>` splits the span there and draws the field's maps again (a forced
// refit, the rig's `skyRefit`); `--keys` prints the film's keys and stops' still seconds instead.
//   node forge/babylon/sky-clip.mjs --from 380 --to 384 --out <abs folder> [--size 800x450] [--samples 4]
//        [--framing desktop] [--refit 382] [--port 5214] [--q 'sky=set']
// Prints one JSON line; exit 1 on a console error or a failed call.
import { chromium } from 'playwright'
import { isAbsolute, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES, buildId } from './pages.mjs'
import { serve } from './serve.mjs'

const opt = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[argv[i].slice(2)] = true
  else { opt[argv[i].slice(2)] = next; i++ }
}
const fail = (m) => { console.error(m); process.exit(2) }
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const [w, h] = String(opt.size ?? '800x450').split('x').map(Number)
const samples = Number(opt.samples ?? 4)
const framing = opt.framing === 'phone' ? 'phone' : 'desktop'
const PORT = Number(opt.port ?? 5214)
const P = PAGES.map

const s = await serve({ port: PORT, out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(s.url('map', opt.q && opt.q !== true ? String(opt.q) : ''))
await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 500 })
if (opt.keys) {
  const v = await page.evaluate((rig) => window[rig].views(), P.rig)
  writeFileSync(`${OUT}/views.json`, JSON.stringify(v, null, 1))
  console.log(JSON.stringify({ stops: v.stops, keys: v.keys.length, duration: v.duration }))
} else {
  const from = Number(opt.from), to = Number(opt.to)
  const refit = opt.refit && opt.refit !== true ? Number(opt.refit) : null
  const spans = refit === null ? [[from, to]] : [[from, refit - 1 / 8], [refit, to]]
  const t0 = Date.now()
  const out = []
  for (const [a, b] of spans) {
    if (a !== from) out.push({ refit: await page.evaluate((rig) => window[rig].skyRefit?.() ?? null, P.rig) })
    out.push(await page.evaluate(([rig, arg]) => window[rig].clip(arg), [P.rig, { out: OUT, fps: 8, w, h, samples, from: a, to: b, framing, view: 'grey' }]))
  }
  const res = { from, to, refit, framing, size: [w, h], samples, q: opt.q ?? '', build: buildId().short, calls: out, ms: Date.now() - t0, consoleErrors: errors.length }
  writeFileSync(`${OUT}/clip.json`, JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res))
}
await browser.close()
await s.close()
process.exit(errors.length ? 1 : 0)
