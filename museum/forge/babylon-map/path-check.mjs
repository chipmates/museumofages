// THE WALK'S PATH CHECK, on the built geometry (plan.ts and path.ts mounted in node), 8 samples a second:
// per stop the seconds, the metres travelled, the top walking and flying speeds, backward seconds, heading
// swings, the eye over the true floor straight under the camera (street, ground or any block top), seconds
// inside a block, and near walls (red: a ray in the lens nearer than 0.75 m for over 0.25 s; fill: most of
// the lens within 3 m for over a second). Exit 1 on a red line.
//
//   node --experimental-strip-types --no-warnings forge/babylon-map/path-check.mjs [--json <out>]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = join(APP, 'src/wings/babylon/map')
const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
const { makePath } = await import(join(MAP, 'path.ts'))
const plan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(MAP, 'map-cams.json'), 'utf8'))
const b = buildPlan(plan, { houses: true })
const F = makeFrame(plan)
const stand = (x, z) => b.stand(x, z)
const path = makePath(cams, F.s, stand)

/* the solids as 2D outlines with a vertical range; boxes as their four corners */
const solids = []
const ring = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]])
for (const p of b.prisms) solids.push({ id: p.id, y0: p.y0, y1: p.y1, outer: p.poly, holes: p.holes, edges: [...ring(p.poly), ...p.holes.flatMap(ring)] })
for (const r of b.boxes) {
  const c = Math.cos(r.yaw), s = Math.sin(r.yaw)
  const corner = (u, v) => [r.x + u * c + v * s, r.z - u * s + v * c]
  const hx = r.sx / 2, hz = r.sz / 2
  const outer = [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)]
  solids.push({ id: r.id, y0: r.y0, y1: r.y1, outer, holes: [], edges: ring(outer) })
}
for (const s of solids) {
  const xs = s.outer.map((p) => p[0]), zs = s.outer.map((p) => p[1])
  s.bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
}
const inPoly = (x, z, poly) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
const contains = (s, x, z) => x >= s.bb[0] && x <= s.bb[1] && z >= s.bb[2] && z <= s.bb[3] && inPoly(x, z, s.outer) && !s.holes.some((h) => inPoly(x, z, h))
const near = (s, x, z, r) => x >= s.bb[0] - r && x <= s.bb[1] + r && z >= s.bb[2] - r && z <= s.bb[3] + r
/** the floor straight under the camera: the street or ground, or the top of a block under the eye */
const floorUnder = (x, z, y) => {
  let f = stand(x, z)
  for (const s of solids) if (s.y1 <= y - 0.3 && s.y1 > f && contains(s, x, z)) f = s.y1
  return f
}
const rayHit = (x, z, dx, dz, edges, max) => {
  let best = max
  for (const [[ax, az], [bx, bz]] of edges) {
    const ex = bx - ax, ez = bz - az
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((ax - x) * ez - (az - z) * ex) / den
    const u = ((ax - x) * dz - (az - z) * dx) / den
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t
  }
  return best
}

