// THE SEEN SET, A STAND-IN: the cells a clip can show, read off its camera
// track in node. The export's ID pass names the cells each frame actually
// shows (a pixel's id and depth give its world point); until that pass runs
// (W2), this is the frustum of every frame WITHOUT OCCLUSION, a superset: a
// false red costs minutes, a missed red costs trust.
//
// Three parts, as the design lists them:
//   (a) every cell inside the frustum of any frame, at the authored aspect;
//   (b) every cell whose shadow can fall on one of those: the cells along the
//       ray from each seen cell toward the sun, up to the top of the scene;
//   (c) when a reflecting water cell is seen, the frustum mirrored in its plane.
// (b) and (c) are dilated by one cell, so a caster or a reflected body that
// stands across a cell's edge is never lost.
//
// THE WIDE STAND-IN (`SEEN_DEFINITION`, with `wide`) adds what lights a frame
// from outside those parts:
//   (d) a frame whose frustum, or the water's mirrored one, meets a room lit
//       by a capture of the scene (a cube probe sees the whole world, the hall
//       floor's mirror whatever stands above it) or a room light's shadow:
//       every cell of the world; so for every frame when a module captures the
//       scene or makes a shadowing light the pin does not place (`lit.mjs`);
//   (e) in place of (b): every cell holding a body that casts a shadow whose
//       shadow line, carried down from its box away from the sun to the
//       bottom of the world, passes through a frustum or its mirror: a
//       receiver is any point a frame shows, in the node world or not, at any
//       distance from the eye (every sun map the wing draws casts along the
//       same sun). A cell with no caster casts nothing; one that starts to
//       cast joins the set, so the set itself moves the key;
//   (f) a shadowing light a material reads (hidden from the scene's list):
//       where a cell that reads it is seen, every cell that casts on its
//       camera's layers; a light of the scene's list: its line where its
//       range meets a frustum (everywhere, without one), and the same casters.
import * as THREE from 'three/webgpu'
import { cellCoords, cellNumber } from './scene.mjs'

const NEAR = 0.25, FAR = 4000
/** The wing's key light draws shadows out to its far cascade (reach 100 m,
    cascades at 20 and 90, `index.ts`); no caster beyond it reaches a frame. */
const SHADOW_REACH_M = 100
/** THE STAND-IN'S DEFINITION: the wide one reads (d), (e) and (f) and each
    cell's shadow flags; without `wide`, `seenSet` is the first one. */
export const SEEN_DEFINITION = 'seen-wide-v2'
/** How far a shadow's edge can spread past its caster's outline (the maps'
    filters and biases spread it centimetres): a margin on every plane of (e). */
const SHADOW_MARGIN_M = 0.5

/** An octree over the occupied cells: every node's leaves are one run of the
    sorted leaf list, so a node wholly inside a frustum takes its run at once. */
export function buildIndex(cells) {
  const numbers = [...cells.hashes.keys()]
  const coords = numbers.map(cellCoords)
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const c of coords) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c[k]); hi[k] = Math.max(hi[k], c[k]) }
  let size = 1
  while (size < Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + 1) size *= 2
  const order = coords.map((c, i) => i)
  const leaves = []
  const nodes = { min: [], max: [], first: [], count: [], child: [], start: [], end: [] }
  const make = (items, x, y, z, s) => {
    const id = nodes.min.length
    nodes.min.push([x * cells.cell, y * cells.cell, z * cells.cell])
    nodes.max.push([(x + s) * cells.cell, (y + s) * cells.cell, (z + s) * cells.cell])
    nodes.child.push([])
    nodes.start.push(leaves.length)
    if (s === 1) {
      for (const i of items) leaves.push(numbers[i])
    } else {
      const h = s / 2
      const buckets = new Map()
      for (const i of items) {
        const c = coords[i]
        const b = (c[0] >= x + h ? 4 : 0) + (c[1] >= y + h ? 2 : 0) + (c[2] >= z + h ? 1 : 0)
        if (!buckets.has(b)) buckets.set(b, [])
        buckets.get(b).push(i)
      }
      for (const b of [...buckets.keys()].sort((p, q) => p - q)) {
        nodes.child[id].push(make(buckets.get(b), x + (b & 4 ? h : 0), y + (b & 2 ? h : 0), z + (b & 1 ? h : 0), h))
      }
    }
    nodes.end[id] = leaves.length
    return id
  }
  make(order, lo[0], lo[1], lo[2], size)
  const occupied = new Set(numbers)
  return { nodes, leaves, occupied, cells }
}

