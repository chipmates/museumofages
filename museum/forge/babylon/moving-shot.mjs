// THE MOVING SHOT: frames of a stop's page film at consecutive seconds, from one page load, so a shimmer or a swim on a
// surface shows between frames (a still cannot show either). Each frame is the page's own still call at that second.
//
//   node forge/babylon/moving-shot.mjs --stop 10 --out <abs folder> [--from -1] [--to 1] [--dt 0.125]
//        [--framing desktop,phone] [--samples 16] [--port 5214]
// --from and --to are seconds around the stop's still second (its sidecar's filmSecond). Files: mv-<stop>-<i>-<framing>.png
// with their sidecars; exit 1 on a failed frame or a console error.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { DEFAULT_SIZES, PAGES, devicePixels, parseSize, resolveStop } from './pages.mjs'
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
if (!opt.stop || opt.stop === true) fail('--stop <id>')
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const st = resolveStop(String(opt.stop))
const P = PAGES[st.page]
if (st.page !== 'map') fail(`stop ${opt.stop} is on the ${st.page} page: the moving shot reads the map film only`)
const framings = String(opt.framing ?? 'desktop,phone').split(',')
const from = Number(opt.from ?? -1), to = Number(opt.to ?? 1), dt = Number(opt.dt ?? 0.125)
const samples = Number(opt.samples ?? 16)
const PORT = Number(opt.port ?? 5214)

const s = await serve({ port: PORT, out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR: ${m.text().slice(0, 400)}`) } })
page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR: ${e.message.slice(0, 400)}`) })
await page.goto(s.url(st.page, ''))
const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 500 }).then(() => true).catch(() => false)
if (!ready) fail('the page is not ready')
let bad = 0
for (const framing of framings) {
  const size = parseSize(DEFAULT_SIZES[framing])
  const [w, h] = devicePixels(size)
  // the stop's still second from its own still call, then the frames around it
  const probe = P.still({ stop: st.stop, framing, view: 'grey', w: 320, h: Math.round(320 * h / w), css: size.css, samples: 1, out: OUT, name: `mv-${st.stop}-probe-${framing}` })
  const r0 = await page.evaluate(([rig, fn, arg]) => window[rig][fn](arg), [P.rig, probe.fn, probe.arg]).catch((e) => ({ error: String(e) }))
  const side0 = join(OUT, `mv-${st.stop}-probe-${framing}.json`)
  if (r0.error || !existsSync(side0)) { bad++; console.log(`FAILED probe ${framing}: ${r0.error ?? 'no sidecar'}`); continue }
  const t0 = JSON.parse(readFileSync(side0, 'utf8')).filmSecond
  const n = Math.round((to - from) / dt)
  for (let i = 0; i <= n; i++) {
    const t = t0 + from + i * dt
    const name = `mv-${st.stop}-${String(i).padStart(2, '0')}-${framing}`
    const call = P.still({ stop: st.stop, framing, view: 'grey', w, h, css: size.css, samples, out: OUT, name, t })
    const r = await page.evaluate(([rig, fn, arg]) => window[rig][fn](arg), [P.rig, call.fn, call.arg]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${name}: ${r.error.slice(0, 400)}`); continue }
    console.log(`${name}.png t ${t.toFixed(3)} ${r.ms} ms`)
  }
}
await browser.close()
await s.close()
process.exit(bad || errors.length ? 1 : 0)
