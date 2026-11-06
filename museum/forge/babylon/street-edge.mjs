// WHERE A STREET'S PAINTED EDGE RUNS, offline: on one map body built with the street's face data (`fa`: s along, t
// across, w the width; fa.w 0 on the top), the line where the paved band begins (t - (w - paved) / 2 = tt) as the
// material reads it, per triangle (the face data interpolate linearly inside a triangle only), projected into a
// stop's still camera; per triangle the segment's pixel ends and its slope, so a bend at a triangle's edge shows.
//
//   node --experimental-strip-types --no-warnings forge/babylon/street-edge.mjs --stop <n> --size phone|desktop
//        --body <id> [--paved 6.4] [--tt 0[,6.4]] [--window x0,y0,x1,y1]
import { MOUNTS } from './mounts.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)

/** the iso-line of tt over one triangle's three corners: two points or none */
export function isoSegment(P, T, level) {
  const out = []
  for (let k = 0; k < 3; k++) {
    const a = k, b = (k + 1) % 3
    const da = T[a] - level, db = T[b] - level
    if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
      const u = da / (da - db)
      out.push([0, 1, 2].map((c) => P[a][c] + (P[b][c] - P[a][c]) * u))
    }
  }
  return out.length === 2 ? out : null
}

/** a scene point to a still's device pixel (origin top left), as geometry.mjs onStage projects */
export function toPixel(cam, p) {
  const tx = p[0] - cam.eye.x, ty = p[1] - cam.eye.y, tz = p[2] - cam.eye.z
  const depth = tx * cam.forward.x + ty * cam.forward.y + tz * cam.forward.z
  if (depth <= 0.25) return null
  const ny = (tx * cam.up.x + ty * cam.up.y + tz * cam.up.z) / depth / cam.half - cam.shift
  const nx = (tx * cam.right.x + ty * cam.right.y + tz * cam.right.z) / depth / cam.half / cam.aspect
  return [((nx + 1) * cam.w) / 2 - 0.5, ((1 - ny) * cam.h) / 2 - 0.5]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stop = opt('--stop', null), size = opt('--size', 'phone'), id = opt('--body', null)
  if (!stop || !id) { console.error('--stop <n> --body <id> [--size phone|desktop]'); process.exit(2) }
  const paved = Number(opt('--paved', 6.4))
  const levels = String(opt('--tt', '0')).split(',').map(Number)
  const win = opt('--window', null)?.split(',').map(Number) ?? null
  const M = await MOUNTS.map(stop, { reach: 400 })
  const cam = M.cameras.find((c) => c.name.includes(size) && c.w === (size === 'phone' ? 1170 : 3200))
  const all = [M.esagila, M.tower, M.bridge, M.nabu, M.house].flatMap((x) => x?.bodies ?? [])
  const body = all.find((b) => b.id === id)
  if (!body) { console.error(`no body ${id}`); process.exit(2) }
  const P = body.geometry.getAttribute('position'), FA = body.geometry.getAttribute('fa'), I = body.geometry.getIndex()
  const n = I ? I.count : P.count
  console.log(`${id} at ${cam.name}: ${n / 3} triangles, paved ${paved}, levels ${levels.join(',')}`)
  for (const lv of levels) {
    const rows = []
    for (let k = 0; k + 2 < n; k += 3) {
      const ix = [0, 1, 2].map((j) => (I ? I.getX(k + j) : k + j))
      if (ix.some((i) => FA.getW(i) > 0.5)) continue
      const pos = ix.map((i) => [P.getX(i), P.getY(i), P.getZ(i)])
      const tt = ix.map((i) => FA.getY(i) - (FA.getZ(i) - paved) / 2)
      const seg = isoSegment(pos, tt, lv)
      if (!seg) continue
      const a = toPixel(cam, seg[0]), b = toPixel(cam, seg[1])
      if (!a || !b) continue
      if (win && ![a, b].some(([x, y]) => x >= win[0] && x <= win[2] && y >= win[1] && y <= win[3])) continue
      const [lo, hi] = a[1] < b[1] ? [a, b] : [b, a]
      rows.push({ tri: k / 3, lo, hi, slope: (hi[0] - lo[0]) / Math.max(1e-9, hi[1] - lo[1]), w: ix.map((i) => +FA.getZ(i).toFixed(3)), s: ix.map((i) => +FA.getX(i).toFixed(2)), p: seg.map((q) => q.map((v) => +v.toFixed(3))) })
    }
    rows.sort((u, v) => u.lo[1] - v.lo[1])
    console.log(`tt = ${lv}: ${rows.length} segments in the window`)
    for (const r of rows) console.log(`  tri ${r.tri}: px ${r.lo.map((v) => v.toFixed(1)).join(',')} to ${r.hi.map((v) => v.toFixed(1)).join(',')} (dx/dy ${r.slope.toFixed(4)}), s ${r.s.join('/')}, w ${r.w.join('/')}, scene ${r.p[0].join(',')} to ${r.p[1].join(',')}`)
  }
}
