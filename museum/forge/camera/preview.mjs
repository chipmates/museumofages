#!/usr/bin/env node
// A CAMERA TRACK AS A PREVIEW, never the release: the sketch page draws each
// frame itself through its rig (`window.__sketch.pose`: its own aim, render
// and print) at half size and one sample, so a move is judged before any
// release render. Every file is named *-preview-*; the sheet's title, the
// track copy and its readings say "sketch clip, not export". The release's
// frames come only from the stack's export (?export=1), untouched here.
//
//   node museum/forge/camera/preview.mjs <track.json> --app <the sketch's museum folder> --out <folder>
//        [--moves a,b] [--framing desktop] [--q 'awalk=castle&entry=a'] [--scale 0.5]
//        [--ev <stops> | --ev-from <a sketch clip's frames-*.json>] [--lens sketch]
//        [--clock <s>] [--shots <a folder served read-only as /forge/shots>] [--port 5310 --data-port 5311]
//
// The page: ?walk=asse&awalk=castle&entry=a&rest=i (the castle film's walk), --q overrides.
// --shots: the asset store's plates, which a bare checkout lacks (the page
// then draws plain parts and logs each missing file as an error).
// --clock: the film time the page's doors and machines stand at on the first
// frame (default: the frame's own time in the track, offsetSeconds included).
// --lens sketch: the shift lens (the format carries none) read from the
// sketch's own path at the frame's clock (its `still` side readout, 0.27 s
// each once warm, so one every --lens-step frames, default 5, and both sides
// of each cut, linear between them inside a run): only for a track on that
// clock; the readout's eye and yaw against the track's are written per move
// as the check.
// The exposure in stops: --ev-from (the clip's own eased value at the
// nearest logged time), else --ev, else the stop's exposure the lens readout
// brings; one of them is needed (the sketch's rooms sit near 5 stops, its
// court near 1).

import { execFileSync } from 'node:child_process'
import { createServer as httpServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { browserArgs, FRAME_TIME_FLAGS } from '../rig.mjs'
import { moveSvg } from './plot.mjs'
import { curvesOf, readMove, readTrackInto } from './read.mjs'
import { hfovOf, readTrack, sliceTrack, writeTrack } from './track.mjs'

export const PREVIEW = 'sketch clip, not export'
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe'
const D2R = Math.PI / 180
const FONT = 'font-family="Helvetica, Arial, sans-serif"'
// the sketch's own frame at scale 1 (its sizeOf)
const SIZES = { desktop: [1440, 708], phone: [390, 844] }

/**
 * A track sample as the sketch's aim() takes it: aim looks along (sin yaw cos
 * pitch, sin pitch, -cos yaw cos pitch) with up +y, then turns the frame by
 * roll, so its rotation is Euler(pitch, -yaw, roll, 'YXZ'); this reads that
 * order back from the quaternion. hfov from the vertical lens and the aspect.
 */
export function poseOf(s, aspect) {
  const [x, y, z, qx, qy, qz, qw, vfov] = s
  const m11 = 1 - 2 * (qy * qy + qz * qz), m13 = 2 * (qx * qz + qy * qw)
  const m21 = 2 * (qx * qy + qz * qw), m22 = 1 - 2 * (qx * qx + qz * qz), m23 = 2 * (qy * qz - qx * qw)
  const m31 = 2 * (qx * qz - qy * qw), m33 = 1 - 2 * (qx * qx + qy * qy)
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m23)))
  const level = Math.abs(m23) < 0.9999999
  const heading = level ? Math.atan2(m13, m33) : Math.atan2(-m31, m11)
  const roll = level ? Math.atan2(m21, m22) : 0
  return { pos: [x, y, z], yaw: -heading / D2R, pitch: pitch / D2R, roll: roll / D2R, hfov: hfovOf(vfov, aspect) }
}

/** the strip's frames: one every `every` seconds of a move of `count` frames, each with the time it really shows */
export function stripFrames(count, fps, every = 0.5) {
  const out = []
  for (let k = 0; ; k++) {
    const i = Math.round(k * every * fps)
    if (i >= count) break
    if (!out.length || out[out.length - 1].i !== i) out.push({ i, t: i / fps })
  }
  return out
}

/** the exposure a sketch clip logged nearest to a time (its frames-*.json: fps and frames [{t, ev}]) */
export function evFrom(log) {
  const fr = log.frames.filter((f) => Number.isFinite(f.ev))
  return (time) => {
    let lo = 0, hi = fr.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t <= time) lo = m; else hi = m }
    return Math.abs(fr[lo].t - time) <= Math.abs(fr[hi].t - time) ? fr[lo].ev : fr[hi].ev
  }
}

