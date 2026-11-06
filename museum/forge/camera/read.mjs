// THE READINGS OF A CAMERA TRACK, free from the track alone: per frame the
// eye's speed, the view's turn (heading, pitch, the centre ray), the height,
// how fast the picture moves on screen, the lens's change, and their rates of
// change; per move the flags where they pass the lines in thresholds.json.
// No derivative crosses a cut.
//
//   node forge/camera/read.mjs <track.json> --out <folder>   (readings.tsv, one <move>.json each)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOTION_CAPS, headingOf, headingReadings, motionVerdict, unwrap } from '../film/motion.mjs'
import { forwardOf, hfovOf, readTrack } from './track.mjs'

const DEG = 180 / Math.PI
const HERE = dirname(fileURLToPath(import.meta.url))
export const THRESHOLDS = JSON.parse(readFileSync(join(HERE, 'thresholds.json'), 'utf8'))
const val = (L, k) => (typeof L[k] === 'object' ? L[k].value : L[k])

/** rotate v by q, or by its inverse */
function rotate(q, v, inverse = false) {
  const [x, y, z] = [inverse ? -q[0] : q[0], inverse ? -q[1] : q[1], inverse ? -q[2] : q[2]], w = q[3]
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
}

/** a sample's camera ray through the frame's point (u, v), each -1..1 across the width and height */
function rayOf(s, aspect, u, v) {
  const tv = Math.tan((s[7] / 2) / DEG), th = tv * aspect
  const d = [u * th, v * tv, -1]
  const l = Math.hypot(...d)
  return rotate(s.slice(3, 7), [d[0] / l, d[1] / l, d[2] / l])
}

/** where a world point falls in a sample's frame, as (u, v), or null behind it */
function project(s, aspect, p) {
  const c = rotate(s.slice(3, 7), [p[0] - s[0], p[1] - s[1], p[2] - s[2]], true)
  if (c[2] > -1e-6) return null
  const tv = Math.tan((s[7] / 2) / DEG)
  return [c[0] / -c[2] / (tv * aspect), c[1] / -c[2] / tv]
}

/** the run (between cuts) each frame belongs to, as its first and last frame */
function runsBetween(n, cuts) {
  const lo = new Int32Array(n), hi = new Int32Array(n)
  const edges = [0, ...cuts.filter((c) => c > 0 && c < n), n]
  for (let r = 0; r + 1 < edges.length; r++) for (let i = edges[r]; i < edges[r + 1]; i++) { lo[i] = edges[r]; hi[i] = edges[r + 1] - 1 }
  return { lo, hi }
}

/** the central difference of a series over +-h frames, kept inside each frame's run */
function rate(series, lo, hi, h, fps) {
  const out = new Float64Array(series.length)
  for (let i = 0; i < series.length; i++) {
    const a = Math.max(lo[i], i - h), b = Math.min(hi[i], i + h)
    out[i] = b > a ? ((series[b] - series[a]) * fps) / (b - a) : 0
  }
  return out
}

