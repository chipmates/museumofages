// THE MAP'S SHOOTER: opens the Babylon map page once and takes stills, the moving sketch, or the facts.
//
//   node forge/babylon-map/shoot.mjs --out <abs folder in the hand-in> [--stops all|1,3] [--framing desktop,phone] [--view grey,classes]
//        [--dw 1920 --dh 1080 --pw 780 --ph 1688 --samples 16] [--t <film second> --name <base>]
//   node forge/babylon-map/shoot.mjs --clip <abs folder> [--fps 8 --w 640 --h 360 --samples 2 --from 0 --to 781 --framing desktop]
//        frames are named by their global index (time x fps), so spans written one after another join; one frames-<first>.json a span
//   node forge/babylon-map/shoot.mjs --facts <abs file>
//   --port 5210 --data-port 5211 (never 5199 or 5400); --q 'exp=0.6' passed to the page
import { chromium } from 'playwright'
import { createServer as httpServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
function handIn(name) {
  if (process.env[name]) return resolve(process.env[name])
  throw new Error(`set ${name} to the hand-in folder of the round`)
}
const HAND = handIn('MAP_HAND')
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
  else { opt[a.slice(2)] = next; i++ }
}
const PORT = Number(opt.port ?? 5210), DPORT = Number(opt['data-port'] ?? 5211)
if ([5199, 5400].includes(PORT) || [5199, 5400].includes(DPORT)) throw new Error("5199 and 5400 are never this tool's")
const inside = (root, p) => p === root || p.startsWith(root + sep)
// the page writes into the hand-in folder and nowhere else
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
const vite = await createServer({ root: APP, configFile: join(APP, 'vite.config.ts'), server: { port: PORT, strictPort: true, host: '127.0.0.1', fs: { allow: [APP] } }, logLevel: 'warn' })
await vite.listen()

const address = `http://127.0.0.1:${PORT}/src/wings/babylon/map/map.html?tier=max&put=${encodeURIComponent(`http://127.0.0.1:${DPORT}/put`)}${opt.q && opt.q !== true ? `&${opt.q}` : ''}`
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error') { errors.push(t); console.log(`ERROR: ${t.slice(0, 600)}`) }
  else if (/^map: /.test(t)) console.log(t.slice(0, 400))
})
page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR: ${(e.stack ?? e.message).slice(0, 1200)}`) })
async function close(code) { await browser.close().catch(() => {}); await vite.close().catch(() => {}); server.close(); process.exit(code) }

const began = Date.now()
await page.goto(address)
try { await page.waitForFunction(() => window.__map?.ready, null, { timeout: 600000, polling: 500 }) } catch (e) { console.log(`not ready: ${e.message}`); await close(1) }
console.log(`ready in ${((Date.now() - began) / 1000).toFixed(1)} s ${JSON.stringify(await page.evaluate(() => window.__map.state()))}`)
let bad = 0
if (opt.facts && opt.facts !== true) {
  const to = writable(String(opt.facts))
  if (!to) throw new Error('--facts <file inside the hand-in>')
  const facts = await page.evaluate(() => ({ views: window.__map.views(), facts: window.__map.facts(), samples: window.__map.pathSamples(0.1) }))
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, JSON.stringify(facts))
  console.log(`facts ${to}`)
}
if (opt.out && opt.out !== true) {
  const out = writable(String(opt.out))
  if (!out) throw new Error(`--out <absolute folder inside ${HAND}>`)
  const views = await page.evaluate(() => window.__map.views())
  const stops = !opt.stops || opt.stops === 'all' ? views.stops.map((s) => s.n) : String(opt.stops).split(',').map(Number)
  const framings = String(opt.framing ?? 'desktop,phone').split(',')
  const kinds = String(opt.view ?? 'grey,classes').split(',')
  const samples = Number(opt.samples ?? 16)
  for (const n of stops) for (const framing of framings) for (const view of kinds) {
    const [w, h] = framing === 'phone' ? [Number(opt.pw ?? 780), Number(opt.ph ?? 1688)] : [Number(opt.dw ?? 1920), Number(opt.dh ?? 1080)]
    const css = framing === 'phone' ? [390, 844] : [Math.round(w / Number(opt.dratio ?? 1.2)), Math.round(h / Number(opt.dratio ?? 1.2))]
    // --t <second> --name <file base>: a film second instead of the stop's still key (one stop only)
    const t = opt.t && opt.t !== true ? Number(opt.t) : undefined
    const name = opt.name && opt.name !== true ? `${opt.name}-${framing}-${view}` : undefined
    const r = await page.evaluate((o) => window.__map.shoot(o), { stop: n, framing, view, w, h, samples, out, css, t, name }).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${n} ${framing} ${view}: ${r.error.slice(0, 400)}`) }
    else console.log(`${r.file.split('/').pop()} ${r.ms} ms median ${r.brightness.median} p1 ${r.brightness.p1} p99 ${r.brightness.p99} eye ${r.camera.eyeOverStand}`)
  }
}
if (opt.probes && opt.probes !== true) {
  // a JSON list of probe cameras (see the rig's probe), written beside --probe-out
  const out = writable(String(opt['probe-out'] ?? ''))
  if (!out) throw new Error('--probe-out <absolute folder inside the hand-in>')
  const list = JSON.parse(readFileSync(String(opt.probes), 'utf8'))
  for (const p of list) {
    const r = await page.evaluate((o) => window.__map.probe(o), { w: 640, h: 360, samples: 4, ...p, out }).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED probe ${p.name}: ${r.error.slice(0, 400)}`) }
    else console.log(`${r.file.split('/').pop()} ${r.ms} ms y ${r.y} median ${r.brightness.median}`)
  }
}
if (opt.clip && opt.clip !== true) {
  const to = writable(String(opt.clip))
  if (!to) throw new Error('--clip <absolute folder inside the hand-in>')
  const r = await page.evaluate((o) => window.__map.clip(o), { out: to, fps: Number(opt.fps ?? 8), w: Number(opt.w ?? 640), h: Number(opt.h ?? 360), samples: Number(opt.samples ?? 2), from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined, framing: opt.framing ?? 'desktop', view: opt.view ?? 'grey' }).catch((e) => ({ error: String(e) }))
  console.log(`clip ${JSON.stringify(r).slice(0, 300)}`)
  if (r.error) bad++
}
if (errors.length) console.log(`${errors.length} console error(s)`)
await close(bad ? 1 : 0)
