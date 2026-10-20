// THE GATE'S SHOOTER: opens the gate page once and takes stills, the sketch, the crop boxes or the facts.
// Begun from the place kit's shooter through the map's (`forge/babylon-map/shoot.mjs`): CSS size times the device ratio,
// a sidecar beside every still with what the page read back, and a lane that writes only under the gate's hand-in.
//
//   node forge/babylon-gate/shoot.mjs --out <abs folder in the hand-in> --shots '<json>'
//        shots: [{ "name": "desk-plain", "framing": "desktop", "state": "full", "switch": false, "css": [1600, 900], "ratio": 2, "samples": 16 }]
//        optional per shot: "hour": "17:00", "stops": 0, "look": { "pos": [x,y,z], "look": [x,y,z], "hfov": 58, "shift": 0 } (gate frame)
//   node forge/babylon-gate/shoot.mjs --crops <abs file>          the crop anchors' device-pixel boxes at the stills' sizes
//   node forge/babylon-gate/shoot.mjs --clip <abs folder> [--fps 1 --w 960 --h 540 --samples 1 --from 0 --to 194 --framing desktop --state grey]
//   node forge/babylon-gate/shoot.mjs --facts <abs file>
//   --port 5220 --data-port 5221 (never 5199 or 5400); --q 'exp=0.9' passed to the page
import { chromium } from 'playwright'
import { createServer as httpServer } from 'node:http'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
function handIn(name) {
  if (process.env[name]) return resolve(process.env[name])
  throw new Error(`set ${name} to the hand-in folder of the round`)
}
const HAND = handIn('GATE_HAND')
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
  else { opt[a.slice(2)] = next; i++ }
}
const PORT = Number(opt.port ?? 5220), DPORT = Number(opt['data-port'] ?? 5221)
if ([5199, 5400].includes(PORT) || [5199, 5400].includes(DPORT)) throw new Error("5199 and 5400 are never this tool's")
if (PORT < 5220 || PORT > 5229 || DPORT < 5220 || DPORT > 5229) throw new Error('the gate seat owns ports 5220 to 5229')
const inside = (root, p) => p === root || p.startsWith(root + sep)
// the page writes into the hand-in folder and nowhere else; never into the writer's words
const writable = (p) => (isAbsolute(p) && !p.split(/[\\/]/).includes('..') && inside(HAND, resolve(p)) && !inside(join(HAND, 'words'), resolve(p)) ? resolve(p) : null)

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

const address = `http://127.0.0.1:${PORT}/src/wings/babylon/gate/gate.html?tier=max&put=${encodeURIComponent(`http://127.0.0.1:${DPORT}/put`)}${opt.q && opt.q !== true ? `&${opt.q}` : ''}`
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
const errors = []
const loaded = new Set()
page.on('request', (r) => loaded.add(r.url()))
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error') { errors.push(t); console.log(`ERROR: ${t.slice(0, 900)}`) }
  else if (m.type() === 'warning' && /WGSL|shader|TSL|NodeMaterial/i.test(t)) console.log(`WARN: ${t.slice(0, 600)}`)
  else if (/^gate: /.test(t)) console.log(t.slice(0, 400))
})
page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR: ${(e.stack ?? e.message).slice(0, 1500)}`) })
async function close(code) {
  if (opt.network && opt.network !== true) {
    const to = writable(String(opt.network))
    if (to) { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, JSON.stringify([...loaded].sort(), null, 1)) }
  }
  await browser.close().catch(() => {}); await vite.close().catch(() => {}); server.close(); process.exit(code)
}

const began = Date.now()
await page.goto(address)
try { await page.waitForFunction(() => window.__gate?.ready, null, { timeout: 900000, polling: 500 }) } catch (e) { console.log(`not ready: ${e.message}`); await close(1) }
console.log(`ready in ${((Date.now() - began) / 1000).toFixed(1)} s ${JSON.stringify(await page.evaluate(() => window.__gate.state()))}`)
let bad = 0
if (opt.facts && opt.facts !== true) {
  const to = writable(String(opt.facts))
  if (!to) throw new Error('--facts <file inside the hand-in>')
  const facts = await page.evaluate(() => { const f = window.__gate.facts(); delete f.level; return { facts: f, views: window.__gate.views(), samples: window.__gate.pathSamples(0.1) } })
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, JSON.stringify(facts))
  console.log(`facts ${to}`)
}
if (opt.crops && opt.crops !== true) {
  const to = writable(String(opt.crops))
  if (!to) throw new Error('--crops <file inside the hand-in>')
  const sizes = { desktop: [3200, 1800], phone: [1170, 1992] }
  const out = {}
  for (const [framing, [w, h]] of Object.entries(sizes)) out[framing] = { devicePixels: [w, h], boxes: await page.evaluate((o) => window.__gate.crops(o), { framing, w, h }) }
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, JSON.stringify(out, null, 1))
  console.log(`crops ${to}`)
}
if (opt.out && opt.out !== true) {
  const out = writable(String(opt.out))
  if (!out) throw new Error(`--out <absolute folder inside ${HAND}>`)
  const shots = JSON.parse(String(opt.shots ?? '[]'))
  for (const s of shots) {
    const ratio = s.ratio ?? 1
    const w = Math.round(s.css[0] * ratio), h = Math.round(s.css[1] * ratio)
    const r = await page.evaluate((o) => window.__gate.shoot(o), { framing: s.framing, state: s.state ?? 'full', switch: !!s.switch, w, h, css: s.css, samples: s.samples ?? 16, out, name: s.name, hour: s.hour, stops: s.stops, look: s.look, box: s.box }).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${s.name}: ${r.error.slice(0, 600)}`) }
    else console.log(`${s.name} ${w}x${h} ${r.ms} ms median ${r.brightness.median} p1 ${r.brightness.p1} p99 ${r.brightness.p99}${r.box ? ` box median ${r.box.median}` : ''}`)
  }
}
if (opt.clip && opt.clip !== true) {
  const to = writable(String(opt.clip))
  if (!to) throw new Error('--clip <absolute folder inside the hand-in>')
  const r = await page.evaluate((o) => window.__gate.clip(o), { out: to, fps: Number(opt.fps ?? 1), w: Number(opt.w ?? 960), h: Number(opt.h ?? 540), samples: Number(opt.samples ?? 1), from: opt.from ? Number(opt.from) : undefined, to: opt.to ? Number(opt.to) : undefined, framing: opt.framing ?? 'desktop', state: opt.state ?? 'grey' }).catch((e) => ({ error: String(e) }))
  console.log(`clip ${JSON.stringify(r).slice(0, 300)}`)
  if (r.error) bad++
}
if (errors.length) console.log(`${errors.length} console error(s)`)
await close(bad || errors.length ? 1 : 0)
