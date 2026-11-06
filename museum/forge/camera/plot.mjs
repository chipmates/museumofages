#!/usr/bin/env node
// A camera track's moves as pictures: per move one PNG, the top-down path with
// the view every half second, beneath it speed, turn rate, height and picture
// motion over time with the flags marked and the holds shaded; optionally the
// rendered video's frames every half second beside it, and one sheet of several
// moves. SVG rendered through sharp (no plotting library in the toolchain).
//
//   node museum/forge/camera/plot.mjs <track.json> --out <folder> [--moves a,b]
//        [--video <mp4> [--video-offset s]] [--sheet <png> --sheet-moves a,b,c,d]

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { forwardOf, readTrack } from './track.mjs'
import { THRESHOLDS, curvesOf, readMove } from './read.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3))
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
 * lines, red flag spans, ticks for keys and cuts
 */
export function panelSvg({ x, y, w, h, t0, t1, title, series, ymin = 0, ymax = null, lines = [], spans = [], flags = [], keys = [], cuts = [], xLabels = true }) {
  const vals = series.flatMap((s) => Array.from(s.v).filter(Number.isFinite))
  const top = ymax ?? niceMax(Math.max(...vals, ...lines.map((l) => l.y * 1.1), 1e-6))
  const lo = ymin ?? Math.min(...vals)
  const hi = top > lo ? top : lo + 1
  const X = (t) => x + ((t - t0) / (t1 - t0 || 1)) * w
  const Y = (v) => y + h - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * h
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fbfbfb" stroke="#999" stroke-width="1"/>`]
  for (const s of spans) out.push(`<rect x="${X(s.t0)}" y="${y}" width="${Math.max(1, X(s.t1) - X(s.t0))}" height="${h}" fill="${s.fill ?? '#d8d8d8'}"/>`)
  for (const f of flags) out.push(`<rect x="${X(f.t0)}" y="${y}" width="${Math.max(2, X(f.t1) - X(f.t0))}" height="${h}" fill="#e0301e" fill-opacity="0.22"/>`)
  for (const c of cuts) out.push(`<line x1="${X(c)}" x2="${X(c)}" y1="${y}" y2="${y + h}" stroke="#000" stroke-width="1.5" stroke-dasharray="6 3"/>`)
  for (const k of keys) out.push(`<line x1="${X(k)}" x2="${X(k)}" y1="${y + h - 10}" y2="${y + h}" stroke="#1f5fbf" stroke-width="2"/>`)
  for (const l of lines) {
    if (l.y < lo || l.y > hi) continue
    out.push(`<line x1="${x}" x2="${x + w}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.color ?? '#e0301e'}" stroke-width="1.2" stroke-dasharray="5 4"/>`)
    out.push(`<text x="${x + w - 4}" y="${Y(l.y) - 3}" font-size="13" ${FONT} text-anchor="end" fill="${l.color ?? '#e0301e'}">${esc(l.label)}</text>`)
  }
  for (const s of series) {
    const pts = []
    for (let i = 0; i < s.v.length; i++) if (Number.isFinite(s.v[i])) pts.push(`${X(s.t[i]).toFixed(1)},${Y(s.v[i]).toFixed(1)}`)
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1.6}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`)
  }
  out.push(`<text x="${x + 6}" y="${y + 17}" font-size="16" ${FONT} fill="#222">${esc(title)}</text>`)
  let lx = x + 6 + 9.2 * title.length + 16
  for (const s of series) if (s.label) { out.push(`<text x="${lx}" y="${y + 17}" font-size="14" ${FONT} fill="${s.color}">${esc(s.label)}</text>`); lx += 8 * s.label.length + 14 }
  out.push(`<text x="${x - 6}" y="${y + 12}" font-size="13" ${FONT} text-anchor="end" fill="#444">${fmt(hi)}</text>`)
  out.push(`<text x="${x - 6}" y="${y + h}" font-size="13" ${FONT} text-anchor="end" fill="#444">${fmt(lo)}</text>`)
  if (xLabels) {
    const step = niceMax((t1 - t0) / 10)
    for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
      out.push(`<line x1="${X(t)}" x2="${X(t)}" y1="${y + h}" y2="${y + h + 4}" stroke="#666"/>`)
      out.push(`<text x="${X(t)}" y="${y + h + 17}" font-size="13" ${FONT} text-anchor="middle" fill="#444">${+t.toFixed(2)}</text>`)
    }
  }
  return out.join('\n')
}

/** the top-down path (north up, x east): the eye's line, the view every half second, holds and flags placed */
function pathSvg({ x, y, w, h, c, from, to, fps, samples, holds, flags, everySeconds = 0.5 }) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = from; i < to; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]) }
  const span = Math.max(x1 - x0, z1 - z0, 2), pad = 40
  const k = Math.min((w - 2 * pad) / Math.max(x1 - x0, span * 0.05, 1e-3), (h - 2 * pad) / Math.max(z1 - z0, span * 0.05, 1e-3))
  const cx = x + w / 2 - ((x0 + x1) / 2) * k, cz = y + h / 2 - ((z0 + z1) / 2) * k
  const P = (i) => [cx + c.x[i] * k, cz + c.z[i] * k]
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4f1ea" stroke="#999"/>`]
  const pts = []
  for (let i = from; i < to; i++) pts.push(P(i).map((v) => v.toFixed(1)).join(','))
  out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#555" stroke-width="2"/>`)
  const step = Math.max(1, Math.round(everySeconds * fps)), n = to - from
  for (let i = from; i < to; i += step) {
    const [px, pz] = P(i), f = forwardOf(samples[i]), fl = Math.hypot(f[0], f[2]) || 1, L = 26
    const u = (i - from) / Math.max(1, n - 1), col = `hsl(${(220 - 200 * u).toFixed(0)},70%,42%)`
    out.push(`<line x1="${px.toFixed(1)}" y1="${pz.toFixed(1)}" x2="${(px + (f[0] / fl) * L).toFixed(1)}" y2="${(pz + (f[2] / fl) * L).toFixed(1)}" stroke="${col}" stroke-width="2"/>`)
    out.push(`<circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="2.5" fill="${col}"/>`)
  }
  for (const hd of holds) { const [px, pz] = P(hd.from); out.push(`<circle cx="${px}" cy="${pz}" r="9" fill="none" stroke="#777" stroke-width="3"/>`) }
  for (const fl of flags) {
    const i = Math.min(to - 1, from + Math.round(fl.at * fps)), [px, pz] = P(i)
    out.push(`<circle cx="${px}" cy="${pz}" r="5" fill="#e0301e" fill-opacity="0.75"/>`)
  }
  const [sx, sz] = P(from), [ex, ez] = P(to - 1)
  out.push(`<text x="${sx + 8}" y="${sz - 8}" font-size="15" ${FONT} fill="#1f3f8f">start</text>`)
  out.push(`<text x="${ex + 8}" y="${ez + 16}" font-size="15" ${FONT} fill="#8f1f1f">end</text>`)
  // a scale bar
  const bar = niceMax(span / 5), bl = bar * k
  out.push(`<line x1="${x + 14}" x2="${x + 14 + bl}" y1="${y + h - 14}" y2="${y + h - 14}" stroke="#222" stroke-width="3"/>`)
  out.push(`<text x="${x + 18 + bl}" y="${y + h - 9}" font-size="14" ${FONT} fill="#222">${bar} m (north up; ticks: the view every ${everySeconds} s, blue to red; grey rings holds; red dots flags)</text>`)
  return out.join('\n')
}

