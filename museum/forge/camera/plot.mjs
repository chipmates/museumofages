#!/usr/bin/env node
// A camera track's moves as pictures: per move one PNG, the top-down path with
// the view every half second, beside it speed, acceleration and jerk, turn
// rate, picture motion and height over time with the flags marked and the holds
// shaded; optionally the rendered video's frames every half second beneath it,
// and one sheet of several moves. SVG rendered through sharp (no plotting library in the toolchain).
//
//   node museum/forge/camera/plot.mjs <track.json> --out <folder> [--moves a,b]
//        [--video <mp4> [--video-offset s]] [--sheet <png> --sheet-moves a,b,c,d]

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { forwardOf, readTrack } from './track.mjs'
import { THRESHOLDS, curvesOf, marksOf, readMove } from './read.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (v) => (v === 0 ? '0' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3))
const FONT = 'font-family="Helvetica, Arial, sans-serif"'

// which panel shows which flag (a flag's span is drawn in red on its panel and in the flag lanes)
const PANEL_OF = { surge: 'speed', jerk: 'speed', 'short-hold': 'speed', 'fast-turn': 'turn', 'turn-accel': 'turn', 'turn-jerk': 'turn', weave: 'turn', 'fast-picture': 'picture', zoom: 'picture', jump: 'height' }

