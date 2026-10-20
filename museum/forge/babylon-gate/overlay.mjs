// THE LEGEND OVER A STILL, IN THE HOUSE'S OWN CSS: the desktop band under the picture or the phone's box over its foot,
// with the legend in the line's place. The tokens come from `index.html`, the rules from `desk-chrome.css` and
// `vinci/film-wing.css`, read at run time, never copied. The other rows of the band and the box (the name, the keys, the
// foot) are held empty at the heights the live wing measured (`sheet-box.mjs`): their words belong to a wing, not to this
// round. The picture covers its box as the film does (object-fit cover, centred).
//
//   node forge/babylon-gate/overlay.mjs --still <abs png> --lang en|de --out <abs png> --live <sheet-box.json>
//        [--hero <hero.json>]                       the still's hero boxes, checked against the free area
//        [--mark 0.5 --gap 0.2]                      the certainty mark's size and the gap after it, in em
//   node forge/babylon-gate/overlay.mjs --still <abs png> --sheet --out <abs png> --live <sheet-box.json> [--hero <hero.json>]
//        the sheet's outline at rest laid over the still, for the live wing's line and for the legend, both languages
// A JSON beside every output holds the boxes, the line's rows, the picture's share and each check's result.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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
function handIn(name) {
  if (process.env[name]) return resolve(process.env[name])
  throw new Error(`set ${name} to the hand-in folder of the round`)
}
const HAND = handIn('GATE_HAND')
const inHand = (p) => typeof p === 'string' && resolve(p).startsWith(HAND + sep) && !resolve(p).startsWith(join(HAND, 'words') + sep)
if (!inHand(opt.out)) throw new Error('--out must lie in the hand-in folder, outside words/')
const still = resolve(String(opt.still))
const side = JSON.parse(readFileSync(still.replace(/\.png$/, '.json'), 'utf8'))
const [cw, ch] = side.cssSize, ratio = side.ratio
const desk = side.framing === 'desktop'
const legend = JSON.parse(readFileSync(join(HAND, 'words', 'legend.json'), 'utf8'))
const live = JSON.parse(readFileSync(String(opt.live), 'utf8'))
const hero = opt.hero && opt.hero !== true ? JSON.parse(readFileSync(String(opt.hero), 'utf8')).cams?.[`${side.framing}-${cw}x${ch}`] ?? null : null
const liveRun = (lang) => live.runs.find((r) => r.size === `${cw}x${ch}` && r.lang === lang) ?? null

const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const index = readFileSync(join(APP, 'index.html'), 'utf8')
const tokens = [...index.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).find((s) => s.includes('--ui-ground:'))
if (!tokens) throw new Error('no token block in index.html')
const deskCss = readFileSync(join(APP, 'src', 'wings', 'desk-chrome.css'), 'utf8')
const filmCss = readFileSync(join(APP, 'src', 'wings', 'vinci', 'film-wing.css'), 'utf8')

/* the house's certainty mark (desk-chrome.ts deskMark): shape carries the class, the colour reinforces it */
const MARK = {
  documented: '<circle cx="9" cy="9" r="6.2" fill="var(--ui-sure-documented)" stroke="var(--ui-text)" stroke-width="1.5"/>',
  reconstructed: '<circle cx="9" cy="9" r="6.2" fill="var(--ui-ground)" stroke="var(--ui-sure-reconstructed)" stroke-width="1.8"/><path d="M9 2.8a6.2 6.2 0 0 0 0 12.4z" fill="var(--ui-sure-reconstructed)"/>',
  conjectural: '<circle cx="9" cy="9" r="5.8" fill="var(--ui-ground)" stroke="var(--ui-sure-conjectural)" stroke-width="2.4"/>',
}
const ORDER = ['documented', 'reconstructed', 'conjectural']
/** line 1 split at its full stops, a mark before each phrase, held to the phrase's first word; line 2 plain */
function legendHtml(lang) {
  const [l1, l2] = legend[lang]
  const phrases = l1.match(/[^.]+\./g)?.map((p) => p.trim()) ?? [l1]
  if (phrases.length !== 3) throw new Error(`line 1 in ${lang} splits into ${phrases.length} phrases, not 3`)
  const one = phrases.map((p, i) => {
    const [first, ...rest] = p.split(' ')
    const mark = `<svg class="gate-mark" viewBox="0 0 18 18" aria-hidden="true">${MARK[ORDER[i]]}</svg>`
    return `<span class="gate-phrase"><span class="gate-hold">${mark}${html(first)}</span>${rest.length ? ' ' + html(rest.join(' ')) : ''}</span>`
  }).join(' ')
  return `<span class="gate-l1">${one}</span><span class="gate-l2">${html(l2)}</span>`
}

