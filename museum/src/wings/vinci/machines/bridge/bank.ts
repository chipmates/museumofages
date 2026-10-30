/** THE BRIDGE'S BANKS, a ground of their own. Where the build's poles, props,
 * seats and logs touch the bank the ground is the plan's own (`groundY`), so
 * every pole lies, rolls and stands where it did. Away from them each bank
 * changes its cross-section along the stream as a worked bank does: a cut
 * face where the water has undercut it, a shoulder slumped into a lobe, a
 * shelf of turf, a gravel lip at the waterline, stones at the foot of a
 * face. The forms and where they stand are ours; they are lit by the scene's
 * own lamps, so the light breaks with them. Its earth is `bank-surface.ts`.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import { BANK, groundY, hash } from './plan'

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const ease = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** a smooth wander in -1..1 along one coordinate, its own for each seed */
function wander(s: number, seed: number): number {
  const i = Math.floor(s), f = s - i, u = f * f * (3 - 2 * f)
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1
}
/** a window along the stream: 1 inside a to b, falling off over `soft` metres either side */
const window = (z: number, a: number, b: number, soft = .45): number => ease(a - soft, a + soft, z) * (1 - ease(b - soft, b + soft, z))

/** WHERE THE BUILD TOUCHES THE BANK, read off its whole run (the bridge's motion over its period and the groundwork):
 * each bank's (+1 far, -1 near) boxes, |x| from and to, z from and to. In a `keep` box the ground stays the plan's: the
 * rolled joists' corridors up the stream, the crown joist's props, the seats with their stakes, and the strips where a
 * rod lies on the slope as it slides off the bank. In a `dig` box something passes a few centimetres over the slope (a
 * kit's rods, a rod held over it), so the ground may only sink there, never rise */
const KEPT: readonly (readonly [number, number, number, number, number, 'keep' | 'dig'])[] = [
  [1, 2.2, 9, -12.5, -10.75, 'keep'], [1, 3.3, 9, -10.75, -8.45, 'keep'], [1, 2.2, 9, -8.45, -6.6, 'keep'],
  [1, 3.3, 9, -5.4, -4.6, 'keep'], [1, 3.3, 9, -3.85, -3.15, 'keep'],
  [1, 2.7, 3.3, -5.4, -4.6, 'dig'], [1, 2.7, 3.3, -3.85, -3.15, 'dig'],
  [1, 3.6, 9, -2.75, 2.35, 'keep'], [1, 2.45, 9, -1.84, -1.6, 'keep'], [1, 2.45, 9, 1.6, 1.84, 'keep'],
  [1, 2.45, 9, -1.56, -1.06, 'dig'], [1, 2.45, 9, 1.06, 1.56, 'dig'],
  [-1, 2.2, 9, -12.5, -6.6, 'keep'], [-1, 3.6, 9, -2.75, 2.35, 'keep'],
  [-1, 2.45, 9, -1.32, -1.08, 'keep'], [-1, 2.45, 9, -.52, -.28, 'keep'], [-1, 2.45, 9, .28, .52, 'keep'], [-1, 2.45, 9, 1.08, 1.32, 'keep'],
  [-1, 2.45, 9, -1.84, -1.34, 'dig'], [-1, 2.45, 9, 1.34, 1.84, 'dig'],
]
const EDGE = .12
/** how much of the plan's ground a point keeps, and how much of any rise it must give up */
function kept(side: number, ax: number, z: number): { keep: number; dig: number } {
  let keep = 0, dig = 0
  for (const [s, a0, a1, z0, z1, kind] of KEPT) {
    if (s !== side) continue
    const inX = ease(a0 - EDGE, a0, ax) * (1 - ease(a1, a1 + EDGE, ax)), inZ = ease(z0 - EDGE, z0, z) * (1 - ease(z1, z1 + EDGE, z))
    if (kind === 'keep') keep = Math.max(keep, inX * inZ); else dig = Math.max(dig, inX * inZ)
  }
  // the bed and the toe under the water, where the props lie and slide, stay the plan's on both banks
  return { keep: Math.max(keep, 1 - ease(2.4, 2.62, ax)), dig }
}

