// THE SKETCH'S LEG NUMBERS (rail-and-camera step 1): per stop, from the path the page sampled (`shoot.mjs --facts`):
// length, seconds, seconds a near wall fills the view, seconds walking backward, heading swings, the eye over the street.
//   node forge/babylon-gate/legs.mjs <facts-sketch.json> [<sketch folder for the per-leg sheets' names>]
import { readFileSync, readFileSync as rf } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const { buildGate } = await import(join(HERE, '../../src/wings/babylon/gate/gate-geom.ts'))
const plan = JSON.parse(rf(join(HERE, '../../src/wings/babylon/gate/gate-plan.json'), 'utf8'))
const B = buildGate(plan)
const facts = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const S = facts.samples

/* the distance along a ray to the nearest body: boxes by slabs, prisms by their sides */
function hitBox(o, d, b) {
  let t0 = 0, t1 = 1e9
  for (const [k, lo, hi] of [[0, b.x0, b.x1], [1, b.y0, b.y1], [2, b.z0, b.z1]]) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo || o[k] > hi) return null; continue }
    let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k]
    if (a > c) [a, c] = [c, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, c)
    if (t0 > t1) return null
  }
  return t0
}
function hitPrism(o, d, p) {
  let best = null
  for (let i = 0; i < p.poly.length; i++) {
    const a = p.poly[i], b = p.poly[(i + 1) % p.poly.length]
    const ex = b[0] - a[0], ez = b[1] - a[1]
    const den = d[0] * ez - d[2] * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((a[0] - o[0]) * ez - (a[1] - o[2]) * ex) / den
    const s = ((a[0] - o[0]) * d[2] - (a[1] - o[2]) * d[0]) / den
    if (t <= 0 || s < 0 || s > 1) continue
    const y = o[1] + d[1] * t
    if (y < p.y0 || y > p.y1) continue
    if (best === null || t < best) best = t
  }
  return best
}
function nearest(o, d) {
  let best = 1e9
  for (const b of B.boxes) { const t = hitBox(o, d, b); if (t !== null && t < best) best = t }
  for (const p of B.prisms) { const t = hitPrism(o, d, p); if (t !== null && t < best) best = t }
  return best
}

const legs = new Map()
for (const s of S) { if (!legs.has(s.stop)) legs.set(s.stop, []); legs.get(s.stop).push(s) }
const out = ['| stop | seconds | length (m) | near wall fills the view (s, under 2 m ahead) | walking backward (s) | heading: largest swing (deg/s), total turn (deg) | eye over the street (m) |', '|---|---|---|---|---|---|---|']
for (const [stop, ss] of legs) {
  let len = 0, near = 0, back = 0, maxRate = 0, turn = 0, eyeMin = 1e9, eyeMax = -1e9
  for (let i = 1; i < ss.length; i++) {
    const a = ss[i - 1], b = ss[i], dt = b.t - a.t
    const mx = b.x - a.x, mz = b.z - a.z, m = Math.hypot(mx, mz)
    len += m
    const lx = b.lx - b.x, ly = b.ly - b.y, lz = b.lz - b.z, ll = Math.hypot(lx, ly, lz)
    const d = [lx / ll, ly / ll, lz / ll]
    if (nearest([b.x, b.y, b.z], d) < 2) near += dt
    if (m / dt > 0.1 && (mx * lx + mz * lz) < 0) back += dt
    const ha = Math.atan2(a.lx - a.x, a.lz - a.z), hb = Math.atan2(lx, lz)
    let dh = (hb - ha) * 180 / Math.PI
    while (dh > 180) dh -= 360
    while (dh < -180) dh += 360
    maxRate = Math.max(maxRate, Math.abs(dh) / dt)
    turn += Math.abs(dh)
    eyeMin = Math.min(eyeMin, b.y - b.street); eyeMax = Math.max(eyeMax, b.y - b.street)
  }
  out.push(`| ${stop} | ${(ss[ss.length - 1].t - ss[0].t).toFixed(1)} | ${len.toFixed(1)} | ${near.toFixed(1)} | ${back.toFixed(1)} | ${maxRate.toFixed(1)}, ${turn.toFixed(0)} | ${eyeMin.toFixed(2)} to ${eyeMax.toFixed(2)} |`)
}
console.log(`# The sketch's legs (stops 2 to 4), from \`checks/facts-sketch.json\` (the page's path sampled every 0.1 s)\n\n${out.join('\n')}\n\nThe eye is measured over the street's profile under it (inside the gate the floor is the +15.40 street); "near wall" is a ray along the view's centre meeting a body within 2 m.`)
