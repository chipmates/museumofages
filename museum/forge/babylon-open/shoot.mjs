// THE OPENING'S SHOOTER: opens the Babylon opening page (or the map page, for the grey before) once and takes
// the first frame's stills, probes, or the flight's frames. Writes only inside the --hand folder, which must lie
// under the folder OPEN_HAND_ROOT names.
//
//   node forge/babylon-open/shoot.mjs --hand <abs> --stills <abs dir> [--framing desktop,phone] [--view grey,classes]
//        [--dw 1920 --dh 1080 --pw 780 --ph 1688 --samples 16] [--t <flight second>] [--name <base>]
//   node forge/babylon-open/shoot.mjs --hand <abs> --clip <abs dir> [--fps 24 --w 640 --h 360 --samples 2 --from 0 --to 30 --framing desktop]
//   node forge/babylon-open/shoot.mjs --hand <abs> --probes <list.json> --probe-out <abs dir>
//   node forge/babylon-open/shoot.mjs --hand <abs> --facts <abs file>
//   --page open|map (map: the grey sketch, probes only) --port 6210 --data-port 6211 (never 5199 or 5400); --q 'exp=0.6'
import { chromium } from 'playwright'
import { createServer as httpServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
if (!process.env.OPEN_HAND_ROOT) throw new Error('set OPEN_HAND_ROOT to the folder that holds the rounds\' hand-in folders')
const ROOT = resolve(process.env.OPEN_HAND_ROOT)
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
  else { opt[a.slice(2)] = next; i++ }
}
const inside = (root, p) => p === root || p.startsWith(root + sep)
const HAND = opt.hand && opt.hand !== true ? resolve(String(opt.hand)) : null
if (!HAND || !inside(ROOT, HAND)) throw new Error(`--hand <absolute folder under ${ROOT}>`)
const PORT = Number(opt.port ?? 6210), DPORT = Number(opt['data-port'] ?? 6211)
if ([5199, 5400].includes(PORT) || [5199, 5400].includes(DPORT)) throw new Error("5199 and 5400 are never this tool's")
const PAGE = opt.page === 'map' ? 'map' : 'open'
const writable = (p) => (isAbsolute(p) && !p.split(/[\\/]/).includes('..') && inside(HAND, resolve(p)) ? resolve(p) : null)

const server = httpServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  const url = new URL(req.url, `http://127.0.0.1:${DPORT}`)
  const to = req.method === 'POST' && url.pathname === '/put' ? writable(url.searchParams.get('path') ?? '') : null
  if (!to) { res.statusCode = 403; return res.end('refused') }
  const parts = []
  req.on('data', (c) => parts.push(c))
  req.on('end', () => { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, Buffer.concat(parts)); res.end('ok') })
})
await new Promise((r) => server.listen(DPORT, '127.0.0.1', r))
const { createServer } = await import('vite')
const vite = await createServer({ root: APP, configFile: join(APP, 'forge', 'babylon-open', 'vite.bench.config.ts'), server: { port: PORT, strictPort: true, host: '127.0.0.1', fs: { allow: [APP] } }, logLevel: 'warn' })
await vite.listen()

