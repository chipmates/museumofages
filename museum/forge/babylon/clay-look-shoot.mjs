// FEATURE 6'S LOOK SHOOTER: stop 7's held frame with its door, the look opening, the press, the paper steps and the
// close, at the visitor's pixel ratio, with the page's own read-back beside each frame. The stills and the photo are
// handed in from a folder by address, never from the store.
//
//   node forge/babylon/clay-look-shoot.mjs --out <abs folder> --stills <abs folder> [--port 5384]
//        [--engine chromium|webkit] [--sizes desktop,phone,phone-small] [--langs en,de] [--hands] [--only rest,open]
// --stills holds held-desktop.png, held-phone.png and met-86.11.361.jpg. --hands presses the press, back and play
// controls with the pointer and the step names by click, as a hand does, and records what each did.
// Frames: look-<lang>-<size>[-webkit]-<what>.png and readout-<lang>-<size>[-webkit].json. Exit 1 on a console error,
// a failed request, a label overlap, a target under 44 px or a press that did not add exactly one wedge.
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
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) fail('--out <absolute folder>')
if (!opt.stills || opt.stills === true || !isAbsolute(String(opt.stills))) fail('--stills <absolute folder>')
const OUT = resolve(String(opt.out)), STILLS = resolve(String(opt.stills))
mkdirSync(OUT, { recursive: true })
const PORT = Number(opt.port ?? 5384)
const ENGINE = String(opt.engine ?? 'chromium')
const SIZES = {
  desktop: { width: 1600, height: 900, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  'phone-small': { width: 360, height: 640, deviceScaleFactor: 3 },
}
const sizes = String(opt.sizes ?? 'desktop,phone').split(',')
for (const s of sizes) if (!SIZES[s]) fail(`size "${s}": ${Object.keys(SIZES).join(', ')}`)
const langs = String(opt.langs ?? 'en,de').split(',')
const only = opt.only && opt.only !== true ? new Set(String(opt.only).split(',')) : null
const want = (what) => !only || only.has(what)

const s = await serve({ port: PORT })
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ args: browserArgs('webgpu') })
let bad = 0
const report = []
const wait = (page, ms) => page.waitForTimeout(ms)
const frames = (page, n = 2) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

