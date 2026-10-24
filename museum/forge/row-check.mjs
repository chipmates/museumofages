#!/usr/bin/env node
// THE ROWS A STATION LINE TAKES ON THE NARROWEST PHONE. A station's line holds
// three rows at 360 by 640 (program/STORY-SYSTEM.md §5). Characters only stand
// in for rows (story-check's 100-character rule); here every station line of
// the story file is set into the wing's own line, in its sheet, on a phone
// page of a running server, and its rendered rows are counted, in Chromium and
// in WebKit. A fourth row is refused.
//
//   node forge/row-check.mjs [port]                     (else FORGE_PORT, else 5199)
//   node forge/row-check.mjs 5292 --langs=en,de         (the default)
//   node forge/row-check.mjs 5292 --line=de:<text>      (one line of your own instead of the story's)
//
// Exit 1 means a line was refused, 2 that the page could not be read. JSON on
// stdout. It shoots a running server of this checkout and starts none.
import { chromium, webkit } from 'playwright'
import { createLoader, WING_DIR } from './film/load.mjs'
import { assertServer, browserArgs } from './rig.mjs'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const PORT = Number(positional[0] ?? process.env['FORGE_PORT'] ?? 5199)
const BASE = `http://localhost:${PORT}`
const LANGS = (flag('langs') ?? 'en,de').split(',')
const OWN = flag('line')
const MAX_ROWS = 3
const PHONE = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const ENGINES = { chromium, webkit }
const WING_MS = 180_000

/** every station line of the story file, or the one line asked for */
async function lines() {
  if (OWN) {
    const at = OWN.indexOf(':')
    return [{ id: 'own', lang: OWN.slice(0, at), text: OWN.slice(at + 1) }]
  }
  const loader = await createLoader()
  const story = loader.load(`${WING_DIR}/story.ts`)
  const stops = (story.vinciStory ?? []).filter((s) => s.kind === 'station')
  if (!stops.length) throw new Error('the story file names no station')
  return LANGS.flatMap((lang) => stops.map((s) => ({ id: s.id, lang, text: String(s.line?.[lang] ?? '') })))
}

/** the rendered rows of each text, set one after another into the wing's own line (one task, so nothing redraws it between) */
function measure(texts) {
  const el = [...document.querySelectorAll('.film-box .film-line')].find((e) => e.getBoundingClientRect().height > 0)
  if (!el) return { error: 'no station line stands in the sheet' }
  const keep = el.textContent
  const range = document.createRange()
  const rowsOf = () => {
    const centres = []
    const node = el.firstChild
    for (let i = 0; node && i < node.textContent.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1)
      const q = [...range.getClientRects()].find((r) => r.height > 0)
      if (!q) continue
      const c = (q.top + q.bottom) / 2
      if (!centres.some((x) => Math.abs(x - c) < Math.max(3, q.height * 0.4))) centres.push(c)
    }
    return centres.length
  }
  const out = texts.map((t) => { el.textContent = t; return rowsOf() })
  el.textContent = keep
  const cs = getComputedStyle(el)
  return { rows: out, font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0]}`, width: Math.round(el.getBoundingClientRect().width) }
}

const wanted = await lines()
await assertServer(BASE)
const result = { checker: 'row-check', port: PORT, phone: `${PHONE.viewport.width}x${PHONE.viewport.height}`, maxRows: MAX_ROWS, engines: {}, lines: [], failures: [], ok: false }
let broken = false
for (const [name, engine] of Object.entries(ENGINES)) {
  for (const lang of [...new Set(wanted.map((l) => l.lang))]) {
    const mine = wanted.filter((l) => l.lang === lang)
    const browser = await engine.launch(name === 'chromium' ? { args: browserArgs() } : {})
    const ctx = await browser.newContext({ ...PHONE, locale: lang === 'de' ? 'de-DE' : 'en-US' })
    await ctx.addInitScript(() => { try { localStorage.setItem('agc_probe', '1') } catch {} })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/w/vinci?probe=1&lang=${lang}&tier=calm#s=picture-room-lisa`, { waitUntil: 'domcontentloaded' })
    const stood = await page.waitForFunction(() => document.body.dataset.phase === 'wing'
      && [...document.querySelectorAll('.film-box .film-line')].some((e) => e.getBoundingClientRect().height > 0),
    null, { timeout: WING_MS, polling: 250 }).then(() => true).catch(() => false)
    await page.evaluate(() => document.fonts.ready)
    const m = stood ? await page.evaluate(measure, mine.map((l) => l.text)) : { error: 'the wing did not stand with a line in its sheet' }
    await browser.close()
    result.engines[`${name}-${lang}`] = m.error ? { error: m.error } : { font: m.font, width: m.width }
    if (m.error) { broken = true; continue }
    mine.forEach((l, i) => {
      const row = { engine: name, lang, id: l.id, characters: [...l.text].length, rows: m.rows[i] }
      result.lines.push(row)
      if (m.rows[i] > MAX_ROWS) result.failures.push({ code: 'rows', ...row, text: l.text })
      if (!l.text.trim()) result.failures.push({ code: 'empty', engine: name, lang, id: l.id })
    })
  }
}
result.ok = !broken && result.failures.length === 0
console.log(JSON.stringify(result, null, 2))
process.exit(broken ? 2 : result.ok ? 0 : 1)
