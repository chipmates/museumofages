// THE LIVE WING'S CHROME, MEASURED ONCE: the phone's box at rest and the desktop's band, at the sizes the gate's stills use.
// A copy of `forge/room-share.mjs`'s union-of-rectangles reading for the film form, which that tool does not walk (it
// measures the station chrome at 390x844 and 390x700 only). The film wing serves the store read only through vite.
//
//   node forge/babylon-gate/sheet-box.mjs --out <abs json in the hand-in> [--port 5222] [--at picture-room-lisa]
//        [--sizes 390x664,360x640,390x844,1600x900] [--langs en,de] [--film w5] [--shots <abs folder>]
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserArgs } from '../rig.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
  else { opt[a.slice(2)] = next; i++ }
}
const PORT = Number(opt.port ?? 5222)
if (PORT < 5220 || PORT > 5229) throw new Error('the gate seat owns ports 5220 to 5229')
function handIn(name) {
  if (process.env[name]) return resolve(process.env[name])
  throw new Error(`set ${name} to the hand-in folder of the round`)
}
const HAND = handIn('GATE_HAND')
const inHand = (p) => typeof p === 'string' && resolve(p).startsWith(HAND + sep)
if (!inHand(opt.out)) throw new Error('--out must lie in the hand-in folder')
if (opt.shots && !inHand(opt.shots)) throw new Error('--shots must lie in the hand-in folder')
const AT = String(opt.at ?? 'picture-room-lisa')
const SIZES = String(opt.sizes ?? '390x664,360x640,390x844,1600x900').split(',').map((s) => s.split('x').map(Number))
const LANGS = String(opt.langs ?? 'en,de').split(',')
// the film is the wing on every device; the release the player check walks
const FILM = String(opt.film ?? 'w5')

const { createServer } = await import('vite')
const vite = await createServer({ root: APP, configFile: join(APP, 'vite.config.ts'), server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await vite.listen()
const browser = await chromium.launch({ args: browserArgs('webgpu') })

/** in the page: the chrome's boxes, the union's share of the stage on a 2 px grid, the line's rows */
function read() {
  const seen = (el) => {
    if (!el || el.hidden) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false
    const r = el.getBoundingClientRect()
    return r.width >= 1 && r.height >= 1
  }
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 } }
  const film = document.querySelector('.na-film') ?? document.querySelector('#wing canvas, canvas')
  const box = film ? film.getBoundingClientRect() : null
  const parts = {}
  const covers = []
  const sel = ['.desk-low', '.film-box > .film-name', '.film-box > .film-line', '.film-box > .film-drawer', '.film-box > .film-keys',
    '.film-foot', '.film-back', '.film-book', '.film-gold', '.vinci-dock[open]', '.desk-drawer']
  for (const s of sel) for (const el of document.querySelectorAll(s)) {
    if (!seen(el)) continue
    const r = el.getBoundingClientRect()
    covers.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    parts[s] = rect(el)
  }
  // the band's own rows, read for the overlay's held heights; inside the band, so never counted twice
  for (const s of ['.desk-cap', '.desk-name', '.desk-line', '.desk-foot', '.desk-ways']) {
    const el = document.querySelector(s)
    if (seen(el)) parts[s] = rect(el)
  }
  let covered = 0, total = 0
  for (let y = 1; y < innerHeight; y += 2) for (let x = 1; x < innerWidth; x += 2) {
    total++
    const inPicture = box && x >= box.left && x < box.right && y >= box.top && y < box.bottom
    if (!inPicture || covers.some((c) => x >= c.left && x < c.right && y >= c.top && y < c.bottom)) covered++
  }
  const line = [...document.querySelectorAll('.film-line, .desk-line')].find(seen) ?? null
  const lh = line ? parseFloat(getComputedStyle(line).lineHeight) : 0
  const lineInner = line ? line.getBoundingClientRect().height - parseFloat(getComputedStyle(line).paddingTop) - parseFloat(getComputedStyle(line).paddingBottom) : 0
  const sheet = document.querySelector('.film-box')
  const band = document.querySelector('.desk-low')
  const css = (el, props) => el ? Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])) : null
  return {
    viewport: { width: innerWidth, height: innerHeight },
    picture: box ? rect(film) : null,
    sheet: seen(sheet) ? rect(sheet) : null,
    band: seen(band) ? rect(band) : null,
    parts,
    pictureShare: Math.round((1 - covered / total) * 1000) / 10,
    line: line ? { cls: line.className, rows: lh ? Math.round(lineInner / lh) : 0, lineHeight: lh, words: line.textContent.trim().length,
      style: css(line, ['font-family', 'font-size', 'line-height', 'padding-top', 'padding-left', 'padding-right', 'color']) } : null,
    film: document.querySelector('#wing')?.dataset.film ?? null,
    desk: document.querySelector('#wing')?.dataset.desk ?? null,
  }
}

const report = { tool: 'sheet-box.mjs', at: AT, film: FILM, port: PORT, runs: [] }
try {
  for (const [width, height] of SIZES) for (const lang of LANGS) {
    const phone = width < 700
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone })
    await ctx.addInitScript(() => { try { localStorage.setItem('agc_probe', '1') } catch { /* storage refused */ } })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
    const run = { size: `${width}x${height}`, lang, errors }
    try {
      await page.goto(`http://127.0.0.1:${PORT}/w/vinci?${FILM === "none" ? "" : `film=${FILM}&`}order=life&probe=1&lang=${lang}#s=${AT}`, { waitUntil: 'load', timeout: 120000 })
      run.stood = await page.waitForFunction(() => {
        const still = document.querySelector('.na-film-still')
        const gold = document.getElementById('goldbreath')
        // the film's still, or the live wing's chrome standing over its canvas once the entry field lifts
        const chrome = document.querySelector('.film-box:not([hidden]), .desk-low')
        return (!gold || !gold.classList.contains('lit')) && ((still && still.complete && still.naturalWidth > 0) || (!still && chrome && document.querySelector('canvas')))
      }, null, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false)
      run.state = await page.evaluate(() => document.querySelector('.na-film')?.dataset.state ?? null)
      await page.waitForTimeout(1500)
      Object.assign(run, await page.evaluate(read))
      if (opt.shots) {
        mkdirSync(opt.shots, { recursive: true })
        await page.screenshot({ path: join(opt.shots, `live-${width}x${height}-${lang}.png`) })
      }
    } catch (e) { run.failed = String(e).slice(0, 200) }
    report.runs.push(run)
    console.log(`${run.size} ${lang}: stood ${run.stood} sheet ${run.sheet ? `${run.sheet.top}+${run.sheet.height}` : '-'} band ${run.band ? `${run.band.top}+${run.band.height}` : '-'} line rows ${run.line?.rows ?? '-'} picture share ${run.pictureShare ?? '-'}${errors.length ? ` errors ${errors.length}` : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
mkdirSync(dirname(opt.out), { recursive: true })
writeFileSync(opt.out, JSON.stringify(report, null, 1))
console.log(`wrote ${opt.out}`)
