// THE PAPER PAGES' SHOOTER: frames of the paper kit's sheet and of a paper feature's bench, at the visitor's pixel ratio,
// in each language asked, with the page's own read-back beside each frame (where every label stood, what it overlapped,
// the line, the list). The stills a feature opens from are handed in from a folder by address, never from the store.
//
//   node forge/babylon/paper-shoot.mjs --page sheet|measure --out <abs folder> [--port 5304] [--engine chromium|webkit]
//        [--sizes desktop,phone,phone-short,phone-small] [--langs en,de] [--stills <abs folder>] [--reduced] [--keys]
//        [--dir rtl] [--steps 0,1,2,3,4,5] [--between] [--only-steps] [--raised 2] [--drawer 4]
// --raised: on a phone, the sheet one height up (the steps) at these steps; --drawer: on a desktop, the band's drawer
// open at these steps. Each step's read-back carries the chrome's own numbers (`chrome`): the band or the sheet, the
// line's rows, every control's centre, the plate's share of the stage.
// --stills holds held-desktop.jpg, held-phone.jpg, ink-desktop.jpg, ink-phone.jpg (any missing: the page goes without).
// Frames: <page>-<lang>-<size>[-reduced]-<what>.png and readout-<lang>-<size>[-reduced].json. Exit 1 on a console error,
// a failed request, a label overlap or a target under 44 px.
import { chromium, webkit } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const fail = (m) => { console.error(m); process.exit(2) }
const PAGE = String(opt.page ?? '')
if (!['sheet', 'measure'].includes(PAGE)) fail('--page sheet|measure')
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const PORT = Number(opt.port ?? 5304)
const ENGINE = String(opt.engine ?? 'chromium')
const SIZES = {
  desktop: { width: 1600, height: 900, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  'phone-short': { width: 390, height: 664, deviceScaleFactor: 3 },
  'phone-small': { width: 360, height: 640, deviceScaleFactor: 3 },
  'desktop-1x': { width: 1440, height: 900, deviceScaleFactor: 1 },
}
const sizes = String(opt.sizes ?? 'desktop,phone').split(',')
for (const s of sizes) if (!SIZES[s]) fail(`size "${s}": ${Object.keys(SIZES).join(', ')}`)
const langs = String(opt.langs ?? 'en,de').split(',')
const STILLS = opt.stills && opt.stills !== true ? resolve(String(opt.stills)) : null
const reduced = Boolean(opt.reduced)
const dir = opt.dir === 'rtl' ? 'rtl' : 'ltr'
const wantSteps = opt.steps && opt.steps !== true ? String(opt.steps).split(',').map(Number) : [0, 1, 2, 3, 4, 5]
const list = (k, d) => (opt[k] === undefined ? d : opt[k] === true ? [] : String(opt[k]).split(',').filter(Boolean).map(Number))
const raisedSteps = list('raised', [2]), drawerSteps = list('drawer', [])
const PATHS = { sheet: 'src/wings/babylon/paper/sheet.html', measure: 'src/wings/babylon/measure/measure.html' }

const s = await serve({ port: PORT })
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ args: browserArgs('webgpu') })
const build = buildId()
let bad = 0
const report = []
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const wait = (page, ms) => page.waitForTimeout(ms)