const planesOf = (() => {
  const frustum = new THREE.Frustum(), m = new THREE.Matrix4()
  return (camera) => {
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(m)
    return frustum.planes.map((p) => [p.normal.x, p.normal.y, p.normal.z, p.constant])
  }
})()

/** The planes of the frustum mirrored in the horizontal plane y = level. */
const mirrorPlanes = (planes, level) => planes.map(([x, y, z, d]) => [x, -y, z, d + 2 * level * y])

/** Mark every leaf inside the planes; `mark` receives a run of the leaf list. */
function cull(index, planes, mark, stamp) {
  const { nodes } = index
  const visit = (id) => {
    if (stamp.full[id] === stamp.now) return
    const lo = nodes.min[id], hi = nodes.max[id]
    let inside = true
    for (const [nx, ny, nz, d] of planes) {
      const px = nx > 0 ? hi[0] : lo[0], py = ny > 0 ? hi[1] : lo[1], pz = nz > 0 ? hi[2] : lo[2]
      if (nx * px + ny * py + nz * pz + d < 0) return
      const qx = nx > 0 ? lo[0] : hi[0], qy = ny > 0 ? lo[1] : hi[1], qz = nz > 0 ? lo[2] : hi[2]
      if (nx * qx + ny * qy + nz * qz + d < 0) inside = false
    }
    if (inside || !nodes.child[id].length) {
      stamp.full[id] = stamp.now
      mark(nodes.start[id], nodes.end[id])
      return
    }
    for (const c of nodes.child[id]) visit(c)
  }
  visit(0)
}

/** The camera of one sample of a replayed track: eye, quaternion, lens, and
    a shifted look's slide as the rail adds it (`rail-projection.ts`). */
function cameraOf(camera, sample, aspect) {
  camera.position.set(sample[0], sample[1], sample[2])
  camera.quaternion.set(sample[3], sample[4], sample[5], sample[6])
  camera.fov = sample[7]
  camera.aspect = aspect
  camera.near = NEAR
  camera.far = FAR
  camera.updateProjectionMatrix()
  if (sample[8]) camera.projectionMatrix.elements[9] += sample[8]
  camera.updateMatrixWorld(true)
  return camera
}

/**
 * The seen set of a track: the sorted cell numbers of (a), (b) and (c).
 *   index     buildIndex(cells)
 *   samples   the track's frames, [x, y, z, qx, qy, qz, qw, fov] each, and
 *             the shift after them where a look is shifted
 *   aspect    the framing's authored aspect
 *   sun       the direction toward the key light
 *   wide      wideSetting() of the world: the wide stand-in's (d), (e), (f);
 *             the array then names its `definition`, the `lights` lines it
 *             reads, and `whole` (why) where it is every cell of the world
 */
