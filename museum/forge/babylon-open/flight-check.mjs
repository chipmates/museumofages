// THE OPENING'S FLIGHT CHECK, on the built geometry (the map's plan without the gate's blocks, the gate's
// bodies, flight.ts) mounted in node, 30 samples a second: speed, acceleration and jerk along the way, the
// look's turn rates (desktop and phone), the nearest body to the camera (every block, wall, house, tower stage
// and the gate's boxes, prisms and arches), seconds inside a body, and the landing against the walk's first
// key (place, look, pace). Exit 1 on a red line.
//
//   node --experimental-strip-types --no-warnings forge/babylon-open/flight-check.mjs [--cams <open-cams.json>] [--json <out>] [--plot <out.json>]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const W = join(APP, 'src/wings/babylon')
const { buildPlan, makeFrame } = await import(join(W, 'map/plan.ts'))
const G = await import(join(W, 'gate/gate-geom.ts'))
const { makeFlight, resolveFlight } = await import(join(W, 'open/flight.ts'))
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]

const mapPlan = JSON.parse(readFileSync(join(W, 'map/map-plan.json'), 'utf8'))
const gatePlan = JSON.parse(readFileSync(join(W, 'gate/gate-plan.json'), 'utf8'))
const gateCams = JSON.parse(readFileSync(join(W, 'gate/gate-cams.json'), 'utf8'))
const cams = JSON.parse(readFileSync(opt.cams ?? join(W, 'open/open-cams.json'), 'utf8'))
const dropB = new Set(gatePlan.frame.mapBlocksReplaced), dropW = new Set(gatePlan.frame.mapWallsReplaced)
const city = structuredClone(mapPlan)
city.blocks = city.blocks.filter((b) => !dropB.has(b.id))
city.walls = city.walls.filter((w) => !dropW.has(w.id))
const b = buildPlan(city, { houses: true })
const F = makeFrame(city)
const B = G.buildGate(gatePlan)
const GF = G.gateFrame(gatePlan)
const L0 = gatePlan.frame.level0
const g2s = (x, z) => { const [E, N] = GF.utm(x, z); return F.s(E, N) }
const sFirst = Number(String(gateCams.stops[0].keys[0].at).slice(7))
const streetAt = (s, t = 0) => { const x = s * B.street.dir[0] + t * B.street.dir[1], z = s * B.street.dir[1] - t * B.street.dir[0]; const [sx, sz] = g2s(x, z); return { x: sx, z: sz, level: B.level(z) + L0, gz: z } }
const endStreet = streetAt(sFirst)
const eyeG = B.level(endStreet.gz) + cams.eye
const [wlx, wlz] = g2s(0, -20)
const walkLook = [wlx, eyeG + L0, wlz]
const spec = resolveFlight(cams.flight, { scene: F.s, street: streetAt, eye: cams.eye, walkLook })
const flight = makeFlight(spec)

/* the solids: vertical prisms over outlines in the scene's frame */
const solids = []
const add = (id, poly, y0, y1) => {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1])
  solids.push({ id, poly, y0, y1, bb: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] })
}
for (const p of b.prisms) { add(p.id, p.poly, p.y0, p.y1); for (const h of p.holes) void h }
for (const r of b.boxes) {
  const c = Math.cos(r.yaw), s = Math.sin(r.yaw), hx = r.sx / 2, hz = r.sz / 2
  const corner = (u, v) => [r.x + u * c + v * s, r.z - u * s + v * c]
  add(r.id, [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)], r.y0, r.y1)
}
const gbox = (id, x0, x1, z0, z1, y0, y1) => add(`gate:${id}`, [g2s(x0, z0), g2s(x1, z0), g2s(x1, z1), g2s(x0, z1)], y0 + L0, y1 + L0)
for (const x of B.boxes) gbox(x.id, x.x0, x.x1, x.z0, x.z1, x.y0, x.y1)
for (const x of B.beams) gbox(x.id, x.x0, x.x1, x.z0, x.z1, x.y0, x.y1)
for (const a of B.arches) gbox(a.id, a.x0, a.x1, a.z0, a.z1, a.springing, a.top)
for (const p of B.prisms) add(`gate:${p.id}`, p.poly.map(([x, z]) => g2s(x, z)), p.y0 + L0, p.y1 + L0)
const holesOf = new Map(b.prisms.map((p) => [p.id, p.holes]))

