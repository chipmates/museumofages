// A CAMERA TRACK, one format for every wing's shooter, so one reader judges
// them all. A sample is motion.mjs's: [x, y, z, qx, qy, qz, qw, fov] a frame,
// fov the vertical lens in degrees as three.js reads it; the track carries
// its frame rate, the frame's aspect (so the horizontal lens comes back), and
// its named spans as half-open frame ranges [from, to): the moves (a leg, a
// stop), the authored holds and the cuts (a frame that starts a new run).
// Optional `shifts`: a shift lens per frame, [vertical, sideways] in the
// projection's units (the sketch's aim adds them to elements 9 and 8); none
// means a centred lens.
//
//   node --experimental-strip-types --no-warnings forge/camera/track.mjs \
//     --sketch <samples.json> [--framing desktop] --out <track.json>
//     --babylon [--fps 30] [--stops 1-15] --out <track.json>

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FORMAT = 'camera-track/1'
const D2R = Math.PI / 180

/** the rotation of a camera looking along heading (0 north = -z, positive west, as motion.mjs reads it) and pitch, radians: Ry(heading) then Rx(pitch), no roll */
export function quatOf(heading, pitch) {
  const sy = Math.sin(heading / 2), cy = Math.cos(heading / 2), sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2)
  return [cy * sx, sy * cx, -sy * sx, cy * cx]
}

/** the rotation of a level-horizon camera looking along a direction */
export function quatAlong(dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz) || 1
  return quatOf(Math.atan2(-dx, -dz), Math.asin(Math.max(-1, Math.min(1, dy / len))))
}

/** where a sample's camera looks, a unit vector (its -z) */
export function forwardOf(s) {
  const [, , , x, y, z, w] = s
  return [-2 * (w * y + x * z), 2 * (w * x - y * z), -1 + 2 * (x * x + y * y)]
}

export const hfovOf = (vfovDeg, aspect) => 2 * Math.atan(Math.tan((vfovDeg / 2) * D2R) * aspect) / D2R
export const vfovOf = (hfovDeg, aspect) => 2 * Math.atan(Math.tan((hfovDeg / 2) * D2R) / aspect) / D2R

/** runs of equal labels as spans */
function spansOf(labels, keep = () => true) {
  const out = []
  for (let i = 0; i < labels.length; i++) {
    if (i && labels[i] === labels[i - 1] && out.length && out[out.length - 1].to === i) { out[out.length - 1].to = i + 1; continue }
    if (keep(labels[i])) out.push({ name: String(labels[i]), from: i, to: i + 1 })
  }
  return out
}

/**
 * THE SKETCH'S SAMPLES (`window.__sketch.samples(framing, dt)`): eye x, y, z;
 * yaw in degrees clockwise from north (-z) toward east (+x), unwrapped; pitch
 * in degrees up; hfov the horizontal lens. The sketch aims along
 * (sin yaw cos pitch, sin pitch, -cos yaw cos pitch) with up +y, so the
 * heading in motion.mjs's sense (positive west) is -yaw. Moves are its legs;
 * holds are its frames of kind `hold` or `rest`; a `black` frame or a jump
 * starts a run.
 */
export function fromSketch(json, { framing = 'desktop', aspect = framing === 'desktop' ? 1440 / 708 : 390 / 844, source = 'sketch' } = {}) {
  const f = json[framing] ?? json
  const raw = f.samples
  const dt = raw[1].t - raw[0].t
  const fps = Math.round(1 / dt)
  const samples = raw.map((s) => [s.x, s.y, s.z, ...quatOf(-s.yaw * D2R, s.pitch * D2R), vfovOf(s.hfov, aspect)])
  const shifts = raw.some((s) => s.shift || s.shiftX) ? raw.map((s) => [s.shift ?? 0, s.shiftX ?? 0]) : null
  const moves = spansOf(raw.map((s) => s.leg))
  const holds = spansOf(raw.map((s, i) => (s.kind === 'hold' || s.kind === 'rest' ? `${s.leg}:${s.kind}` : `-${i}`)), (l) => !l.startsWith('-'))
  const cuts = [], blackTo = {}
  for (let i = 1; i < raw.length; i++) if (raw[i].kind === 'black' && raw[i - 1].kind !== 'black') {
    let j = i
    while (j + 1 < raw.length && raw[j + 1].kind === 'black') j++
    cuts.push(i)
    blackTo[i] = j + 1
  }
  return { format: FORMAT, source: `${source} ${framing}`, fps, aspect, samples, moves, holds, ...jumpCuts(samples, fps, cuts, blackTo), kinds: raw.map((s) => s.kind), ...(shifts ? { shifts } : {}) }
}

/** a frame whose eye moves over 3 m or whose view turns over 45 degrees from the last starts a new run: a cut where
    the source names one (within a frame of it, or through its black, where the run starts at the pose's change), a
    jump where it does not */
export function jumpCuts(samples, fps, given = [], blackTo = {}) {
  const named = new Set(given.flatMap((c) => [c - 1, c, c + 1]))
  const black = new Set(given.flatMap((c) => (blackTo[c] ? Array.from({ length: blackTo[c] - c }, (_, k) => c + 1 + k) : [])))
  const jumps = [], inBlack = []
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    const fa = forwardOf(a), fb = forwardOf(b)
    const turn = Math.acos(Math.max(-1, Math.min(1, fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2]))) / D2R
    if (!(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 3 || turn > 45) || named.has(i)) continue
    ;(black.has(i) ? inBlack : jumps).push(i)
  }
  return { cuts: [...new Set([...given, ...inBlack, ...jumps])].sort((p, q) => p - q).filter((c, i, a) => !i || c - a[i - 1] > 1), jumps }
}

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** the map page's own path (plan.ts and path.ts mounted in node; needs --experimental-strip-types) */
export async function babylonPath(cams) {
  const MAP = join(APP, 'src/wings/babylon/map')
  const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
  const { makePath } = await import(join(MAP, 'path.ts'))
  const plan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
  cams ??= JSON.parse(readFileSync(join(MAP, 'map-cams.json'), 'utf8'))
  const b = buildPlan(plan, { houses: true })
  const F = makeFrame(plan)
  return makePath(cams, F.s, (x, z) => b.stand(x, z))
}