/** the mark's size and its gap after it, in the line's em */
const MARK_EM = Number(opt.mark ?? 0.5), GAP_EM = Number(opt.gap ?? 0.2)
const OWN = `
.gate-stage { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; overflow: hidden; z-index: 0; }
.gate-still { width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; display: block; }
.gate-l1, .gate-l2 { display: block; }
.gate-hold { white-space: nowrap; }
.gate-mark { display: inline-block; width: ${MARK_EM}em; height: ${MARK_EM}em; margin-right: ${GAP_EM}em; vertical-align: -.02em; overflow: visible; }
.gate-outline { position: fixed; left: 0; right: 0; bottom: 0; box-sizing: border-box; pointer-events: none; z-index: 9; }
.gate-outline.live { border-top: 2px dashed var(--ui-way); }
.gate-outline.legend { border-top: 2px solid var(--ui-sure-conjectural); }
.gate-hero { position: fixed; box-sizing: border-box; border: 2px solid var(--ui-sure-documented); z-index: 9; pointer-events: none; }
`
function page(lang, mode) {
  const held = (sel, fallback) => Math.round(liveRun(lang)?.parts?.[sel]?.height ?? fallback)
  const chrome = desk
    ? `<div class="desk-low"><div class="desk-cap"><div class="desk-name" style="min-height:${held('.desk-name', 30)}px"></div>` +
      `<p class="desk-line">${legendHtml(lang)}</p><div class="desk-foot" style="min-height:${held('.desk-foot', 44)}px"></div></div>` +
      `</div>`
    : `<div class="film-box"><div class="film-name" style="min-height:${held('.film-box > .film-name', 34)}px;box-sizing:border-box"></div>` +
      `<p class="film-line">${legendHtml(lang)}</p>` +
      `<div class="film-keys" style="min-height:${held('.film-box > .film-keys', 42)}px;box-sizing:border-box"></div>` +
      `<div class="film-foot" style="height:${held('.film-foot', 80)}px;box-sizing:border-box"></div></div>`
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${tokens}</style><style>${deskCss}</style><style>${filmCss}</style><style>${OWN}</style></head>` +
    `<body><div id="wing" ${desk ? 'data-desk="stage"' : 'data-film="upright"'}><div class="wing-stage gate-stage"><img class="gate-still" src="/still.png" alt=""></div>` +
    `${chrome}</div></body></html>`
}

/** in the page: the chrome's boxes, the line's rows and the picture's share of the stage (the union of rectangles) */
function read() {
  const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10, left: Math.round(b.left), width: Math.round(b.width) } }
  const stage = document.querySelector('.gate-stage')
  const low = document.querySelector('.desk-low')
  if (low) stage.style.height = `${innerHeight - low.getBoundingClientRect().height}px`
  const covers = []
  for (const s of ['.desk-low', '.film-box > .film-name', '.film-box > .film-line', '.film-box > .film-keys', '.film-foot']) {
    const el = document.querySelector(s)
    if (el) { const b = el.getBoundingClientRect(); if (b.height >= 1) covers.push(b) }
  }
  const pic = stage.getBoundingClientRect()
  let covered = 0, total = 0
  for (let y = 1; y < innerHeight; y += 2) for (let x = 1; x < innerWidth; x += 2) {
    total++
    const inPicture = x >= pic.left && x < pic.right && y >= pic.top && y < pic.bottom
    if (!inPicture || covers.some((c) => x >= c.left && x < c.right && y >= c.top && y < c.bottom)) covered++
  }
  const line = document.querySelector('.film-line, .desk-line')
  const cs = getComputedStyle(line)
  const lh = parseFloat(cs.lineHeight)
  const rows = (el) => Math.round(el.getBoundingClientRect().height / lh)
  const box = document.querySelector('.film-box, .desk-low')
  // each line's width set on one row, against the measure it has
  const natural = (el) => { const c = el.cloneNode(true); c.style.cssText = 'display:inline-block;white-space:nowrap;position:absolute;visibility:hidden'; line.append(c); const w = c.getBoundingClientRect().width; c.remove(); return Math.round(w) }
  return {
    picture: r(stage), chrome: r(box), line: { ...r(line), rows: Math.round((line.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh), lineHeight: lh, font: cs.font,
      rowsL1: rows(line.querySelector('.gate-l1')), rowsL2: rows(line.querySelector('.gate-l2')),
      measure: Math.round(line.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), widthL1: natural(line.querySelector('.gate-l1')), widthL2: natural(line.querySelector('.gate-l2')),
      overflow: line.scrollWidth > line.clientWidth + 0.5 },
    pictureShare: Math.round((1 - covered / total) * 1000) / 10,
  }
}

const browser = await chromium.launch()
const report = { tool: 'overlay.mjs', still, css: [cw, ch], ratio, framing: side.framing, legendFile: join(HAND, 'words', 'legend.json'), runs: [] }
const requests = new Set()
async function open(lang, mode) {
  const ctx = await browser.newContext({ viewport: { width: cw, height: ch }, deviceScaleFactor: ratio })
  const p = await ctx.newPage()
  p.on('request', (q) => requests.add(q.url()))
  await p.route('http://overlay.local/**', (route) => {
    const u = new URL(route.request().url())
    if (u.pathname === '/still.png') return route.fulfill({ body: readFileSync(still), contentType: 'image/png' })
    if (u.pathname === '/') return route.fulfill({ body: page(lang, mode), contentType: 'text/html; charset=utf-8' })
    return route.fulfill({ status: 404, body: '' })
  })
  await p.goto('http://overlay.local/')
  await p.waitForFunction(() => { const i = document.querySelector('.gate-still'); return i && i.complete && i.naturalWidth > 0 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p }
}
/** a share floor by the line's rows: two thirds at three rows, three quarters at two or fewer */
const floor = (rows) => (rows <= 2 ? 75 : 66.7)
let failed = 0
try {
  if (!opt.sheet) {
    const lang = String(opt.lang)
    if (!legend[lang]) throw new Error(`no legend for ${lang}`)
    const { ctx, p } = await open(lang, 'legend')
    const m = await p.evaluate(read)
    const run = { lang, ...m, checks: {} }
    const lv = liveRun(lang)
    if (desk) {
      run.checks.rowsAtMostTwo = m.line.rows <= 2
      run.checks.liveBand = lv?.band?.height ?? null
      run.checks.noOverflow = !m.line.overflow
    } else {
      run.checks.shareFloor = floor(m.line.rows)
      run.checks.shareKept = m.pictureShare >= floor(m.line.rows)
      run.checks.rowsAtMostThree = m.line.rows <= 3
      run.checks.noOverflow = !m.line.overflow
      if (lv?.sheet && lv?.parts?.['.film-box > .film-line']) {
        // the live box with its line swapped for the legend's: the held rows must give back the live box's own height
        run.checks.liveSheet = lv.sheet.height
        run.checks.heldDelta = Math.round((m.chrome.height - (lv.sheet.height - lv.parts['.film-box > .film-line'].height + m.line.height)) * 10) / 10
      }
    }
    if (hero) {
      // the desktop picture is covered into the window less the band, so the still loses half the band at its top and foot
      const lift = desk ? (ch - m.picture.height) / 2 : 0
      const free = desk ? m.picture.height : m.chrome.top
      run.checks.heroInFree = Object.fromEntries(Object.entries(hero).filter(([, b]) => Array.isArray(b)).map(([k, b]) => [k, { top: b[1] - lift, bottom: b[3] - lift, free, inside: b[3] - lift <= free && b[1] - lift >= 0 && b[0] >= 0 && b[2] <= cw }]))
    }
    for (const v of Object.values(run.checks)) if (v === false) failed++
    if (run.checks.heroInFree) for (const v of Object.values(run.checks.heroInFree)) if (!v.inside) failed++
    mkdirSync(dirname(opt.out), { recursive: true })
    await p.screenshot({ path: String(opt.out) })
    report.runs.push(run)
    console.log(`${lang}: chrome ${m.chrome.top}+${m.chrome.height} line rows ${m.line.rows} (${m.line.rowsL1}+${m.line.rowsL2}) widths ${m.line.widthL1}+${m.line.widthL2} of ${m.line.measure} mark ${MARK_EM} gap ${GAP_EM} share ${m.pictureShare} ${JSON.stringify(run.checks)}`)
    await ctx.close()
  } else {
    // the outline: where the live box stands at rest (dashed) and where the legend's box stands (solid), the hero's boxes ringed
    const tops = {}
    for (const lang of Object.keys(legend)) {
      const { ctx, p } = await open(lang, 'legend')
      tops[lang] = await p.evaluate(read)
      await ctx.close()
    }
    const liveTop = Math.min(...Object.keys(legend).map((l) => liveRun(l)?.sheet?.top ?? ch))
    const legendTop = Math.min(...Object.values(tops).map((m) => m.chrome.top))
    const { ctx, p } = await open('en', 'legend')
    await p.evaluate(({ liveTop, legendTop, hero, ch }) => {
      document.querySelector('.film-box, .desk-low')?.remove()
      const add = (cls, top) => { const d = document.createElement('div'); d.className = `gate-outline ${cls}`; d.style.top = `${top}px`; document.body.append(d) }
      add('live', liveTop)
      add('legend', legendTop)
      for (const b of Object.values(hero ?? {}).filter((b) => Array.isArray(b))) {
        const d = document.createElement('div'); d.className = 'gate-hero'
        Object.assign(d.style, { left: `${b[0] - 2}px`, top: `${b[1] - 2}px`, width: `${b[2] - b[0] + 4}px`, height: `${b[3] - b[1] + 4}px` })
        document.body.append(d)
      }
    }, { liveTop, legendTop, hero, ch })
    const run = { mode: 'sheet', liveTop, legendTop, perLang: Object.fromEntries(Object.entries(tops).map(([l, m]) => [l, { top: m.chrome.top, rows: m.line.rows, share: m.pictureShare }])), checks: {} }
    if (hero) run.checks.heroInFree = Object.fromEntries(Object.entries(hero).filter(([, b]) => Array.isArray(b)).map(([k, b]) => [k, { bottom: b[3], free: Math.min(liveTop, legendTop), inside: b[3] <= Math.min(liveTop, legendTop) }]))
    if (run.checks.heroInFree) for (const v of Object.values(run.checks.heroInFree)) if (!v.inside) failed++
    for (const [l, m] of Object.entries(tops)) { run.checks[`share-${l}`] = m.pictureShare >= floor(m.line.rows); if (!run.checks[`share-${l}`]) failed++ }
    mkdirSync(dirname(opt.out), { recursive: true })
    await p.screenshot({ path: String(opt.out) })
    report.runs.push(run)
    console.log(`sheet: live top ${liveTop} legend top ${legendTop} ${JSON.stringify(run.checks)}`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
report.requests = [...requests].sort()
writeFileSync(String(opt.out).replace(/\.png$/, '.json'), JSON.stringify(report, null, 1))
console.log(failed ? `checks failed ${failed}` : 'checks ok')
process.exit(failed ? 1 : 0)