for (const lang of langs) for (const size of sizes) {
  const ctx = await browser.newContext({ viewport: { width: SIZES[size].width, height: SIZES[size].height }, deviceScaleFactor: SIZES[size].deviceScaleFactor, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  const errors = [], failed = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`) })
  if (STILLS) await page.route('**/_stills/**', async (route) => {
    const file = join(STILLS, new URL(route.request().url()).pathname.split('/').pop())
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'none' })
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: file.endsWith('.png') ? 'image/png' : 'image/jpeg' })
  })
  const has = (n) => STILLS && existsSync(join(STILLS, n))
  const params = new URLSearchParams({ lang, ...(dir === 'rtl' ? { dir } : {}) })
  if (PAGE === 'measure' && has('held-desktop.jpg')) params.set('held', '/_stills/held-{framing}.jpg')
  if (PAGE === 'measure' && has('ink-desktop.jpg')) params.set('ink', '/_stills/ink-{framing}.jpg')
  const tag = `${PAGE}-${lang}-${size}${reduced ? '-reduced' : ''}${dir === 'rtl' ? '-rtl' : ''}${ENGINE === 'webkit' ? '-webkit' : ''}`
  await page.goto(`${s.base}/${PATHS[PAGE]}?${params.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')}`)
  const rig = PAGE === 'sheet' ? '__paper' : '__measure'
  await page.waitForFunction((r) => window[r]?.ready === true, rig, { timeout: 60000, polling: 200 })
  await frames(page)
  // each frame says whether the harness's own marker stood in it: it must not, outside the harness's own address
  const marked = {}
  const shot = async (what) => {
    const f = join(OUT, `${tag}-${what}.png`); await page.screenshot({ path: f })
    marked[what] = await page.evaluate(() => { const n = document.getElementById('says'); return Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.textContent) })
    return f
  }
  const row = { lang, size, engine: ENGINE, reduced, dir, frames: [], readouts: {}, chrome: {}, marked, errors, failed }
  if (PAGE === 'sheet') {
    await wait(page, 300)
    row.frames.push(await shot('sheet'))
    row.samples = await page.evaluate(() => window.__paper.samples())
    row.tokens = await page.evaluate(() => window.__paper.tokens())
    row.placed = await page.evaluate(() => window.__paper.placed)
    row.ratio = SIZES[size].deviceScaleFactor
  } else {
    if (!opt['only-steps']) row.frames.push(await shot('0-rest'))
    row.targets = { rest: await page.evaluate(() => window.__measure.targets()) }
    if (opt.keys) {
      // the whole walk by keyboard: Tab to the door, Enter, the arrows across every step, Escape, and the focus back on the door
      const keys = []
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const id = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className); keys.push(`tab ${id}`); if (id === 'door') break }
      await page.keyboard.press('Enter'); await wait(page, reduced ? 200 : 2000)
      keys.push(`enter: ${await page.evaluate(() => window.__measure.phase())}`)
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const id = await page.evaluate(() => document.activeElement?.className || document.activeElement?.id); keys.push(`tab ${id}`); if (String(id).includes('paper-slider')) break }
      for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await wait(page, reduced ? 150 : 2800); keys.push(`right: step ${await page.evaluate(() => window.__measure.readout()?.step)} t ${await page.evaluate(() => window.__measure.readout()?.t)}`) }
      await page.keyboard.press('Home'); await wait(page, reduced ? 150 : 2800); keys.push(`home: step ${await page.evaluate(() => window.__measure.readout()?.step)}`)
      await page.keyboard.press('Escape'); await wait(page, reduced ? 200 : 1800)
      keys.push(`escape: ${await page.evaluate(() => window.__measure.phase())}, focus ${await page.evaluate(() => document.activeElement?.id)}`)
      row.keys = keys
      console.log(`${tag} keys: ${keys.join(' | ')}`)
    } else {
      await page.evaluate(() => window.__measure.open())
      if (!reduced && !opt['only-steps']) {
        await wait(page, 450); row.frames.push(await shot('1-ink-half'))
        await page.waitForFunction(() => window.__measure.phase() !== 'ink', null, { timeout: 5000 }); row.frames.push(await shot('2-ink'))
      }
      await page.waitForFunction(() => window.__measure.phase() === 'open', null, { timeout: 8000 })
      await wait(page, 450)
      for (const st of wantSteps) {
        await page.evaluate((n) => window.__measure.go(n), st)
        await frames(page); await wait(page, 120)
        const ro = await page.evaluate(() => window.__measure.readout())
        row.readouts[`step${st}`] = ro
        row.chrome[`step${st}`] = await page.evaluate(() => window.__measure.chrome())
        row.frames.push(await shot(`step${st}`))
        if (ro.overlaps.length) { bad++; console.log(`${tag} step ${st}: OVERLAP ${ro.overlaps.join('; ')}`) }
        const off = ro.labels.filter((l) => !l.box).map((l) => l.id)
        if (off.length) console.log(`${tag} step ${st}: left off ${off.join(', ')}`)
      }
      row.targets.open = await page.evaluate(() => window.__measure.targets())
      const phone = SIZES[size].width <= 700
      for (const st of phone ? raisedSteps : drawerSteps) {
        await page.evaluate((n) => window.__measure.go(n), st)
        await page.evaluate((up) => (up ? window.__measure.raise(true) : window.__measure.drawer(true)), phone)
        await frames(page); await wait(page, 200)
        const what = `${phone ? 'raised' : 'drawer'}-step${st}`
        const ro = await page.evaluate(() => window.__measure.readout())
        row.readouts[what] = ro
        row.chrome[what] = await page.evaluate(() => window.__measure.chrome())
        row.targets[what] = await page.evaluate(() => window.__measure.targets())
        row.frames.push(await shot(what))
        if (ro.overlaps.length) { bad++; console.log(`${tag} ${what}: OVERLAP ${ro.overlaps.join('; ')}`) }
        await page.evaluate((up) => (up ? window.__measure.raise(false) : window.__measure.drawer(false)), phone)
        await frames(page); await wait(page, 150)
      }
      if (opt.between) for (const at of [0.5, 1.5, 2.5, 3.5, 4.25, 4.7]) {
        await page.evaluate((x) => window.__measure.at(x), at)
        await frames(page); await wait(page, 80)
        row.frames.push(await shot(`between-${String(at).replace('.', '_')}`))
      }
      if (!opt['only-steps']) {
        await page.evaluate(() => window.__measure.go(0))
        const closing = page.evaluate(() => window.__measure.close())
        if (!reduced) { await wait(page, 600); row.frames.push(await shot('8-closing')) }
        await closing
        await frames(page); await wait(page, 150)
        row.frames.push(await shot('9-closed'))
      }
    }
    const small = Object.values(row.targets).flat().filter((t) => t.w < 44 || t.h < 44)
    if (small.length) { console.log(`${tag}: under 44 px: ${small.map((t) => `${t.what} ${t.w}x${t.h}`).join(', ')}`) ; bad++ }
  }
  if (errors.length || failed.length) { bad++; console.log(`${tag}: ${errors.length} console error(s), ${failed.length} failed request(s): ${[...errors, ...failed].slice(0, 4).join(' | ')}`) }
  writeFileSync(join(OUT, `readout-${tag}.json`), JSON.stringify({ build, page: PAGE, ...row }, null, 1))
  console.log(`${tag}: ${row.frames.length} frames, ${errors.length} errors, ${failed.length} failed`)
  report.push({ tag, frames: row.frames.length, errors: errors.length, failed: failed.length })
  await ctx.close()
}
await browser.close()
await s.close()
console.log(`${bad ? `RED ${bad}` : 'GREEN'}: ${report.length} runs, build ${build.short}${build.dirty ? ' with changes' : ''}`)
process.exit(bad ? 1 : 0)
