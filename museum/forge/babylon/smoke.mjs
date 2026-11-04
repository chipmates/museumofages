// THE BASE SMOKE: every Babylon dev page opened in Chromium and WebKit at 1440x900 and 390x844, through the museum's
// own vite config: the document's status code, the console's errors, the failed requests, whether the rig came ready,
// and one screenshot each. Writes SMOKE.md, smoke.json and the stills into --out.
//
//   node forge/babylon/smoke.mjs --out <abs folder> [--port 5212] [--engines chromium,webkit] [--pages map,gate,open,paper,measure]
//        [--cap 300] (seconds a page may take to come ready)
// Exit 0 when every page answered 200, came ready and logged no error; 1 otherwise.
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs } from '../rig.mjs'
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
if (!opt.out || opt.out === true || !isAbsolute(String(opt.out))) { console.error('--out <absolute folder>'); process.exit(2) }
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const PORT = Number(opt.port ?? 5212)
const ENGINES = String(opt.engines ?? 'chromium,webkit').split(',')
const NAMES = String(opt.pages ?? Object.keys(PAGES).join(',')).split(',')
const CAP = Number(opt.cap ?? 300) * 1000
const VIEWS = [
  { tag: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { tag: 'phone', width: 390, height: 844, deviceScaleFactor: 2 },
]
const LAUNCH = { chromium: () => chromium.launch({ args: browserArgs('webgpu') }), webkit: () => webkit.launch() }

const s = await serve({ port: PORT })
const rows = []
const build = buildId()
// the documents' status codes first, the lobby's beside the benches', straight from the dev server
const statuses = {}
for (const p of ['index.html', ...NAMES.map((n) => PAGES[n].html)]) {
  const r = await fetch(`${s.base}/${p}`).catch((e) => ({ status: `fetch failed: ${e.message}` }))
  statuses[p] = r.status
  console.log(`GET /${p} ${r.status}`)
}

for (const engine of ENGINES) {
  let browser
  try { browser = await LAUNCH[engine]() } catch (e) {
    for (const name of NAMES) for (const v of VIEWS) rows.push({ engine, page: name, view: v.tag, status: '-', ready: false, error: `launch failed: ${e.message.split('\n')[0]}` })
    continue
  }
  for (const name of NAMES) for (const v of VIEWS) {
    const P = PAGES[name]
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.deviceScaleFactor })
    const page = await ctx.newPage()
    const errors = [], failed = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 400)}`))
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(s.base, '').slice(0, 160)}`) })
    page.on('requestfailed', (r) => failed.push(`failed ${r.url().replace(s.base, '').slice(0, 160)}: ${r.failure()?.errorText ?? ''}`))
    const row = { engine, page: name, view: `${v.width}x${v.height}@${v.deviceScaleFactor}`, status: null, ready: false, readyS: null, backend: null, says: null, still: null }
    const t0 = Date.now()
    try {
      const res = await page.goto(s.url(name), { waitUntil: 'load', timeout: 120000 })
      row.status = res?.status() ?? null
      row.ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: CAP, polling: 500 }).then(() => true).catch(() => false)
      row.readyS = +((Date.now() - t0) / 1000).toFixed(1)
      if (row.ready) {
        const st = await page.evaluate((rig) => window[rig].state(), P.rig).catch(() => null)
        row.backend = st ? `${st.backend ?? '?'} ${st.architecture ?? ''}`.trim() : null
        // the page draws its live look once after ready; two frames and a short wait let it land
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        await page.waitForTimeout(1500)
      }
      row.says = await page.evaluate(() => document.getElementById('says')?.textContent ?? null).catch(() => null)
      const file = join(OUT, `${engine}-${name}-${v.tag}.png`)
      await page.screenshot({ path: file, timeout: 60000 })
      row.still = file
    } catch (e) { row.error = e.message.split('\n')[0].slice(0, 300) }
    row.errors = errors
    row.failed = failed
    rows.push(row)
    console.log(`${engine} ${name} ${row.view}: status ${row.status} ready ${row.ready} in ${row.readyS} s, ${errors.length} console error(s), ${failed.length} failed request(s)${row.error ? `, ${row.error}` : ''}`)
    for (const e of errors.slice(0, 5)) console.log(`  ERROR ${e}`)
    for (const f of failed.slice(0, 5)) console.log(`  REQUEST ${f}`)
    await ctx.close()
  }
  await browser.close()
}
await s.close()

const bad = rows.filter((r) => r.status !== 200 || !r.ready || r.errors?.length || r.failed?.length || r.error)
const md = [
  `# The base smoke (${new Date().toISOString()}, build ${build.short}${build.dirty ? ' with changes' : ''}, the museum's own vite config)`,
  '',
  `Documents straight from the dev server: ${Object.entries(statuses).map(([p, c]) => `\`${p}\` ${c}`).join(', ')}.`,
  '',
  '| engine | page | viewport | status | ready (s) | backend | console errors | failed requests | still |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.engine} | ${r.page} | ${r.view} | ${r.status ?? '-'} | ${r.ready ? r.readyS : `no (${r.readyS ?? '-'})`} | ${r.backend ?? '-'} | ${r.errors?.length ?? '-'} | ${r.failed?.length ?? '-'} | ${r.still ? r.still.split('/').pop() : r.error ?? '-'} |`),
  '',
  ...rows.filter((r) => r.errors?.length || r.failed?.length || r.error).flatMap((r) => [`## ${r.engine} ${r.page} ${r.view}`, ...(r.error ? [`- ${r.error}`] : []), ...r.errors.map((e) => `- console: ${e}`), ...r.failed.map((f) => `- request: ${f}`), `- the page said: ${r.says}`, '']),
  `${bad.length ? `RED: ${bad.length} of ${rows.length}` : `GREEN: ${rows.length} of ${rows.length}`}`,
]
writeFileSync(join(OUT, 'SMOKE.md'), md.join('\n') + '\n')
writeFileSync(join(OUT, 'smoke.json'), JSON.stringify({ build, statuses, rows }, null, 1))
console.log(md[md.length - 1])
process.exit(bad.length ? 1 : 0)
