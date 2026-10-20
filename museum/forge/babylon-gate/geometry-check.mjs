// THE GATE'S GEOMETRY, OFFLINE (no renderer): two bodies in one plane, and faces thinner than a device pixel at the stills' cameras.
// The logic of `src/wings/vinci/coplanar-check.mjs` and `feature-size-check.mjs`, on the gate's bodies mounted in node as the page
// mounts them (the merged wall soup split by its body marks, the panels' base quads, the paving, the bronzes) and on the map's bodies
// within reach, moved into the gate's frame. The map's street and ground are masked inside the gate's paved area on the page, so their
// cells there are not counted.
//   node --experimental-strip-types --no-warnings forge/babylon-gate/geometry-check.mjs [--near <mm>] [--area 0.01] [--all] [--json <out>] [--eyes <facts.json>]
// --eyes: the path the page sampled (`shoot.mjs --facts`); a pair whose plane every eye of the round stands behind is read as unseen.
// Not covered, said plainly: the figure (the house's sign person, not mounted here), occlusion (a thin face behind a wall still counts),
// anything a material draws, and the panels' displaced relief (a height field on a 1 cm grid, its base quad is checked).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = join(HERE, '../../src/wings/babylon/gate'), MAP = join(HERE, '../../src/wings/babylon/map')
const { buildGate, gateFrame } = await import(join(GATE, 'gate-geom.ts'))
const { animalField } = await import(join(GATE, 'gate-relief.ts'))
const { assemble, paved } = await import(join(GATE, 'gate-mesh.ts'))
const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
const { buildBodies, tonesFrom } = await import(join(MAP, 'mass.ts'))

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const ALL = args.includes('--all')
const NEAR_MM = Number(opt('--near', 0))
const BED = NEAR_MM > 0 ? NEAR_MM / 1000 : 0.002
const AREA_MIN = Number(opt('--area', 0.01))
const JSON_OUT = opt('--json', null)
const EYES_FILE = opt('--eyes', null)