const FPS = 8, RAYS = 13, REACH = 12
const rows = []
let prev = null
for (let i = 0; i <= Math.round(path.duration * FPS); i++) {
  const t = i / FPS
  const p = path.sample(t)
  const [x, y, z] = p.pos
  const lx = p.look[0] - x, lz = p.look[2] - z, lh = Math.hypot(lx, lz) || 1
  const yaw = (Math.atan2(lx, -lz) * 180) / Math.PI
  const floor = floorUnder(x, z, y)
  const inside = solids.find((s) => y > s.y0 && y < s.y1 && contains(s, x, z))?.id ?? null
  const cand = solids.filter((s) => y >= s.y0 - 0.2 && y <= s.y1 + 0.2 && near(s, x, z, REACH))
  const edges = cand.flatMap((s) => s.edges)
  const half = (p.hfov / 2) * (Math.PI / 180), base = Math.atan2(lz, lx)
  const hits = []
  for (let k = 0; k < RAYS; k++) {
    const a = base - half + (2 * half * k) / (RAYS - 1)
    hits.push(rayHit(x, z, Math.cos(a), Math.sin(a), edges, REACH))
  }
  const row = { t, stop: p.stop, kind: p.kind, eye: p.eye, x, y, z, yaw, floor, overFloor: y - floor, inside, minRay: Math.min(...hits), fill: hits.filter((h) => h < 3).length / RAYS, speed: 0, hspeed: 0, back: false, yawRate: 0, cut: false }
  if (prev) {
    const dx = x - prev.x, dz = z - prev.z, dy = y - prev.y
    const jump = Math.hypot(dx, dy, dz) > 30 / FPS
    row.cut = jump
    if (!jump) {
      row.speed = Math.hypot(dx, dy, dz) * FPS
      row.hspeed = Math.hypot(dx, dz) * FPS
      row.back = row.hspeed > 0.05 && (dx * lx + dz * lz) / (Math.hypot(dx, dz) * lh) < -0.2 && p.kind !== 'crane'
      row.crane = p.kind === 'crane'
      let dyaw = yaw - prev.yaw
      while (dyaw > 180) dyaw -= 360
      while (dyaw < -180) dyaw += 360
      row.yawRate = dyaw * FPS
    }
  }
  rows.push(row)
  prev = row
}

