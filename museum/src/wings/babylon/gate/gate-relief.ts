/* THE RELIEF ANIMALS, pure: the bull, the mušḫuššu and the lion drawn in code
   as distance fields and rasterized into four maps on the animal's own grid
   (u along it, facing +u; v up from its feet course; metres): the moulded
   height, the colour field, the black glaze thread, and the fine detail
   (curls, scales). Lengths are the design grids of K1918 p. 23 (bull 9, dragon
   10 half bricks); heights 13 courses. Drawn from the excavator's descriptions
   and the grids; nothing traced. No imports, so node mounts it. */

export type AnimalKind = 'bull' | 'dragon' | 'lion'
type Pt = [number, number]

/** colour fields; the shader turns them into glaze colours per scheme */
export const REG = { ground: 0, body: 1, mane: 2, red: 3, eyeWhite: 4, black: 5, stripe: 6, mouth: 7, tooth: 8 } as const

export interface Field {
  kind: AnimalKind
  /** grid length and height (m) and texel size (m) */
  L: number
  H: number
  res: number
  w: number
  h: number
  /** moulded height (m) at each texel, rows from the feet up */
  height: Float32Array
  /** fine detail height (m): curls and scales */
  detail: Float32Array
  region: Uint8Array
  /** the black thread's strength 0..1 */
  thread: Float32Array
  /** features the joints must not cut: [u, v, radius] */
  keep: Array<{ what: string; u: number; v: number; r: number; rv?: number }>
  hMax: number
}

/* ── distance helpers: positive inside, metres ── */
const len = (x: number, y: number): number => Math.hypot(x, y)
function capsule(p: Pt, a: Pt, b: Pt, ra: number, rb: number): number {
  const bx = b[0] - a[0], by = b[1] - a[1], px = p[0] - a[0], py = p[1] - a[1]
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by || 1)))
  return ra + (rb - ra) * t - len(px - bx * t, py - by * t)
}
function ellipse(p: Pt, c: Pt, a: number, b: number, rot = 0): number {
  const cs = Math.cos(-rot), sn = Math.sin(-rot)
  const x = (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, y = (p[0] - c[0]) * sn + (p[1] - c[1]) * cs
  return (1 - len(x / a, y / b)) * Math.min(a, b)
}
function circle(p: Pt, c: Pt, r: number): number {
  return r - len(p[0] - c[0], p[1] - c[1])
}
/** a chain of tapered capsules through points with radii */
function chain(p: Pt, pts: Pt[], rs: number[]): number {
  let d = -1e9
  for (let i = 0; i + 1 < pts.length; i++) d = Math.max(d, capsule(p, pts[i]!, pts[i + 1]!, rs[i]!, rs[i + 1]!))
  return d
}
/** a quadratic curve sampled into a chain, radius tapering from r0 to r1 */
function curve(a: Pt, c: Pt, b: Pt, n = 10): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]])
  }
  return out
}
function stroke(p: Pt, pts: Pt[], r0: number, r1: number): number {
  const rs = pts.map((_, i) => r0 + ((r1 - r0) * i) / Math.max(1, pts.length - 1))
  return chain(p, pts, rs)
}
/** a curl: a spiral ridge of `turns` round a centre, as a stroke */
function spiral(c: Pt, r: number, a0: number, turns: number, dir = 1): Pt[] {
  const out: Pt[] = []
  const n = Math.ceil(turns * 16)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ang = a0 + dir * t * turns * Math.PI * 2
    const rr = r * (1 - 0.82 * t)
    out.push([c[0] + Math.cos(ang) * rr, c[1] + Math.sin(ang) * rr])
  }
  return out
}
const smax = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + h * h * k * 0.25
}

interface Part {
  /** colour field */
  reg: number
  d: (p: Pt) => number
  /** highest point (m) and the bevel's run (m) */
  h: number
  r: number
  /** a lowered part (the far legs), m */
  base?: number
}

/** the bevel: steep at the outline, rounding into the top */
const bevel = (x: number): number => (x >= 1 ? 1 : x <= 0 ? 0 : Math.sqrt(1 - (1 - x) * (1 - x)))

