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
/** the far bank's form at (|x|, z), and what it is made of there: the share of an earth face, of gravel and of turf */
function farForm(ax: number, z: number, base: number): Form {
  const n = (s: number, k: number): number => wander(z * s, k)
  const forms: [number, Form][] = []
  // up the stream behind the bridge, between the crown joist's props: a slumped shoulder
  forms.push([window(z, -6.45, -5.6, .3), { y: slump(ax, 3.72 + .05 * n(1.3, 11), .05), face: ease(3.45, 3.62, ax) * (1 - ease(3.7, 3.8, ax)), gravel: 0, turf: ease(3.75, 3.85, ax) }])
  // under the far seat, between the strips its rods slide down: the gravel the builders landed on
  forms.push([window(z, .25, 1.3, .3), { y: beach(ax, 3.45), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.4, 3.55, ax) }])
  // down the stream toward the visitor: a cut bank, a slumped shoulder, a shelf of turf, a gravel lip
  const f = 3.02 + .045 * n(.9, 21) + .02 * n(2.7, 22), h = .38 + .05 * n(1.1, 23)
  forms.push([window(z, 2.85, 5.0, .45), { y: cutBank(ax, f, h), face: ease(f - .11, f - .06, ax) * (1 - ease(f - .01, f + .01, ax)), gravel: 0, turf: ease(f - .005, f + .05, ax) }])
  const s = 3.78 + .06 * n(.8, 31)
  forms.push([window(z, 5.4, 7.4, .5), { y: slump(ax, s, .05 + .025 * n(1.6, 32)), face: ease(s - .09, s - .06, ax) * (1 - ease(s - .01, s + .01, ax)), gravel: 0, turf: ease(s - .01, s + .06, ax) }])
  const l = 3.6 + .05 * n(.9, 41), t = -.22 + .03 * n(1.2, 42)
  forms.push([window(z, 7.8, 9.3, .45), { y: shelf(ax, l, t), face: ease(2.94, 3.02, ax) * (1 - ease(3.08, 3.13, ax)), gravel: 0, turf: ease(3.12, 3.2, ax) }])
  forms.push([window(z, 9.75, 12.5, .45), { y: beach(ax, 3.55 + .05 * n(1, 51)), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.5, 3.65, ax) }])
  const form = blend(base, forms)
  // between the forms the toe is cut back wherever nothing lies on the slope, its face's top wandering along the stream
  const shown = Math.min(1, forms.reduce((w, [k]) => w + Math.max(0, k), 0))
  const toe = Math.max(window(z, -10.5, -8.6, .3), window(z, -6.4, -2.1, .3), window(z, -1.38, 1.38, .2), window(z, 2.1, 12.5, .3)) * (1 - shown)
  if (toe <= 0) return form
  const tf = 3.08 + .09 * n(.45, 24) + .04 * n(1.6, 25), foot = tf - .07
  const cut = Math.min(form.y, toeCut(ax, tf, groundY(tf, z)))
  const face = ease(foot - .03, foot + .01, ax) * (1 - ease(tf - .005, tf + .005, ax))
  return { y: lerp(form.y, cut, toe), face: lerp(form.face, face, toe), gravel: form.gravel * (1 - toe), turf: lerp(form.turf, ease(tf - .005, tf + .05, ax), toe) }
}
/** the near bank, which every eye sees from behind its lip: its lip line and its top change, its face more quietly */
function nearForm(ax: number, z: number, base: number): Form {
  const n = (s: number, k: number): number => wander(z * s, k)
  const forms: [number, Form][] = []
  forms.push([window(z, -6.4, -4.4, .35), { y: beach(ax, 3.55 + .04 * n(1, 61)), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.5, 3.65, ax) }])
  // by the bridge a lower lip, where the builders worked from it
  forms.push([window(z, -2.6, 2.4, .3), { y: beach(ax, 3.45 + .04 * n(2, 62)), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.4, 3.55, ax) }])
  forms.push([window(z, 2.8, 4.6, .4), { y: beach(ax, 3.6), face: 0, gravel: ease(2.62, 2.72, ax) * (1 - ease(3.0, 3.1, ax)), turf: ease(3.55, 3.7, ax) }])
  const f = 3.0 + .04 * n(1, 71)
  forms.push([window(z, 4.8, 6.6, .4), { y: cutBank(ax, f, .3), face: ease(f - .11, f - .06, ax) * (1 - ease(f - .01, f + .01, ax)), gravel: 0, turf: ease(f - .005, f + .05, ax) }])
  const s = 3.7 + .05 * n(.9, 72)
  forms.push([window(z, 6.9, 9.0, .45), { y: slump(ax, s, .04), face: ease(s - .09, s - .06, ax) * (1 - ease(s - .01, s + .01, ax)), gravel: 0, turf: ease(s - .01, s + .06, ax) }])
  return blend(base, forms)
}
/** the forms laid over the plan's ground by their windows' shares (the plan's own where none stands) */
function blend(base: number, forms: [number, Form][]): Form {
  let w = 0, y = 0, face = 0, gravel = 0, turf = 0
  for (const [k, f] of forms) if (k > 0) { w += k; y += k * f.y; face += k * f.face; gravel += k * f.gravel; turf += k * f.turf }
  if (w <= 0) return { y: base, face: 0, gravel: 0, turf: 0 }
  const s = Math.min(1, w)
  return { y: lerp(base, y / w, s), face: face / w * s, gravel: gravel / w * s, turf: turf / w * s }
}