const inPoly = (x, z, poly) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
const segDist = (x, z, [ax, az], [bx, bz]) => {
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez
  const u = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L)) : 0
  return Math.hypot(x - ax - u * ex, z - az - u * ez)
}
/** distance from a point to a solid (0 inside), horizontally to its outline (or a hole's), vertically to its span */
const dist = (s, x, y, z) => {
  const holes = holesOf.get(s.id) ?? []
  const insideOuter = inPoly(x, z, s.poly)
  const inHole = insideOuter && holes.some((h) => inPoly(x, z, h))
  let dh = 0
  if (!insideOuter || inHole) {
    dh = Infinity
    const rings = inHole ? holes.filter((h) => inPoly(x, z, h)) : [s.poly]
    for (const ring of rings) for (let i = 0; i < ring.length; i++) dh = Math.min(dh, segDist(x, z, ring[i], ring[(i + 1) % ring.length]))
  }
  const dv = Math.max(s.y0 - y, 0, y - s.y1)
  return Math.hypot(dh, dv)
}

const FPS = 30
const n = Math.round(flight.duration * FPS)
const rows = []
const D = 180 / Math.PI
const angles = (p, l) => {
  const dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2]
  return { yaw: Math.atan2(dx, -dz) * D, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * D }
}
const wrap = (a) => ((a + 540) % 360) - 180
for (let i = 0; i <= n; i++) {
  const t = i / FPS
  const p = flight.sample(t)
  const [x, y, z] = p.pos
  let near = Infinity, nearId = null, inside = null
  for (const s of solids) {
    if (x < s.bb[0] - 60 || x > s.bb[1] + 60 || z < s.bb[2] - 60 || z > s.bb[3] + 60) continue
    const d = dist(s, x, y, z)
    if (d < near) { near = d; nearId = s.id }
    if (d === 0) inside = s.id
  }
  const floor = b.stand(x, z)
  rows.push({ t, x, y, z, s: p.s, speed: p.speed, near, nearId, inside, floor, over: y - floor, d: angles(p.pos, p.look), ph: angles(p.pos, p.phoneLook), hfov: p.hfov, phoneHfov: p.phoneHfov })
}
/* rates from the samples */
for (let i = 0; i < rows.length; i++) {
  const a = rows[Math.max(0, i - 1)], c = rows[Math.min(rows.length - 1, i + 1)], dt = c.t - a.t || 1
  const r = rows[i]
  r.vel = [(c.x - a.x) / dt, (c.y - a.y) / dt, (c.z - a.z) / dt]
  r.vy = r.vel[1]
  r.yawRate = wrap(c.d.yaw - a.d.yaw) / dt
  r.pitchRate = (c.d.pitch - a.d.pitch) / dt
  r.phYawRate = wrap(c.ph.yaw - a.ph.yaw) / dt
  r.phPitchRate = (c.ph.pitch - a.ph.pitch) / dt
}
for (let i = 0; i < rows.length; i++) {
  const a = rows[Math.max(0, i - 1)], c = rows[Math.min(rows.length - 1, i + 1)], dt = c.t - a.t || 1
  const av = [0, 1, 2].map((k) => (c.vel[k] - a.vel[k]) / dt)
  const r = rows[i], v = Math.hypot(...r.vel)
  r.acc = Math.hypot(...av)
  // split: along the path (the speed's change, a lurch) and across it (the path's turn, felt as the heading's rate)
  r.accAlong = v > 1e-6 ? (av[0] * r.vel[0] + av[1] * r.vel[1] + av[2] * r.vel[2]) / v : r.acc
  r.accTurn = Math.sqrt(Math.max(0, r.acc * r.acc - r.accAlong * r.accAlong))
  r.heading = v > 1 ? (r.accTurn / v) * D : 0
}
for (let i = 0; i < rows.length; i++) {
  const a = rows[Math.max(0, i - 2)], c = rows[Math.min(rows.length - 1, i + 2)], dt = c.t - a.t || 1
  rows[i].jerk = Math.abs(c.acc - a.acc) / dt
  // the look's angular acceleration (deg/s2): what a viewer feels as a lurch
  rows[i].yawAcc = Math.max(Math.abs(c.yawRate - a.yawRate), Math.abs(c.phYawRate - a.phYawRate)) / dt
  rows[i].tiltAcc = Math.max(Math.abs(c.pitchRate - a.pitchRate), Math.abs(c.phPitchRate - a.phPitchRate)) / dt
}