const wantLine = (key) => THRESHOLDS[key]

/** one move's plot as an SVG string, and its pixel size */
export function moveSvg(track, c, move, r, { width = 1200 } = {}) {
  const { fps } = track, from = move.from, to = move.to, n = to - from
  const t = Float64Array.from({ length: n }, (_, i) => i / fps), T1 = Math.max(t[n - 1], 1 / fps)
  const sl = (a) => Array.from(a.subarray(from, to))
  const holds = r.holds.map((hd) => ({ t0: hd.t0, t1: hd.t1 }))
  const authored = (r.authored ?? []).map((a) => ({ t0: a.t0, t1: a.t1, fill: '#efe0b8' }))
  const keys = (track.keys ?? []).filter((k) => k >= from && k < to).map((k) => (k - from) / fps)
  const cuts = (track.cuts ?? []).filter((k) => k > from && k < to).map((k) => (k - from) / fps)
  const flagsOn = (p) => r.flags.filter((f) => PANEL_OF[f.flag] === p || (f.flag === 'unsettled' && p === (String(f.unit).startsWith('deg') ? 'turn' : 'speed')))
  const L = 70, W = width - L - 20, H = 120, G = 34
  const parts = []
  let y = 52
  const title = `${move.name}  ${r.seconds} s, ${r.metres} m   flags: ${[...new Set(r.flags.map((f) => f.flag))].join(' ') || 'none'}`
  parts.push(`<text x="${L}" y="30" font-size="22" ${FONT} font-weight="bold" fill="#111">${esc(title)}</text>`)
  parts.push(pathSvg({ x: L, y, w: W, h: 420, c, from, to, fps, samples: track.samples, holds: r.holds, flags: r.flags }))
  y += 420 + 16
  const common = { x: L, w: W, h: H, t0: 0, t1: T1, spans: [...authored, ...holds], keys, cuts }
  parts.push(panelSvg({ ...common, y, title: 'speed m/s', series: [{ t, v: sl(c.speed), color: '#1f3f8f', label: 'speed' }, { t, v: sl(c.accel).map((v) => v / 10), color: '#8a5a00', label: 'accel / 10 (m/s2)', width: 1 }], lines: [{ y: wantLine('bodyMetresPerSecond2').value / 10, label: `surge line ${wantLine('bodyMetresPerSecond2').value} m/s2 (/10)` }], flags: flagsOn('speed') }))
  y += H + G
  const wk = wantLine('walking'), st = wantLine('standing')
  parts.push(panelSvg({ ...common, y, title: 'turn deg/s', series: [{ t, v: sl(c.turnRate), color: '#1f3f8f', label: 'centre ray' }], lines: [{ y: wk.turnDegPerSecond, label: `walking ${wk.turnDegPerSecond}` }, { y: st.turnDegPerSecond, label: `standing ${st.turnDegPerSecond}` }], flags: flagsOn('turn') }))
  y += H + G
  parts.push(panelSvg({ ...common, y, ymin: null, title: 'height m', series: [{ t, v: sl(c.y), color: '#2f7f3f', label: 'eye y' }], flags: flagsOn('height') }))
  y += H + G
  parts.push(panelSvg({ ...common, y, title: 'picture widths/s', series: [{ t, v: sl(c.centreWidths), color: '#1f3f8f', label: 'centre' }, { t, v: sl(c.farWidths), color: '#7f2f8f', label: 'far point' }], lines: [{ y: wk.screenWidthsPerSecond, label: `walking ${+wk.screenWidthsPerSecond.toFixed(3)}` }, { y: st.screenWidthsPerSecond, label: `standing ${+st.screenWidthsPerSecond.toFixed(3)}` }], flags: flagsOn('picture') }))
  y += H + G
  // the flag lanes: one row per flag that fired
  const names = [...new Set(r.flags.map((f) => f.flag))]
  const X = (s) => L + (s / T1) * W
  parts.push(`<text x="${L}" y="${y}" font-size="15" ${FONT} fill="#222">flags (red spans; grey: measured holds; tan: authored holds; blue ticks: keys; dashed: cuts)</text>`)
  y += 8
  for (const nm of names) {
    parts.push(`<text x="${L - 6}" y="${y + 13}" font-size="13" ${FONT} text-anchor="end" fill="#e0301e">${esc(nm)}</text>`)
    parts.push(`<rect x="${L}" y="${y}" width="${W}" height="16" fill="#f6f6f6"/>`)
    for (const f of r.flags.filter((g) => g.flag === nm)) parts.push(`<rect x="${X(f.t0)}" y="${y}" width="${Math.max(3, X(f.t1) - X(f.t0))}" height="16" fill="#e0301e"/>`)
    y += 20
  }
  const height = y + 16
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('\n')}</svg>`, width, height }
}

/** the video's frames every half second over [t0, t1) as one PNG grid with the times written on */
export async function filmstrip(video, t0, t1, { every = 0.5, cols = 4, frameWidth = 220, scratch }) {
  const n = Math.max(1, Math.floor((t1 - t0) / every + 1e-6) + (t1 - t0 > 0 ? 0 : 1))
  const rows = Math.ceil(n / cols)
  const file = join(scratch, `strip-${t0.toFixed(2)}.png`)
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', t0.toFixed(3), '-i', video, '-t', (n * every).toFixed(3), '-vf', `fps=${1 / every}:start_time=0,scale=${frameWidth}:-2,tile=${cols}x${rows}`, '-frames:v', '1', file])
  const meta = await sharp(file).metadata(), fh = meta.height / rows
  const labels = Array.from({ length: n }, (_, i) => `<text x="${(i % cols) * frameWidth + 5}" y="${Math.floor(i / cols) * fh + 17}" font-size="15" ${FONT} fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${(t0 + i * every).toFixed(1)}</text>`)
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${labels.join('')}</svg>`)
  return sharp(file).composite([{ input: over, top: 0, left: 0 }]).png().toBuffer()
}