const EDGE = 0.012

function bull(): { L: number; parts: Part[]; curls: Array<{ c: Pt; r: number; a: number }>; keep: Field['keep'] } {
  const L = 1.485
  const parts: Part[] = []
  // the far legs first, lower: the near legs and the body stand over them
  parts.push({ reg: REG.body, d: (p) => chain(p, [[0.93, 0.5], [0.915, 0.3], [0.905, 0.15], [0.915, 0.07]], [0.075, 0.05, 0.04, 0.036]), h: 0.03, r: 0.03, base: -0.006 })
  parts.push({ reg: REG.body, d: (p) => chain(p, [[0.5, 0.55], [0.47, 0.32], [0.52, 0.16], [0.555, 0.07]], [0.11, 0.05, 0.04, 0.036]), h: 0.03, r: 0.03, base: -0.006 })
  parts.push({ reg: REG.red, d: (p) => ellipse(p, [0.92, 0.036], 0.042, 0.038), h: 0.026, r: 0.02, base: -0.006 })
  parts.push({ reg: REG.red, d: (p) => ellipse(p, [0.565, 0.036], 0.042, 0.038), h: 0.026, r: 0.02, base: -0.006 })
  // the barrel: a deep chest, the withers over the forelegs, the rump lower
  const body = (p: Pt): number => {
    let d = ellipse(p, [0.66, 0.635], 0.43, 0.2)
    d = smax(d, ellipse(p, [1.0, 0.65], 0.18, 0.25, 0.1), 0.06)
    d = smax(d, ellipse(p, [0.33, 0.66], 0.15, 0.2), 0.05)
    // the short thick neck into the head
    d = smax(d, capsule(p, [1.05, 0.73], [1.22, 0.82], 0.16, 0.115), 0.05)
    return d
  }
  parts.push({ reg: REG.body, d: body, h: 0.046, r: 0.11 })
  // the near legs: the foreleg reaching forward, the hind leg back, thick as a bull's
  parts.push({ reg: REG.body, d: (p) => chain(p, [[1.04, 0.52], [1.07, 0.32], [1.1, 0.15], [1.115, 0.07]], [0.085, 0.055, 0.043, 0.038]), h: 0.04, r: 0.035 })
  parts.push({ reg: REG.body, d: (p) => chain(p, [[0.36, 0.56], [0.31, 0.32], [0.355, 0.16], [0.38, 0.07]], [0.13, 0.055, 0.042, 0.038]), h: 0.042, r: 0.04 })
  parts.push({ reg: REG.red, d: (p) => ellipse(p, [1.125, 0.036], 0.044, 0.038), h: 0.03, r: 0.02 })
  parts.push({ reg: REG.red, d: (p) => ellipse(p, [0.39, 0.036], 0.044, 0.038), h: 0.03, r: 0.02 })
  // the head carried level with the back, the muzzle a little down and square
  parts.push({ reg: REG.body, d: (p) => smax(capsule(p, [1.24, 0.86], [1.4, 0.75], 0.088, 0.062), ellipse(p, [1.41, 0.735], 0.055, 0.05), 0.03), h: 0.044, r: 0.05 })
  // the ear back; the horn from the poll, forward and up, a sickle (one in pure profile)
  parts.push({ reg: REG.body, d: (p) => capsule(p, [1.2, 0.93], [1.1, 0.965], 0.032, 0.012), h: 0.026, r: 0.015 })
  parts.push({ reg: REG.red, d: (p) => stroke(p, curve([1.225, 0.935], [1.2, 1.09], [1.35, 1.095]), 0.034, 0.009), h: 0.03, r: 0.016 })
  // the tail down the haunch, its tuft blue
  parts.push({ reg: REG.body, d: (p) => stroke(p, curve([0.21, 0.8], [0.13, 0.68], [0.15, 0.3]), 0.022, 0.016), h: 0.024, r: 0.015 })
  parts.push({ reg: REG.mane, d: (p) => ellipse(p, [0.15, 0.245], 0.036, 0.08), h: 0.032, r: 0.02 })
  // the blue hair (K1918 p. 25 to 26): the crest from the poll to the withers, the dewlap from the throat to the brisket, the belly fringe
  parts.push({ reg: REG.mane, d: (p) => chain(p, [[1.2, 0.935], [1.1, 0.885], [0.98, 0.86], [0.88, 0.855]], [0.03, 0.036, 0.034, 0.02]), h: 0.048, r: 0.025 })
  parts.push({ reg: REG.mane, d: (p) => chain(p, [[1.3, 0.73], [1.22, 0.62], [1.14, 0.52], [1.07, 0.45]], [0.03, 0.04, 0.04, 0.028]), h: 0.048, r: 0.025 })
  parts.push({ reg: REG.mane, d: (p) => chain(p, [[0.98, 0.45], [0.8, 0.43], [0.62, 0.435], [0.5, 0.46]], [0.03, 0.036, 0.032, 0.02]), h: 0.046, r: 0.025 })
  // the eye: white, black in the middle; the nostril
  parts.push({ reg: REG.eyeWhite, d: (p) => ellipse(p, [1.27, 0.9], 0.021, 0.017), h: 0.048, r: 0.008 })
  parts.push({ reg: REG.black, d: (p) => circle(p, [1.274, 0.9], 0.009), h: 0.049, r: 0.005 })
  parts.push({ reg: REG.black, d: (p) => ellipse(p, [1.425, 0.76], 0.012, 0.007, 0.3), h: 0.042, r: 0.004 })
  const curls: Array<{ c: Pt; r: number; a: number }> = []
  for (let i = 0; i < 6; i++) curls.push({ c: [1.18 - i * 0.055, 0.915 - i * 0.012], r: 0.02, a: i })
  for (let i = 0; i < 5; i++) curls.push({ c: [1.28 - i * 0.05, 0.71 - i * 0.065], r: 0.02, a: i + 2 })
  for (let i = 0; i < 9; i++) curls.push({ c: [0.96 - i * 0.055, 0.445 - Math.sin(i * 0.4) * 0.01], r: 0.018, a: i + 4 })
  curls.push({ c: [0.15, 0.22], r: 0.024, a: 1 })
  const keep: Field['keep'] = [
    { what: 'eye', u: 1.27, v: 0.9, r: 0.022 },
    { what: 'nostril', u: 1.425, v: 0.76, r: 0.013 },
    { what: 'hoof', u: 1.125, v: 0.036, r: 0.045, rv: 0.038 },
    { what: 'hoof', u: 0.92, v: 0.036, r: 0.043, rv: 0.038 },
    { what: 'hoof', u: 0.39, v: 0.036, r: 0.045, rv: 0.038 },
    { what: 'hoof', u: 0.565, v: 0.036, r: 0.043, rv: 0.038 },
  ]
  return { L, parts, curls, keep }
}

