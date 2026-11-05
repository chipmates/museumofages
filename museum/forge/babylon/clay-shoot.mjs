// FEATURE 6'S STILLS: the fresh tablet on the turntable at its beats (a clock in wedges: 0 fresh clay, 3.5 the fourth
// wedge half in, 7 KÁ finished, 10 DINGIR, 15 RA, 23 the whole name), desktop wide and phone upright, no chrome, from
// the bench page (src/wings/babylon/clay/clay.html). Each still gets a sidecar with the build, framing, clock and the
// frame's box. Optionally the frame time over the played presses.
//
//   node forge/babylon/clay-shoot.mjs --out <abs folder> [--framing desktop,phone] [--lang en] [--beats 0,3.5,7]
//        [--desktop 1600x900@2] [--phone 390x844@3] [--frametime 12] [--port 5214]
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
const BEATS = { rest: 0, half: 3.5, ka: 7, dingir: 10, ra: 15, name: 23 }
const beats = opt.beats && opt.beats !== true ? Object.fromEntries(String(opt.beats).split(',').map((t) => [`t${t}`, Number(t)])) : BEATS
const framings = String(opt.framing ?? 'desktop,phone').split(',')
const lang = opt.lang === 'de' ? 'de' : 'en'
const sizes = Object.fromEntries(framings.map((f) => [f, parseSize(opt[f] && opt[f] !== true ? opt[f] : DEFAULT_SIZES[f])]))
const PORT = Number(opt.port ?? 5214)
const build = buildId()
const P = PAGES.clay

const s = await serve({ port: PORT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
let bad = 0, errorsSeen = 0
const times = []
for (const framing of framings) {
  const size = sizes[framing]
  const ctx = await browser.newContext({ viewport: { width: size.css[0], height: size.css[1] }, deviceScaleFactor: size.ratio })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${framing}: ${m.text().slice(0, 500)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${framing}: ${(e.stack ?? e.message).slice(0, 900)}`) })
  const address = `${s.base}/${P.html}?narrow=${framing === 'phone' ? 1 : 0}&lang=${lang}`
  const t0 = Date.now()
  await page.goto(address)
  const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 250 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`FAILED ${framing}: not ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`); bad++; await ctx.close(); continue }
  const state = await page.evaluate((rig) => window[rig].state(), P.rig)
  console.log(`${framing}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, built in ${state.buildMs} ms, ${state.backend} ${state.architecture}`)
  for (const [label, t] of Object.entries(beats)) {
    const r = await page.evaluate(([rig, t]) => window[rig].pose({ t }), [P.rig, t]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${framing} ${label}: ${r.error.slice(0, 400)}`); continue }
    const name = `clay-${framing}-${lang}-${label}`
    await page.screenshot({ path: join(OUT, `${name}.png`) })
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ tool: 'forge/babylon/clay-shoot.mjs', build, framing, lang, beat: label, wedges: t,
      cssSize: size.css, ratio: size.ratio, devicePixels: devicePixels(size), measure: r.measure, clock: r.clock, lit: r.lit, named: r.named, state, address, shotAt: new Date().toISOString() }, null, 1))
    console.log(`${name}.png at ${t} wedges`)
  }
  if (opt.frametime) {
    const ft = await page.evaluate(([rig, seconds]) => window[rig].frameTime({ seconds }), [P.rig, Number(opt.frametime)])
    times.push({ framing, ...ft })
    console.log(`${framing}: ${ft.frames} frames, median ${ft.median.toFixed(2)} ms, 95th ${ft.p95.toFixed(2)} ms, worst ${ft.worst.toFixed(2)} ms, ${ft.pressed} pressed`)
  }
  errorsSeen += errors.length
  await ctx.close()
}
if (times.length) writeFileSync(join(OUT, `frametime-${lang}.json`), JSON.stringify({ build, times }, null, 1))
await browser.close()
await s.close()
console.log(`build ${build.short}${build.dirty ? ` with ${build.dirtyFiles} changed Babylon file(s)` : ''}; ${bad ? `${bad} failed` : 'all stills written'}${errorsSeen ? `, ${errorsSeen} console error(s)` : ''}`)
process.exit(bad || errorsSeen ? 1 : 0)