const plan = JSON.parse(readFileSync(join(GATE, 'gate-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(GATE, 'gate-cams.json'), 'utf8'))
const mapPlan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))

/* ---- the gate, as the page builds it ---- */
const B = buildGate(plan)
const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
const A = assemble(B, plan, fields)
const C = plan.course

/* ---- the map's city without the replaced bodies, moved into the gate's frame ---- */
const dropB = new Set(plan.frame.mapBlocksReplaced), dropW = new Set(plan.frame.mapWallsReplaced)
const cityPlan = structuredClone(mapPlan)
cityPlan.blocks = cityPlan.blocks.filter((b) => !dropB.has(b.id))
cityPlan.walls = cityPlan.walls.filter((w) => !dropW.has(w.id))
const city = buildPlan(cityPlan)
const MF = makeFrame(mapPlan), GF = gateFrame(plan)
const canalZ = []
{
  const cz = MF.s(cityPlan.canal.line[0][0], cityPlan.canal.line[0][1])[1]
  for (const d of [-2.4, -cityPlan.canal.w / 2, cityPlan.canal.w / 2, 2.4]) canalZ.push(Math.round((cz + d) * 100) / 100)
}
const sky = { colour: () => TSL.vec3(0.5) }
const mapBodies = buildBodies(city, tonesFrom(cityPlan), sky, TSL.uniform(new THREE.Vector3(0, 1, 0)), canalZ)
const G2W = new THREE.Matrix4().fromArray(GF.toMap(MF.E0, MF.N0))
const W2G = G2W.clone().invert()
/** the map's bodies counted within this box of the gate's frame (the stills see nothing of the map's beyond it at a size that matters here) */
const REACH = { x: [-90, 90], z: [-130, 240] }
const MASKED = new Set(['map:street', 'map:ground'])

/* ---- every triangle, in the gate's frame, with its body and its plane ---- */
const faces = []
function push(body, a, b, c) {
  const u = b.clone().sub(a), t = c.clone().sub(a)
  const n = u.clone().cross(t)
  const twice = n.length()
  if (twice < 1e-9) return
  n.divideScalar(twice)
  const major = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? n.x : Math.abs(n.y) >= Math.abs(n.z) ? n.y : n.z
  // one plane whichever way its faces look; `facing` keeps the way, so a butt joint (two closed bodies meeting) parts from a fight
  const facing = major < 0 ? -1 : 1
  if (major < 0) n.negate()
  faces.push({ body, n, d: n.dot(a), v: [a, b, c], area: twice / 2, facing })
}
function trianglesOf(geo, matrix, bodyAt) {
  const P = geo.getAttribute('position'), I = geo.getIndex()
  const count = I ? I.count : P.count
  for (let k = 0; k + 2 < count; k += 3) {
    const v = [0, 1, 2].map((j) => {
      const i = I ? I.getX(k + j) : k + j
      const p = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))
      return matrix ? p.applyMatrix4(matrix) : p
    })
    const body = bodyAt(I ? I.getX(k) : k)
    if (body) push(body, v[0], v[1], v[2])
  }
}
// the gate's walls, split at the marks
{
  const marks = A.marks
  let m = 0
  trianglesOf(A.walls, null, (i) => {
    while (m + 1 < marks.length && marks[m + 1].from <= i) m++
    return `gate:${marks[m].id}`
  })
}
// the panels' base quads, each where its instance stands
for (const set of A.panels) {
  const L = fields[set.kind].L
  const quad = new THREE.PlaneGeometry(1, 1)
  quad.translate(0.5, 0.5, 0)
  const list = B.panels.filter((q) => q.kind === set.kind)
  for (let i = 0; i < set.count; i++) {
    const local = new THREE.Matrix4().makeScale(L + 0.04, 15 * C, 1).premultiply(new THREE.Matrix4().makeTranslation(-0.02, -C, 0))
    const M = new THREE.Matrix4().fromArray(set.matrices, i * 16).multiply(local)
    trianglesOf(quad, M, () => `panel:${list[i].id}`)
  }
}
trianglesOf(A.paving, null, () => 'gate:paving')
A.bronzes.forEach((b, i) => trianglesOf(b.geometry, null, () => `gate:bronze-${i}`))
const gateFaces = faces.length
// the map, its instanced towers and piers by instance
mapBodies.group.updateMatrixWorld(true)
mapBodies.group.traverse((o) => {
  if (!o.isMesh || !o.geometry) return
  const name = `map:${o.name || 'mesh'}`
  const inReach = (i, M) => {
    const P = o.geometry.getAttribute('position')
    const p = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(M)
    return p.x >= REACH.x[0] - 40 && p.x <= REACH.x[1] + 40 && p.z >= REACH.z[0] - 40 && p.z <= REACH.z[1] + 40
  }
  if (o.isInstancedMesh) {
    for (let k = 0; k < o.count; k++) {
      const im = new THREE.Matrix4()
      o.getMatrixAt(k, im)
      const M = W2G.clone().multiply(o.matrixWorld).multiply(im)
      if (!inReach(0, M)) continue
      trianglesOf(o.geometry, M, () => `${name}#${k}`)
    }
  } else {
    const M = W2G.clone().multiply(o.matrixWorld)
    trianglesOf(o.geometry, M, (i) => (inReach(i, M) ? name : null))
  }
})
const mapFaces = faces.length - gateFaces

/* ---- the round's eyes: both stills and, with --eyes, the path of stops 2 to 4 every 0.1 s ---- */
const pathEyes = []
if (EYES_FILE) for (const s of JSON.parse(readFileSync(EYES_FILE, 'utf8')).samples) pathEyes.push(new THREE.Vector3(s.x, s.y, s.z))
for (const name of ['desktop', 'phone']) { const v = cams.stills[name]; if (pathEyes.length) pathEyes.push(new THREE.Vector3(v.at[0], B.level(v.at[1]) + cams.eye, v.at[1])) }

/* ---- coplanar: one normal to a hundredth, offsets clustered within the bed, pairs of bodies sharing area ---- */
/** the shared area of two face sets in one plane; `cover` faces (a third body's, looking the other way) close the cells they lie on:
    two closed bodies on either side of the plane make that part of it interior */