function dragon(): { L: number; parts: Part[]; curls: Array<{ c: Pt; r: number; a: number }>; keep: Field['keep']; scales: (p: Pt) => boolean } {
  const L = 1.65
  const parts: Part[] = []
  // a long cat's body, the neck rising in an S, the tail rising behind and curling forward over the back
  const trunk = (p: Pt): number => {
    let d = capsule(p, [0.44, 0.63], [1.02, 0.65], 0.13, 0.145)
    d = smax(d, chain(p, [[1.02, 0.7], [1.13, 0.81], [1.2, 0.92], [1.27, 0.985]], [0.12, 0.085, 0.068, 0.058]), 0.04)
    d = smax(d, chain(p, [[0.42, 0.68], [0.29, 0.76], [0.2, 0.87], [0.16, 0.97], [0.17, 1.03]], [0.085, 0.06, 0.045, 0.036, 0.03]), 0.03)
    return d
  }
  // far legs: a cat's foreleg, a bird's hind leg
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[0.93, 0.58], [0.915, 0.4], [0.88, 0.12]], [0.075, 0.052, 0.04]), catPaw(p, [0.87, 0.0]), 0.02), h: 0.028, r: 0.028, base: -0.006 })
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[0.56, 0.58], [0.53, 0.42], [0.49, 0.3], [0.545, 0.11]], [0.085, 0.05, 0.034, 0.026]), talons(p, [0.545, 0.095], 1), 0.01), h: 0.026, r: 0.025, base: -0.006 })
  parts.push({ reg: REG.body, d: trunk, h: 0.044, r: 0.075 })
  // near legs
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[1.04, 0.6], [1.085, 0.42], [1.13, 0.12]], [0.088, 0.058, 0.042]), catPaw(p, [1.12, 0.0]), 0.02), h: 0.038, r: 0.035 })
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[0.45, 0.6], [0.43, 0.43], [0.36, 0.3], [0.41, 0.11]], [0.11, 0.06, 0.038, 0.028]), talons(p, [0.41, 0.095], 1), 0.01), h: 0.038, r: 0.035 })
  // the viper's head, level, its mouth shut with the forked tongue out
  parts.push({ reg: REG.body, d: (p) => smax(capsule(p, [1.27, 0.995], [1.49, 0.985], 0.058, 0.03), ellipse(p, [1.33, 0.995], 0.07, 0.058), 0.02), h: 0.042, r: 0.04 })
  parts.push({ reg: REG.red, d: (p) => Math.max(capsule(p, [1.49, 0.985], [1.55, 0.988], 0.006, 0.005), capsule(p, [1.55, 0.988], [1.6, 1.008], 0.005, 0.003), capsule(p, [1.55, 0.988], [1.6, 0.968], 0.005, 0.003)), h: 0.02, r: 0.005 })
  // the long straight horn up and back, and the skin curling back from its root
  parts.push({ reg: REG.red, d: (p) => capsule(p, [1.325, 1.035], [1.235, 1.113], 0.02, 0.007), h: 0.032, r: 0.01 })
  parts.push({ reg: REG.body, d: (p) => stroke(p, [[1.3, 1.04], [1.25, 1.05], ...spiral([1.215, 1.045], 0.026, 0.2, 1.1, 1)], 0.011, 0.006), h: 0.032, r: 0.009 })
  // three locks from the head down the neck's back, each ending in a curl (K1918 p. 28)
  for (let i = 0; i < 3; i++) {
    const a: Pt = [1.24 - i * 0.04, 0.95 - i * 0.085], c: Pt = [1.15 - i * 0.045, 0.9 - i * 0.09]
    parts.push({ reg: REG.mane, d: (p) => stroke(p, [a, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 0.014], ...spiral(c, 0.028, 0.6, 1.2, -1)], 0.018, 0.009), h: 0.047, r: 0.012 })
  }
  // the tail's end curling forward into the scorpion's sting
  parts.push({ reg: REG.body, d: (p) => stroke(p, spiral([0.24, 1.03], 0.06, Math.PI, 0.75, -1), 0.03, 0.012), h: 0.03, r: 0.014 })
  parts.push({ reg: REG.red, d: (p) => capsule(p, [0.265, 0.995], [0.3, 1.04], 0.011, 0.003), h: 0.024, r: 0.007 })
  parts.push({ reg: REG.eyeWhite, d: (p) => ellipse(p, [1.35, 1.012], 0.019, 0.014), h: 0.046, r: 0.007 })
  parts.push({ reg: REG.black, d: (p) => circle(p, [1.353, 1.012], 0.0075), h: 0.047, r: 0.004 })
  parts.push({ reg: REG.black, d: (p) => capsule(p, [1.39, 0.978], [1.49, 0.982], 0.003, 0.003), h: 0.042, r: 0.003 })
  const curls: Array<{ c: Pt; r: number; a: number }> = [{ c: [1.29, 0.955], r: 0.014, a: 0 }, { c: [1.27, 0.93], r: 0.014, a: 1 }, { c: [1.25, 0.905], r: 0.014, a: 2 }]
  const scales = (p: Pt): boolean => trunk(p) > 0.004 && p[1] > 0.5
  const keep: Field['keep'] = [
    { what: 'eye', u: 1.35, v: 1.012, r: 0.02 },
    { what: 'paw', u: 1.16, v: 0.032, r: 0.07, rv: 0.034 },
    { what: 'paw', u: 0.91, v: 0.032, r: 0.07, rv: 0.034 },
  ]
  return { L, parts, curls, keep, scales }
}

