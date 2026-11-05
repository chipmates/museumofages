// THE PAPER PAGES' SHOOTER: frames of the paper kit's sheet and of a paper feature's bench, at the visitor's pixel ratio,
// in each language asked, with the page's own read-back beside each frame (where every label stood, what it overlapped,
// the line, the list). The stills a feature opens from are handed in from a folder by address, never from the store.
//
//   node forge/babylon/paper-shoot.mjs --page sheet|measure|oil|words|river --out <abs folder> [--port 5304] [--engine chromium|webkit]
//        [--sizes desktop,phone,phone-short,phone-small] [--langs en,de] [--stills <abs folder>] [--reduced] [--keys]
//        [--dir rtl] [--steps 0,1,2,3,4,5] [--between] [--only-steps] [--raised 2] [--drawer 4]
// oil and words are stop 4's two paper features on one bench (rig __look, two doors at rest); their steps are read from
// the page, and --stills may also hold vat16378.jpg and coasts.json, handed to the bench by address. river is stop 13's
// feature 10 (rig __look, one door); --stills may hold its ink stills and gadmer1927.jpg.
// --raised: on a phone, the sheet one height up (the steps) at these steps; --drawer: on a desktop, the band's drawer
// open at these steps. Each step's read-back carries the chrome's own numbers (`chrome`): the band or the sheet, the
// line's rows, every control's centre, the plate's share of the stage.
// --stills holds held-desktop.jpg, held-phone.jpg, ink-desktop.jpg, ink-phone.jpg (any missing: the page goes without).
// A look page's rest frame carries the doors' numbers (`rest`): each door's box, the group's, the picture's share.
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
if (!['sheet', 'measure', 'oil', 'words', 'river'].includes(PAGE)) fail('--page sheet|measure|oil|words|river')
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
const askedSteps = opt.steps && opt.steps !== true ? String(opt.steps).split(',').map(Number) : null
const list = (k, d) => (opt[k] === undefined ? d : opt[k] === true ? [] : String(opt[k]).split(',').filter(Boolean).map(Number))
const raisedSteps = list('raised', [2]), drawerSteps = list('drawer', [])
const PATHS = { sheet: 'src/wings/babylon/paper/sheet.html', measure: 'src/wings/babylon/measure/measure.html', oil: 'src/wings/babylon/oil/oil.html', words: 'src/wings/babylon/garden-words/garden-words.html', river: 'src/wings/babylon/river/river.html' }
const RIGS = { sheet: '__paper', measure: '__measure', oil: '__look', words: '__look', river: '__look' }
const LOOK = PAGE === 'oil' || PAGE === 'words' || PAGE === 'river'
// a page whose feature crosses through the stop's ink still: its opening frames are the ink's
const INKED = PAGE === 'measure' || PAGE === 'river'
const FEATURE = PAGE === 'words' ? 'garden-words' : PAGE

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
  if (PAGE !== 'sheet' && has('held-desktop.jpg')) params.set('held', '/_stills/held-{framing}.jpg')
  if (INKED && has('ink-desktop.jpg')) params.set('ink', '/_stills/ink-{framing}.jpg')
  if (PAGE === 'river' && has('gadmer1927.jpg')) params.set('photo', '/_stills/gadmer1927.jpg')
  if (LOOK && has('vat16378.jpg')) params.set('photo', '/_stills/vat16378.jpg')
  if (LOOK && has('coasts.json')) params.set('coasts', '/_stills/coasts.json')
  const tag = `${PAGE}-${lang}-${size}${reduced ? '-reduced' : ''}${dir === 'rtl' ? '-rtl' : ''}${ENGINE === 'webkit' ? '-webkit' : ''}`
  await page.goto(`${s.base}/${PATHS[PAGE]}?${params.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')}`)
  const rig = RIGS[PAGE]
  await page.waitForFunction((r) => window[r]?.ready === true, rig, { timeout: 60000, polling: 200 })
  const R = (fn, arg) => page.evaluate(([r, f, a]) => window[r][f](a), [rig, fn, arg])
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
    row.targets = { rest: await R('targets') }
    if (LOOK) row.rest = await R('rest')
    if (opt.keys) {
      // the whole walk by keyboard: Tab to the door, Enter, the arrows across every step, Escape, and the focus back on the door
      const keys = []
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const id = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className); keys.push(`tab ${id}`); if (id === 'door' || (LOOK && await page.evaluate(() => document.activeElement?.dataset?.feature ?? '') === FEATURE)) break }
      await page.keyboard.press('Enter'); await wait(page, reduced ? 200 : 2000)
      keys.push(`enter: ${await R('phase')}`)
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const id = await page.evaluate(() => document.activeElement?.className || document.activeElement?.id); keys.push(`tab ${id}`); if (String(id).includes('paper-slider')) break }
      for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await wait(page, reduced ? 150 : 2800); keys.push(`right: step ${(await R('readout'))?.step} t ${(await R('readout'))?.t}`) }
      await page.keyboard.press('Home'); await wait(page, reduced ? 150 : 2800); keys.push(`home: step ${(await R('readout'))?.step}`)
      await page.keyboard.press('Escape'); await wait(page, reduced ? 200 : 1800)
      keys.push(`escape: ${await R('phase')}, focus ${await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.feature)}`)
      row.keys = keys
      console.log(`${tag} keys: ${keys.join(' | ')}`)
    } else {
      await R('open', LOOK ? FEATURE : undefined)
      if (!reduced && !opt['only-steps']) {
        if (LOOK && !INKED) { await wait(page, 380); row.frames.push(await shot('1-cross-half')) }
        else {
          await wait(page, 450); row.frames.push(await shot('1-ink-half'))
          await page.waitForFunction((r) => window[r].phase() !== 'ink', rig, { timeout: 5000 }); row.frames.push(await shot('2-ink'))
        }
      }
      await page.waitForFunction((r) => window[r].phase() === 'open', rig, { timeout: 8000 })
      await wait(page, 450)
      const count = LOOK ? (await R('state')).steps : 6
      const wantSteps = askedSteps ?? Array.from({ length: count }, (_, i) => i)
      for (const st of wantSteps) {
        await R('go', st)
        await frames(page); await wait(page, 120)
        const ro = await R('readout')
        row.readouts[`step${st}`] = ro
        row.chrome[`step${st}`] = await R('chrome')
        row.frames.push(await shot(`step${st}`))
        if (ro.overlaps.length) { bad++; console.log(`${tag} step ${st}: OVERLAP ${ro.overlaps.join('; ')}`) }
        const off = ro.labels.filter((l) => !l.box).map((l) => l.id)
        if (off.length) console.log(`${tag} step ${st}: left off ${off.join(', ')}`)
      }
      row.targets.open = await R('targets')
      const phone = SIZES[size].width <= 700
      for (const st of phone ? raisedSteps : drawerSteps) {
        await R('go', st)
        await R(phone ? 'raise' : 'drawer', true)
        await frames(page); await wait(page, 200)
        const what = `${phone ? 'raised' : 'drawer'}-step${st}`
        const ro = await R('readout')
        row.readouts[what] = ro
        row.chrome[what] = await R('chrome')
        row.targets[what] = await R('targets')
        row.frames.push(await shot(what))
        if (ro.overlaps.length) { bad++; console.log(`${tag} ${what}: OVERLAP ${ro.overlaps.join('; ')}`) }
        await R(phone ? 'raise' : 'drawer', false)
        await frames(page); await wait(page, 150)
      }
      const betweens = LOOK ? [...Array.from({ length: count - 1 }, (_, i) => i + 0.5), ...(PAGE === 'oil' ? [3.25, 4.25, 4.7] : [])].sort((a, b) => a - b) : [0.5, 1.5, 2.5, 3.5, 4.25, 4.7]
      if (opt.between) for (const at of betweens) {
        await R('at', at)
        await frames(page); await wait(page, 80)
        row.frames.push(await shot(`between-${String(at).replace('.', '_')}`))
      }
      if (!opt['only-steps']) {
        await R('go', 0)
        const closing = R('close')
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
