// FEATURE 1'S STILLS: each of the three things on the turntable at its beats, desktop wide and phone upright, no chrome,
// from the bench page (src/wings/babylon/objects/bench.html). A beat is a second of the object's run; the eye stands
// where the run carries it at that second (the phone's run adds the crop on the signs). Each still gets a sidecar with
// the build, the object, the framing, the second and the frame's box. Optionally the frame time over a played run.
//
//   node forge/babylon/objects-shoot.mjs --out <abs folder> [--objects brick,limestone,breccia] [--framing desktop,phone]
//        [--desktop 1600x900@2] [--phone 390x844@3] [--beats brick:0,3.4,8;limestone:...] [--frametime 6] [--port 5214]
// Exit 1 on a console error or a failed still.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { DEFAULT_SIZES, PAGES, buildId, devicePixels, parseSize } from './pages.mjs'
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
/** each thing's beats, seconds of its run: rest, mid-turn, the hold, the step in on the signs (the phone's crop), back */
const BEATS = {
  brick: { rest: 0.5, lift: 3.0, turn: 3.6, hold: 6.5, crop: 9.0, back: 13.6 },
  limestone: { rest: 0.5, turn: 3.0, hold: 6.0, crop: 8.6, back: 12.3 },
  breccia: { edge: 2.5, turn: 6.6, hold: 10.0, crop: 12.2, back: 16.0 },
}
if (opt.beats && opt.beats !== true) for (const part of String(opt.beats).split(';')) {
  const [obj, list] = part.split(':')
  BEATS[obj] = Object.fromEntries(list.split(',').map((t) => [`t${t}`, Number(t)]))
}
const objects = String(opt.objects ?? 'brick,limestone,breccia').split(',')
const framings = String(opt.framing ?? 'desktop,phone').split(',')
const sizes = Object.fromEntries(framings.map((f) => [f, parseSize(opt[f] && opt[f] !== true ? opt[f] : DEFAULT_SIZES[f])]))
const PORT = Number(opt.port ?? 5214)
const build = buildId()
const P = PAGES.objects

const s = await serve({ port: PORT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
let bad = 0, errorsSeen = 0
const times = []
for (const obj of objects) for (const framing of framings) {
  const size = sizes[framing]
  const ctx = await browser.newContext({ viewport: { width: size.css[0], height: size.css[1] }, deviceScaleFactor: size.ratio })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${obj} ${framing}: ${m.text().slice(0, 500)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${obj} ${framing}: ${(e.stack ?? e.message).slice(0, 900)}`) })
  const address = `${s.base}/${P.html}?object=${obj}&narrow=${framing === 'phone' ? 1 : 0}`
  const t0 = Date.now()
  await page.goto(address)
  const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 250 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`FAILED ${obj} ${framing}: not ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`); bad++; await ctx.close(); continue }
  const state = await page.evaluate((rig) => window[rig].state(), P.rig)
  console.log(`${obj} ${framing}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, built in ${state.buildMs} ms, ${state.backend} ${state.architecture}`)
  for (const [label, t] of Object.entries(BEATS[obj])) {
    const r = await page.evaluate(([rig, t]) => window[rig].pose({ t }), [P.rig, t]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${obj} ${framing} ${label}: ${r.error.slice(0, 400)}`); continue }
    const name = `${obj}-${framing}-${label}`
    await page.screenshot({ path: join(OUT, `${name}.png`) })
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ tool: 'forge/babylon/objects-shoot.mjs', build, object: obj, framing, beat: label, second: t,
      cssSize: size.css, ratio: size.ratio, devicePixels: devicePixels(size), measure: r.measure, state, address, shotAt: new Date().toISOString() }, null, 1))
    console.log(`${name}.png at ${t} s`)
  }
  if (opt.frametime) {
    const ft = await page.evaluate(([rig, seconds]) => window[rig].frameTime({ seconds }), [P.rig, Number(opt.frametime)])
    times.push({ object: obj, framing, ...ft })
    console.log(`${obj} ${framing}: ${ft.frames} frames, median ${ft.median.toFixed(2)} ms, 95th ${ft.p95.toFixed(2)} ms, worst ${ft.worst.toFixed(2)} ms`)
  }
  errorsSeen += errors.length
  await ctx.close()
}
if (times.length) writeFileSync(join(OUT, 'frametime.json'), JSON.stringify({ build, times }, null, 1))
await browser.close()
await s.close()
console.log(`build ${build.short}${build.dirty ? ` with ${build.dirtyFiles} changed Babylon file(s)` : ''}; ${bad ? `${bad} failed` : 'all stills written'}${errorsSeen ? `, ${errorsSeen} console error(s)` : ''}`)
process.exit(bad || errorsSeen ? 1 : 0)