/** a nice upper bound for an axis */
function niceMax(v) {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

/**
 * one time panel as SVG: series over a shared time axis, shaded spans, dashed
 * lines, red flag spans, ticks for keys and cuts; values over ymax are clipped
 * (the title carries the peaks)
 */
export function panelSvg({ x, y, w, h, t0, t1, title, series, ymin = 0, ymax = null, lines = [], spans = [], flags = [], keys = [], cuts = [], xLabels = true, grid = [] }) {
  const vals = series.flatMap((s) => Array.from(s.v).filter(Number.isFinite))
  const top = ymax ?? niceMax(Math.max(...vals, ...lines.map((l) => l.y * 1.1), 1e-6))
  const lo = ymin ?? Math.min(...vals)
  const hi = top > lo ? top : lo + 1
  const X = (t) => x + ((t - t0) / (t1 - t0 || 1)) * w
  const Y = (v) => y + h - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * h
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fbfbfb" stroke="#999" stroke-width="1"/>`]
  for (const s of spans) out.push(`<rect x="${X(s.t0)}" y="${y}" width="${Math.max(1, X(s.t1) - X(s.t0))}" height="${h}" fill="${s.fill ?? '#dcdcdc'}"/>`)
  for (const g of grid) out.push(`<line x1="${X(g)}" x2="${X(g)}" y1="${y}" y2="${y + h}" stroke="#e4e4e4" stroke-width="1"/>`)
  for (const f of flags) out.push(`<rect x="${X(f.t0)}" y="${y}" width="${Math.max(2, X(f.t1) - X(f.t0))}" height="${h}" fill="#e0301e" fill-opacity="0.22"/>`)
  for (const c of cuts) out.push(`<line x1="${X(c)}" x2="${X(c)}" y1="${y}" y2="${y + h}" stroke="#000" stroke-width="1.5" stroke-dasharray="6 3"/>`)
  for (const k of keys) out.push(`<line x1="${X(k)}" x2="${X(k)}" y1="${y + h - 8}" y2="${y + h}" stroke="#1f5fbf" stroke-width="2"/>`)
  // labels of close lines step upward so they never overprint; drawn last with a halo, so a line or curve
  // crossing a label never strikes it through
  let lastLabel = Infinity
  const labels = []
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    if (l.y < lo || l.y > hi) continue
    const ly = Math.min(Y(l.y) - 3, lastLabel - 13)
    lastLabel = ly
    out.push(`<line x1="${x}" x2="${x + w}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.color ?? '#e0301e'}" stroke-width="1.2" stroke-dasharray="5 4"/>`)
    labels.push(`<text x="${x + w - 4}" y="${ly}" font-size="12" ${FONT} text-anchor="end" fill="${l.color ?? '#e0301e'}" stroke="#fbfbfb" stroke-width="3" paint-order="stroke">${esc(l.label)}</text>`)
  }
  for (const s of series) {
    const pts = []
    for (let i = 0; i < s.v.length; i++) if (Number.isFinite(s.v[i])) pts.push(`${X(s.t[i]).toFixed(1)},${Y(s.v[i]).toFixed(1)}`)
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1.6}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`)
    // a clipped stretch gets a bar on the top edge, so a flat top never reads as a plateau
    for (let i = 0; i < s.v.length; i++) {
      if (!(s.v[i] > hi)) continue
      let j = i; while (j + 1 < s.v.length && s.v[j + 1] > hi) j++
      out.push(`<rect x="${X(s.t[i]).toFixed(1)}" y="${y}" width="${Math.max(2, X(s.t[j]) - X(s.t[i])).toFixed(1)}" height="4" fill="${s.color}"/>`)
      i = j
    }
  }
  out.push(...labels)
  out.push(`<text x="${x + 5}" y="${y + 14}" font-size="13" ${FONT} font-weight="bold" fill="#222">${esc(title)}</text>`)
  let lx = x + 5 + 7.4 * title.length + 12
  for (const s of series) if (s.label) { out.push(`<text x="${lx}" y="${y + 14}" font-size="12" ${FONT} fill="${s.color}">${esc(s.label)}</text>`); lx += 6.4 * s.label.length + 12 }
  out.push(`<text x="${x - 5}" y="${y + 11}" font-size="12" ${FONT} text-anchor="end" fill="#444">${fmt(hi)}</text>`)
  out.push(`<text x="${x - 5}" y="${y + h}" font-size="12" ${FONT} text-anchor="end" fill="#444">${fmt(lo)}</text>`)
  if (xLabels) for (const g of grid) {
    out.push(`<line x1="${X(g)}" x2="${X(g)}" y1="${y + h}" y2="${y + h + 4}" stroke="#666"/>`)
    out.push(`<text x="${X(g)}" y="${y + h + 16}" font-size="12" ${FONT} text-anchor="middle" fill="#444">${+g.toFixed(2)}</text>`)
  }
  return out.join('\n')
}

/** the time axis's tick times */
const gridOf = (t1) => { const step = niceMax(t1 / 10), out = []; for (let t = 0; t <= t1 + 1e-9; t += step) out.push(t); return out }

/** the top-down path (north up, x east): the eye's line split at cuts, the view every half second, keys, holds and flags placed */
function pathSvg({ x, y, side, c, from, to, fps, samples, holds, flags, marks, cuts, metres, everySeconds = 0.5 }) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = from; i < to; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]) }
  // at least 4 m across, so a turn on the spot reads as a fan, not a dot
  // the top pad keeps the path clear of the two legend lines
  const extent = Math.max(x1 - x0, z1 - z0, 4), pad = 34, padTop = 48, k = (side - pad - padTop) / extent
  const cx = x + side / 2 - ((x0 + x1) / 2) * k, cz = y + padTop + (side - pad - padTop) / 2 - ((z0 + z1) / 2) * k
  const P = (i) => [cx + c.x[i] * k, cz + c.z[i] * k]
  const out = [`<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="#f4f1ea" stroke="#999"/>`]
  const edges = [from, ...cuts.filter((q) => q > from && q < to), to]
  for (let e = 0; e + 1 < edges.length; e++) {
    const pts = []
    for (let i = edges[e]; i < edges[e + 1]; i++) pts.push(P(i).map((v) => v.toFixed(1)).join(','))
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#555" stroke-width="2"/>`)
  }
  const step = Math.max(1, Math.round(everySeconds * fps)), n = to - from, L = side * (metres < 1 ? 0.3 : 0.075)
  for (let i = from; i < to; i += step) {
    const [px, pz] = P(i), f = forwardOf(samples[i]), fl = Math.hypot(f[0], f[2]) || 1
    const u = (i - from) / Math.max(1, n - 1), col = `hsl(${(220 - 220 * u).toFixed(0)},75%,42%)`
    out.push(`<line x1="${px.toFixed(1)}" y1="${pz.toFixed(1)}" x2="${(px + (f[0] / fl) * L).toFixed(1)}" y2="${(pz + (f[2] / fl) * L).toFixed(1)}" stroke="${col}" stroke-width="2"/>`)
    out.push(`<circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="2.2" fill="${col}"/>`)
  }
  for (const m of marks) { const [px, pz] = P(m); out.push(`<rect x="${(px - 3).toFixed(1)}" y="${(pz - 3).toFixed(1)}" width="6" height="6" fill="#1f5fbf"/>`) }
  for (const hd of holds) { const [px, pz] = P(hd.from); out.push(`<circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="8" fill="none" stroke="#777" stroke-width="2.5"/>`) }
  for (const fl of flags) {
    if (fl.flag === 'weave' || fl.flag === 'short-hold') continue
    const [px, pz] = P(Math.min(to - 1, from + Math.round(fl.at * fps)))
    out.push(`<circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="4.5" fill="#e0301e" fill-opacity="0.8"/>`)
  }
  const [sx, sz] = P(from), [ex, ez] = P(to - 1)
  out.push(`<text x="${sx + 7}" y="${sz - 7}" font-size="13" ${FONT} fill="#1f3f8f">start</text>`)
  out.push(`<text x="${ex + 7}" y="${ez + 15}" font-size="13" ${FONT} fill="#8f1f1f">end</text>`)
  let bar = niceMax(extent / 4)
  while (bar * k > side / 3) bar /= 2
  out.push(`<line x1="${x + 10}" x2="${x + 10 + bar * k}" y1="${y + side - 10}" y2="${y + side - 10}" stroke="#222" stroke-width="3"/>`)
  out.push(`<text x="${x + 14 + bar * k}" y="${y + side - 6}" font-size="12" ${FONT} fill="#222">${+bar.toPrecision(3)} m, north up</text>`)
  out.push(`<text x="${x + 8}" y="${y + 15}" font-size="12" ${FONT} fill="#444">the view every ${everySeconds} s, blue to red</text>`)
  out.push(`<text x="${x + 8}" y="${y + 29}" font-size="12" ${FONT} fill="#444">squares keys, rings holds, red dots flags</text>`)
  return out.join('\n')
}