/* lines */
const red = []
const max = (k, f = (v) => v) => rows.reduce((m, r) => Math.max(m, Math.abs(f(r[k]))), 0)
const insideRows = rows.filter((r) => r.inside)
if (insideRows.length) red.push(`inside a body for ${(insideRows.length / FPS).toFixed(2)} s (first ${insideRows[0].t.toFixed(2)} s, ${insideRows[0].inside})`)
// flying: nothing nearer than 6 m; on the ground at the end the walls of the lion street stand 6 to 8 m off
const flyRows = rows.filter((r) => r.over > 4)
const nearFly = flyRows.reduce((m, r) => (r.near < m.near ? r : m), { near: Infinity })
if (nearFly.near < 6) red.push(`flying ${nearFly.near.toFixed(2)} m from ${nearFly.nearId} at ${nearFly.t.toFixed(2)} s`)
const yawAt = rows.reduce((m, r) => (Math.abs(r.yawRate) > Math.abs(m.yawRate) ? r : m), rows[0])
const yawMax = max('yawRate'), phYawMax = max('phYawRate'), pitchMax = max('pitchRate'), phPitchMax = max('phPitchRate')
if (yawMax > 25) red.push(`desktop look turns ${yawMax.toFixed(1)} deg/s`)
if (phYawMax > 25) red.push(`phone look turns ${phYawMax.toFixed(1)} deg/s`)
if (pitchMax > 12 || phPitchMax > 12) red.push(`the look tilts ${Math.max(pitchMax, phPitchMax).toFixed(1)} deg/s`)
const accMax = max('acc'), jerkMax = max('jerk')
const accAt = rows.reduce((m, r) => (r.acc > m.acc ? r : m), rows[0])
const alongMax = max('accAlong'), headingMax = max('heading')
const alongAt = rows.reduce((m, r) => (Math.abs(r.accAlong) > Math.abs(m.accAlong) ? r : m), rows[0])
const headingAt = rows.reduce((m, r) => (r.heading > m.heading ? r : m), rows[0])
if (alongMax > 35) red.push(`the speed changes by ${alongMax.toFixed(1)} m/s2 at ${alongAt.t.toFixed(2)} s`)
if (headingMax > 25) red.push(`the path turns ${headingMax.toFixed(1)} deg/s at ${headingAt.t.toFixed(2)} s`)
const yawAccMax = max('yawAcc'), tiltAccMax = max('tiltAcc')
const yawAccAt = rows.reduce((m, r) => (r.yawAcc > m.yawAcc ? r : m), rows[0])
if (yawAccMax > 12) red.push(`the look's turn changes by ${yawAccMax.toFixed(1)} deg/s2 at ${yawAccAt.t.toFixed(2)} s`)
if (tiltAccMax > 8) red.push(`the look's tilt changes by ${tiltAccMax.toFixed(1)} deg/s2`)
const last = rows[rows.length - 1]
const endGap = Math.hypot(last.x - endStreet.x, last.y - (eyeG + L0), last.z - endStreet.z)
if (endGap > 0.02) red.push(`lands ${endGap.toFixed(3)} m from the walk's first key`)
const lookGap = (() => {
  const a = [walkLook[0] - last.x, walkLook[1] - last.y, walkLook[2] - last.z]
  const s = flight.sample(flight.duration)
  const c = [s.look[0] - last.x, s.look[1] - last.y, s.look[2] - last.z]
  const dot = a[0] * c[0] + a[1] * c[1] + a[2] * c[2]
  return Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...c)))) * D
})()
if (lookGap > 0.1) red.push(`ends looking ${lookGap.toFixed(2)} deg off the walk's look`)
const backward = rows.filter((r, i) => i > 0 && r.s < rows[i - 1].s - 1e-6).length
if (backward) red.push(`${backward} samples backward`)

