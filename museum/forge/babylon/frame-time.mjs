// THE MAP'S FRAME TIME at one film second: the page's own still call timed at 1 and at n sub-frames, the same camera,
// several times; one sub-frame's cost is the difference over n - 1 (the page's post pipeline and its read-back, the CPU
// print counted once in both), so two builds compare on the same footing without a change to the page.
//
//   node forge/babylon/frame-time.mjs --stop 5 [--t 102.53] --out <abs scratch folder> [--size 1600x900] [--n 17]
//        [--reps 3] [--framing desktop] [--port 5214] [--q 'ao=0']
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
if (!opt.stop || opt.stop === true) fail('--stop <n> (a map stop)')
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const [w, h] = String(opt.size ?? '1600x900').split('x').map(Number)
const n = Number(opt.n ?? 17), reps = Number(opt.reps ?? 3)
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
const state = await page.evaluate((rig) => window[rig].state(), P.rig)
const call = (samples, k) => page.evaluate(([rig, arg]) => window[rig].shoot(arg), [P.rig, {
  stop: Number(opt.stop), framing, view: 'grey', w, h, css: [w, h], samples, out: OUT, name: `ft-${samples}-${k}`, t: opt.t && opt.t !== true ? Number(opt.t) : undefined,
}])
// a warm-up call compiles every pipeline before anything is timed
await call(1, 'warm')
const one = [], many = []
for (let k = 0; k < reps; k++) {
  one.push((await call(1, k)).ms)
  many.push((await call(n, k)).ms)
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const out = {
  stop: Number(opt.stop), t: opt.t ?? null, framing, size: [w, h], n, reps, backend: state.backend, adapter: state.architecture, build: buildId().short,
  oneMs: one, manyMs: many, perSubFrameMs: +((med(many) - med(one)) / (n - 1)).toFixed(2), consoleErrors: errors.length,
}
writeFileSync(`${OUT}/frame-time-${opt.stop}${opt.t ? `-${opt.t}` : ''}.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
await browser.close()
await s.close()
process.exit(errors.length ? 1 : 0)