const wantLine = (key) => THRESHOLDS[key]
const lineOf = (key) => { const v = wantLine(key); return typeof v === 'object' ? v.value : v }

/** a flag list in words: each name with its count, jerk and surge with how many sit at a key */
export function flagWords(flags) {
  const names = [...new Set(flags.map((f) => f.flag))]
  return names.map((nm) => {
    const fs = flags.filter((f) => f.flag === nm), at = fs.filter((f) => f.mark !== undefined).length
    return `${nm} ${fs.length}${nm === 'jerk' || nm === 'surge' ? ` (${at} at a key)` : ''}`
  }).join(', ') || 'none'
}

/** one move's plot as an SVG string, and its pixel size */
export function moveSvg(track, c, move, r, { width = 1000 } = {}) {
  const { fps } = track, from = move.from, to = move.to, n = to - from
  const t = Float64Array.from({ length: n }, (_, i) => i / fps), T1 = Math.max(t[n - 1], 1 / fps)
  const sl = (a) => Array.from(a.subarray(from, to))
  const holds = r.holds.map((hd) => ({ t0: hd.t0, t1: hd.t1 }))
  const authored = (r.authored ?? []).map((a) => ({ t0: a.t0, t1: a.t1, fill: '#efe0b8' }))
  const markFrames = marksOf(track).filter((k) => k >= from && k < to)
  const keys = markFrames.map((k) => (k - from) / fps)
  const cuts = (track.cuts ?? []).filter((k) => k > from && k < to).map((k) => (k - from) / fps)
  const flagsOn = (p) => r.flags.filter((f) => PANEL_OF[f.flag] === p || (f.flag === 'unsettled' && p === (String(f.unit).startsWith('deg') ? 'turn' : 'speed')))
  const M = 10, S = Math.round(width * 0.36), X0 = M + S + 58, WC = width - X0 - 14
  const parts = []
  const where = `${r.seconds} s, ${r.metres} m, from ${r.startSeconds} s`
  parts.push(`<text x="${M}" y="24" font-size="19" ${FONT} font-weight="bold" fill="#111">${esc(move.name)}<tspan dx="12" font-weight="normal" font-size="15" fill="#333">${esc(where)}</tspan>${track.preview ? `<tspan dx="12" font-size="15" font-weight="bold" fill="#a00">PREVIEW (${esc(track.preview)})</tspan>` : ''}</text>`)
  parts.push(`<text x="${M}" y="46" font-size="14" ${FONT} fill="#b0200f">flags: ${esc(flagWords(r.flags))}</text>`)
  const yA = 58
  parts.push(pathSvg({ x: M, y: yA, side: S, c, from, to, fps, samples: track.samples, holds: r.holds, flags: r.flags, marks: markFrames, cuts: track.cuts ?? [], metres: r.metres }))
  const grid = gridOf(T1), common = { x: X0, w: WC, t0: 0, t1: T1, spans: [...authored, ...holds], keys, cuts, grid, xLabels: false }
  const fly = (track.kinds ?? []).slice(from, to).includes('fly')
  const body3 = lineOf('bodyMetresPerSecond3'), fly3 = lineOf('flyMetresPerSecond3'), surge = lineOf('bodyMetresPerSecond2'), win = 2 * lineOf('derivativeHalfSeconds')
  const H = 62, HH = 44, G = 9
  let y = yA
  parts.push(panelSvg({ ...common, y, h: H, title: 'speed m/s', series: [{ t, v: sl(c.speed), color: '#1f3f8f', label: `peak ${r.peaks.speed}` }], flags: [] }))
  y += H + G
  // jerk times the window is the acceleration step it reads, so one line serves both
  parts.push(panelSvg({ ...common, y, h: H, ymax: 4 * Math.max(surge, fly ? fly3 * win : 0), title: 'accel m/s2', series: [{ t, v: sl(c.accel), color: '#8a5a00', label: `peak ${r.peaks.accel}` }, { t, v: sl(c.jerk).map((v) => v * win), color: '#7f2f8f', width: 1.2, label: `jerk x ${win} s, peak ${r.peaks.jerk} m/s3` }],
    lines: [{ y: surge, label: `surge ${surge} m/s2 = jerk ${body3} m/s3` }, ...(fly ? [{ y: fly3 * win, label: `fly jerk ${fly3} (guess)`, color: '#b05090' }] : [])], flags: flagsOn('speed') }))
  y += H + G
  const wk = wantLine('walking'), st = wantLine('standing')
  parts.push(panelSvg({ ...common, y, h: H, ymax: 2 * st.turnDegPerSecond, title: 'turn deg/s', series: [{ t, v: sl(c.turnRate), color: '#1f3f8f', label: `centre ray, peak ${r.peaks.turnRate}` }], lines: [{ y: wk.turnDegPerSecond, label: `walking ${wk.turnDegPerSecond}` }, { y: st.turnDegPerSecond, label: `standing ${st.turnDegPerSecond}` }], flags: flagsOn('turn') }))
  y += H + G
  parts.push(panelSvg({ ...common, y, h: H, ymax: 2 * st.screenWidthsPerSecond, title: 'picture widths/s', series: [{ t, v: sl(c.centreWidths), color: '#1f3f8f', label: `centre ${r.peaks.centreWidths}` }, { t, v: sl(c.farWidths), color: '#7f2f8f', label: `far ${r.peaks.farWidths}` }], lines: [{ y: wk.screenWidthsPerSecond, label: `walking ${+wk.screenWidthsPerSecond.toFixed(3)}` }, { y: st.screenWidthsPerSecond, label: `standing ${+st.screenWidthsPerSecond.toFixed(3)}` }], flags: flagsOn('picture') }))
  y += H + G
  const ys = sl(c.y), yLo = Math.min(...ys), yHi = Math.max(...ys), yPad = Math.max(0.25, 0.1 * (yHi - yLo))
  parts.push(panelSvg({ ...common, y, h: HH, ymin: yLo - yPad, ymax: yHi + yPad, xLabels: true, title: 'height m', series: [{ t, v: ys, color: '#2f7f3f' }], flags: flagsOn('height') }))
  y = Math.max(y + HH + 24, yA + S + 12)
  // the flag lanes, on the curves' time axis: a red span a flag, a blue tick where it sits at a key
  const X = (s) => X0 + (s / T1) * WC
  for (const nm of [...new Set(r.flags.map((f) => f.flag))]) {
    parts.push(`<text x="${X0 - 6}" y="${y + 11}" font-size="12" ${FONT} text-anchor="end" fill="#b0200f">${esc(nm)}</text>`)
    parts.push(`<rect x="${X0}" y="${y}" width="${WC}" height="13" fill="#f3f3f3"/>`)
    for (const f of r.flags.filter((g) => g.flag === nm)) {
      parts.push(`<rect x="${X(f.t0).toFixed(1)}" y="${y}" width="${Math.max(3, X(f.t1) - X(f.t0)).toFixed(1)}" height="13" fill="#e0301e"/>`)
      if (f.mark !== undefined) parts.push(`<rect x="${(X(f.mark) - 1.5).toFixed(1)}" y="${y + 13}" width="3" height="5" fill="#1f5fbf"/>`)
    }
    y += 19
  }
  parts.push(`<text x="${M}" y="${y + 13}" font-size="12" ${FONT} fill="#444">grey: measured holds; tan: authored holds; blue ticks: ${track.keys?.length ? 'path keys' : 'kind changes'}; dashed: cuts; red: flag spans; a bar on a top edge: the curve runs above the axis (time in s from the move's start)</text>`)
  const height = y + 22
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('\n')}</svg>`, width, height }
}

/** the video's frames every half second over [t0, t1) as one PNG grid, each frame's time from the move's start written on */
export async function filmstrip(video, t0, t1, { every = 0.5, cols = 8, frameWidth = 122, scratch }) {
  const n = Math.max(1, Math.floor((t1 - t0) / every + 1e-6))
  const rows = Math.ceil(n / cols)
  const file = join(scratch, `strip-${t0.toFixed(2)}.png`)
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', t0.toFixed(3), '-i', video, '-t', (n * every).toFixed(3), '-vf', `fps=${1 / every}:start_time=0,scale=${frameWidth}:-2,tile=${cols}x${rows}`, '-frames:v', '1', file])
  const meta = await sharp(file).metadata(), fh = meta.height / rows
  const labels = Array.from({ length: n }, (_, i) => `<text x="${(i % cols) * frameWidth + 4}" y="${Math.floor(i / cols) * fh + 14}" font-size="13" ${FONT} fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${(i * every).toFixed(1)}</text>`)
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${labels.join('')}</svg>`)
  return sharp(file).composite([{ input: over, top: 0, left: 0 }]).png().toBuffer()
}