/** the frames of a move of n frames whose lens is read: every step-th, the last, and both sides of each cut */
export function lensFrames(n, step, cuts = []) {
  const ks = new Set([n - 1])
  for (let k = 0; k < n; k += step) ks.add(k)
  for (const c of cuts) if (c > 0 && c < n) { ks.add(c - 1); ks.add(c) }
  return [...ks].sort((a, b) => a - b)
}

/** a value per frame from readouts at some frames: linear between two readouts in one run, never across a cut */
export function fillLens(n, read, cuts = []) {
  const ks = [...read.keys()].sort((a, b) => a - b), runOf = (k) => cuts.filter((c) => c <= k).length
  return Array.from({ length: n }, (_, k) => {
    if (read.has(k)) return read.get(k)
    const lo = ks.filter((j) => j < k && runOf(j) === runOf(k)).pop(), hi = ks.find((j) => j > k && runOf(j) === runOf(k))
    if (lo === undefined || hi === undefined) return read.get(lo ?? hi)
    const u = (k - lo) / (hi - lo), a = read.get(lo), b = read.get(hi)
    return { shift: a.shift + (b.shift - a.shift) * u, stops: a.stops + (b.stops - a.stops) * u }
  })
}

/** a move's track as its preview: sliced to the move, its source and its own field naming the sketch's clip */
export function previewTrack(track, move, shifts = null) {
  const t = sliceTrack(track, move.from, move.to)
  return { ...t, source: `${track.source} preview (${PREVIEW})`, preview: PREVIEW, ...(shifts ? { shifts } : {}) }
}

/** the frames on disk every half second, tiled, each labelled with its time from the move's start */
export async function stripPng(files, times, { cols = 8, frameWidth = 122 } = {}) {
  const tiles = await Promise.all(files.map((f) => sharp(f).resize({ width: frameWidth }).png().toBuffer()))
  const fh = (await sharp(tiles[0]).metadata()).height
  const rows = Math.ceil(tiles.length / cols)
  const label = (t) => (Math.abs(t * 2 - Math.round(t * 2)) < 1e-9 ? t.toFixed(1) : t.toFixed(2))
  const labels = times.map((t, i) => `<text x="${(i % cols) * frameWidth + 4}" y="${Math.floor(i / cols) * fh + 14}" font-size="13" ${FONT} fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${label(t)}</text>`)
  const W = cols * frameWidth, H = rows * fh
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${labels.join('')}</svg>`)
  return sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .composite([...tiles.map((b, i) => ({ input: b, left: (i % cols) * frameWidth, top: Math.floor(i / cols) * fh })), { input: over, left: 0, top: 0 }])
    .png().toBuffer()
}

/** one move's sheet: part 1's plot of the preview track, beneath it the preview's frames every half second */
export async function previewSheet(pt, files, times, clock0, file, width = 1000) {
  const c = curvesOf(pt), move = pt.moves[0]
  const { svg, height } = moveSvg(pt, c, move, readMove(pt, c, move), { width })
  const plot = await sharp(Buffer.from(svg)).png().toBuffer()
  const cols = 8, strip = await stripPng(files, times, { cols, frameWidth: Math.floor((width - 20) / cols) })
  const sm = await sharp(strip).metadata()
  const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="22"><text x="10" y="16" font-size="13" ${FONT} font-weight="bold" fill="#a00">PREVIEW (${PREVIEW})<tspan dx="8" font-weight="normal" fill="#111">its frames every 0.5 s from the clock's ${clock0.toFixed(2)} s (labels: seconds from the move's start)</tspan></text></svg>`)
  await sharp({ create: { width, height: height + 24 + sm.height + 8, channels: 3, background: '#ffffff' } })
    .composite([{ input: plot, top: 0, left: 0 }, { input: cap, top: height, left: 0 }, { input: strip, top: height + 24, left: 10 }])
    .png().toFile(file)
}

function args() {
  const argv = process.argv.slice(2), o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { o._.push(a); continue }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) o[a.slice(2)] = true
    else { o[a.slice(2)] = next; i++ }
  }
  return o
}

async function viteOf(app) {
  const dir = join(app, 'node_modules', 'vite')
  const ex = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports['.']
  const entry = typeof ex === 'string' ? ex : ex.import?.default ?? ex.import ?? ex.default
  return import(pathToFileURL(join(dir, entry)).href)
}