function sharedArea(a, b, n, maskedSide, cover = []) {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const e1 = new THREE.Vector3().crossVectors(n, helper).normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1)
  const flat = (set) => set.map((f) => f.v.map((q) => [q.dot(e1), q.dot(e2)]))
  const FA = flat(a), FB = flat(b), FC = flat(cover)
  const bb = (F) => { const p = F.flat(); return [Math.min(...p.map((x) => x[0])), Math.min(...p.map((x) => x[1])), Math.max(...p.map((x) => x[0])), Math.max(...p.map((x) => x[1]))] }
  const ba = bb(FA), bq = bb(FB)
  const box = [Math.max(ba[0], bq[0]), Math.max(ba[1], bq[1]), Math.min(ba[2], bq[2]), Math.min(ba[3], bq[3])]
  if (box[2] <= box[0] || box[3] <= box[1]) return null
  const CELL = Math.min(0.05, Math.max(0.01, Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / 2e6)))
  // the samples sit off the cell's middle: two bodies meeting edge to edge share an edge at a whole or half cell from the box's corner,
  // and a sample exactly on a shared edge reads as inside both
  const F = 0.537
  const cols = Math.ceil((box[2] - box[0]) / CELL) + 1, rows = Math.ceil((box[3] - box[1]) / CELL) + 1
  const grid = new Uint8Array(cols * rows)
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const paint = (set, bit) => {
    for (const tri of set) {
      const lo = [Math.min(...tri.map((p) => p[0])), Math.min(...tri.map((p) => p[1]))], hi = [Math.max(...tri.map((p) => p[0])), Math.max(...tri.map((p) => p[1]))]
      const i0 = Math.max(0, Math.floor((lo[0] - box[0]) / CELL)), i1 = Math.min(cols - 1, Math.ceil((hi[0] - box[0]) / CELL))
      const j0 = Math.max(0, Math.floor((lo[1] - box[1]) / CELL)), j1 = Math.min(rows - 1, Math.ceil((hi[1] - box[1]) / CELL))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const P = [box[0] + (i + F) * CELL, box[1] + (j + F) * CELL]
        const d1 = side(tri[0], tri[1], P), d2 = side(tri[1], tri[2], P), d3 = side(tri[2], tri[0], P)
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) grid[j * cols + i] |= bit
      }
    }
  }
  paint(FA, 1)
  paint(FB, 2)
  paint(FC, 4)
  const d0 = a[0].d
  let both = 0
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (grid[j * cols + i] !== 3) continue
    if (maskedSide) {
      const x = box[0] + (i + F) * CELL, y = box[1] + (j + F) * CELL
      const p = e1.clone().multiplyScalar(x).addScaledVector(e2, y).addScaledVector(n, d0)
      if (paved(B, p.x, p.z, plan.lionWalls.to)) continue
    }
    both++
  }
  return { area: both * CELL * CELL, cell: +CELL.toFixed(3) }
}
const groups = new Map()
for (const f of faces) {
  const key = [f.n.x, f.n.y, f.n.z].map((c) => (Math.round(c * 100) / 100).toFixed(2)).join(',')
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(f)
}
const pairs = []
for (const [, set] of groups) {
  set.sort((p, q) => p.d - q.d)
  let run = []
  const close = () => {
    if (run.length > 1) {
      const by = new Map()
      for (const f of run) { if (!by.has(f.body)) by.set(f.body, []); by.get(f.body).push(f) }
      const names = [...by.keys()]
      if (names.length > 1) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const an = names[i], bn = names[j]
        // two of the map's own bodies are the map's to answer; only pairs touching the gate are this round's
        if (an.startsWith('map:') && bn.startsWith('map:')) continue
        const masked = MASKED.has(an.replace(/#.*/, '')) || MASKED.has(bn.replace(/#.*/, ''))
        for (const [fa, fb, k0] of [[1, 1, 'fight'], [-1, -1, 'fight'], [1, -1, 'butt'], [-1, 1, 'butt']]) {
          const sa = by.get(an).filter((f) => f.facing === fa), sb = by.get(bn).filter((f) => f.facing === fb)
          if (!sa.length || !sb.length) continue
          // a fight whose plane every eye of the round stands behind is culled from every eye
          const kind = k0 === 'fight' && pathEyes.length && pathEyes.every((e) => fa * (run[0].n.dot(e) - run[0].d) < 0.001) ? 'unseen' : k0
          const cover = k0 === 'fight' ? run.filter((f) => f.facing === -fa && f.body !== an && f.body !== bn) : []
          const o = sharedArea(sa, sb, run[0].n, masked, cover)
          if (!o || o.area < AREA_MIN) continue
          const pts = [...sa, ...sb].flatMap((f) => f.v)
          const span = (k) => [+Math.min(...pts.map((p) => p[k])).toFixed(2), +Math.max(...pts.map((p) => p[k])).toFixed(2)]
          const gap = Math.abs(sa[0].d - sb[0].d)
          pairs.push({ a: an, b: bn, kind, facing: fa, area: +o.area.toFixed(3), cell: o.cell, gapMm: +(gap * 1000).toFixed(1), n: [run[0].n.x, run[0].n.y, run[0].n.z].map((c) => +c.toFixed(3)), d: +run[0].d.toFixed(3), x: span('x'), y: span('y'), z: span('z') })
        }
      }
    }
    run = []
  }
  for (const f of set) {
    if (run.length && f.d - run[0].d > BED) close()
    run.push(f)
  }
  close()
}

/** pairs that may share a plane, each with its reason; the ratchet starts empty and may only shrink */
const ALLOWED_PAIRS = [
  { kind: 'butt', why: 'two closed bodies meeting face to face: the two faces look opposite ways and both lie inside the union, so no eye outside sees either (front faces only)' },
  { kind: 'unseen', why: 'every eye of the round (both stills, stops 2 to 4 every 0.1 s) stands behind the plane, so both faces are culled; the map\'s other stops may see the gate from outside and are not read here' },
]
// the bodies' feet: faces looking down at the foundation level, under the street and the paving wherever the gate stands
const FOOT_Y = Math.min(...B.boxes.map((b) => b.y0))
ALLOWED_PAIRS.push({ test: (p) => p.facing < 0 && p.n[1] > 0.99 && p.y[1] <= FOOT_Y + 0.05, why: `the bodies' feet at ${FOOT_Y} m, looking down, under the street and the paving (the half-space test sees the lion street's eyes below them, the ground hides them)` })
const allowedPair = (p) => ALLOWED_PAIRS.find((r) => (r.test && r.test(p)) || (r.kind && r.kind === p.kind && !r.a) || (r.a === p.a && r.b === p.b) || (r.a === p.b && r.b === p.a))

/* ---- sub-pixel: the thinnest altitude of every gate face, projected through each still's camera at its device pixels ---- */
const D2R = Math.PI / 180
function fittedFov(hfov, authored, w, h) {
  const vAuth = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (authored[1] / authored[0]))
  const vKeepH = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))
  return (w / h >= authored[0] / authored[1] ? vKeepH : Math.max(vKeepH, vAuth)) / D2R
}
const stills = [['desktop', 3200, 1800, 'ratio 2'], ['desktop', 1600, 900, 'ratio 1'], ['phone', 1170, 1992, '390x664 at 3'], ['phone', 1080, 1920, '360x640 at 3'], ['phone', 1170, 2532, '390x844 at 3']]
const eyes = stills.map(([name, w, h, says]) => {
  const v = cams.stills[name]
  const y = B.level(v.at[1]) + cams.eye
  const eye = new THREE.Vector3(v.at[0], y, v.at[1])
  const look = new THREE.Vector3(v.look[0], v.look[1] ?? y, v.look[2])
  const forward = look.clone().sub(eye).normalize()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  const vfov = fittedFov(v.hfov, v.authored, w, h)
  const half = Math.tan((vfov * D2R) / 2)
  return { name: `${name} ${w}x${h} (${says})`, eye, forward, right, up, w, h, half, aspect: w / h, shift: v.shift, reach: h / (2 * half) }
})
function onStage(e, p) {
  const to = p.clone().sub(e.eye)
  const depth = to.dot(e.forward)
  if (depth <= 0.25) return null
  const ny = to.dot(e.up) / depth / e.half - e.shift, nx = to.dot(e.right) / depth / e.half / e.aspect
  return { x: nx * e.w / 2, y: ny * e.h / 2, depth, inside: Math.abs(nx) <= 1.1 && Math.abs(ny) <= 1.1 }
}
function altitude(v) {
  let longest = 0, at = 0
  for (let i = 0; i < 3; i++) { const l = v[(i + 1) % 3].distanceTo(v[i]); if (l > longest) { longest = l; at = i } }
  const a = v[at], b = v[(at + 1) % 3], c = v[(at + 2) % 3]
  const axis = b.clone().sub(a)
  const t = axis.lengthSq() > 0 ? c.clone().sub(a).dot(axis) / axis.lengthSq() : 0
  const foot = a.clone().addScaledVector(axis, t)
  return { foot, top: c, along: [a, b], thick: foot.distanceTo(c) }
}
const RUN_PX = 4, FACING = 0.15, THICK_CAP = 0.5
/* A sliver of a triangulated surface is not a thin surface: across its long edge the surface goes on (the same body's face turned
   less than 30 degrees, or any gate face in the same plane 2 mm beyond the edge). Only a triangle whose long edge borders no such
   surface is a strip of its own (a ledge, a step, a hairline). */
