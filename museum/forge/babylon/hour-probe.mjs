// A stop's still key at other hours, both framings, through the map rig's probe (an option sheet for a stop's hour):
//   node forge/babylon/hour-probe.mjs --stop 12 --out <abs dir> --hours 18:00,17:00 [--port 5214] [--samples 16] [--q 'a=1'] [--stops 1.7,0.8 (per hour; default the stop's own)]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES } from './pages.mjs'
import { serve } from './serve.mjs'
const opt = {}
const a = process.argv.slice(2)
for (let i = 0; i < a.length; i += 2) opt[a[i].slice(2)] = a[i + 1]
const OUT = opt.out; mkdirSync(OUT, { recursive: true })
const hours = opt.hours.split(',')
const samples = Number(opt.samples ?? 16)
const s = await serve({ port: Number(opt.port ?? 5452), out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.log(`ERROR ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => console.log(`PAGEERROR ${e.message.slice(0, 300)}`))
await page.goto(s.url('map', opt.q ?? ''))
await page.waitForFunction(() => window.__map?.ready === true, null, { timeout: PAGES.map.readyMs, polling: 500 })
// the stop's key marked still, its lens and its exposure stops, from the walk's cameras
const cams = JSON.parse(readFileSync(new URL('../../src/wings/babylon/map/map-cams.json', import.meta.url), 'utf8'))
const n = Number(opt.stop ?? 12)
const k = cams.path.find((p) => p.stop === n && p.still)
const st = cams.stops.find((s) => s.n === n)
const cam = {
  desktop: { look: k.look, hfov: k.hfov ?? cams.lens.desktop, shift: k.shift ?? 0, w: 3200, h: 1800 },
  phone: { look: k.phone?.look ?? k.look, hfov: k.phone?.hfov ?? cams.lens.phone, shift: k.phone?.shift ?? 0, w: 1170, h: 2532 },
}
const stopsFor = (i) => (opt.stops ? Number(opt.stops.split(',')[i]) : st.stops ?? 0)
for (const [i, hour] of hours.entries()) for (const [f, c] of Object.entries(cam)) {
  const name = `${String(n).padStart(2, '0')}-h${hour.replace(':', '')}${opt.stops ? `-s${stopsFor(i)}` : ''}-${f}`
  const r = await page.evaluate((o) => window.__map.probe(o), { at: k.at, y: k.y, look: c.look, hour, hfov: c.hfov, shift: c.shift, stops: stopsFor(i), w: c.w, h: c.h, samples, out: OUT, name, figure: st.figure ? n : undefined, air: st.air })
  console.log(name, r.ms, 'ms', JSON.stringify(r.brightness))
}
await browser.close(); await s.close()