/** a cat's paw in profile from its heel on the course: low, long, three toes rounded forward */
function catPaw(p: Pt, heel: Pt): number {
  let d = capsule(p, [heel[0] + 0.01, heel[1] + 0.034], [heel[0] + 0.075, heel[1] + 0.03], 0.034, 0.028)
  for (const [dx, r] of [[0.06, 0.024], [0.085, 0.022], [0.105, 0.018]] as Pt[]) d = smax(d, circle(p, [heel[0] + dx, heel[1] + r], r), 0.008)
  return d
}

/** a bird's foot: three claws forward, one back, from the ankle point */
function talons(p: Pt, a: Pt, s: number): number {
  let d = -1e9
  for (const [dx, dy] of [[0.085, -0.088], [0.05, -0.092], [0.015, -0.092], [-0.06, -0.078]] as Pt[]) d = Math.max(d, capsule(p, a, [a[0] + dx * s, a[1] + dy], 0.016, 0.006))
  return d
}

function lion(): { L: number; parts: Part[]; curls: Array<{ c: Pt; r: number; a: number }>; keep: Field['keep'] } {
  const L = 1.98
  const parts: Part[] = []
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[1.3, 0.52], [1.27, 0.3], [1.235, 0.1]], [0.07, 0.05, 0.038]), ellipse(p, [1.265, 0.038], 0.065, 0.038), 0.02), h: 0.03, r: 0.03, base: -0.006 })
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[0.58, 0.56], [0.6, 0.36], [0.53, 0.22], [0.62, 0.09]], [0.09, 0.055, 0.04, 0.035]), ellipse(p, [0.645, 0.038], 0.06, 0.038), 0.02), h: 0.03, r: 0.03, base: -0.006 })
  parts.push({ reg: REG.body, d: (p) => {
    let d = ellipse(p, [0.92, 0.615], 0.56, 0.16)
    d = smax(d, ellipse(p, [1.38, 0.62], 0.2, 0.22, 0.2), 0.05)
    d = smax(d, ellipse(p, [0.47, 0.63], 0.18, 0.18), 0.05)
    return d
  }, h: 0.045, r: 0.1 })
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[1.41, 0.52], [1.43, 0.3], [1.47, 0.1]], [0.09, 0.06, 0.045]), ellipse(p, [1.5, 0.038], 0.07, 0.038), 0.02), h: 0.038, r: 0.04 })
  parts.push({ reg: REG.body, d: (p) => smax(chain(p, [[0.46, 0.58], [0.44, 0.38], [0.36, 0.24], [0.41, 0.09]], [0.13, 0.07, 0.045, 0.04]), ellipse(p, [0.44, 0.038], 0.065, 0.038), 0.02), h: 0.04, r: 0.04 })
  // the tail raised and curling
  parts.push({ reg: REG.body, d: (p) => stroke(p, [[0.33, 0.74], [0.22, 0.8], [0.14, 0.9], [0.13, 1.0], [0.19, 1.05]], 0.026, 0.016), h: 0.026, r: 0.016 })
  parts.push({ reg: REG.mane, d: (p) => ellipse(p, [0.245, 1.055], 0.05, 0.03, 0.2), h: 0.03, r: 0.02 })
  // the mane over the neck and shoulder, and along the belly
  parts.push({ reg: REG.mane, d: (p) => smax(ellipse(p, [1.5, 0.76], 0.2, 0.25, -0.2), ellipse(p, [1.37, 0.66], 0.11, 0.17), 0.04), h: 0.05, r: 0.05 })
  parts.push({ reg: REG.mane, d: (p) => chain(p, [[1.3, 0.47], [1.05, 0.445], [0.8, 0.455], [0.62, 0.48]], [0.03, 0.03, 0.026, 0.018]), h: 0.044, r: 0.022 })
  // the head, jaws open (K1918 p. 5)
  parts.push({ reg: REG.body, d: (p) => smax(circle(p, [1.66, 0.84], 0.115), capsule(p, [1.7, 0.85], [1.87, 0.805], 0.07, 0.038), 0.03), h: 0.048, r: 0.05 })
  parts.push({ reg: REG.body, d: (p) => capsule(p, [1.68, 0.735], [1.83, 0.7], 0.05, 0.026), h: 0.04, r: 0.035 })
  parts.push({ reg: REG.mouth, d: (p) => Math.min(capsule(p, [1.71, 0.77], [1.88, 0.76], 0.03, 0.02), 0.78 - p[1] + 0.03, p[1] - 0.725 + 0.01), h: 0.022, r: 0.01 })
  for (const u of [1.84, 1.8]) parts.push({ reg: REG.tooth, d: (p) => capsule(p, [u, 0.782], [u + 0.004, 0.758], 0.008, 0.002), h: 0.03, r: 0.005 })
  parts.push({ reg: REG.tooth, d: (p) => capsule(p, [1.81, 0.728], [1.815, 0.75], 0.008, 0.002), h: 0.03, r: 0.005 })
  parts.push({ reg: REG.body, d: (p) => ellipse(p, [1.6, 0.955], 0.03, 0.022, 0.4), h: 0.04, r: 0.015 })
  parts.push({ reg: REG.eyeWhite, d: (p) => ellipse(p, [1.71, 0.885], 0.018, 0.013, -0.2), h: 0.05, r: 0.006 })
  parts.push({ reg: REG.black, d: (p) => circle(p, [1.714, 0.885], 0.0075), h: 0.051, r: 0.004 })
  const curls: Array<{ c: Pt; r: number; a: number }> = []
  for (let i = 0; i < 26; i++) {
    const t = i / 26
    const ang = 0.6 + t * 4.8
    curls.push({ c: [1.48 + Math.cos(ang) * (0.1 + 0.06 * (i % 2)), 0.74 + Math.sin(ang) * (0.13 + 0.06 * (i % 3) / 2)], r: 0.022, a: i })
  }
  for (let i = 0; i < 9; i++) curls.push({ c: [1.27 - i * 0.075, 0.455], r: 0.02, a: i })
  const keep: Field['keep'] = [{ what: 'eye', u: 1.71, v: 0.885, r: 0.02 }]
  return { L, parts, curls, keep }
}

