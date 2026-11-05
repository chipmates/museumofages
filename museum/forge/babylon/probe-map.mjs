// THE MAP PAGE FROM ANY CAMERA: one page load, a list of the rig's probes (a UTM place, a height or 'eye', a look point,
// an hour, a lens) or film stills (a second, a framing), each written into --out by the rig. For a stop's look rounds,
// where the film's keys are not yet cut; the stills of record stay shoot.mjs's.
//
//   node forge/babylon/probe-map.mjs --jobs <jobs.json> --out <abs folder> [--port 5214] [--q 'view=classes']
//   jobs.json: [{ "name": "hold-a", "at": [E, N], "y": "eye", "look": [E, N, level], "hour": "18:12", "hfov": 58,
//                 "shift": 0, "w": 1600, "h": 900, "samples": 8, "figure": 13 },
//               { "name": "film-433", "t": 433, "framing": "desktop", "w": 1600, "h": 900, "samples": 8, "stop": 13 }]
// Exit 1 on a failed job or a console error.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES } from './pages.mjs'
import { serve } from './serve.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const jobsFile = opt('--jobs', null), outArg = opt('--out', null)
if (!jobsFile || !outArg || !isAbsolute(outArg)) { console.error('--jobs <json> --out <absolute folder>'); process.exit(2) }
const OUT = resolve(outArg)
mkdirSync(OUT, { recursive: true })
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'))
const s = await serve({ port: Number(opt('--port', 5214)), out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${m.text().slice(0, 600)}`) } })
page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${(e.stack ?? e.message).slice(0, 1200)}`) })
await page.goto(s.url('map', opt('--q', '')))
const ready = await page.waitForFunction(() => window.__map?.ready === true, null, { timeout: PAGES.map.readyMs, polling: 500 }).then(() => true).catch(() => false)
let bad = ready ? 0 : 1
if (!ready) console.log('map: not ready')
for (const j of ready ? jobs : []) {
  const t0 = Date.now()
  const r = await page.evaluate((job) => {
    const rig = window.__map
    if (job.t !== undefined) return rig.shoot({ stop: job.stop, framing: job.framing ?? 'desktop', view: job.view ?? 'grey', w: job.w, h: job.h, samples: job.samples ?? 8, out: job.out, name: job.name, t: job.t })
    return rig.probe(job)
  }, { ...j, out: OUT }).catch((e) => ({ error: String(e) }))
  if (r.error) { bad++; console.log(`FAILED ${j.name}: ${r.error.slice(0, 600)}`); continue }
  console.log(`${j.name}: ${Date.now() - t0} ms, median ${r.brightness?.median} p1 ${r.brightness?.p1} p99 ${r.brightness?.p99}${r.y !== undefined ? `, eye y ${r.y}` : ''}${r.camera ? `, eye ${r.camera.y} over ${r.camera.eyeOverStand}, hour ${r.hour}, sun ${r.sun.azimuth}/${r.sun.elevation}` : ''}`)
}
await browser.close()
await s.close()
process.exit(bad || errors.length ? 1 : 0)