/** THE CURVES of a whole track, one value a frame */
export function curvesOf(track, L = THRESHOLDS) {
  const { samples: S, fps, aspect } = track
  const n = S.length
  const h = Math.max(1, Math.round(val(L, 'derivativeHalfSeconds') * fps))
  const { lo, hi } = runsBetween(n, track.cuts ?? [])
  const far = val(L, 'farM')
  const head = new Float64Array(n), elev = new Float64Array(n)
  for (let i = 0; i < n; i++) { const r = headingOf(S[i][3], S[i][4], S[i][5], S[i][6]); head[i] = r.heading; elev[i] = r.elevation }
  // unwrap within each run, so a cut's turn is not a swing
  const headU = new Float64Array(n)
  for (let i = 0; i < n; ) { const j = hi[i] + 1; headU.set(unwrap(head.subarray(i, j)), i); i = j }
  const xs = Float64Array.from(S, (s) => s[0]), ys = Float64Array.from(S, (s) => s[1]), zs = Float64Array.from(S, (s) => s[2])
  const vx = rate(xs, lo, hi, h, fps), vy = rate(ys, lo, hi, h, fps), vz = rate(zs, lo, hi, h, fps)
  const speed = Float64Array.from(vx, (v, i) => Math.hypot(v, vy[i], vz[i]))
  const ax = rate(vx, lo, hi, h, fps), ay = rate(vy, lo, hi, h, fps), az = rate(vz, lo, hi, h, fps)
  const accel = Float64Array.from(ax, (v, i) => Math.hypot(v, ay[i], az[i]))
  const jx = rate(ax, lo, hi, h, fps), jy = rate(ay, lo, hi, h, fps), jz = rate(az, lo, hi, h, fps)
  const jerk = Float64Array.from(jx, (v, i) => Math.hypot(v, jy[i], jz[i]))
  const headingRate = Float64Array.from(rate(headU, lo, hi, h, fps), (v) => v * DEG)
  const pitchRate = Float64Array.from(rate(elev, lo, hi, h, fps), (v) => v * DEG)
  // the centre ray's own angular rate: the turn as the picture shows it, whatever the pitch
  const turnRate = new Float64Array(n), centreWidths = new Float64Array(n), farWidths = new Float64Array(n), zoom = new Float64Array(n)
  const hfov = Float64Array.from(S, (s) => hfovOf(s[7], aspect))
  for (let i = 0; i < n; i++) {
    const a = Math.max(lo[i], i - h), b = Math.min(hi[i], i + h)
    if (b <= a) continue
    const dt = (b - a) / fps
    const fa = forwardOf(S[a]), fb = forwardOf(S[b])
    const w = Math.acos(Math.max(-1, Math.min(1, fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2]))) / dt
    turnRate[i] = w * DEG
    // at the frame's centre a turn of w moves the picture w / (2 tan(hfov / 2)) widths a second
    centreWidths[i] = w / (2 * Math.tan(hfov[i] / 2 / DEG))
    let top = 0
    for (const u of [-1, 0, 1]) {
      const r = rayOf(S[a], aspect, u, 0)
      const p = [S[a][0] + r[0] * far, S[a][1] + r[1] * far, S[a][2] + r[2] * far]
      const q = project(S[b], aspect, p)
      if (!q) continue
      top = Math.max(top, Math.hypot((q[0] - u) / 2, q[1] / (2 * aspect)) / dt)
    }
    farWidths[i] = top
    const ta = Math.tan(hfov[a] / 2 / DEG), tb = Math.tan(hfov[b] / 2 / DEG)
    zoom[i] = Math.abs(Math.log(ta / tb)) / dt
  }
  const turnAccel = Float64Array.from(rate(turnRate, lo, hi, h, fps), Math.abs)
  const turnJerk = Float64Array.from(rate(rate(turnRate, lo, hi, h, fps), lo, hi, h, fps), Math.abs)
  const standing = Uint8Array.from(speed, (v) => (v < val(L, 'standingMetresPerSecond') ? 1 : 0))
  const still = Uint8Array.from(speed, (v, i) => (v < val(L, 'standingMetresPerSecond') && turnRate[i] < val(L, 'stillDegPerSecond') && zoom[i] < 0.01 ? 1 : 0))
  return { fps, h, x: xs, y: ys, z: zs, heading: headU, elevation: elev, speed, accel, jerk, headingRate, pitchRate, turnRate, turnAccel, turnJerk, centreWidths, farWidths, zoom, hfov, standing, still, lo, hi }
}

/** runs of a mask inside [from, to), as frame spans */
function spans(mask, from, to) {
  const out = []
  for (let i = from; i < to; i++) {
    if (!mask(i)) continue
    if (out.length && out[out.length - 1].to === i) out[out.length - 1].to = i + 1
    else out.push({ from: i, to: i + 1 })
  }
  return out
}

/**
 * the still runs of a stretch, at least minStopSeconds long. The ±h central
 * difference reads a frame as moving while its window still reaches motion, so
 * every still run is short by h frames at each end: widen it back (exact for a
 * stop that steps, up to h frames long for an ease), never across a cut's run.
 */