/** THE FORMS, each a cross-section (|x| to height) a bank takes somewhere along its length */
/** a cut bank: the turf's edge at `f`, a face `h` deep down to the water, its fallen earth at its foot */
function cutBank(ax: number, f: number, h: number): number {
  if (ax >= f) return -.035 * (1 - ease(f, f + .3, ax))
  if (ax >= f - .07) return lerp(-h, -.035, Math.pow((ax - (f - .07)) / .07, .55))
  return -h - (f - .07 - ax) * .85
}
/** a slumped shoulder: a scarp at `s` where the turf broke away, the slumped earth below it in a lobe pushed toward the
 * water */
function slump(ax: number, s: number, hump: number): number {
  if (ax >= s) return -.01 * (1 - ease(s, s + .25, ax))
  if (ax >= s - .07) return lerp(-.17, -.01, ease(s - .07, s, ax))
  const top = s - .07, front = 3.02
  if (ax >= front) { const k = (top - ax) / (top - front); return -.17 - .15 * k + hump * Math.sin(Math.PI * k) }
  return -.32 - (front - ax) * .72
}
/** a shelf of turf: the lip at `l`, a short drop to a tread at `h`, a riser down to the water */
function shelf(ax: number, l: number, h: number): number {
  if (ax >= l) return -.02 * (1 - ease(l, l + .25, ax))
  if (ax >= l - .1) return lerp(h, -.02, ease(l - .1, l, ax))
  if (ax >= 3.12) return h - .05 * (l - .1 - ax) / Math.max(.05, l - .1 - 3.12)
  if (ax >= 2.9) return lerp(-.5, h - .05, ease(2.9, 3.12, ax))
  return -.5 - (2.9 - ax) * .8
}
/** a gravel lip: a gentle bank down to a narrow bar of gravel just above the water */
function beach(ax: number, top: number): number {
  if (ax >= top) return -.03 * (1 - ease(top, top + .3, ax))
  if (ax >= 3.05) return -.03 - .27 * ease(top, 3.05, ax)
  if (ax >= 2.7) return -.3 - .12 * (3.05 - ax) / .35
  return -.42 - (2.7 - ax) * .9
}

interface Form { y: number; face: number; gravel: number; turf: number }
/** the toe cut back by the water: the plan's own slope above |x| `f`, under it a face, steepest at its top, down to the
 * water and a little under it. It only ever takes ground away */
