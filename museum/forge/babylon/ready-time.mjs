// THE PAGES' READY TIME UNDER TWO QUERIES: each page opened fresh in each engine, the seconds from the address to the
// rig's ready, a query against another, interleaved, several loads each; the console's errors counted.
//   node forge/babylon/ready-time.mjs --out <abs folder> [--pages map,gate] [--engines chromium,webkit]
//        [--q 'sky=env|sky=set'] [--loads 3] [--port 5214]
// Writes ready-time.json and prints one line per page, engine and query; exit 1 on a console error or a page not ready.
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
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
const pages = String(opt.pages ?? 'map,gate').split(',')
const engines = String(opt.engines ?? 'chromium,webkit').split(',')
const queries = String(opt.q ?? 'sky=env|sky=set').split('|')
const loads = Number(opt.loads ?? 3)
const LAUNCH = { chromium: () => chromium.launch({ args: browserArgs('webgpu') }), webkit: () => webkit.launch() }

const s = await serve({ port: Number(opt.port ?? 5214), out: OUT })
const out = []
let bad = 0
for (const engine of engines) {
  const browser = await LAUNCH[engine]()
  for (const name of pages) {
    const P = PAGES[name]
    const times = Object.fromEntries(queries.map((q) => [q, []]))
    for (let k = 0; k < loads; k++) for (const q of queries) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      let errors = 0
      page.on('console', (m) => { if (m.type() === 'error') errors++ })
      page.on('pageerror', () => errors++)
      const t0 = Date.now()
      await page.goto(s.url(name, q))
      const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 100 }).then(() => true).catch(() => false)
      const sec = (Date.now() - t0) / 1000
      if (!ready || errors) bad++
      times[q].push(ready ? +sec.toFixed(2) : null)
      await page.close()
    }
    for (const q of queries) {
      const v = times[q].filter((x) => x !== null).sort((a, b) => a - b)
      const row = { engine, page: name, q, loads: times[q], median: v.length ? v[Math.floor(v.length / 2)] : null }
      out.push(row)
      console.log(`${engine} ${name} ${q}: median ${row.median} s (${times[q].join(', ')})`)
    }
  }
  await browser.close()
}
writeFileSync(`${OUT}/ready-time.json`, JSON.stringify({ build: buildId().short, rows: out }, null, 1))
await s.close()
process.exit(bad ? 1 : 0)