export function holdsOf(c, from, to, L = THRESHOLDS) {
  const out = []
  const runs = spans((i) => c.still[i], from, to).filter((s) => (s.to - s.from) / c.fps >= val(L, 'minStopSeconds'))
  for (const s of runs) {
    const lo = Math.max(from, c.lo[s.from], s.from - c.h), hi = Math.min(to, c.hi[s.from] + 1, s.to + c.h)
    const last = out[out.length - 1]
    if (last && last.to >= lo) last.to = Math.max(last.to, hi)
    else out.push({ from: lo, to: hi })
  }
  return out
}

/**
 * ONE MOVE'S READING: its peaks, its holds (measured, and authored where the
 * track names them), and its flags, each a span of seconds from the move's
 * start with its peak and its line.
 */
export function readMove(track, c, move, L = THRESHOLDS) {
  const { from, to } = move
  const fps = c.fps
  const sec = (i) => +((i - from) / fps).toFixed(2)
  const capOf = (i, k) => (c.standing[i] ? L.standing : L.walking)[k]
  const flags = []
  const flag = (name, test, value, cap, unit) => {
    for (const s of spans(test, from, to)) {
      let peak = 0, at = s.from
      for (let i = s.from; i < s.to; i++) if (value(i) > peak) { peak = value(i); at = i }
      flags.push({ flag: name, t0: sec(s.from), t1: sec(s.to), peak: +peak.toFixed(3), at: sec(at), cap: +cap(at).toFixed(3), unit })
    }
  }
  flag('fast-turn', (i) => c.turnRate[i] > capOf(i, 'turnDegPerSecond'), (i) => c.turnRate[i], (i) => capOf(i, 'turnDegPerSecond'), 'deg/s')
  flag('turn-accel', (i) => c.turnAccel[i] > capOf(i, 'turnDegPerSecond2'), (i) => c.turnAccel[i], (i) => capOf(i, 'turnDegPerSecond2'), 'deg/s2')
  flag('turn-jerk', (i) => c.turnJerk[i] > capOf(i, 'turnDegPerSecond3'), (i) => c.turnJerk[i], (i) => capOf(i, 'turnDegPerSecond3'), 'deg/s3')
  flag('fast-picture', (i) => c.centreWidths[i] > capOf(i, 'screenWidthsPerSecond'), (i) => c.centreWidths[i], (i) => capOf(i, 'screenWidthsPerSecond'), 'widths/s')
  flag('surge', (i) => c.accel[i] > val(L, 'bodyMetresPerSecond2'), (i) => c.accel[i], () => val(L, 'bodyMetresPerSecond2'), 'm/s2')
  const jerkCap = (i) => val(L, track.kinds?.[i] === 'fly' ? 'flyMetresPerSecond3' : 'bodyMetresPerSecond3')
  flag('jerk', (i) => c.jerk[i] > jerkCap(i), (i) => c.jerk[i], jerkCap, 'm/s3')
  flag('zoom', (i) => c.zoom[i] > val(L, 'zoomPerSecond'), (i) => c.zoom[i], () => val(L, 'zoomPerSecond'), '/s')

  // the holds: still runs, the authored spans beside them
  const holds = holdsOf(c, from, to, L).map((s) => ({ t0: sec(s.from), t1: sec(s.to), seconds: +((s.to - s.from) / fps).toFixed(2), from: s.from, to: s.to }))
  const authored = (track.holds ?? []).filter((s) => s.from >= from && s.from < to).map((s) => {
    let moving = 0
    for (let i = s.from; i < s.to; i++) if (!c.still[i]) moving++
    return { name: s.name, t0: sec(s.from), t1: sec(Math.min(s.to, to)), seconds: +((s.to - s.from) / fps).toFixed(2), movingShare: +(moving / (s.to - s.from)).toFixed(2) }
  })
  const W = Math.max(1, Math.round(val(L, 'settleWindowSeconds') * fps))
  for (const hd of holds) {
    const seconds = hd.seconds
    const ends = hd.to >= to || c.hi[hd.from] < hd.to
    // a hold that the move or a cut ends is the shot's last frame, read by what follows
    if (seconds < val(L, 'minHoldSeconds') && !ends && hd.from > from) flags.push({ flag: 'short-hold', t0: hd.t0, t1: hd.t1, peak: seconds, at: hd.t0, cap: val(L, 'minHoldSeconds'), unit: 's' })
    if (hd.from > c.lo[hd.from] && hd.from > from) {
      let v = 0, w = 0
      for (let i = Math.max(c.lo[hd.from], hd.from - W); i < hd.from; i++) { v = Math.max(v, c.speed[i]); w = Math.max(w, c.turnRate[i]) }
      if (v > val(L, 'settleMetresPerSecond') || w > val(L, 'settleDegPerSecond')) {
        const byTurn = w / val(L, 'settleDegPerSecond') > v / val(L, 'settleMetresPerSecond')
        flags.push({ flag: 'unsettled', t0: sec(hd.from - W), t1: hd.t0, peak: +(byTurn ? w : v).toFixed(3), at: hd.t0, cap: byTurn ? val(L, 'settleDegPerSecond') : val(L, 'settleMetresPerSecond'), unit: byTurn ? 'deg/s into a hold' : 'm/s into a hold' })
      }
    }
  }
  for (const a of authored) if (a.movingShare > val(L, 'driftShare')) flags.push({ flag: 'unsettled', t0: a.t0, t1: a.t1, peak: a.movingShare, at: a.t0, cap: val(L, 'driftShare'), unit: 'share of an authored hold that moves' })
  for (const j of track.jumps ?? []) if (j > from && j < to) flags.push({ flag: 'jump', t0: sec(j - 1), t1: sec(j), peak: 1, at: sec(j), cap: 0, unit: 'unnamed cut' })

  // a surge or jerk peak within reach of a key is the path's step there, not a reading's fault: name the key
  const marks = marksOf(track).filter((k) => k >= from && k < to), reach = Math.round(val(L, 'markReachSeconds') * fps)
  for (const f of flags) if (f.flag === 'surge' || f.flag === 'jerk') {
    const at = from + Math.round(f.at * fps)
    const near = marks.filter((k) => Math.abs(k - at) <= reach).sort((p, q) => Math.abs(p - at) - Math.abs(q - at))[0]
    if (near !== undefined) f.mark = sec(near)
  }
  // the live film's walk gate on the move's own frames
  let weave = null
  if (to - from > 2) {
    const hr = headingReadings(track.samples.slice(from, to), fps, MOTION_CAPS)
    weave = { yawReversals: hr.yaw.reversals, yawExcessDeg: +hr.yaw.excessDeg.toFixed(1), walkReversals: hr.way.inView.reversals }
    const v = motionVerdict({ heading: hr }, MOTION_CAPS).heading
    if (v) flags.push({ flag: 'weave', t0: 0, t1: sec(to), peak: hr.yaw.reversals, at: 0, cap: MOTION_CAPS.yawReversals, unit: v })
  }

  const peak = (k) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(c[k][i])); return m }
  let metres = 0
  for (let i = from + 1; i < to; i++) if (c.lo[i] !== i) metres += Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1], c.z[i] - c.z[i - 1])
  const yMin = Math.min(...c.y.subarray(from, to)), yMax = Math.max(...c.y.subarray(from, to))
  const holdSeconds = holds.reduce((s, x) => s + x.seconds, 0)
  return {
    name: move.name, from, to, fps, startSeconds: +((from / fps) + (track.offsetSeconds ?? 0)).toFixed(2), seconds: +((to - from) / fps).toFixed(2), metres: +metres.toFixed(1),
    peaks: {
      speed: +peak('speed').toFixed(2), accel: +peak('accel').toFixed(2), jerk: +peak('jerk').toFixed(2),
      headingRate: +peak('headingRate').toFixed(1), pitchRate: +peak('pitchRate').toFixed(1), turnRate: +peak('turnRate').toFixed(1),
      turnAccel: +peak('turnAccel').toFixed(1), turnJerk: +peak('turnJerk').toFixed(1),
      centreWidths: +peak('centreWidths').toFixed(3), farWidths: +peak('farWidths').toFixed(3), zoom: +peak('zoom').toFixed(3),
      yMin: +yMin.toFixed(2), yMax: +yMax.toFixed(2),
    },
    holds, holdSeconds: +holdSeconds.toFixed(2), authored, weave, flags,
  }
}