/**
 * A BABYLON CAMS FILE'S PATH, sampled at the fps through the page's own
 * `makePath(...).sample(t)` (time-spaced Hermite positions, its own look and
 * lens between keys). Moves are its stops; holds are its frames whose segment
 * runs to a `hold` key (a held key alone is a momentary stop, its tangent
 * zero); a cut key starts a run.
 */
export function fromBabylonPath(path, { fps = 30, stops = null, aspect = 16 / 9, source = 'babylon map' } = {}) {
  const n = Math.floor(path.duration * fps) + 1
  const samples = [], stop = [], kind = []
  for (let i = 0; i < n; i++) {
    const p = path.sample(i / fps)
    const [x, y, z] = p.pos
    samples.push([x, y, z, ...quatAlong(p.look[0] - x, p.look[1] - y, p.look[2] - z), vfovOf(p.hfov, aspect)])
    stop.push(p.stop)
    kind.push(p.kind)
  }
  // a cut key's segment shows the old pose until its time: the run starts at the first frame at or after it
  const cutKeys = path.keys.filter((k) => k.cut).map((k) => Math.ceil(k.t * fps - 1e-6))
  const keys = path.keys.map((k) => Math.round(k.t * fps))
  const inStops = (s) => !stops || stops.includes(Number(s))
  let moves = spansOf(stop).filter((m) => inStops(m.name)).map((m) => ({ ...m, name: `stop-${m.name}` }))
  const holds = spansOf(kind.map((k, i) => (k === 'hold' ? `stop-${stop[i]}:hold` : `-${i}`)), (l) => !l.startsWith('-'))
    .filter((h) => moves.some((m) => h.from >= m.from && h.from < m.to))
  let track = { format: FORMAT, source, fps, aspect, samples, moves, holds, ...jumpCuts(samples, fps, cutKeys), kinds: kind, keys }
  if (stops) track = sliceTrack(track, Math.min(...moves.map((m) => m.from)), Math.max(...moves.map((m) => m.to)))
  return track
}

/** a track's frames [from, to), its spans clipped and shifted */
export function sliceTrack(t, from, to) {
  const clip = (s) => ({ ...s, from: Math.max(s.from, from) - from, to: Math.min(s.to, to) - from })
  return {
    ...t, samples: t.samples.slice(from, to), kinds: t.kinds?.slice(from, to), ...(t.shifts ? { shifts: t.shifts.slice(from, to) } : {}),
    moves: t.moves.filter((s) => s.to > from && s.from < to).map(clip),
    holds: t.holds.filter((s) => s.to > from && s.from < to).map(clip).filter((s) => s.to > s.from),
    cuts: t.cuts.filter((c) => c > from && c < to).map((c) => c - from),
    jumps: (t.jumps ?? []).filter((c) => c > from && c < to).map((c) => c - from),
    ...(t.keys ? { keys: t.keys.filter((c) => c >= from && c < to).map((c) => c - from) } : {}),
    offsetSeconds: (t.offsetSeconds ?? 0) + from / t.fps,
  }
}

/** a track's shape holds: samples of eight finite numbers, spans inside the frames */
export function checkTrack(t) {
  const bad = []
  if (t.format !== FORMAT) bad.push(`format ${t.format}`)
  if (!(t.fps > 0)) bad.push('fps')
  if (!(t.aspect > 0)) bad.push('aspect')
  t.samples.forEach((s, i) => { if (s.length !== 8 || !s.every(Number.isFinite)) bad.push(`sample ${i}`) })
  if (t.shifts && (t.shifts.length !== t.samples.length || !t.shifts.every((v) => v.length === 2 && v.every(Number.isFinite)))) bad.push('shifts')
  for (const k of ['moves', 'holds']) for (const s of t[k]) if (!(s.from >= 0 && s.to <= t.samples.length && s.from < s.to)) bad.push(`${k} ${s.name}`)
  return bad
}

export function writeTrack(file, t) {
  const bad = checkTrack(t)
  if (bad.length) throw new Error(`track: ${bad.slice(0, 5).join(', ')}`)
  writeFileSync(file, JSON.stringify(t, (k, v) => (Object.is(v, -0) ? 0 : v)))
}

export function readTrack(file) {
  const t = JSON.parse(readFileSync(file, 'utf8'))
  const bad = checkTrack(t)
  if (bad.length) throw new Error(`track ${file}: ${bad.slice(0, 5).join(', ')}`)
  return t
}

export const rangeOf = (s) => (s ? s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a] }) : null)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
  const out = opt('--out')
  if (!out) throw new Error('--out <track.json>')
  let t
  if (opt('--sketch')) t = fromSketch(JSON.parse(readFileSync(opt('--sketch'), 'utf8')), { framing: opt('--framing', 'desktop'), source: 'castle draft' })
  else if (args.includes('--babylon')) t = fromBabylonPath(await babylonPath(), { fps: Number(opt('--fps', 30)), stops: rangeOf(opt('--stops')) })
  else throw new Error('--sketch <samples.json> | --babylon')
  writeTrack(out, t)
  console.log(`${out}: ${t.samples.length} frames at ${t.fps} fps, ${t.moves.length} moves, ${t.holds.length} holds, ${t.cuts.length} cuts`)
}