for (const lang of langs) for (const size of sizes) {
  const ctx = await browser.newContext({ viewport: { width: SIZES[size].width, height: SIZES[size].height }, deviceScaleFactor: SIZES[size].deviceScaleFactor })
  const page = await ctx.newPage()
  const errors = [], failed = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`) })
  await page.route('**/_stills/**', async (route) => {
    const file = join(STILLS, new URL(route.request().url()).pathname.split('/').pop())
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'none' })
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: file.endsWith('.png') ? 'image/png' : 'image/jpeg' })
  })
  const params = new URLSearchParams({ lang, held: "/_stills/held-{framing}.png", photo: "/_stills/met-86.11.361.jpg" }).toString()
  const tag = `look-${lang}-${size}${ENGINE === 'webkit' ? '-webkit' : ''}`
  await page.goto(`${s.base}/src/wings/babylon/clay/look.html?${params}`)
  try { await page.waitForFunction(() => window.__claylook?.ready === true, null, { timeout: 120000, polling: 200 }) }
  catch (e) { console.log(`${tag}: not ready: ${JSON.stringify(errors)} ${JSON.stringify(failed)}`); throw e }
  await frames(page, 4)
  const row = { lang, size, engine: ENGINE, build: buildId(), frames: [], steps: {}, hands: [], errors, failed, marked: {} }
  const shot = async (what) => {
    const f = join(OUT, `${tag}-${what}.png`); await page.screenshot({ path: f })
    row.marked[what] = await page.evaluate(() => { const n = document.getElementById('says'); return Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.textContent) })
    row.frames.push(f)
  }
  const read = async (what) => {
    const r = await page.evaluate(() => ({ readout: window.__claylook.readout(), chrome: window.__claylook.chrome(), targets: window.__claylook.targets(), state: window.__claylook.state() }))
    row.steps[what] = r
    const small = r.targets.filter((x) => x.w < 44 || x.h < 44)
    if (small.length) { bad++; console.log(`${tag} ${what}: under 44 px: ${JSON.stringify(small)}`) }
    if (r.readout?.overlaps?.length) { bad++; console.log(`${tag} ${what}: overlaps ${r.readout.overlaps.join('; ')}`) }
  }
  if (want('rest')) { await shot('00-rest'); row.steps.rest = { targets: await page.evaluate(() => window.__claylook.targets()) } }
  // THE OPENING: the door, the held frame crossing to the tablet, the fresh tablet
  await page.click('#door')
  await page.waitForFunction(() => window.__claylook.state().standing, null, { timeout: 120000, polling: 100 })
  if (want('open')) {
    await page.waitForFunction(() => window.__claylook.state().held < 0.65, null, { timeout: 10000, polling: 16 }).catch(() => {})
    await shot('01-opening')
  }
  await page.evaluate(() => window.__claylook.standing())
  await frames(page, 20)
  await shot('02-press-0'); await read('press-0')
  if (opt.hands) {
    // a hand on each control: press twice, back once, play to the end, Space once from fresh clay
    const clock = () => page.evaluate(() => window.__claylook.readout().press.clock)
    const before = await clock()
    await page.click('.clay-press'); await wait(page, 900); const one = await clock()
    await page.click('.clay-press'); await wait(page, 900); const two = await clock()
    await page.click('.clay-back'); await wait(page, 300); const back = await clock()
    row.hands.push({ before, one, two, back })
    if (!(Math.abs(one - before - 1) < 0.01 && Math.abs(two - one - 1) < 0.01 && Math.abs(back - one) < 0.01)) { bad++; console.log(`${tag}: press or back off: ${before} ${one} ${two} ${back}`) }
    await page.evaluate(() => window.__claylook.pose(0))
    await page.click('.clay-play'); await wait(page, 25000); const played = await clock()
    row.hands.push({ played })
    if (Math.abs(played - 23) > 0.01) { bad++; console.log(`${tag}: play stopped at ${played}`) }
    await page.evaluate(() => window.__claylook.pose(0))
    // Space on a focused button presses that button, as it should: the hand's Space is tried with nothing focused
    await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Space'); await wait(page, 900); const spaced = await clock()
    row.hands.push({ spaced })
    if (Math.abs(spaced - 1) > 0.01) { bad++; console.log(`${tag}: Space pressed to ${spaced}`) }
    await page.evaluate(() => window.__claylook.pose(0))
  }
  if (want('press')) {
    for (let i = 0; i < 7; i++) await page.evaluate(() => window.__claylook.press())
    await frames(page, 12); await shot('03-press-7'); await read('press-7')
    await page.evaluate(() => window.__claylook.pose(23)); await frames(page, 30); await shot('04-press-23'); await read('press-23')
  }
  if (want('frametime')) row.frameTime = await page.evaluate(() => window.__claylook.frameTime(12))
  if (want('paper')) {
    await page.evaluate(() => window.__claylook.pose(23))
    for (const [what, t] of [['05-cross', 0.5], ['06-letters', 1], ['07-fold', 1.5], ['08-signs', 2], ['09-cross', 2.5], ['10-students', 3], ['11-readers', 4]]) {
      await page.evaluate((x) => window.__claylook.at(x), t); await frames(page, 6)
      if (Number.isInteger(t)) await page.evaluate(() => document.fonts.ready)
      await shot(what); await read(what)
    }
    if (size !== 'desktop') { await page.evaluate(() => window.__claylook.go(1)); await page.evaluate(() => window.__claylook.raise(true)); await frames(page, 8); await shot('12-raised'); await read('raised'); await page.evaluate(() => window.__claylook.raise(false)) }
  }
  if (want('close')) {
    await page.evaluate(() => window.__claylook.close()); await frames(page, 6)
    row.focus = await page.evaluate(() => document.activeElement?.id ?? '')
    await shot('13-closed')
    if (row.focus !== 'door') { bad++; console.log(`${tag}: focus after close on "${row.focus}"`) }
  }
  if (errors.length || failed.length) { bad++; console.log(`${tag}: errors ${JSON.stringify(errors)} failed ${JSON.stringify(failed)}`) }
  if (Object.values(row.marked).some(Boolean)) { bad++; console.log(`${tag}: the harness's marker in a frame`) }
  writeFileSync(join(OUT, `readout-${lang}-${size}${ENGINE === 'webkit' ? '-webkit' : ''}.json`), JSON.stringify(row, null, 1))
  report.push({ tag, frames: row.frames.length, frameTime: row.frameTime ?? null, hands: row.hands })
  await ctx.close()
}
await browser.close()
await s.close()
console.log(JSON.stringify(report, null, 1))
console.log(bad ? `RED: ${bad} finding(s)` : 'GREEN')
process.exit(bad ? 1 : 0)