console.log(`length ${flight.length.toFixed(0)} m in ${flight.duration} s; cruise scale ${flight.cruise.toFixed(1)}; top speed ${max('speed').toFixed(1)} m/s; end speed ${last.speed.toFixed(2)} m/s`)
console.log(`top acceleration ${accMax.toFixed(2)} m/s2 (at ${accAt.t.toFixed(2)} s), top jerk ${jerkMax.toFixed(2)} m/s3; look turns: desktop ${yawMax.toFixed(1)} deg/s yaw (at ${yawAt.t.toFixed(2)} s) ${pitchMax.toFixed(1)} tilt, phone ${phYawMax.toFixed(1)} yaw ${phPitchMax.toFixed(1)} tilt`)
console.log(`acceleration split: along the path (speed change) ${alongMax.toFixed(2)} m/s2 (at ${alongAt.t.toFixed(2)} s, ${alongAt.over.toFixed(0)} m up); the path's turn ${headingMax.toFixed(1)} deg/s (at ${headingAt.t.toFixed(2)} s)`)
console.log(`look acceleration: turn ${yawAccMax.toFixed(1)} deg/s2 (at ${yawAccAt.t.toFixed(2)} s), tilt ${tiltAccMax.toFixed(1)} deg/s2`)
console.log(`nearest body in flight ${nearFly.near.toFixed(2)} m (${nearFly.nearId}, ${nearFly.t?.toFixed(2)} s); landing ${endGap.toFixed(3)} m and ${lookGap.toFixed(2)} deg from the walk's first key`)
console.log('   t      E          N       level  over  speed  vy    acc  along  turn/s  yaw/s  tilt/s  ph-yaw/s  nearest')
for (let t = 0; t <= flight.duration + 1e-9; t += Number(opt.every ?? 1)) {
  const r = rows[Math.round(t * FPS)]
  const [E, N] = [r.x + F.E0, F.N0 - r.z]
  console.log(`${t.toFixed(1).padStart(5)} ${E.toFixed(1).padStart(9)} ${N.toFixed(1).padStart(10)} ${r.y.toFixed(1).padStart(6)} ${r.over.toFixed(1).padStart(6)} ${r.speed.toFixed(1).padStart(6)} ${r.vy.toFixed(1).padStart(5)} ${r.acc.toFixed(2).padStart(6)} ${r.accAlong.toFixed(1).padStart(6)} ${r.heading.toFixed(1).padStart(6)} ${r.yawRate.toFixed(1).padStart(6)} ${r.pitchRate.toFixed(1).padStart(6)} ${r.phYawRate.toFixed(1).padStart(8)}   ${r.near.toFixed(1)} ${r.nearId}`)
}
console.log(red.length ? `RED\n- ${red.join('\n- ')}` : 'clean')
if (opt.json) writeFileSync(opt.json, JSON.stringify({ length: flight.length, duration: flight.duration, red, rows }, null, 0))
if (opt.plot) writeFileSync(opt.plot, JSON.stringify({
  frame: { E0: F.E0, N0: F.N0 },
  solids: solids.filter((s) => !s.id.startsWith('house')).map((s) => ({ id: s.id, poly: s.poly, y1: s.y1 })),
  houses: solids.filter((s) => s.id.startsWith('house')).map((s) => s.poly),
  water: b.water.map((w) => w.poly),
  path: rows.filter((_, i) => i % 3 === 0).map((r) => [r.t, r.x, r.y, r.z, r.d.yaw]),
  points: spec.points, looks: spec.look.map((k) => k.at),
}))
process.exit(red.length ? 1 : 0)
