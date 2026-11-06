// WHAT THE SUN DOES TO A STILL'S FACES, offline: rays from a stop's still camera through a pixel grid (ray-probe.mjs's
// rays) give each grid point its body, normal and point; from each point a ray toward the sun at every hour of a sweep
// folder (its sidecars' hours) says whether the geometry shades it. Bodies within the mount's reach only; the shadow
// map's own error and the materials are not modelled. A bounding volume tree keeps the rays cheap.
//
//   node --experimental-strip-types --no-warnings forge/babylon/sun-faces.mjs --stop <n> --sweep <sweep>/S<nn>
//        [--framing desktop,phone] [--step 8] [--reach 600] [--json <out>]   (default <sweep>/S<nn>/faces-<framing>.json)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three/webgpu'
import { MOUNTS } from './mounts.mjs'
import { cameraFrom } from './geometry.mjs'
import { flatten, pixelRay } from './ray-probe.mjs'
import { STOPS } from './pages.mjs'
import { sunVector } from '../../src/wings/babylon/map/sun.ts'

/** a bounding volume tree over flattened triangles: leaves of up to 4, split at the centroid median on the long axis */
export function buildTree(T) {
  const n = T.n, V = T.V, cx = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cx[i * 3 + k] = (V[i * 9 + k] + V[i * 9 + 3 + k] + V[i * 9 + 6 + k]) / 3
  const idx = new Uint32Array(n).map((_, i) => i)
  const box = [], kids = [], span = []
  function make(a, b) {
    const id = span.length
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let j = a; j < b; j++) { const t = idx[j] * 9; for (let v = 0; v < 9; v += 3) for (let k = 0; k < 3; k++) { const x = V[t + v + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x } }
    box.push([...lo, ...hi]); span.push([a, b]); kids.push(null)
    if (b - a <= 4) return id
    const ax = [0, 1, 2].sort((p, q) => (hi[q] - lo[q]) - (hi[p] - lo[p]))[0]
    const sub = Array.from(idx.subarray(a, b)).sort((p, q) => cx[p * 3 + ax] - cx[q * 3 + ax])
    idx.set(sub, a)
    const m = (a + b) >> 1
    kids[id] = [make(a, m), make(m, b)]
    return id
  }
  make(0, n)
  return { T, idx, box, kids, span }
}

function slab(bx, o, inv, tMax) {
  let t0 = 0, t1 = tMax
  for (let k = 0; k < 3; k++) {
    let a = (bx[k] - o[k]) * inv[k], b = (bx[k + 3] - o[k]) * inv[k]
    if (a > b) [a, b] = [b, a]
    if (a > t0) t0 = a
    if (b < t1) t1 = b
    if (t0 > t1) return false
  }
  return true
}

/** the nearest triangle a ray meets past tMin, or with `any` the first found: { i, t } or null. `front`: only faces
    turned toward the ray, as the pages cull back faces (an eye inside a body sees out of it) */
export function treeHit(tree, o, d, tMin = 1e-4, tMax = Infinity, any = false, front = false) {
  const V = tree.T.V, inv = d.map((x) => 1 / (Math.abs(x) < 1e-12 ? 1e-12 : x))
  let best = null, bt = tMax
  const stack = [0]
  while (stack.length) {
    const id = stack.pop()
    if (!slab(tree.box[id], o, inv, bt)) continue
    const kid = tree.kids[id]
    if (kid) { stack.push(kid[0], kid[1]); continue }
    const [a, b] = tree.span[id]
    for (let q = a; q < b; q++) {
      const i = tree.idx[q], j = i * 9
      const e1x = V[j + 3] - V[j], e1y = V[j + 4] - V[j + 1], e1z = V[j + 5] - V[j + 2]
      const e2x = V[j + 6] - V[j], e2y = V[j + 7] - V[j + 1], e2z = V[j + 8] - V[j + 2]
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x
      const det = e1x * px + e1y * py + e1z * pz
      if (front ? det < 1e-12 : Math.abs(det) < 1e-12) continue
      const iv = 1 / det, sx = o[0] - V[j], sy = o[1] - V[j + 1], sz = o[2] - V[j + 2]
      const u = (sx * px + sy * py + sz * pz) * iv
      if (u < 0 || u > 1) continue
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * iv
      if (v < 0 || u + v > 1) continue
      const t = (e2x * qx + e2y * qy + e2z * qz) * iv
      if (t > tMin && t < bt) { bt = t; best = i; if (any) return { i, t } }
    }
  }
  return best === null ? null : { i: best, t: bt }
}