const html = PAGE === 'map' ? 'map/map.html' : 'open/open.html'
const RIG = PAGE === 'map' ? '__map' : '__open'
const address = `http://127.0.0.1:${PORT}/src/wings/babylon/${html}?tier=max&put=${encodeURIComponent(`http://127.0.0.1:${DPORT}/put`)}${opt.q && opt.q !== true ? `&${opt.q}` : ''}`
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error') { errors.push(t); console.log(`ERROR: ${t.slice(0, 600)}`) }
  else if (/^(map|open): /.test(t)) console.log(t.slice(0, 400))
})
page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR: ${(e.stack ?? e.message).slice(0, 1200)}`) })
// a page that fails before it is ready would hold the render lock until the wait runs out
page.on('response', (r) => { if (r.status() >= 500) { console.log(`HTTP ${r.status()} ${r.url().slice(0, 200)}`); close(1) } })
async function close(code) { await browser.close().catch(() => {}); await vite.close().catch(() => {}); server.close(); process.exit(code) }

const began = Date.now()
await page.goto(address)
try { await page.waitForFunction((r) => window[r]?.ready, RIG, { timeout: 240000, polling: 500 }) } catch (e) { console.log(`not ready: ${e.message}`); await close(1) }
console.log(`ready in ${((Date.now() - began) / 1000).toFixed(1)} s ${JSON.stringify(await page.evaluate((r) => window[r].state(), RIG))}`)
let bad = 0
const need = (k) => { const to = writable(String(opt[k])); if (!to) throw new Error(`--${k} <absolute path inside ${HAND}>`); return to }

if (opt.facts && opt.facts !== true) {
  const to = need('facts')
  const facts = await page.evaluate((r) => ({ views: window[r].views?.(), samples: window[r].pathSamples?.(1 / 30) }), RIG)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, JSON.stringify(facts))
  console.log(`facts ${to}`)
}
if (opt.stills && opt.stills !== true) {
  const out = need('stills')
  const framings = String(opt.framing ?? 'desktop,phone').split(',')
  const views = String(opt.view ?? 'grey,classes').split(',')
  const samples = Number(opt.samples ?? 16)
  // --t <second> or --ts <s,s,...>: frames of the flight at those seconds (0 is the first frame)
  const ts = opt.ts && opt.ts !== true ? String(opt.ts).split(',').map(Number) : [opt.t && opt.t !== true ? Number(opt.t) : 0]
  for (const t of ts) for (const framing of framings) for (const view of views) {
    const [w, h] = framing === 'phone' ? [Number(opt.pw ?? 780), Number(opt.ph ?? 1688)] : [Number(opt.dw ?? 1920), Number(opt.dh ?? 1080)]
    const css = framing === 'phone' ? [Math.round(w / 2), Math.round(h / 2)] : [Math.round(w / 1.2), Math.round(h / 1.2)]
    const base = opt.name && opt.name !== true ? opt.name : ts.length > 1 || ts[0] !== 0 ? `t${String(t.toFixed(1)).padStart(4, '0')}` : 'first'
    const name = `${base}-${framing}-${view}`
    const r = await page.evaluate((o) => window.__open.still(o), { framing, view, w, h, css, samples, out, name, t }).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${framing} ${view}: ${r.error.slice(0, 400)}`) }
    else console.log(`${r.file.split('/').pop()} ${r.ms} ms median ${r.brightness.median} p1 ${r.brightness.p1} p99 ${r.brightness.p99}`)
  }
}
if (opt.variants && opt.variants !== true) {
  // a JSON list of {name, tune: {...}, t, framing, view, w, h, samples}: each tuned, then shot, then the tuning kept for the next
  const out = need('variant-out')
  const list = JSON.parse(readFileSync(String(opt.variants), 'utf8'))
  for (const v of list) {
    const tuned = v.tune ? await page.evaluate((o) => window.__open.tune(o), v.tune) : null
    const framing = v.framing ?? 'desktop'
    const [w, h] = framing === 'phone' ? [v.w ?? 390, v.h ?? 844] : [v.w ?? 960, v.h ?? 540]
    const r = await page.evaluate((o) => window.__open.still(o), { framing, view: v.view ?? 'grey', w, h, css: [w, h], samples: v.samples ?? 6, out, name: v.name, t: v.t ?? 0 }).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${v.name}: ${r.error.slice(0, 400)}`) }
    else console.log(`${v.name} ${JSON.stringify(tuned)} median ${r.brightness.median} p1 ${r.brightness.p1} p99 ${r.brightness.p99}`)
  }
}
if (opt.probes && opt.probes !== true) {
  const out = need('probe-out')
  const list = JSON.parse(readFileSync(String(opt.probes), 'utf8'))
  for (const p of list) {
    const r = await page.evaluate(([rig, o]) => window[rig].probe(o), [RIG, { w: 640, h: 360, samples: 4, ...p, out }]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED probe ${p.name}: ${r.error.slice(0, 400)}`) }
    else console.log(`${r.file.split('/').pop()} ${r.ms} ms median ${r.brightness.median}`)
  }
}
if (opt.clip && opt.clip !== true) {
  const to = need('clip')
  const r = await page.evaluate((o) => window.__open.clip(o), {
    out: to, fps: Number(opt.fps ?? 24), w: Number(opt.w ?? 640), h: Number(opt.h ?? 360), samples: Number(opt.samples ?? 2),
    from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined, framing: opt.framing ?? 'desktop', view: opt.view ?? 'grey',
  }).catch((e) => ({ error: String(e) }))
  console.log(`clip ${JSON.stringify(r).slice(0, 300)}`)
  if (r.error) bad++
}
if (errors.length) console.log(`${errors.length} console error(s)`)
await close(bad ? 1 : 0)