export function seenSet(index, samples, { aspect, sun, mirror = [], mirrorLevel, wide = null }) {
  const { leaves, occupied, cells } = index
  const seen = new Uint8Array(leaves.length)
  const stamp = { full: new Int32Array(index.nodes.min.length), now: 1 }
  const camera = new THREE.PerspectiveCamera()
  const mark = (a, b) => { seen.fill(1, a, b) }
  const planeSets = samples.map((s) => planesOf(cameraOf(camera, s, aspect)))
  if (wide?.whole) return wholeWorld(index, wide.whole)
  for (const planes of planeSets) cull(index, planes, mark, stamp)
  const direct = []
  for (let i = 0; i < leaves.length; i++) if (seen[i]) direct.push(leaves[i])
  const extra = new Set()
  const mirrored = mirror.length && direct.some((n) => mirror.includes(n)) ? planeSets.map((planes) => mirrorPlanes(planes, mirrorLevel)) : []
  const views = [...planeSets, ...mirrored]
  // (d) a room lit by a capture or a room light's shadow, met by a frustum or its mirror
  if (wide?.lit && views.some((planes) => meets(wide.lit, planes))) return wholeWorld(index, 'a frame meets a lit room')
  // (c) the water's mirror, when a reflecting cell is seen
  if (mirrored.length) {
    const inMirror = new Uint8Array(leaves.length)
    const again = { full: new Int32Array(index.nodes.min.length), now: 1 }
    for (const planes of mirrored) cull(index, planes, (a, b) => inMirror.fill(1, a, b), again)
    for (let i = 0; i < leaves.length; i++) if (inMirror[i] && !seen[i]) extra.add(leaves[i])
  }
  // (b) the casters toward the sun, inside the reach of the far cascade; the wide stand-in's (e) stands in for it
  const rays = index.rays ??= new Map()
  const step = cells.cell
  const lo = [0, 1, 2].map((k) => Math.min(...samples.map((s) => s[k])) - SHADOW_REACH_M)
  const hi = [0, 1, 2].map((k) => Math.max(...samples.map((s) => s[k])) + SHADOW_REACH_M)
  const reached = (n) => { const c = cellCoords(n); return c.every((v, k) => (v + 1) * step >= lo[k] && v * step <= hi[k]) }
  for (const n of wide ? [] : [...direct, ...extra]) {
    if (!reached(n)) continue
    let ray = rays.get(n)
    if (!ray) {
      ray = []
      const [cx, cy, cz] = cellCoords(n)
      const p = [(cx + .5) * step, (cy + .5) * step, (cz + .5) * step]
      for (let k = 1; k < 4096; k++) {
        const q = [p[0] + sun[0] * k * step, p[1] + sun[1] * k * step, p[2] + sun[2] * k * step]
        if (q[1] > cells.top + step) break
        const m = cellNumber(Math.floor(q[0] / step), Math.floor(q[1] / step), Math.floor(q[2] / step))
        if (occupied.has(m)) ray.push(m)
      }
      rays.set(n, ray)
    }
    for (const m of ray) if (reached(m)) extra.add(m)
  }
  const out = new Set(direct)
  for (const n of extra) {
    const [x, y, z] = cellCoords(n)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const m = cellNumber(x + dx, y + dy, z + dz)
      if (occupied.has(m)) out.add(m)
    }
  }
  if (!wide) return Float64Array.from([...out].sort((a, b) => a - b))
  // (e) every cell holding a body that casts whose shadow line passes through a frustum or its mirror
  if (wide.casting) {
    const { casting } = wide
    const cast = new Uint8Array(casting.leaves.length)
    const swept = { full: new Int32Array(casting.nodes.min.length), now: 1 }
    for (const planes of views) sweptCull(casting, planes, sun, wide.bottom, SHADOW_MARGIN_M, (a, b) => cast.fill(1, a, b), swept)
    for (let i = 0; i < casting.leaves.length; i++) if (cast[i]) out.add(casting.leaves[i])
  }
  // (f) the lights no cell's hash reads: a hidden shadowing light where a cell that reads it is seen
  for (const h of wide.hidden) if (h.receivers.some((n) => out.has(n))) for (const n of h.casters) out.add(n)
  const lights = []
  for (const l of wide.lights) {
    if (l.box && !views.some((planes) => boxMeets(planes, l.box[0], l.box[1]))) continue
    lights.push(l.line)
    for (const n of l.casters ?? []) out.add(n)
  }
  return Object.assign(Float64Array.from([...out].sort((a, b) => a - b)), { definition: SEEN_DEFINITION, lights })
}

/** Every occupied cell of the world, one array per index and reason, shared by every frame it holds. */
export function wholeWorld(index, why) {
  index.whole ??= new Map()
  if (!index.whole.has(why)) index.whole.set(why, Object.assign(Float64Array.from([...index.occupied].sort((a, b) => a - b)), { definition: SEEN_DEFINITION, whole: why, lights: null }))
  return index.whole.get(why)
}

/** Whether any leaf of an index stands inside the planes. */
function meets(index, planes) {
  let hit = false
  cull(index, planes, (a, b) => { if (b > a) hit = true }, { full: new Int32Array(index.nodes.min.length), now: 1 })
  return hit
}
/** Whether a world box meets the planes, by the box's corners against each (conservative). */
function boxMeets(planes, lo, hi) {
  for (const [nx, ny, nz, d] of planes) if (nx * (nx > 0 ? hi[0] : lo[0]) + ny * (ny > 0 ? hi[1] : lo[1]) + nz * (nz > 0 ? hi[2] : lo[2]) + d < 0) return false
  return true
}

/** THE SHADOW LINES THROUGH A FRUSTUM: mark every leaf whose box, carried away
    from the sun down to the height `bottom`, meets the planes widened by
    `margin`. A node whose carried box is outside one plane is skipped, one
    wholly inside every plane is taken at once; a leaf is tested against all
    planes together, its box's centre carried down a line and each plane moved
    out by the box's half extent along its normal. */