function normalOf(V, i) {
  const j = i * 9
  const ax = V[j + 3] - V[j], ay = V[j + 4] - V[j + 1], az = V[j + 5] - V[j + 2]
  const bx = V[j + 6] - V[j], by = V[j + 7] - V[j + 1], bz = V[j + 8] - V[j + 2]
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

const hourOf = (h) => (typeof h === 'string' ? Number(h.split(':')[0]) + Number(h.split(':')[1]) / 60 : Number(h))

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  const stop = opt('--stop', null), dir = opt('--sweep', null)
  if (!stop || !dir) { console.error('--stop <n> --sweep <sweep>/S<nn>'); process.exit(2) }
  const page = STOPS.find((s) => s.stop === String(stop)).page
  const t0 = Date.now()
  const M = await MOUNTS[page](String(stop), page === 'map' ? { reach: Number(opt('--reach', 600)) } : {})
  const T = flatten(M.faces), tree = buildTree(T)
  // the sun in the mount's frame: the map's is the scene's; the gate's and the opening's turn by the map-to-gate matrix
  const toFrame = (v) => (M.W2G ? new THREE.Vector3(...v).transformDirection(M.W2G).toArray() : v)
  console.log(`stop ${stop} on ${page}: ${T.n} faces, tree in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  for (const framing of String(opt('--framing', 'desktop,phone')).split(',')) {
    const sides = readdirSync(dir).filter((f) => f.endsWith(`-${framing}.json`) && !f.startsWith('faces'))
    if (!sides.length) { console.log(`no ${framing} stills in ${dir}`); continue }
    const first = JSON.parse(readFileSync(join(dir, sides[0]), 'utf8'))
    const [W, H] = first.devicePixels
    // the gate page's stills name their own stand and look (each stop its hold); the other mounts' cameras are the stop's
    const g = first.camera?.gate
    const cam = g?.pos && g.look
      ? cameraFrom({ name: `gate stop ${stop} ${framing} ${W}x${H} (the still's own camera)`, eye: g.pos, look: g.look, vfov: first.camera.vfov, w: W, h: H, shift: first.camera.shift ?? 0 })
      : M.cameras.filter((c) => c.name.includes(framing) && c.w * H === c.h * W).sort((a, b) => b.w - a.w)[0]
    if (!cam) { console.log(`no ${framing} camera of ${W}x${H}'s shape`); continue }
    const hours = sides.map((f) => { const j = JSON.parse(readFileSync(join(dir, f), 'utf8')); return { file: f.replace(/\.json$/, ''), hour: hourOf(j.hour) } })
    const suns = hours.map((h) => toFrame(sunVector(h.hour)))
    const step = Number(opt('--step', 8)), names = [], nameIx = new Map(), pts = []
    const t1 = Date.now()
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const { o, d } = pixelRay(cam, ((x + 0.5) * cam.w) / W - 0.5, ((y + 0.5) * cam.h) / H - 0.5)
      const h = treeHit(tree, o, d, 0.3, Infinity, false, true)
      if (!h) { pts.push([x, y, -1]); continue }
      const body = T.body[h.i]
      if (!nameIx.has(body)) { nameIx.set(body, names.length); names.push(body) }
      let n = normalOf(T.V, h.i)
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0) n = n.map((v) => -v)
      const p = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t], q = p.map((v, k) => v + n[k] * 2e-3)
      // per hour: the sun's cosine on the face, and 1 where the geometry lets it through
      const facing = suns.map((s) => +(n[0] * s[0] + n[1] * s[1] + n[2] * s[2]).toFixed(3))
      const lit = suns.map((s, k) => (facing[k] > 0 && !treeHit(tree, q, s, 1e-4, Infinity, true) ? 1 : 0))
      pts.push([x, y, nameIx.get(body), n.map((v) => +v.toFixed(3)), +h.t.toFixed(1), +p[1].toFixed(2), facing, lit])
    }
    const view = cam.forward.toArray().map((v) => +v.toFixed(4))
    const out = opt('--json', null) ?? join(dir, `faces-${framing}.json`)
    writeFileSync(out, JSON.stringify({ stop, page, framing, frame: M.frame, camera: cam.name, size: [W, H], step, view, eyeY: +cam.eye.y.toFixed(2), hours, suns: suns.map((s) => s.map((v) => +v.toFixed(4))), names, pts }))
    console.log(`${framing}: ${pts.length} rays, ${hours.length} hours, ${names.length} bodies, ${((Date.now() - t1) / 1000).toFixed(1)} s -> ${out}`)
  }
}
