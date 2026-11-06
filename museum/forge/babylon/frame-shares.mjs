// WHAT A MAP STILL IS MADE OF, offline: the share of the frame each group of bodies takes (the sky where no body is),
// from a depth-tested id raster of the bodies the map page builds (mounts.mjs), at the stop's own still cameras or at
// probe-style cameras; the whole frame and its lower half, and each group's box in device pixels.
//
//   node --experimental-strip-types --no-warnings forge/babylon/frame-shares.mjs --stop <n> [--jobs <probe jobs.json>]
//        [--groups <json: [{ "name": "...", "match": "<regex on the body name>" }]>] [--px 4] [--reach 3000] [--json <out>]
// The first group whose pattern matches a body takes it; a body no group names counts as "other". A probe job's eye
// stands 1.70 m over the ground there (the street's overlay and the eye), as the page's stand does within a few cm.
import { readFileSync, writeFileSync } from 'node:fs'
import { MOUNTS } from './mounts.mjs'
import { fittedFov } from './geometry.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
if (!args.includes('--stop')) { console.error('--stop <n> (a map stop)'); process.exit(2) }
const STOP = opt('--stop'), PX = Number(opt('--px', 4)), NEAR = 0.3
const GROUPS = (opt('--groups', null) ? JSON.parse(readFileSync(opt('--groups'), 'utf8')) : [
  { name: 'esagila', match: '^map:esagila(?!-ground|-street|-wall)' },
  { name: 'south-front', match: '^map:precinct-(south|gate8)' },
  { name: 'precinct', match: '^map:precinct-' },
  { name: 'road', match: 'street' },
  { name: 'plain', match: '^map:(ground|esagila-ground)' },
]).map((g) => ({ ...g, re: new RegExp(g.match) }))

const M = await MOUNTS.map(STOP, { reach: Number(opt('--reach', 3000)) })
const names = [], index = new Map()
for (const f of M.faces) if (!index.has(f.body)) { index.set(f.body, names.length); names.push(f.body) }
const groupOf = names.map((n) => { const k = GROUPS.findIndex((g) => g.re.test(n)); return k < 0 ? GROUPS.length : k })
const labels = [...GROUPS.map((g) => g.name), 'other', 'sky']
const tris = M.faces.map((f) => ({ b: index.get(f.body), v: f.v }))

/** one camera's raster: per pixel the group index, the sky the last */
function raster(cam, W, H) {
  const Z = new Float32Array(W * H), I = new Int32Array(W * H).fill(labels.length - 1)
  const e = cam.eye, f = cam.forward, r = cam.right, u = cam.up
  const sx = W / 2 / (cam.half * cam.aspect), sy = H / 2 / cam.half, shiftPx = cam.shift * H / 2
  const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], poly = []
  for (const t of tris) {
    for (let j = 0; j < 3; j++) {
      const px = t.v[j].x - e.x, py = t.v[j].y - e.y, pz = t.v[j].z - e.z
      P[j][0] = px * r.x + py * r.y + pz * r.z; P[j][1] = px * u.x + py * u.y + pz * u.z; P[j][2] = px * f.x + py * f.y + pz * f.z
    }
    if (P[0][2] < NEAR && P[1][2] < NEAR && P[2][2] < NEAR) continue
    poly.length = 0
    for (let j = 0; j < 3; j++) {
      const a = P[j], c = P[(j + 1) % 3]
      if (a[2] >= NEAR) poly.push(a)
      if ((a[2] >= NEAR) !== (c[2] >= NEAR)) { const s = (NEAR - a[2]) / (c[2] - a[2]); poly.push([a[0] + s * (c[0] - a[0]), a[1] + s * (c[1] - a[1]), NEAR]) }
    }
    const g = groupOf[t.b]
    for (let k = 1; k + 1 < poly.length; k++) fill(poly[0], poly[k], poly[k + 1], g)
  }
  function fill(A, Bv, C, g) {
    const x0 = W / 2 + (A[0] / A[2]) * sx, y0 = H / 2 - (A[1] / A[2]) * sy + shiftPx
    const x1 = W / 2 + (Bv[0] / Bv[2]) * sx, y1 = H / 2 - (Bv[1] / Bv[2]) * sy + shiftPx
    const x2 = W / 2 + (C[0] / C[2]) * sx, y2 = H / 2 - (C[1] / C[2]) * sy + shiftPx
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (area === 0) return
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)))
    if (minX > maxX || minY > maxY) return
    const w0 = 1 / A[2], w1 = 1 / Bv[2], w2 = 1 / C[2], inv = 1 / area
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5
      const a = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv, c = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv, b = 1 - a - c
      if (a < 0 || c < 0 || b < 0) continue
      const wz = a * w0 + c * w1 + b * w2, o = y * W + x
      if (wz > Z[o]) { Z[o] = wz; I[o] = g }
    }
  }
  return I
}

function shares(cam, W, H) {
  const I = raster(cam, W, H)
  const all = new Array(labels.length).fill(0), low = new Array(labels.length).fill(0)
  const box = labels.map(() => [Infinity, Infinity, -Infinity, -Infinity])
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = I[y * W + x]
    all[g]++
    if (y >= H / 2) low[g]++
    const bx = box[g]; if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y
  }
  const pct = (a, n) => Object.fromEntries(labels.map((l, k) => [l, +((100 * a[k]) / n).toFixed(1)]))
  const k = (cam.w / W)
  return { all: pct(all, W * H), lowerHalf: pct(low, (W * H) / 2), boxPx: Object.fromEntries(labels.map((l, g) => [l, all[g] ? box[g].map((v, i) => Math.round(i < 2 ? v * k : (v + 1) * k)) : null])) }
}

const rows = []
if (opt('--jobs', null)) {
  const { cameraFrom } = await import('./geometry.mjs')
  const E0 = 445700, N0 = 3600400
  for (const j of JSON.parse(readFileSync(opt('--jobs'), 'utf8'))) {
    const x = j.at[0] - E0, z = N0 - j.at[1]
    const eye = [x, j.y === 'eye' ? M.ground(x, z) + 1.7 : j.y, z], look = [j.look[0] - E0, j.look[2], N0 - j.look[1]]
    const w = j.w > j.h ? 3200 : 1170, h = j.w > j.h ? 1800 : 2532
    const cam = cameraFrom({ name: j.name, eye, look, vfov: fittedFov(j.hfov, w, h), w, h, shift: j.shift ?? 0 })
    rows.push({ name: j.name, ...shares(cam, Math.round(w / PX), Math.round(h / PX)) })
  }
} else {
  for (const cam of M.cameras.filter((c) => /3200x1800|1170x2532/.test(c.name))) rows.push({ name: cam.name, ...shares(cam, Math.round(cam.w / PX), Math.round(cam.h / PX)) })
}
for (const r of rows) console.log(`${r.name.padEnd(28)} all ${labels.map((l) => `${l} ${r.all[l]}`).join(', ')} | lower half ${labels.map((l) => `${l} ${r.lowerHalf[l]}`).join(', ')} | esagila box ${JSON.stringify(r.boxPx.esagila)}`)
if (opt('--json', null)) writeFileSync(opt('--json'), JSON.stringify({ stop: STOP, px: PX, groups: GROUPS.map(({ name, match }) => ({ name, match })), rows }, null, 1))