function toeCut(ax: number, f: number, top: number): number {
  if (ax >= f) return Infinity
  const foot = f - .07
  if (ax >= foot) return lerp(BANK.water - .05, top, Math.sqrt((ax - foot) / .07))
  return BANK.water - .05 - (foot - ax) * .9
}
/** one form standing along the stream: its share at this row and its cross-section there */
type Shape = [number, (ax: number) => Form]
/** a row's forms (all that depend on z alone), kept for the few rows a grid and its normals ask for in turn */
interface Row { forms: Shape[]; shown: number; toe: number; tf: number; top: number }
const rows = new Map<number, Row>()
function rowAt(side: number, z: number): Row {
  const key = side * 1e4 + z
  let row = rows.get(key)
  if (!row) {
    if (rows.size > 64) rows.clear()
    row = side > 0 ? farRow(z) : nearRow(z)
    rows.set(key, row)
  }
  return row
}
/** the far bank's forms at z, and what each is made of: the share of an earth face, of gravel and of turf */
function farRow(z: number): Row {
  const n = (s: number, k: number): number => wander(z * s, k)
  const forms: Shape[] = []
  const add = (k: number, shape: () => (ax: number) => Form): void => { if (k > 0) forms.push([k, shape()]) }
  // up the stream behind the bridge, between the crown joist's props: a slumped shoulder
  add(window(z, -6.45, -5.6, .3), () => { const s = 3.72 + .05 * n(1.3, 11); return ax => ({ y: slump(ax, s, .05), face: ease(3.45, 3.62, ax) * (1 - ease(3.7, 3.8, ax)), gravel: 0, turf: ease(3.75, 3.85, ax) }) })
  // under the far seat, between the strips its rods slide down: the gravel the builders landed on
  add(window(z, .25, 1.3, .3), () => ax => ({ y: beach(ax, 3.45), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.4, 3.55, ax) }))
  // down the stream toward the visitor: a cut bank, a slumped shoulder, a shelf of turf, a gravel lip
  add(window(z, 2.85, 5.0, .45), () => {
    const f = 3.02 + .045 * n(.9, 21) + .02 * n(2.7, 22), h = .38 + .05 * n(1.1, 23)
    return ax => ({ y: cutBank(ax, f, h), face: ease(f - .11, f - .06, ax) * (1 - ease(f - .01, f + .01, ax)), gravel: 0, turf: ease(f - .005, f + .05, ax) })
  })
  add(window(z, 5.4, 7.4, .5), () => {
    const s = 3.78 + .06 * n(.8, 31), hump = .05 + .025 * n(1.6, 32)
    return ax => ({ y: slump(ax, s, hump), face: ease(s - .09, s - .06, ax) * (1 - ease(s - .01, s + .01, ax)), gravel: 0, turf: ease(s - .01, s + .06, ax) })
  })
  add(window(z, 7.8, 9.3, .45), () => {
    const l = 3.6 + .05 * n(.9, 41), t = -.22 + .03 * n(1.2, 42)
    return ax => ({ y: shelf(ax, l, t), face: ease(2.94, 3.02, ax) * (1 - ease(3.08, 3.13, ax)), gravel: 0, turf: ease(3.12, 3.2, ax) })
  })
  add(window(z, 9.75, 12.5, .45), () => { const top = 3.55 + .05 * n(1, 51); return ax => ({ y: beach(ax, top), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.5, 3.65, ax) }) })
  // between the forms the toe is cut back wherever nothing lies on the slope, its face's top wandering along the stream
  const shown = Math.min(1, forms.reduce((w, [k]) => w + k, 0))
  const toe = Math.max(window(z, -10.5, -8.6, .3), window(z, -6.4, -2.1, .3), window(z, -1.38, 1.38, .2), window(z, 2.1, 12.5, .3)) * (1 - shown)
  const tf = toe > 0 ? 3.08 + .09 * n(.45, 24) + .04 * n(1.6, 25) : 0
  return { forms, shown, toe, tf, top: toe > 0 ? groundY(tf, z) : 0 }
}
function farForm(ax: number, z: number, base: number): Form {
  const row = rowAt(1, z)
  const form = blend(base, row.forms, ax)
  if (row.toe <= 0) return form
  const { toe, tf } = row, foot = tf - .07
  const cut = Math.min(form.y, toeCut(ax, tf, row.top))
  const face = ease(foot - .03, foot + .01, ax) * (1 - ease(tf - .012, tf + .012, ax))
  return { y: lerp(form.y, cut, toe), face: lerp(form.face, face, toe), gravel: form.gravel * (1 - toe), turf: lerp(form.turf, ease(tf - .005, tf + .05, ax), toe) }
}
/** the near bank, which every eye sees from behind its lip: its lip line and its top change, its face more quietly */
function nearRow(z: number): Row {
  const n = (s: number, k: number): number => wander(z * s, k)
  const forms: Shape[] = []
  const add = (k: number, shape: () => (ax: number) => Form): void => { if (k > 0) forms.push([k, shape()]) }
  const beachOf = (top: number) => (ax: number): Form => ({ y: beach(ax, top), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(top - .05, top + .1, ax) })
  add(window(z, -6.4, -4.4, .35), () => beachOf(3.55 + .04 * n(1, 61)))
  // by the bridge a lower lip, where the builders worked from it
  add(window(z, -2.6, 2.4, .3), () => beachOf(3.45 + .04 * n(2, 62)))
  add(window(z, 2.8, 4.6, .4), () => beachOf(3.6))
  add(window(z, 4.8, 6.6, .4), () => { const f = 3.0 + .04 * n(1, 71); return ax => ({ y: cutBank(ax, f, .3), face: ease(f - .11, f - .06, ax) * (1 - ease(f - .01, f + .01, ax)), gravel: 0, turf: ease(f - .005, f + .05, ax) }) })
  add(window(z, 6.9, 9.0, .45), () => { const s = 3.7 + .05 * n(.9, 72); return ax => ({ y: slump(ax, s, .04), face: ease(s - .09, s - .06, ax) * (1 - ease(s - .01, s + .01, ax)), gravel: 0, turf: ease(s - .01, s + .06, ax) }) })
  return { forms, shown: 0, toe: 0, tf: 0, top: 0 }
}
function nearForm(ax: number, z: number, base: number): Form {
  return blend(base, rowAt(-1, z).forms, ax)
}
/** the forms laid over the plan's ground by their windows' shares (the plan's own where none stands) */
function blend(base: number, forms: Shape[], ax: number): Form {
  if (!forms.length) return { y: base, face: 0, gravel: 0, turf: 0 }
  let w = 0, y = 0, face = 0, gravel = 0, turf = 0
  for (const [k, shape] of forms) { const f = shape(ax); w += k; y += k * f.y; face += k * f.face; gravel += k * f.gravel; turf += k * f.turf }
  const s = Math.min(1, w)
  return { y: lerp(base, y / w, s), face: face / w * s, gravel: gravel / w * s, turf: turf / w * s }
}