/** the bank's height at (x, z), metres: the plan's ground where the build touches it, its own forms elsewhere */
export function bankHeight(x: number, z: number): number {
  return bankAt(x, z).y
}
function bankAt(x: number, z: number): Form {
  const base = groundY(x, z), ax = Math.abs(x), side = x > 0 ? 1 : -1
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
export function bankGeometry(): BufferGeometry {
  const X = BANK.halfX, Z0 = BANK.zMin, Z1 = BANK.zMax
  const xs: number[] = []
  for (let x = -X; x < X - 1e-6;) {
    xs.push(x)
    const ax = Math.abs(x)
    x += x > 0 ? (ax > 4.8 ? .3 : ax > 4.0 ? .1 : ax > 3.2 ? .04 : ax > 2.85 ? .02 : ax > 2.45 ? .04 : ax > 2.0 ? .1 : .25)
      : (ax > 4.8 ? .3 : ax > 4.0 ? .1 : ax > 2.45 ? .06 : ax > 2.0 ? .1 : .25)
  }
  xs.push(X)
  const zs: number[] = []
  for (let z = Z0; z < Z1 - 1e-6;) { zs.push(z); z += z > -7 && z < 11.5 ? .1 : .25 }
  zs.push(Z1)
  const position: number[] = [], normal: number[] = [], uvs: number[] = [], form: number[] = [], index: number[] = []
  const vertex = (p: [number, number, number], n: [number, number, number], u: number, v: number, f: [number, number, number, number]): number => {
    position.push(...p); normal.push(...n); uvs.push(u, v); form.push(...f)
    return position.length / 3 - 1
  }
  const h = .008
  const normalAt = (x: number, z: number): [number, number, number] => {
    const nx = bankHeight(x - h, z) - bankHeight(x + h, z), nz = bankHeight(x, z - h) - bankHeight(x, z + h), l = Math.hypot(nx, 2 * h, nz)
    return [nx / l, 2 * h / l, nz / l]
  }
  const nx = xs.length - 1, nz = zs.length - 1
  for (const z of zs) {
    // the length along the cross-section from the stream's middle, either way, for the UV across
    const ys = xs.map(x => bankAt(x, z))
    const run = new Array<number>(xs.length).fill(0)
    const mid = xs.findIndex(x => x >= 0)
    for (let i = mid + 1; i < xs.length; i++) run[i] = run[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]!.y - ys[i - 1]!.y)
    for (let i = mid - 1; i >= 0; i--) run[i] = run[i + 1]! - Math.hypot(xs[i + 1]! - xs[i]!, ys[i + 1]!.y - ys[i]!.y)
    xs.forEach((x, i) => { const b = ys[i]!; vertex([x, b.y, z], normalAt(x, z), run[i]! + xs[mid]!, z, [b.face, b.gravel, 0, b.turf]) })
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
  face(xs.map(x => [x, bankHeight(x, Z1), Z1]), [0, 0, 1], p => p[0], false)
  face(xs.map(x => [x, bankHeight(x, Z0), Z0]), [0, 0, -1], p => p[0], true)
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