const planes = new Map()
const pkey = (f) => `${[f.n.x, f.n.y, f.n.z].map((c) => (Math.round(c * 1000) / 1000).toFixed(3)).join(',')}|${Math.round(f.d * 1000)}`
for (const f of faces) {
  if (f.body.startsWith('panel:') || f.body.startsWith('map:')) continue
  const k = pkey(f)
  if (!planes.has(k)) planes.set(k, [])
  planes.get(k).push(f)
}
const inTri = (p, f) => {
  const [a, b, c] = f.v
  const v0 = c.clone().sub(a), v1 = b.clone().sub(a), v2 = p.clone().sub(a)
  const d00 = v0.dot(v0), d01 = v0.dot(v1), d02 = v0.dot(v2), d11 = v1.dot(v1), d12 = v1.dot(v2)
  const inv = 1 / (d00 * d11 - d01 * d01)
  const u = (d11 * d02 - d01 * d12) * inv, w = (d00 * d12 - d01 * d02) * inv
  return u >= -1e-6 && w >= -1e-6 && u + w <= 1 + 1e-6 && Math.abs(p.clone().sub(a).dot(f.n)) < 2e-4
}
const goesOn = (f, foot, top, along) => {
  const across = edges.get(ekey(along[0], along[1])) ?? []
  if (across.some((g) => g !== f && g.body === f.body && g.n.dot(f.n) > 0.866)) return true
  const mid = along[0].clone().add(along[1]).multiplyScalar(0.5)
  const probe = mid.addScaledVector(foot.clone().sub(top).normalize(), 0.002)
  return (planes.get(pkey(f)) ?? []).some((g) => g !== f && inTri(probe, g))
}
const vkey = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`
const ekey = (a, b) => { const p = vkey(a), q = vkey(b); return p < q ? `${p}|${q}` : `${q}|${p}` }
const edges = new Map()
for (const f of faces) {
  if (f.body.startsWith('panel:') || f.body.startsWith('map:')) continue
  for (let i = 0; i < 3; i++) { const k = ekey(f.v[i], f.v[(i + 1) % 3]); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(f) }
}
let slivers = 0
const thin = new Map()
for (const f of faces) {
  if (f.body.startsWith('panel:')) continue
  const { foot, top, along, thick } = altitude(f.v)
  if (!(thick > 1e-4) || thick >= THICK_CAP) continue
  if (goesOn(f, foot, top, along)) { slivers++; continue }
  const centre = foot.clone().add(top).multiplyScalar(0.5)
  for (const e of eyes) {
    if (centre.distanceTo(e.eye) < e.reach * thick) continue
    const toEye = e.eye.clone().sub(centre).normalize()
    if (Math.abs(toEye.dot(f.n)) < FACING) continue
    const a = onStage(e, foot), b = onStage(e, top)
    if (!a || !b || !a.inside) continue
    const px = Math.hypot(a.x - b.x, a.y - b.y)
    if (px >= 1) continue
    const p = onStage(e, along[0]), q = onStage(e, along[1])
    if (!p || !q) continue
    const run = Math.hypot(p.x - q.x, p.y - q.y)
    if (run < RUN_PX) continue
    const key = `${f.body.replace(/#.*/, '')}|${e.name}`
    const row = thin.get(key) ?? { body: f.body.replace(/#.*/, ''), eye: e.name, faces: 0, thinnestPx: 9, thickM: 0, atM: 0, runPx: 0 }
    row.faces++
    if (px < row.thinnestPx) Object.assign(row, { thinnestPx: +px.toFixed(3), thickM: +thick.toFixed(4), atM: +a.depth.toFixed(1), runPx: Math.round(run), where: f.v.map((q) => [q.x, q.y, q.z].map((c) => +c.toFixed(3))) })
    thin.set(key, row)
  }
}
/** gate bodies that may stand under a pixel, each with its reason; empty at the start (the ratchet) */
const ALLOWED_THIN = [
  { prefix: 'gate:bronze-', why: 'the two bronzes\' outline band, where the inflated halves close at the middle plane: a ridge of one closed body, so where the band falls under a pixel the halves meet there and nothing opens (measured 20 Oct: about 1.4 cm wide, 0.08 to 0.15 px at 49 to 51 m from the desktop still, no other still)' },
]
const allowedThin = (r) => ALLOWED_THIN.find((x) => x.body === r.body || (x.prefix && r.body.startsWith(x.prefix)))

const thinRows = [...thin.values()].sort((a, b) => a.thinnestPx - b.thinnestPx)
const gateThin = thinRows.filter((r) => !r.body.startsWith('map:'))
const mapThin = thinRows.filter((r) => r.body.startsWith('map:'))
const pairOff = pairs.filter((p) => !allowedPair(p))
const thinOff = gateThin.filter((r) => !allowedThin(r))
const report = {
  checker: 'babylon-gate-geometry', bedMm: BED * 1000, areaMin: AREA_MIN, gateFaces, mapFacesInReach: mapFaces, marks: A.marks.length, panels: B.panels.length,
  coplanar: { pairs: pairs.length, offences: pairOff.length, list: (ALL ? pairs : pairOff).map((p) => ({ ...p, why: allowedPair(p)?.why ?? null })) },
  subPixel: { eyes: eyes.map((e) => e.name), sliversInAPlane: slivers, gateRows: gateThin.length, offences: thinOff.length, list: (ALL ? gateThin : thinOff).map((r) => ({ ...r, why: allowedThin(r)?.why ?? null })), mapRows: mapThin.slice(0, 20) },
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1))
console.log(`gate faces ${gateFaces} in ${A.marks.length} bodies plus ${B.panels.length} panel quads; the map's faces in reach ${mapFaces}`)
console.log(`coplanar (bed ${BED * 1000} mm, area over ${AREA_MIN} m2): ${pairs.length} pairs, ${pairOff.length} not allowed`)
console.log(`  by kind: ${['fight', 'unseen', 'butt'].map((k) => `${k} ${pairs.filter((p) => p.kind === k).length}`).join(', ')}`)
for (const p of (ALL ? pairs : pairOff).slice(0, 40)) console.log(`  [${p.kind} ${p.facing > 0 ? '+' : '-'}] ${p.a} | ${p.b}: ${p.area} m2 (cell ${p.cell}), gap ${p.gapMm} mm, n ${p.n.join(',')}, x ${p.x.join('..')} y ${p.y.join('..')} z ${p.z.join('..')}`)
console.log(`sub-pixel (under 1 device px over a run of ${RUN_PX} px; ${slivers} slivers of triangulated planes set aside, the surface going on across their long edge): ${gateThin.length} gate rows, ${thinOff.length} not allowed; the map's own rows ${mapThin.length} (the map's to answer)`)
for (const r of (ALL ? gateThin : thinOff).slice(0, 40)) console.log(`  ${r.body} at ${r.eye}: ${r.faces} faces, thinnest ${r.thinnestPx} px (${r.thickM} m at ${r.atM} m, run ${r.runPx} px)`)
console.log(pairOff.length + thinOff.length === 0 ? 'geometry: ok' : 'geometry: FAILED')
process.exit(pairOff.length + thinOff.length === 0 ? 0 : 1)