/** the bank's height at (x, z), metres: the plan's ground where the build touches it, its own forms elsewhere */
export function bankHeight(x: number, z: number): number {
  return bankAt(x, z).y
}
function bankAt(x: number, z: number): Form {
  const ax = Math.abs(x), side = x > 0 ? 1 : -1
  const base = groundY(x, z)
  // past the lip's back and beyond the bank's ends the level ground is the plan's: the forms stay on the channel's sides
  const reach = 1 - ease(4.4, 4.7, ax)
  const along = 1 - ease(11.2, 12.2, z)
  const { keep, dig } = kept(side, ax, z)
  const free = (1 - keep) * reach * along
  if (free <= 0) return { y: base, face: 0, gravel: 0, turf: 0 }
  const form = side > 0 ? farForm(ax, z, base) : nearForm(ax, z, base)
  const y = form.y > base ? lerp(form.y, base, dig) : form.y
  return { y: lerp(base, y, free), face: form.face * free, gravel: form.gravel * free, turf: form.turf * free }
}

/** THE STONES at the foot of a face and along the gravel: where each lies (x, z), its radius and its seed; only where
 * nothing of the build passes */
function stones(): { x: number; z: number; r: number; seed: number }[] {
  const out: { x: number; z: number; r: number; seed: number }[] = []
  const runs: [number, number, number, number][] = [
    // side, z from, z to, how many
    [1, 2.9, 5.0, 8], [1, 5.4, 7.3, 3], [1, 7.8, 9.2, 3], [1, 9.6, 11.0, 4], [1, -6.35, -5.7, 2], [1, -4.4, -4.1, 1],
    [-1, 4.9, 6.5, 4],
  ]
  for (const [side, z0, z1, count] of runs) for (let i = 0; i < count; i++) {
    const seed = hash(side, z0, i, 81)
    const z = z0 + (z1 - z0) * (i + .2 + .6 * hash(seed, 82)) / count
    // at the waterline, a little either side of it, most just out of it
    let ax = 2.7
    for (let a = 2.55; a < 3.2; a += .01) if (bankHeight(side * a, z) > BANK.water + .02) { ax = a; break }
    ax += (hash(seed, 83) - .65) * .14
    out.push({ x: side * ax, z, r: .035 + .055 * hash(seed, 84) ** 1.6, seed })
  }
  return out
}

/** The banks as one ground: the level banks and the channel on top on an even grid, finest where the far bank's forms
 * stand; the section through the earth on the four sides; the stones. UVs in metres: across, the length along the
 * cross-section (so a face is not drawn stretched); along, the stream's z. `aBank`: the share of an earth face, of
 * gravel, of a stone and of turf. */
/** one row's columns across a bank's slope, |x| from `a` to `b`: `count` of them, closest where the cross-section
 * bends most, so a crease (a face's top, a scarp, a shelf's lip) lies on columns in every row and does not step from
 * row to row as it wanders along the stream */
