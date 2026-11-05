// FEATURE 11'S STAGE PICTURES: the heaps, the lump and the figure on the close view's stage, one still per eye of the
// plan (sky-data.ts HEAPS_PLAN.views), each at the pixel size the paper plate expects (sky-scene.ts HEAPS_PICTURE),
// from the bench page (src/wings/babylon/sky/heaps.html). Each still gets a sidecar with the build, the view and the
// page's own read-back: where the plan's points fall on the canvas and the volumes as built.
//
//   node forge/babylon/sky-heaps-shoot.mjs --out <abs folder> [--views wide,upright,silver] [--port 5470]
// Writes heaps-wide.png, heaps-upright.png, silver.png (the names the feature's bench takes) and <name>.json.
// Exit 1 on a console error or a failed still.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs } from '../rig.mjs'
import { buildId } from './pages.mjs'
import { serve } from './serve.mjs'

const opt = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[argv[i].slice(2)] = true
  else { opt[argv[i].slice(2)] = next; i++ }
}
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) { console.error('--out <absolute folder>'); process.exit(2) }
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const PORT = Number(opt.port ?? 5470)
// the pictures' sizes: HEAPS_PICTURE in sky-scene.ts (a test holds the two equal)
const SIZES = { wide: [1600, 1000], upright: [1200, 1200], silver: [800, 800] }
const NAMES = { wide: 'heaps-wide', upright: 'heaps-upright', silver: 'silver' }
const views = String(opt.views && opt.views !== true ? opt.views : 'wide,upright,silver').split(',')
const build = buildId()

const s = await serve({ port: PORT })
const browser = await chromium.launch({ args: browserArgs('webgpu') })
let bad = 0
for (const view of views) {
  const [w, h] = SIZES[view]
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${view}: ${m.text().slice(0, 500)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${view}: ${(e.stack ?? e.message).slice(0, 900)}`) })
  const address = `${s.base}/src/wings/babylon/sky/heaps.html?view=${view}`
  const t0 = Date.now()
  await page.goto(address)
  const ready = await page.waitForFunction(() => window.__heaps?.ready === true, null, { timeout: 120000, polling: 250 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`FAILED ${view}: not ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`); bad++; await ctx.close(); continue }
  // the shadows are drawn on demand: a few more frames after the read so the still holds them
  await page.waitForTimeout(800)
  const state = await page.evaluate(() => window.__heaps.state())
  const measure = await page.evaluate(() => window.__heaps.measure())
  const name = NAMES[view]
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ tool: 'forge/babylon/sky-heaps-shoot.mjs', build, view, size: [w, h], state, measure, address, shotAt: new Date().toISOString() }, null, 1))
  console.log(`${name}.png: ${state.backend} ${state.architecture}, built in ${state.buildMs} ms; litres ${Object.entries(measure.litres).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')}`)
  if (errors.length) bad++
  await ctx.close()
}
await browser.close()
await s.close()
console.log(`build ${build.short}${build.dirty ? ' with changes' : ''}; ${bad ? `${bad} failed` : 'all stills written'}`)
process.exit(bad ? 1 : 0)
