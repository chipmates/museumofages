// The gate page's film frames at chosen seconds (its rig's `clip`), either framing, with the clip's own frame log.
//   node forge/babylon/gate-clip.mjs --out <abs folder> --t 66,108,179 [--framing phone] [--size 390x844@3]
//        [--samples 16] [--state full] [--port 5214] [--south]
// Writes <framing>-f<frame at 8 fps>.jpg and <framing>-frames-<frame>.json per second into --out; --south also the
// south paving's line (the rig's `south`) as south.json. Exit 1 on an error.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES, devicePixels, parseSize } from './pages.mjs'
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
if ((!opt.t || opt.t === true) && !opt.south) fail('--t <second>[,<second>...] or --south')
const OUT = resolve(String(opt.out))
mkdirSync(OUT, { recursive: true })
const framing = opt.framing === 'desktop' ? 'desktop' : 'phone'
const [w, h] = devicePixels(parseSize(opt.size && opt.size !== true ? String(opt.size) : framing === 'phone' ? '390x844@3' : '1600x900@2'))
const times = opt.t && opt.t !== true ? String(opt.t).split(',').map(Number) : []
const s = await serve({ port: Number(opt.port ?? 5214), out: OUT })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
let errors = 0
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log(`ERROR gate: ${m.text().slice(0, 600)}`) } })
page.on('pageerror', (e) => { errors++; console.log(`PAGEERROR gate: ${(e.stack ?? e.message).slice(0, 1200)}`) })
await page.goto(s.url('gate', ''))
const ready = await page.waitForFunction(() => window.__gate?.ready === true, null, { timeout: PAGES.gate.readyMs, polling: 500 }).then(() => true).catch(() => false)
if (!ready) { console.log('gate: not ready'); errors++ }
else {
  if (opt.south) { const line = await page.evaluate(() => window.__gate.south()); writeFileSync(join(OUT, 'south.json'), JSON.stringify({ line })); console.log(`south.json: ${line.length} points`) }
  for (const t of times) {
    const r = await page.evaluate((a) => window.__gate.clip(a), { out: OUT, fps: 8, w, h, samples: Number(opt.samples ?? 16), from: t, to: t, framing, state: opt.state && opt.state !== true ? String(opt.state) : 'full' }).catch((e) => ({ error: String(e) }))
    if (r.error) { errors++; console.log(`FAILED t ${t}: ${r.error.slice(0, 600)}`) } else console.log(`t ${t}: ${r.frames} frame(s) ${w}x${h} in ${r.ms} ms`)
  }
}
await browser.close()
await s.close()
process.exit(errors ? 1 : 0)