function columns(side: number, z: number, a: number, b: number, count: number): number[] {
  const step = .006, n = Math.round((b - a) / step)
  const y = new Float64Array(n + 1)
  for (let i = 0; i <= n; i++) y[i] = bankHeight(side * (a + i * step), z)
  // the angle the section turns at each sample, spread over two centimetres either side
  const turn = new Float64Array(n + 1)
  for (let i = 1; i < n; i++) turn[i] = Math.abs(Math.atan((y[i + 1]! - y[i]!) / step) - Math.atan((y[i]! - y[i - 1]!) / step))
  const spread = new Float64Array(n + 1)
  let total = 0
  for (let i = 0; i <= n; i++) { let t = 0; for (let k = -3; k <= 3; k++) t += turn[Math.min(n, Math.max(0, i + k))]! * (4 - Math.abs(k)); spread[i] = t / 16; total += spread[i]! }
  // half the columns spaced evenly, half by the bends (fewer by the bends where the section hardly bends)
  const bend = .6 * Math.min(1, total / 1.2)
  const weight = (i: number): number => (1 - bend) / (n + 1) + (total > 0 ? bend * spread[i]! / total : 0)
  const out: number[] = [], cum = [0]
  for (let i = 0; i <= n; i++) cum.push(cum[i]! + weight(i))
  const all = cum[n + 1]!
  let i = 0
  for (let j = 0; j < count; j++) {
    const want = all * j / (count - 1)
    while (i < n && cum[i + 1]! < want) i++
    const f = (want - cum[i]!) / Math.max(1e-12, cum[i + 1]! - cum[i]!)
    out.push(a + Math.min(n, i + f) * step)
  }
  out[0] = a; out[count - 1] = b
  return out
}
/** the slope's band on each side, |x| from and to, and its columns (the far bank, where the forms stand, the finer) */
const BAND: readonly [number, number] = [2.45, 4.0]
const FAR_COLUMNS = 44, NEAR_COLUMNS = 28