/** draw one animal into its maps at `res` metres a texel */
export function animalField(kind: AnimalKind, res = 0.004): Field {
  const C = 0.086
  const H = 13 * C
  const def = kind === 'bull' ? bull() : kind === 'dragon' ? dragon() : lion()
  const L = def.L
  const w = Math.ceil(L / res) + 1, h = Math.ceil(H / res) + 1
  const height = new Float32Array(w * h), detail = new Float32Array(w * h), thread = new Float32Array(w * h)
  const region = new Uint8Array(w * h)
  const scales = (def as { scales?: (p: Pt) => boolean }).scales
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p: Pt = [i * res, j * res]
      let best = 0, reg: number = REG.ground
      for (const part of def.parts) {
        const d = part.d(p)
        if (d <= 0) continue
        const z = (part.base ?? 0) + EDGE + (part.h - EDGE) * bevel(d / part.r)
        best = Math.max(best, z)
        reg = part.reg
      }
      const k = j * w + i
      height[k] = best
      region[k] = reg
      if (best > 0 && scales && scales(p)) {
        // roof-shaped scales in offset rows; larger cross scales under the belly
        const sw = 0.036, sh = 0.028
        const row = Math.floor(p[1] / sh)
        const off = (row % 2) * sw * 0.5
        const fx = ((p[0] + off) / sw) % 1, fy = (p[1] / sh) % 1
        const roof = 1 - Math.abs(fx - 0.5) * 2
        detail[k] = 0.0035 * Math.min(1, roof * 2.2) * (0.4 + 0.6 * fy)
        if (p[1] < 0.56 && p[1] > 0.51) detail[k] = 0.002 * (1 - Math.abs(((p[0] / 0.045) % 1) - 0.5) * 2)
      }
    }
  }
  // curls in the manes: a spiral ridge each
  for (const cu of def.curls) {
    const pts = spiral(cu.c, cu.r, cu.a * 1.3, 1.6, 1)
    const i0 = Math.max(0, Math.floor((cu.c[0] - cu.r - 0.01) / res)), i1 = Math.min(w - 1, Math.ceil((cu.c[0] + cu.r + 0.01) / res))
    const j0 = Math.max(0, Math.floor((cu.c[1] - cu.r - 0.01) / res)), j1 = Math.min(h - 1, Math.ceil((cu.c[1] + cu.r + 0.01) / res))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * w + i
      if (height[k]! <= 0) continue
      const d = stroke([i * res, j * res], pts, 0.0045, 0.002)
      if (d > -0.002) detail[k] = Math.max(detail[k]!, 0.005 * Math.max(0, Math.min(1, (d + 0.002) / 0.004)))
      const r = Math.hypot(i * res - cu.c[0], j * res - cu.c[1])
      if (r < cu.r) detail[k] = Math.max(detail[k]!, 0.0025 * (1 - r / cu.r))
    }
  }
  // the white stripe where a blue mane meets the blue ground (K1918 p. 26)
  const R2 = Math.ceil(0.012 / res)
  const near = (i: number, j: number, r: number, test: (q: number) => boolean): number => {
    let dmin = 1e9
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) { if (test(REG.ground)) dmin = Math.min(dmin, Math.hypot(di, dj)); continue }
      if (test(region[jj * w + ii]!)) dmin = Math.min(dmin, Math.hypot(di, dj))
    }
    return dmin * res
  }
  const stripe = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i
    if (region[k] === REG.mane && near(i, j, R2, (q) => q === REG.ground) <= 0.011) stripe[k] = 1
  }
  for (let k = 0; k < w * h; k++) if (stripe[k]) region[k] = REG.stripe
  // the black thread on every border between two fields and round the outline
  const T = Math.ceil(0.006 / res)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i
    const me = region[k]!
    const d = near(i, j, T, (q) => q !== me && !(me === REG.black || q === REG.black))
    const half = me === REG.ground ? 0.0022 : 0.0028
    thread[k] = Math.max(0, Math.min(1, (half + res * 0.5 - d) / res))
  }
  let hMax = 0
  for (let k = 0; k < w * h; k++) hMax = Math.max(hMax, height[k]! + detail[k]!)
  return { kind, L, H, res, w, h, height, detail, region, thread, keep: def.keep, hMax }
}

/** joints of an animal's own brick grid that pass too close to the features they must miss (K1918 p. 23) */
export function jointConflicts(f: Field, course = 0.086, brick = 0.33): string[] {
  const out: string[] = []
  for (const k of f.keep) {
    // the feet line (bed joint 0) is where every animal stands; the joints above it must miss the feature
    const rv = k.rv ?? k.r
    for (let c = 1; c < 13; c++) if (Math.abs(k.v - c * course) < rv) out.push(`${f.kind} ${k.what} at ${k.u.toFixed(3)},${k.v.toFixed(3)} on bed joint ${c}`)
    const c = Math.floor(k.v / course)
    for (const cc of [...new Set([c, Math.floor((k.v - rv) / course), Math.floor((k.v + rv) / course)])].filter((q) => q >= 0 && q < 13)) {
      const phase = cc % 2 === 0 ? 0 : brick / 2
      for (let u = phase; u <= f.L + 1e-6; u += brick) if (Math.abs(k.u - u) < k.r) out.push(`${f.kind} ${k.what} at ${k.u.toFixed(3)},${k.v.toFixed(3)} on a head joint at ${u.toFixed(3)} (course ${cc})`)
    }
  }
  return [...new Set(out)]
}
