// A STOP'S DAY: the stop's own still at a list of solar hours, both framings, at small sizes, one page load per page.
// The page's hour knob takes the hour (map and gate: the shoot call's `hour`; the opening: its `tune`); the camera and
// the exposure stay the stop's. `day` is every hour from 07:00 to the last before sunset, 06:00, sunset's own minute
// (map/sun.ts, the centre on the horizon) and the stop's present hour (`now`, the page's default).
//
//   node --experimental-strip-types forge/babylon/hour-sweep.mjs --stop 9[,10] --out <abs dir> [--hours day[,18:13]]
//        [--desktop 800x450@1] [--phone 390x844@1] [--framing desktop,phone] [--samples 8] [--port 5214]
// Files: <out>/S<nn>/<hhmm>-<framing>.png and .json (`now-<framing>` the present hour). Exit 1 on any failed still.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES, devicePixels, parseSize, resolveStop } from './pages.mjs'
import { serve } from './serve.mjs'
import { sunAt } from '../../src/wings/babylon/map/sun.ts'

const opt = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[argv[i].slice(2)] = true
  else { opt[argv[i].slice(2)] = next; i++ }
}
const fail = (m) => { console.error(m); process.exit(2) }
if (!opt.stop || opt.stop === true) fail('--stop <n>[,<n>...]')
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')

/** sunset's minute: the sun's centre on the geometric horizon, afternoon side */
export function sunsetMinute() {
  let a = 12, b = 21
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (sunAt(m).elevation > 0) a = m; else b = m }
  return Math.floor(a * 60) / 60
}
const hhmm = (h) => `${String(Math.floor(h + 1e-9)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`
export function dayHours() {
  const set = sunsetMinute(), out = ['06:00']
  for (let h = 7; h < set; h++) out.push(hhmm(h))
  out.push(hhmm(set))
  return out
}
const hours = []
for (const h of String(opt.hours ?? 'day').split(',')) {
  if (h === 'day') hours.push(...dayHours())
  else if (/^\d{1,2}:\d{2}$/.test(h)) hours.push(h.padStart(5, '0'))
  else fail(`hour "${h}": day or hh:mm`)
}
const list = ['now', ...new Set(hours)]
const framings = String(opt.framing ?? 'desktop,phone').split(',')
const sizes = { desktop: parseSize(opt.desktop && opt.desktop !== true ? opt.desktop : '800x450@1'), phone: parseSize(opt.phone && opt.phone !== true ? opt.phone : '390x844@1') }
const samples = Number(opt.samples ?? 8)
const wanted = String(opt.stop).split(',').map(resolveStop)
const s = await serve({ port: Number(opt.port ?? 5214), out: String(opt.out) })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
let bad = 0, errorsSeen = 0
const byPage = new Map()
for (const w of wanted) { if (!byPage.has(w.page)) byPage.set(w.page, []); byPage.get(w.page).push(w) }
for (const [name, stops] of byPage) {
  const P = PAGES[name]
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${name}: ${m.text().slice(0, 400)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${name}: ${e.message.slice(0, 400)}`) })
  await page.goto(s.url(name, ''))
  const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 500 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`${name}: not ready`); bad += stops.length; await page.close(); continue }
  const own = name === 'open' ? (await page.evaluate(() => window.__open.views())).hour : null
  for (const st of stops) {
    const dir = join(String(opt.out), `S${st.stop.padStart(2, '0')}`)
    mkdirSync(dir, { recursive: true })
    for (const hour of list) for (const framing of framings) {
      const size = sizes[framing], [w, h] = devicePixels(size)
      const base = `${hour === 'now' ? 'now' : hour.replace(':', '')}-${framing}`
      const call = P.still({ stop: st.stop, framing, view: 'grey', w, h, css: size.css, samples, out: dir, name: base })
      if (name !== 'open' && hour !== 'now') call.arg.hour = hour
      const r = await page.evaluate(async ([rig, fn, arg, hr, back]) => {
        if (rig === '__open') window.__open.tune({ hour: hr ?? back })
        try { return await window[rig][fn](arg) } finally { if (rig === '__open') window.__open.tune({ hour: back }) }
      }, [P.rig, call.fn, call.arg, hour === 'now' ? null : hour, own === null ? null : hhmm(own)]).catch((e) => ({ error: String(e) }))
      if (r.error) { bad++; console.log(`FAILED ${st.stop} ${hour} ${framing}: ${r.error.slice(0, 400)}`); continue }
      const side = join(dir, `${base}.json`)
      if (!existsSync(side)) { bad++; console.log(`FAILED ${st.stop} ${hour} ${framing}: no sidecar`); continue }
      const j = JSON.parse(readFileSync(side, 'utf8'))
      j.sweep = { tool: 'forge/babylon/hour-sweep.mjs', page: name, stop: st.stop, stopId: st.id, framing, asked: hour, cssSize: size.css, ratio: size.ratio, devicePixels: [w, h] }
      writeFileSync(side, JSON.stringify(j, null, 1))
      console.log(`S${st.stop} ${base} hour ${j.hour} sun ${j.sun?.elevation} ${r.ms} ms median ${r.brightness?.median}`)
    }
  }
  errorsSeen += errors.length
  await page.close()
}
await browser.close()
await s.close()
console.log(`${bad ? `${bad} failed` : 'all stills written'}${errorsSeen ? `, ${errorsSeen} console error(s)` : ''}`)
process.exit(bad || errorsSeen ? 1 : 0)