/** one move's PNG: the plot, and the filmstrip beneath it when a video is given */
export async function movePng(track, c, move, r, { video = null, videoOffset = 0, scratch, width = 1000 } = {}) {
  const { svg, height } = moveSvg(track, c, move, r, { width })
  const plot = await sharp(Buffer.from(svg)).png().toBuffer()
  if (!video) return plot
  const t0 = (track.offsetSeconds ?? 0) + move.from / track.fps + videoOffset
  const cols = 8, strip = await filmstrip(video, t0, t0 + (move.to - move.from) / track.fps, { scratch, cols, frameWidth: Math.floor((width - 20) / cols) })
  const sm = await sharp(strip).metadata()
  const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="22"><text x="10" y="16" font-size="13" ${FONT} fill="#111">the draft video every 0.5 s from ${t0.toFixed(2)} s (frame labels: seconds from the move's start)</text></svg>`)
  return sharp({ create: { width, height: height + 24 + sm.height + 8, channels: 3, background: '#ffffff' } })
    .composite([{ input: plot, top: 0, left: 0 }, { input: cap, top: height, left: 0 }, { input: strip, top: height + 24, left: 10 }])
    .png().toBuffer()
}

/** several PNGs in a grid, each scaled to one cell width */
export async function sheet(buffers, file, { cols = 2, cellWidth = 1000, gap = 24 } = {}) {
  const scaled = await Promise.all(buffers.map(async (b) => ((await sharp(b).metadata()).width === cellWidth ? b : sharp(b).resize({ width: cellWidth }).png().toBuffer())))
  const hs = await Promise.all(scaled.map(async (b) => (await sharp(b).metadata()).height))
  const rows = Math.ceil(scaled.length / cols)
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...hs.slice(r * cols, r * cols + cols)))
  const comp = scaled.map((b, i) => ({ input: b, left: (i % cols) * (cellWidth + gap), top: rowH.slice(0, Math.floor(i / cols)).reduce((s, v) => s + v + gap, 0) }))
  await sharp({ create: { width: cols * cellWidth + (cols - 1) * gap, height: rowH.reduce((s, v) => s + v + gap, -gap), channels: 3, background: '#ffffff' } }).composite(comp).png().toFile(file)
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  const track = readTrack(args[0])
  const out = opt('--out') ?? join(HERE, 'out')
  mkdirSync(out, { recursive: true })
  const pick = opt('--moves')?.split(',')
  const sheetMoves = opt('--sheet-moves')?.split(',')
  const want = new Set([...(pick ?? (sheetMoves ? [] : track.moves.map((m) => m.name))), ...(sheetMoves ?? [])])
  const c = curvesOf(track)
  const scratch = mkdtempSync(join(out, '.strip-'))
  const done = {}
  try {
    for (const move of track.moves) {
      if (!want.has(move.name)) continue
      const png = await movePng(track, c, move, readMove(track, c, move), { video: opt('--video'), videoOffset: Number(opt('--video-offset', 0)), scratch })
      await sharp(png).toFile(join(out, `${move.name}.png`))
      done[move.name] = png
      console.log(join(out, `${move.name}.png`))
    }
    if (opt('--sheet')) {
      await sheet((sheetMoves ?? Object.keys(done)).map((m) => done[m]).filter(Boolean), opt('--sheet'))
      console.log(opt('--sheet'))
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
