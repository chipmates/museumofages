// WHAT A STILL'S PIXEL SEES, offline: a ray from a map stop's still camera through device pixels, the first face it
// meets (body, distance, point, normal), and from that point a ray toward the sun at the hour: the first face in the
// way, or none (lit by the geometry). Says which body draws a pixel, and whether a bright one is a gap in the bodies
// or the shadow map's own error; the material and the shadow map themselves are not modelled.
//
//   node --experimental-strip-types --no-warnings forge/babylon/ray-probe.mjs --stop <n> --size desktop|phone
//        --hour <solar hour> --px x,y[;x,y...] [--grid x0,y0,x1,y1,step] [--reach 400] [--json <out>]
import { writeFileSync } from 'node:fs'
import { MOUNTS } from './mounts.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const D2R = Math.PI / 180

/** the faces flattened for the ray tests: 9 numbers a triangle, the body names beside */
export function flatten(faces) {
  const V = new Float64Array(faces.length * 9), body = new Array(faces.length)
  faces.forEach((f, i) => {
    for (let k = 0; k < 3; k++) { V[i * 9 + k * 3] = f.v[k].x; V[i * 9 + k * 3 + 1] = f.v[k].y; V[i * 9 + k * 3 + 2] = f.v[k].z }
    body[i] = f.body
  })
  return { V, body, n: faces.length }
}

/** the nearest triangle a ray meets past tMin (Moller-Trumbore, both sides): { i, t } or null */
export function hit(T, o, d, tMin = 1e-4, tMax = Infinity) {
  const { V, n } = T
  let best = null, bt = tMax
  for (let i = 0; i < n; i++) {
    const j = i * 9
    const e1x = V[j + 3] - V[j], e1y = V[j + 4] - V[j + 1], e1z = V[j + 5] - V[j + 2]
    const e2x = V[j + 6] - V[j], e2y = V[j + 7] - V[j + 1], e2z = V[j + 8] - V[j + 2]
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x
    const det = e1x * px + e1y * py + e1z * pz
    if (Math.abs(det) < 1e-12) continue
    const inv = 1 / det
    const sx = o[0] - V[j], sy = o[1] - V[j + 1], sz = o[2] - V[j + 2]
    const u = (sx * px + sy * py + sz * pz) * inv
    if (u < 0 || u > 1) continue
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv
    if (v < 0 || u + v > 1) continue
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv
    if (t > tMin && t < bt) { bt = t; best = i }
  }
  return best === null ? null : { i: best, t: bt }
}

function normalOf(T, i) {
  const V = T.V, j = i * 9
  const ax = V[j + 3] - V[j], ay = V[j + 4] - V[j + 1], az = V[j + 5] - V[j + 2]
  const bx = V[j + 6] - V[j], by = V[j + 7] - V[j + 1], bz = V[j + 8] - V[j + 2]
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

/** the ray through device pixel (px, py), the origin top left, as onStage projects (geometry.mjs) */
export function pixelRay(cam, px, py) {
  const nx = (2 * (px + 0.5)) / cam.w - 1, ny = 1 - (2 * (py + 0.5)) / cam.h
  const d = cam.forward.clone().addScaledVector(cam.right, nx * cam.half * cam.aspect).addScaledVector(cam.up, (ny + cam.shift) * cam.half).normalize()
  return { o: [cam.eye.x, cam.eye.y, cam.eye.z], d: [d.x, d.y, d.z] }
}

/** one pixel: what it sees and whether the sun reaches that point */
export function probePixel(T, cam, sun, px, py) {
  const { o, d } = pixelRay(cam, px, py)
  const h = hit(T, o, d, 0.3)
  if (!h) return { px, py, sees: null }
  const p = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t]
  let n = normalOf(T, h.i)
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0) n = n.map((x) => -x)
  const facing = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]
  const lift = 2e-3
  const s = hit(T, [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift], sun, 1e-4)
  return {
    px, py, sees: T.body[h.i], at: +h.t.toFixed(3), point: p.map((x) => +x.toFixed(3)), normal: n.map((x) => +x.toFixed(3)),
    sunFacing: +facing.toFixed(3), sunBlockedBy: s ? T.body[s.i] : null, sunBlockedAt: s ? +s.t.toFixed(3) : null,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stop = opt('--stop', null), size = opt('--size', 'desktop'), hour = Number(opt('--hour', NaN))
  if (!stop || !Number.isFinite(hour)) { console.error('--stop <n> --hour <solar hour> --px x,y[;x,y] [--size desktop|phone]'); process.exit(2) }
  const { sunVector } = await import('../../src/wings/babylon/map/sun.ts')
  const sun = sunVector(hour)
  const M = await MOUNTS.map(stop, { reach: Number(opt('--reach', 400)) })
  const cam = M.cameras.find((c) => c.name.includes(size) && c.w === (size === 'phone' ? 1170 : 3200))
  const T = flatten(M.faces)
  const pts = []
  for (const s of (opt('--px', '') || '').split(';').filter(Boolean)) { const [x, y] = s.split(',').map(Number); pts.push([x, y]) }
  const grid = opt('--grid', null)
  if (grid) {
    const [x0, y0, x1, y1, st] = grid.split(',').map(Number)
    for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) pts.push([x, y])
  }
  console.log(`stop ${stop} ${cam.name}, ${T.n} faces, sun ${sun.map((x) => x.toFixed(3)).join(',')} at hour ${hour}`)
  const rows = pts.map(([x, y]) => probePixel(T, cam, sun, x, y))
  for (const r of rows) console.log(r.sees === null ? `${r.px},${r.py}: nothing` : `${r.px},${r.py}: ${r.sees} at ${r.at} m, p ${r.point.join(',')} n ${r.normal.join(',')} sun·n ${r.sunFacing} ${r.sunBlockedBy ? `shade by ${r.sunBlockedBy} at ${r.sunBlockedAt} m` : 'LIT'}`)
  const out = opt('--json', null)
  if (out) writeFileSync(out, JSON.stringify({ stop, camera: cam.name, hour, sun, rows }, null, 1))
}