function sweptCull(index, planes, sun, bottom, margin, mark, stamp) {
  const { nodes } = index
  const along = planes.map(([nx, ny, nz]) => nx * sun[0] + ny * sun[1] + nz * sun[2])
  const half = index.cells.cell / 2
  const visit = (id) => {
    if (stamp.full[id] === stamp.now) return
    const lo = nodes.min[id], hi = nodes.max[id]
    const depth = Math.max(0, (hi[1] - bottom) / sun[1])
    let inside = true
    for (let i = 0; i < planes.length; i++) {
      const [nx, ny, nz, d] = planes[i], ns = along[i]
      const most = nx * (nx > 0 ? hi[0] : lo[0]) + ny * (ny > 0 ? hi[1] : lo[1]) + nz * (nz > 0 ? hi[2] : lo[2]) + d + (ns < 0 ? -depth * ns : 0)
      if (most + margin < 0) return
      const least = nx * (nx > 0 ? lo[0] : hi[0]) + ny * (ny > 0 ? lo[1] : hi[1]) + nz * (nz > 0 ? lo[2] : hi[2]) + d + (ns > 0 ? -depth * ns : 0)
      if (least + margin < 0) inside = false
    }
    if (!inside && !nodes.child[id].length) {
      // the leaf: one line from the box's centre, t along it away from the sun, held by every plane at once
      let t0 = 0, t1 = depth
      for (let i = 0; i < planes.length && t0 <= t1; i++) {
        const [nx, ny, nz, d] = planes[i], ns = along[i]
        const at = nx * (lo[0] + half) + ny * (lo[1] + half) + nz * (lo[2] + half) + d + half * (Math.abs(nx) + Math.abs(ny) + Math.abs(nz)) + margin
        if (Math.abs(ns) < 1e-12) { if (at < 0) return; continue }
        if (ns > 0) t1 = Math.min(t1, at / ns)
        else t0 = Math.max(t0, at / ns)
      }
      if (t0 > t1) return
    }
    if (inside || !nodes.child[id].length) {
      stamp.full[id] = stamp.now
      mark(nodes.start[id], nodes.end[id])
      return
    }
    for (const c of nodes.child[id]) visit(c)
  }
  visit(0)
}

/**
 * WHAT THE WIDE STAND-IN READS OF A WORLD beside its cells, once per world:
 *   world      mountWorld()
 *   lighting   lightingAt() of the same tree (lit.mjs)
 * Returns { lit, whole, bottom, hidden, lights, casting, key }: `key` names all of it,
 * so a seen set held for one world is never handed to another.
 */
export function wideSetting(world, lighting) {
  const { cells } = world
  const lit = lighting.lit?.size ? buildIndex({ hashes: new Map([...lighting.lit].map((n) => [n, 1])), cell: cells.cell }) : null
  let low = Infinity
  for (const n of [...cells.hashes.keys(), ...(lighting.lit ?? [])]) low = Math.min(low, cellCoords(n)[1])
  // a receiver below the lowest cell of the world or of its lit rooms stands on nothing
  const bottom = (low - 1) * cells.cell
  const castOn = (mask) => [...(cells.castMask ?? new Map())].filter(([, m]) => (m & mask) !== 0).map(([n]) => n).sort((a, b) => a - b)
  // a world that names no shadow flags casts from every occupied cell
  const casters = cells.castMask ? castOn(~0) : [...cells.hashes.keys()]
  const casting = casters.length ? buildIndex({ hashes: new Map(casters.map((n) => [n, 1])), cell: cells.cell }) : null
  const hidden = (world.hidden ?? []).map((h) => ({ line: h.line, receivers: h.receivers, casters: castOn(h.mask) }))
  const lights = (world.lights ?? []).map((l) => ({ line: l.line, box: l.box, casters: l.mask === null ? [] : castOn(l.mask) }))
  const whole = lighting.unpinned?.length ? `a module lights the scene the stand-in does not place: ${lighting.unpinned.join(', ')}`
    : world.sun[1] < .02 ? 'the sun stands at the horizon' : null
  const key = JSON.stringify({ lit: [...(lighting.lit ?? [])].sort((a, b) => a - b), whole, bottom, hidden, lights, casters })
  return { lit, whole, bottom, hidden, lights, casting, key }
}

/**
 * THE NARROWED TEST: which of the cells `moved` a rendered picture can show,
 * read off the cells its own frames recorded (`export.mjs`, the solid pass,
 * dilated by one cell) in place of the frustum, with the stand-in's other two
 * parts taken from them as `seenSet` takes them from the frustum:
 *   (b) the casters toward the sun of every recorded surface inside the reach,
 *   (c) the mirrored frustum of every frame, when a recorded cell reflects;
 * both dilated by one cell. A surface is a cell a ray ended on a body in
 * (`record.struck`, format 2), else a cell occupied in either tree. And one
 * part the stand-in has not:
 *   (d) `lit`, the cells of the rooms whose surfaces read a capture of the
 *       scene (a cube probe, the hall floor's mirror) or a room light's
 *       shadow: a record that enters one reaches every moved cell.
 * `shadows` false leaves (b) out, for what casts no shadow (a plate);
 * `farBox` ([lo, hi], world) the far cascade's own box, a reach of (b) beside the eyes'.
 *   record     Set of the recorded cell numbers
 *   moved      the cell numbers whose hash differs between the render's tree and now
 *   samples    the track's frames (a still: its one pose)
 *   occupied   Set: the cells occupied in either tree
 *   index      buildIndex() over those cells, for the mirrored frustum
 *   aspect, sun, mirror (the reflecting cells of either tree), mirrorLevel, top (the higher scene top), cell
 * Returns the moved cells the picture can show, each with the part that reaches it.
 */