async function main() {
  const opt = args()
  const track = readTrack(opt._[0])
  const app = opt.app && opt.app !== true ? resolve(String(opt.app)) : null
  const out = opt.out && opt.out !== true ? resolve(String(opt.out)) : null
  if (!app || !existsSync(join(app, 'src/wings/vinci-sketch/sketch.html'))) throw new Error('--app <a museum folder holding src/wings/vinci-sketch>')
  if (!out) throw new Error('--out <folder>')
  const framing = String(opt.framing ?? 'desktop')
  const scale = Number(opt.scale ?? 0.5)
  const [w, h] = SIZES[framing].map((v) => Math.round(v * scale))
  const PORT = Number(opt.port ?? 5310), DPORT = Number(opt['data-port'] ?? 5311)
  if ([PORT, DPORT].some((p) => !(p >= 5310 && p <= 5319)) || PORT === DPORT) throw new Error('this tool runs on 5310 to 5319 only')
  const want = opt.moves && opt.moves !== true ? String(opt.moves).split(',') : track.moves.map((m) => m.name)
  const moves = want.map((n) => track.moves.find((m) => m.name === n) ?? (() => { throw new Error(`no move ${n}`) })())
  const evLog = opt['ev-from'] && opt['ev-from'] !== true ? evFrom(JSON.parse(readFileSync(String(opt['ev-from']), 'utf8'))) : null
  const evFlat = opt.ev !== undefined && opt.ev !== true ? Number(opt.ev) : null
  const lensSketch = opt.lens === 'sketch'
  if (!evLog && evFlat === null && !lensSketch) throw new Error('the exposure: --ev-from <frames.json>, --ev <stops> or --lens sketch')
  mkdirSync(out, { recursive: true })

  const inside = (p) => isAbsolute(p) && !p.split(/[\\/]/).includes('..') && resolve(p).startsWith(out + sep)
  const server = httpServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') return res.end()
    const url = new URL(req.url, `http://127.0.0.1:${DPORT}`)
    const to = req.method === 'POST' && url.pathname === '/put' ? url.searchParams.get('path') ?? '' : ''
    if (!inside(to)) { res.statusCode = 403; return res.end('refused') }
    const parts = []
    req.on('data', (c) => parts.push(c))
    req.on('end', () => { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, Buffer.concat(parts)); res.end('ok') })
  })
  await new Promise((r) => server.listen(DPORT, '127.0.0.1', r))
  const { createServer } = await viteOf(app)
  const shots = opt.shots && opt.shots !== true ? resolve(String(opt.shots)) : null
  const plates = shots ? [{ name: 'preview-shots', configureServer(sv) {
    sv.middlewares.use('/forge/shots', (req, res, next) => {
      const f = resolve(shots, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (req.method !== 'GET' || !f.startsWith(shots + sep) || !existsSync(f)) return next()
      res.setHeader('Content-Type', f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream')
      res.end(readFileSync(f))
    })
  } }] : []
  const vite = await createServer({ root: app, configFile: join(app, 'vite.config.ts'), plugins: plates, server: { port: PORT, strictPort: true, host: '127.0.0.1', fs: { allow: [app] } }, logLevel: 'warn' })
  await vite.listen()
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: [...browserArgs('webgpu'), ...FRAME_TIME_FLAGS] })
  const close = async () => { await browser.close().catch(() => {}); await vite.close().catch(() => {}); server.close() }
  const errors = []
  const run = { preview: PREVIEW, track: resolve(opt._[0]), app, framing, size: [w, h], samples: 1, moves: [] }
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 400)))
    await page.addInitScript(() => { globalThis.__sketchText = (g, s, x, y) => g.fillText(s, x, y) })
    const walk = String(opt.walk ?? 'asse')
    const qs = new URLSearchParams({ tier: 'max', put: `http://127.0.0.1:${DPORT}/put`, walk, awalk: 'castle', entry: 'a', rest: 'i' })
    if (opt.q && opt.q !== true) for (const [k, v] of new URLSearchParams(String(opt.q))) qs.set(k, v)
    run.address = `/src/wings/vinci-sketch/sketch.html?${qs}`.replace(/put=[^&]*/, 'put=<data port>')
    const began = Date.now()
    await page.goto(`http://127.0.0.1:${PORT}/src/wings/vinci-sketch/sketch.html?${qs}`)
    await page.waitForFunction(() => window.__sketch?.ready, null, { timeout: 600000, polling: 500 })
    run.readySeconds = +((Date.now() - began) / 1000).toFixed(1)
    run.pathSeconds = await page.evaluate((f) => window.__sketch.state().duration[f], framing)
    run.trackSeconds = +(track.samples.length / track.fps + (track.offsetSeconds ?? 0)).toFixed(3)
    run.missingBeforeFrames = errors.length
    console.log(`ready in ${run.readySeconds} s; the page's path ${run.pathSeconds} s, the track ${run.trackSeconds} s; ${errors.length} errors on load`)

    for (const move of moves) {
      const name = `${move.name}-preview-${framing}`
      const dir = join(out, `${name}-frames`)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const n = move.to - move.from
      const clock0 = opt.clock !== undefined && opt.clock !== true ? Number(opt.clock) : (track.offsetSeconds ?? 0) + move.from / track.fps
      const frames = [], shifts = []
      const read = new Map(), l0 = Date.now()
      const cutsIn = (track.cuts ?? []).filter((c) => c > move.from && c < move.to).map((c) => c - move.from)
      let offEye = 0, offYaw = 0
      if (lensSketch) for (const k of lensFrames(n, Number(opt['lens-step'] ?? 5), cutsIn)) {
        const side = await page.evaluate((o) => window.__sketch.still(o), { mark: 'lens', time: clock0 + k / track.fps, framing, scale: 0.05, samples: 1, out: join(dir, 'lens'), name: 'lens', caption: false })
        const p = poseOf(track.samples[move.from + k], track.aspect), e = side.camera.scene
        offEye = Math.max(offEye, Math.hypot(e[0] - p.pos[0], e[1] - p.pos[1], e[2] - p.pos[2]))
        offYaw = Math.max(offYaw, Math.abs((((side.camera.yaw - p.yaw) % 360) + 540) % 360 - 180))
        read.set(k, { shift: side.camera.shift ?? 0, stops: side.exposureStops })
      }
      const lens = lensSketch ? fillLens(n, read, cutsIn) : []
      const lensMs = Date.now() - l0
      if (lensSketch && (offEye > 0.05 || offYaw > 0.5)) console.log(`WARNING ${move.name}: the sketch path's eye is ${offEye.toFixed(3)} m and ${offYaw.toFixed(2)} deg off the track: not on its clock, its lens and doors do not belong to this track`)
      const t0 = Date.now()
      for (let k = 0; k < n; k++) {
        const i = move.from + k
        const clock = clock0 + k / track.fps
        const p = poseOf(track.samples[i], track.aspect)
        const [shift, shiftX] = lensSketch ? [lens[k].shift, 0] : track.shifts?.[i] ?? [0, 0]
        const ev = evLog ? evLog(clock) : evFlat ?? lens[k].stops
        const f0 = Date.now()
        const r = await page.evaluate((o) => window.__sketch.pose(o), {
          at: ['xz', p.pos[0], p.pos[2], p.pos[1]], yaw: p.yaw, pitch: p.pitch, roll: p.roll, hfov: p.hfov, shift, shiftX,
          framing, w, h, samples: 1, out: dir, name: `f${String(k).padStart(5, '0')}`, time: clock, stops: ev,
        })
        frames.push({ k, i, t: +(k / track.fps).toFixed(4), clock: +clock.toFixed(4), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), roll: +p.roll.toFixed(3), hfov: +p.hfov.toFixed(3), shift, shiftX, ev, ms: Date.now() - f0, pageMs: r.ms })
        shifts.push([shift, shiftX])
      }
      const wallMs = Date.now() - t0
      rmSync(join(dir, 'lens'), { recursive: true, force: true })

      const mp4 = join(out, `${name}.mp4`)
      execFileSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(track.fps), '-start_number', '0', '-i', join(dir, 'f%05d.png'),
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', mp4])
      const [vw, vh, rate, count] = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'csv=p=0', mp4]).toString().trim().split(',')

      const pt = previewTrack(track, move, shifts)
      writeTrack(join(out, `${name}-track.json`), pt)
      readTrackInto(pt, join(out, `${name}-readings`))
      const picks = stripFrames(n, track.fps)
      await previewSheet(pt, picks.map((s) => join(dir, `f${String(s.i).padStart(5, '0')}.png`)), picks.map((s) => s.t), clock0, join(out, `${name}-sheet.png`))

      const perFrame = wallMs / n
      const m = { move: move.name, frames: n, fps: track.fps, clock0: +clock0.toFixed(4), mp4: { file: mp4, width: +vw, height: +vh, rate, frames: +count },
        wallMs, lensMs, lensReads: read.size, ...(lensSketch ? { lensOff: { eyeM: +offEye.toFixed(4), yawDeg: +offYaw.toFixed(3) } } : {}), msPerFrame: +perFrame.toFixed(1), minutesPerFilmMinute: +((perFrame * track.fps * 60) / 60000).toFixed(2), pageMsMean: +(frames.reduce((s, f) => s + f.pageMs, 0) / n).toFixed(1),
        lens: lensSketch ? 'sketch path (still readout)' : track.shifts ? 'track' : 'none', ev: evLog ? 'clip log' : evFlat !== null ? 'flat' : 'stop (lens readout)' }
      writeFileSync(join(out, `${name}-frames.json`), JSON.stringify({ preview: PREVIEW, ...m, frames }, null, 1))
      run.moves.push(m)
      console.log(`${name}: ${n} frames, ${m.msPerFrame} ms a frame, ${m.minutesPerFilmMinute} min a film minute, mp4 ${count} frames at ${rate}`)
    }
  } finally {
    run.consoleErrors = errors.length
    run.errors = errors.slice(0, 10)
    writeFileSync(join(out, 'preview-run.json'), JSON.stringify(run, null, 1))
    await close()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