export function bankGeometry(): BufferGeometry {
  const X = BANK.halfX, Z0 = BANK.zMin, Z1 = BANK.zMax
  // the even columns off the slopes, either side of each band
  const even = (from: number, to: number): number[] => {
    const out: number[] = []
    for (let x = from; x < to - 1e-6;) { out.push(x); const ax = Math.abs(x); x += ax > 5.95 ? .6 : ax > 4.8 ? .3 : ax > 4.0 - 1e-9 ? .1 : ax > 1.95 ? .1 : .5 }
    return out
  }
  const outer = even(BAND[1], X).concat([X]), inner = even(-BAND[0], BAND[0])
  const rowXs = (z: number): number[] => [
    ...outer.slice(1).reverse().map(x => -x),
    ...columns(-1, z, BAND[0], BAND[1], NEAR_COLUMNS).reverse().map(x => -x),
    ...inner.slice(1),
    ...columns(1, z, BAND[0], BAND[1], FAR_COLUMNS),
    ...outer.slice(1),
  ]
  const zs: number[] = []
  for (let z = Z0; z < Z1 - 1e-6;) { zs.push(z); z += z > -7 && z < 11.5 ? .12 : .25 }
  zs.push(Z1)
  const position: number[] = [], normal: number[] = [], uvs: number[] = [], form: number[] = [], index: number[] = []
  const vertex = (p: [number, number, number], n: [number, number, number], u: number, v: number, f: [number, number, number, number]): number => {
    position.push(...p); normal.push(...n); uvs.push(u, v); form.push(...f)
    return position.length / 3 - 1
  }
  const rows = zs.map(rowXs)
  const nx = rows[0]!.length - 1, nz = zs.length - 1
  zs.forEach((z, j) => {
    const xs = rows[j]!
    // the length along the cross-section from the stream's middle, either way, for the UV across
    const ys = xs.map(x => bankAt(x, z))
    const run = new Array<number>(xs.length).fill(0)
    const mid = xs.findIndex(x => x >= 0)
    for (let i = mid + 1; i < xs.length; i++) run[i] = run[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]!.y - ys[i - 1]!.y)
    for (let i = mid - 1; i >= 0; i--) run[i] = run[i + 1]! - Math.hypot(xs[i + 1]! - xs[i]!, ys[i + 1]!.y - ys[i]!.y)
    xs.forEach((x, i) => { const b = ys[i]!; vertex([x, b.y, z], [0, 1, 0], run[i]! + xs[mid]!, z, [b.face, b.gravel, 0, b.turf]) })
  })
  // the top's normals from its neighbours across and along (the columns crowd where it bends, so they hold its creases)
  const P = (i: number, j: number): number => 3 * (Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i)))
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const a = P(i - 1, j), b = P(i + 1, j), c = P(i, j - 1), d = P(i, j + 1)
    const ux = position[b]! - position[a]!, uy = position[b + 1]! - position[a + 1]!, uz = position[b + 2]! - position[a + 2]!
    const vx = position[d]! - position[c]!, vy = position[d + 1]! - position[c + 1]!, vz = position[d + 2]! - position[c + 2]!
    let n0 = vy * uz - vz * uy, n1 = vz * ux - vx * uz, n2 = vx * uy - vy * ux
    const l = Math.hypot(n0, n1, n2) || 1
    if (n1 < 0) { n0 = -n0; n1 = -n1; n2 = -n2 }
    const k = P(i, j)
    normal[k] = n0 / l; normal[k + 1] = n1 / l; normal[k + 2] = n2 / l
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    index.push(a, c, b, b, c, d)
  }
  const face = (points: [number, number, number][], n: [number, number, number], u: (p: [number, number, number]) => number, flip: boolean): void => {
    const start = position.length / 3
    for (const p of points) {
      vertex(p, n, u(p), p[1], [0, 0, 0, 0])
      vertex([p[0], BANK.bottom, p[2]], n, u(p), BANK.bottom, [0, 0, 0, 0])
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const a = start + 2 * i, b = a + 1, c = a + 2, d = a + 3
      if (flip) index.push(a, c, b, b, c, d); else index.push(a, b, c, b, d, c)
    }
  }
  face(rows[nz]!.map(x => [x, bankHeight(x, Z1), Z1]), [0, 0, 1], p => p[0], false)
  face(rows[0]!.map(x => [x, bankHeight(x, Z0), Z0]), [0, 0, -1], p => p[0], true)
  face(zs.map(z => [X, bankHeight(X, z), z]), [1, 0, 0], p => p[2], true)
  face(zs.map(z => [-X, bankHeight(-X, z), z]), [-1, 0, 0], p => p[2], false)
  // the stones: a rounded lump each, flattened, turned and dented by its seed, sunk past its middle into the ground
  for (const s of stones()) {
    const start = position.length / 3, rings = 5, around = 9
    const flat = .55 + .25 * hash(s.seed, 85), long = 1 + .45 * hash(s.seed, 86), turn = Math.PI * 2 * hash(s.seed, 87)
    const ground = bankHeight(s.x, s.z), cy = ground - s.r * flat * .2
    const at = (i: number, k: number): [number, number, number] => {
      const th = Math.PI * i / rings, ph = Math.PI * 2 * k / around
      const dent = 1 + .12 * (hash(s.seed, i, k % around, 88) - .5)
      const lx = Math.sin(th) * Math.cos(ph) * long * dent, ly = Math.cos(th) * flat * dent, lz = Math.sin(th) * Math.sin(ph) * dent
      const c = Math.cos(turn), sn = Math.sin(turn)
      return [s.x + s.r * (lx * c - lz * sn), cy + s.r * ly, s.z + s.r * (lx * sn + lz * c)]
    }
    for (let i = 0; i <= rings; i++) for (let k = 0; k <= around; k++) {
      const p = at(i, k)
      const th = Math.PI * i / rings, ph = Math.PI * 2 * k / around
      const ln = [Math.sin(th) * Math.cos(ph) / long, Math.cos(th) / flat, Math.sin(th) * Math.sin(ph)]
      const c = Math.cos(turn), sn = Math.sin(turn), wn: [number, number, number] = [ln[0]! * c - ln[2]! * sn, ln[1]!, ln[0]! * sn + ln[2]! * c]
      const l = Math.hypot(...wn)
      vertex(p, [wn[0] / l, wn[1] / l, wn[2] / l], s.x * 3 + k / around * .6, s.z * 3 + i / rings * .4, [0, 0, 1, 0])
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < around; k++) {
      const a = start + i * (around + 1) + k, b = a + 1, c = a + around + 1, d = c + 1
      index.push(a, b, c, b, d, c)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(position, 3))
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setAttribute('aBank', new Float32BufferAttribute(form, 4))
  g.setIndex(index)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  g.name = 'bridge-of-poles:bank'
  return g
}