export function narrowedHits(record, moved, samples, { occupied, index, aspect, sun, mirror = [], mirrorLevel, top, cell, lit = null, shadows = true, farBox = null }) {
  const hits = new Map()
  const hit = (n, why) => { if (!hits.has(n)) hits.set(n, why) }
  for (const n of moved) if (record.has(n)) hit(n, 'recorded')
  // (d) a room whose surfaces read a capture of the scene or a room light's shadow: what it shows reaches anything moved
  if (lit && [...lit].some((n) => record.has(n))) for (const n of moved) hit(n, 'lit room')
  if (hits.size === moved.length) return [...hits].map(([n, why]) => ({ cell: n, why }))
  // each moved cell and its neighbours: a part's cell within one of a moved cell reaches it
  const near = new Map()
  for (const n of moved) {
    const [x, y, z] = cellCoords(n)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const m = cellNumber(x + dx, y + dy, z + dz)
      if (!near.has(m)) near.set(m, [])
      near.get(m).push(n)
    }
  }
  const reach = (m, why) => { for (const n of near.get(m) ?? []) hit(n, why) }
  // (c) the mirrored frustum, its surfaces taken as receivers too; a record
  // of format 2 names the cells its rays ended on a body in, else the occupied ones stand in
  const sources = record.struck ? [...record.struck] : [...record].filter((n) => occupied.has(n))
  if (mirror.length && mirror.some((n) => record.has(n))) {
    const camera = new THREE.PerspectiveCamera()
    const seen = new Uint8Array(index.leaves.length)
    const stamp = { full: new Int32Array(index.nodes.min.length), now: 1 }
    for (const s of samples) cull(index, mirrorPlanes(planesOf(cameraOf(camera, s, aspect)), mirrorLevel), (a, b) => seen.fill(1, a, b), stamp)
    for (let i = 0; i < index.leaves.length; i++) if (seen[i]) { reach(index.leaves[i], 'mirror'); sources.push(index.leaves[i]) }
  }
  if (!shadows) return [...hits].map(([n, why]) => ({ cell: n, why }))
  // (b) the casters toward the sun, inside the far cascade's reach about the eyes
  const lo = [0, 1, 2].map((k) => Math.min(...samples.map((s) => s[k])) - SHADOW_REACH_M)
  const hi = [0, 1, 2].map((k) => Math.max(...samples.map((s) => s[k])) + SHADOW_REACH_M)
  // the far cascade stands fixed over the site, whatever the eye: a receiver inside it takes its shadows at any distance
  const inBox = (c, a, b) => c.every((v, k) => (v + 1) * cell >= a[k] && v * cell <= b[k])
  const reached = (n) => { const c = cellCoords(n); return inBox(c, lo, hi) || (farBox !== null && inBox(c, farBox[0], farBox[1])) }
  // a ray passes within a cell of a moved cell only if its source stands below that cell along the sun
  const targets = moved.map((n) => cellCoords(n).map((v) => (v + .5) * cell))
  const slack = 4 * cell
  const aimed = (p) => targets.some((q) => {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
    const t = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]
    if (t < -slack) return false
    const off = [d[0] - t * sun[0], d[1] - t * sun[1], d[2] - t * sun[2]]
    return Math.hypot(off[0], off[1], off[2]) <= slack
  })
  for (const n of new Set(sources)) {
    if (!reached(n)) continue
    const [cx, cy, cz] = cellCoords(n)
    const p = [(cx + .5) * cell, (cy + .5) * cell, (cz + .5) * cell]
    if (!aimed(p)) continue
    for (let k = 1; k < 4096; k++) {
      const q = [p[0] + sun[0] * k * cell, p[1] + sun[1] * k * cell, p[2] + sun[2] * k * cell]
      if (q[1] > top + cell) break
      const m = cellNumber(Math.floor(q[0] / cell), Math.floor(q[1] / cell), Math.floor(q[2] / cell))
      if (occupied.has(m) && reached(m)) reach(m, 'shadow ray')
    }
  }
  return [...hits].map(([n, why]) => ({ cell: n, why }))
}
