// THE KIT'S SHOOTER: stills of any Babylon stop, by stop id, on the page that owns it (pages.mjs). Device pixels are
// the CSS size times the device ratio; each still gets the page's own sidecar plus a `kit` block naming the build,
// the page, the stop and the address. Both framings by default. The page writes into --out and nowhere else.
//
//   node forge/babylon/shoot.mjs --stop 3[,map:9,open] --out <abs folder> [--framing desktop,phone]
//        [--desktop 1600x900@2] [--phone 390x844@3] [--samples 16] [--view grey|classes] [--state full|flat|grey]
//        [--t <second on the map film or the flight>] [--name <base>] [--q 'exp=0.6'] [--port 5214]
//   node forge/babylon/shoot.mjs --stop <id> --out <dir> --facts   only the page's path samples (facts-<page>.json), no stills
//   node forge/babylon/shoot.mjs --stops      the stops and the page each is on
// File names: [<page>-]<stop>-<id>-<framing>[-classes].png (the page named when it is not the stop's own), or <name>-<framing>.png with --name. Exit 1 on any failed still
// or console error.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { DEFAULT_SIZES, PAGES, STOPS, buildId, devicePixels, parseSize, resolveStop } from './pages.mjs'
import { serve } from './serve.mjs'

const opt = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[argv[i].slice(2)] = true
  else { opt[argv[i].slice(2)] = next; i++ }
}
if (opt.stops) {
  for (const s of STOPS) console.log(`${s.stop.padStart(2)} ${s.id.padEnd(18)} ${s.page}`)
  process.exit(0)
}
const fail = (m) => { console.error(m); process.exit(2) }
if (!opt.stop || opt.stop === true) fail('--stop <id>[,<id>...] (see --stops)')
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const wanted = String(opt.stop).split(',').map(resolveStop)
const framings = String(opt.framing ?? 'desktop,phone').split(',')
for (const f of framings) if (!DEFAULT_SIZES[f]) fail(`framing "${f}": desktop or phone`)
const sizes = Object.fromEntries(framings.map((f) => [f, parseSize(opt[f] && opt[f] !== true ? opt[f] : DEFAULT_SIZES[f])]))
const samples = Number(opt.samples ?? 16)
const view = opt.view === 'classes' ? 'classes' : 'grey'
const PORT = Number(opt.port ?? 5214)
const build = buildId()

const s = await serve({ port: PORT, out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
let bad = 0, errorsSeen = 0
// one page load per page, every stop on it shot from that load
const byPage = new Map()
for (const w of wanted) { if (!byPage.has(w.page)) byPage.set(w.page, []); byPage.get(w.page).push(w) }
for (const [name, stops] of byPage) {
  const P = PAGES[name]
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${name}: ${m.text().slice(0, 600)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${name}: ${(e.stack ?? e.message).slice(0, 1200)}`) })
  page.on('response', (r) => { if (r.status() >= 500) { errors.push(`HTTP ${r.status()}`); console.log(`HTTP ${r.status()} ${r.url().slice(0, 200)}`) } })
  const address = s.url(name, opt.q && opt.q !== true ? String(opt.q) : '')
  const t0 = Date.now()
  await page.goto(address)
  const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 500 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`${name}: not ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`); bad += stops.length; await page.close(); continue }
  const state = await page.evaluate((rig) => window[rig].state(), P.rig)
  console.log(`${name}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${state.backend} ${state.architecture ?? ''}`)
  if (opt.facts) {
    // the page's path, sampled every 0.1 s, for the geometry check's eyes
    const facts = await page.evaluate((rig) => ({ samples: window[rig].pathSamples?.(0.1) ?? [] }), P.rig)
    writeFileSync(join(OUT, `facts-${name}.json`), JSON.stringify(facts))
    console.log(`facts-${name}.json: ${facts.samples.length} path samples`)
  }
  for (const st of stops) for (const framing of opt.facts ? [] : framings) {
    const size = sizes[framing]
    const [w, h] = devicePixels(size)
    const base = opt.name && opt.name !== true ? `${opt.name}-${framing}` : `${st.page !== st.owner ? `${st.page}-` : ''}${st.stop.padStart(2, '0')}-${st.id}-${framing}${view === 'classes' ? '-classes' : ''}`
    const call = P.still({
      stop: st.stop, framing, view, w, h, css: size.css, samples, out: OUT, name: base,
      state: opt.state && opt.state !== true ? String(opt.state) : undefined, t: opt.t && opt.t !== true ? Number(opt.t) : undefined,
    })
    const r = await page.evaluate(([rig, fn, arg]) => window[rig][fn](arg), [P.rig, call.fn, call.arg]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${st.stop} ${framing}: ${r.error.slice(0, 600)}`); continue }
    const side = join(OUT, `${base}.json`)
    if (existsSync(side)) {
      const j = JSON.parse(readFileSync(side, 'utf8'))
      j.kit = { tool: 'forge/babylon/shoot.mjs', build, page: name, stop: st.stop, stopId: st.id, framing, view, cssSize: size.css, ratio: size.ratio, devicePixels: [w, h], address: address.replace(/&put=[^&]*/, ''), shotAt: new Date().toISOString(), consoleErrorsSoFar: errors.length }
      writeFileSync(side, JSON.stringify(j, null, 1))
    } else { bad++; console.log(`FAILED ${st.stop} ${framing}: no sidecar written`) }
    console.log(`${base}.png ${w}x${h} (${size.css.join('x')} at ${size.ratio}) ${r.ms} ms median ${r.brightness?.median} p1 ${r.brightness?.p1} p99 ${r.brightness?.p99}`)
  }
  errorsSeen += errors.length
  await page.close()
}
await browser.close()
await s.close()
if (errorsSeen) console.log(`${errorsSeen} console error(s)`)
console.log(`build ${build.short}${build.dirty ? ` with ${build.dirtyFiles} changed Babylon file(s)` : ''}; ${bad ? `${bad} failed` : 'all stills written'}`)
process.exit(bad || errorsSeen ? 1 : 0)