/** a track's marks as frames: its path keys where it has them, else its kind changes; its cuts in both */
export function marksOf(track) {
  const out = new Set(track.cuts ?? [])
  if (track.keys?.length) for (const k of track.keys) out.add(k)
  else if (track.kinds) for (let i = 1; i < track.kinds.length; i++) if (track.kinds[i] !== track.kinds[i - 1]) out.add(i)
  return [...out].sort((p, q) => p - q)
}

/** the per-frame curves of one move, for its JSON and its plot */
export function moveCurves(c, move) {
  const keys = ['x', 'y', 'z', 'heading', 'elevation', 'speed', 'accel', 'jerk', 'headingRate', 'pitchRate', 'turnRate', 'turnAccel', 'turnJerk', 'centreWidths', 'farWidths', 'zoom', 'hfov', 'standing', 'still']
  const out = {}
  for (const k of keys) out[k] = Array.from(c[k].subarray(move.from, move.to), (v) => +(k === 'heading' || k === 'elevation' ? v * DEG : v).toFixed(4))
  return out
}

const FLAG_ORDER = ['fast-turn', 'turn-accel', 'turn-jerk', 'fast-picture', 'surge', 'jerk', 'zoom', 'short-hold', 'unsettled', 'jump', 'weave']

export function tsvRow(r) {
  const count = (f) => r.flags.filter((x) => x.flag === f).length
  const p = r.peaks
  return [r.name, r.startSeconds, r.seconds, r.metres, p.speed, p.accel, p.jerk, p.turnRate, p.headingRate, p.pitchRate, p.turnAccel, p.turnJerk, p.centreWidths, p.farWidths, p.zoom, p.yMin, p.yMax,
    r.holds.length, r.holdSeconds, r.holds.length ? Math.min(...r.holds.map((h) => h.seconds)) : '',
    ...FLAG_ORDER.map(count), r.flags.filter((f) => f.flag === 'jerk' && f.mark !== undefined).length, FLAG_ORDER.filter((f) => count(f)).join(' ')].join('\t')
}
export const TSV_HEAD = ['move', 'start_s', 'seconds', 'metres', 'speed_mps', 'accel_mps2', 'jerk_mps3', 'turn_dps', 'heading_dps', 'pitch_dps', 'turn_dps2', 'turn_dps3', 'centre_wps', 'far_wps', 'zoom_ps', 'y_min', 'y_max',
  'holds', 'hold_s', 'shortest_hold_s', ...FLAG_ORDER, 'jerk_at_mark', 'flags'].join('\t')

/** read every move of a track into a folder: readings.tsv and one JSON a move */
export function readTrackInto(track, out, L = THRESHOLDS) {
  mkdirSync(out, { recursive: true })
  const c = curvesOf(track, L)
  const rows = [TSV_HEAD], all = []
  for (const m of track.moves) {
    const r = readMove(track, c, m, L)
    writeFileSync(join(out, `${m.name}.json`), JSON.stringify({ ...r, curves: moveCurves(c, m) }))
    rows.push(tsvRow(r))
    all.push(r)
  }
  writeFileSync(join(out, 'readings.tsv'), rows.join('\n') + '\n')
  return all
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--out')
  if (!args[0] || i < 0) throw new Error('read.mjs <track.json> --out <folder>')
  const all = readTrackInto(readTrack(args[0]), args[i + 1])
  for (const r of all) console.log(`${r.name.padEnd(18)} ${String(r.seconds).padStart(6)} s  ${r.flags.length ? [...new Set(r.flags.map((f) => f.flag))].join(' ') : '-'}`)
}