/** one move's PNG: the plot, and the filmstrip to its right when a video is given */
export async function movePng(track, c, move, r, { video = null, videoOffset = 0, scratch } = {}) {
  const { svg, width, height } = moveSvg(track, c, move, r)
  const plot = await sharp(Buffer.from(svg)).png().toBuffer()
  if (!video) return plot
  const t0 = (track.offsetSeconds ?? 0) + move.from / track.fps + videoOffset
  const strip = await filmstrip(video, t0, t0 + (move.to - move.from) / track.fps, { scratch })
  const sm = await sharp(strip).metadata()
  return sharp({ create: { width: width + sm.width + 16, height: Math.max(height, sm.height + 40), channels: 3, background: '#ffffff' } })
    .composite([{ input: plot, top: 0, left: 0 }, { input: strip, top: 40, left: width + 16 },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sm.width}" height="30"><text x="0" y="22" font-size="18" ${FONT} fill="#111">the draft video every 0.5 s (video time)</text></svg>`), top: 6, left: width + 16 }])
    .png().toBuffer()
}

/** several PNGs in a grid, each scaled to one cell width */
export async function sheet(buffers, file, { cols = 2, cellWidth = 1600, gap = 24 } = {}) {
  const scaled = await Promise.all(buffers.map((b) => sharp(b).resize({ width: cellWidth }).png().toBuffer()))
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
