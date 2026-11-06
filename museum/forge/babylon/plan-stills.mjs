// PLANNED STILLS: a list of jobs, each one page load at its own query (`exp=` or any page knob), each rendering its
// items (a stop at an hour in a framing) at the job's sizes, one browser for all. The hour goes in as hour-sweep.mjs
// takes it (map and gate: the shoot call's `hour`; the opening: its `tune`); `now` is the page's own hour.
//
//   node --experimental-strip-types forge/babylon/plan-stills.mjs --plan <abs json> [--port 5214]
// plan: { "root": "<abs dir every job's out sits in>", "sizes": { "desktop": "800x450@1", "phone": "390x844@1" }, "samples": 8,
//         "jobs": [ { "page": "map", "q": "exp=0.6", "out": "<abs dir>", "sizes"?: {...}, "samples"?: 16,
//                     "items": [ { "stop": "5", "hour": "14:00" | "now", "framing": "desktop", "name": "1400-desktop" } ] } ] }
// Files: <out>/<name>.png and .json (the page's sidecar plus a `planned` block: the job's query, the asked hour).
// Exit 1 on any failed still or console error.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { PAGES, devicePixels, parseSize, resolveStop } from './pages.mjs'
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
if (!opt.plan || opt.plan === true || !isAbsolute(String(opt.plan))) fail('--plan <absolute json>')
const plan = JSON.parse(readFileSync(String(opt.plan), 'utf8'))
if (!Array.isArray(plan.jobs) || !plan.jobs.length) fail('plan: no jobs')
if (!plan.root || !isAbsolute(String(plan.root))) fail('plan root: the absolute folder the page may write in')
const root = resolve(String(plan.root))
const sizesOf = (job) => {
  const s = { desktop: '800x450@1', phone: '390x844@1', ...(plan.sizes ?? {}), ...(job.sizes ?? {}) }
  return { desktop: parseSize(s.desktop), phone: parseSize(s.phone) }
}
const hhmm = (h) => `${String(Math.floor(h + 1e-9)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`
for (const job of plan.jobs) {
  if (!PAGES[job.page]?.rig) fail(`job page "${job.page}"`)
  if (!job.out || !isAbsolute(String(job.out)) || !resolve(String(job.out)).startsWith(root + sep)) fail(`job out ${job.out}: an absolute folder inside the plan's root`)
  for (const it of job.items) {
    if (resolveStop(String(it.stop)).page !== job.page) fail(`stop ${it.stop} is not on the ${job.page} page`)
    if (it.hour !== 'now' && !/^\d{1,2}:\d{2}$/.test(it.hour)) fail(`hour "${it.hour}": now or hh:mm`)
  }
}
const s = await serve({ port: Number(opt.port ?? 5214), out: root })
const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
let bad = 0, errorsSeen = 0, done = 0
for (const [ji, job] of plan.jobs.entries()) {
  const P = PAGES[job.page]
  const sizes = sizesOf(job), samples = Number(job.samples ?? plan.samples ?? 8)
  mkdirSync(job.out, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log(`ERROR ${job.page}: ${m.text().slice(0, 400)}`) } })
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`PAGEERROR ${job.page}: ${e.message.slice(0, 400)}`) })
  await page.goto(s.url(job.page, job.q ?? ''))
  const ready = await page.waitForFunction((rig) => window[rig]?.ready === true, P.rig, { timeout: P.readyMs, polling: 500 }).then(() => true).catch(() => false)
  if (!ready) { console.log(`job ${ji} ${job.page}: not ready`); bad += job.items.length; await page.close(); continue }
  const own = job.page === 'open' ? (await page.evaluate(() => window.__open.views())).hour : null
  for (const it of job.items) {
    const size = sizes[it.framing], [w, h] = devicePixels(size)
    const st = resolveStop(String(it.stop))
    const call = P.still({ stop: st.stop, framing: it.framing, view: 'grey', w, h, css: size.css, samples, out: job.out, name: it.name })
    if (job.page !== 'open' && it.hour !== 'now') call.arg.hour = it.hour.padStart(5, '0')
    const r = await page.evaluate(async ([rig, fn, arg, hr, back]) => {
      if (rig === '__open') window.__open.tune({ hour: hr ?? back })
      try { return await window[rig][fn](arg) } finally { if (rig === '__open') window.__open.tune({ hour: back }) }
    }, [P.rig, call.fn, call.arg, it.hour === 'now' ? null : it.hour.padStart(5, '0'), own === null ? null : hhmm(own)]).catch((e) => ({ error: String(e) }))
    if (r.error) { bad++; console.log(`FAILED ${it.stop} ${it.hour} ${it.framing}: ${r.error.slice(0, 400)}`); continue }
    const side = join(job.out, `${it.name}.json`)
    if (!existsSync(side)) { bad++; console.log(`FAILED ${it.stop} ${it.hour} ${it.framing}: no sidecar`); continue }
    const j = JSON.parse(readFileSync(side, 'utf8'))
    j.planned = { tool: 'forge/babylon/plan-stills.mjs', page: job.page, q: job.q ?? '', stop: st.stop, stopId: st.id, framing: it.framing, asked: it.hour, cssSize: size.css, ratio: size.ratio, devicePixels: [w, h], subFrames: samples }
    writeFileSync(side, JSON.stringify(j, null, 1))
    done++
    console.log(`job ${ji} S${st.stop} ${it.name} q "${job.q ?? ''}" hour ${j.hour} sun ${j.sun?.elevation} ${r.ms} ms median ${r.brightness?.median}`)
  }
  errorsSeen += errors.length
  await page.close()
}
await browser.close()
await s.close()
console.log(`${done} stills${bad ? `, ${bad} failed` : ''}${errorsSeen ? `, ${errorsSeen} console error(s)` : ''}`)
process.exit(bad || errorsSeen ? 1 : 0)