/* per stop */
const out = []
const stops = [...new Set(rows.map((r) => r.stop))]
for (const n of stops) {
  const rs = rows.filter((r) => r.stop === n)
  const eye = rs.filter((r) => r.eye)
  let swings = 0, lastSign = 0, lastT = -9
  for (const r of rs) {
    if (r.cut) { lastSign = 0; continue }
    if (Math.abs(r.yawRate) < 2) continue
    const sg = Math.sign(r.yawRate)
    if (lastSign && sg !== lastSign && r.t - lastT < 4) swings++
    lastSign = sg; lastT = r.t
  }
  const runOver = (pred) => {
    let best = 0, cur = 0
    for (const r of rs) { cur = pred(r) ? cur + 1 / FPS : 0; best = Math.max(best, cur) }
    return best
  }
  out.push({
    stop: n,
    seconds: +(rs.length / FPS).toFixed(1),
    from: rs[0].t, to: rs[rs.length - 1].t,
    metres: +rs.reduce((a, r) => a + r.speed / FPS, 0).toFixed(0),
    walkTop: +Math.max(0, ...eye.map((r) => r.hspeed)).toFixed(2),
    flyTop: +Math.max(0, ...rs.filter((r) => !r.eye).map((r) => r.speed)).toFixed(1),
    backS: +(rs.filter((r) => r.back).length / FPS).toFixed(2),
    craneS: +(rs.filter((r) => r.crane).length / FPS).toFixed(2),
    swings,
    yawTop: +Math.max(0, ...rs.map((r) => Math.abs(r.yawRate))).toFixed(1),
    eyeMin: eye.length ? +Math.min(...eye.map((r) => r.overFloor)).toFixed(2) : null,
    eyeMax: eye.length ? +Math.max(...eye.map((r) => r.overFloor)).toFixed(2) : null,
    insideS: +(rs.filter((r) => r.inside).length / FPS).toFixed(2),
    insideIds: [...new Set(rs.filter((r) => r.inside).map((r) => r.inside))].slice(0, 4),
    nearRedS: +runOver((r) => r.minRay < 0.75).toFixed(2),
    fillS: +runOver((r) => r.fill > 0.6).toFixed(2),
    minRay: +Math.min(...rs.map((r) => r.minRay)).toFixed(2),
  })
}
const red = (s) => [
  s.backS > 0 && 'backward',
  s.swings > 0 && 'swing',
  s.yawTop > 25 && 'pan-fast',
  s.eyeMin !== null && (s.eyeMin < 1.6 || s.eyeMax > 1.7) && 'eye',
  s.insideS > 0 && 'inside',
  s.nearRedS > 0.25 && 'near',
  s.fillS > 1 && 'fill',
  s.walkTop > 2.0 && 'walk-fast',
].filter(Boolean)
console.log('crane: a flight up and back the walk sheet asks for (stop 14); its seconds are not backward seconds')
console.log('stop  from-to s     sec  metres walk m/s  fly m/s  back s  swings  yaw deg/s  eye over floor  inside s  near red s  fill s  nearest m  verdict')
let bad = 0
for (const s of out) {
  const r = red(s)
  if (r.length) bad++
  s.red = r
  console.log(`${String(s.stop).padStart(4)}  ${s.from.toFixed(0).padStart(3)}-${s.to.toFixed(0).padEnd(3)}  ${String(s.seconds).padStart(6)}  ${String(s.metres).padStart(6)}  ${String(s.walkTop).padStart(8)}  ${String(s.flyTop).padStart(7)}  ${String(s.backS).padStart(6)}${s.craneS ? ` (crane ${s.craneS})` : ''}  ${String(s.swings).padStart(6)}  ${String(s.yawTop).padStart(9)}  ${s.eyeMin === null ? '      -      ' : `${s.eyeMin.toFixed(2)} to ${s.eyeMax.toFixed(2)}`}  ${String(s.insideS).padStart(8)}  ${String(s.nearRedS).padStart(10)}  ${String(s.fillS).padStart(6)}  ${String(s.minRay).padStart(9)}  ${r.length ? 'RED ' + r.join(',') + (s.insideIds.length ? ' ' + s.insideIds.join(' ') : '') : 'ok'}`)
}
/* the stills' cameras: the same floor and inside tests */
let badStill = 0
for (const st of cams.stops) for (const fr of ['desktop', 'phone']) {
  const v = st[fr]
  const [x, z] = F.s(v.at[0], v.at[1])
  const y = v.y === 'eye' ? stand(x, z) + cams.eye : v.y
  const over = y - floorUnder(x, z, y)
  const inside = solids.find((q) => y > q.y0 && y < q.y1 && contains(q, x, z))?.id ?? null
  const okS = !inside && (v.y !== 'eye' || (over >= 1.6 && over <= 1.7))
  if (!okS) badStill++
  console.log(`still ${String(st.n).padStart(2)} ${fr.padEnd(7)} at +${y.toFixed(2)}, ${over.toFixed(2)} m over the floor under it${inside ? ', INSIDE ' + inside : ''}${okS ? '' : '  RED'}`)
}
if (badStill) bad++
/* the people for size: the walk never passes through one; red under 1.5 m (a person by the wall of a 4.5 m door is passed at about 1.7 m) */
for (const st of cams.stops) {
  if (!st.figure) continue
  const [fx, fz] = F.s(st.figure[0], st.figure[1])
  let best = Infinity, at = 0
  for (const r of rows) if (r.eye) { const d = Math.hypot(r.x - fx, r.z - fz); if (d < best) { best = d; at = r.t } }
  const okF = best >= 1.5
  if (!okF) bad++
  console.log(`figure ${String(st.n).padStart(2)}: the walk passes ${best.toFixed(2)} m from it at ${at.toFixed(1)} s${okF ? '' : '  RED'}`)
}
console.log(`film ${path.duration} s, ${rows.length} samples at ${FPS} fps; ${out.length - bad} of ${out.length} stops clean`)
if (process.argv.includes('--why')) for (const r of rows) if (r.back || Math.abs(r.yawRate) > 20 || (r.eye && r.hspeed > 2)) console.log(`  t ${r.t.toFixed(2)} stop ${r.stop} ${r.kind}${r.back ? ' back' : ''} yaw ${r.yawRate.toFixed(1)} h ${r.hspeed.toFixed(2)} y ${r.y.toFixed(1)}`)
const j = process.argv.indexOf('--json')
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify({ stops: out, samples: rows.filter((_, i) => i % FPS === 0).map((r) => ({ t: r.t, stop: r.stop, utm: F.utm(r.x, r.z).map((v) => +v.toFixed(1)), y: +r.y.toFixed(2), overFloor: +r.overFloor.toFixed(2), minRay: +r.minRay.toFixed(2) })) }, null, 1))
process.exit(bad ? 1 : 0)
