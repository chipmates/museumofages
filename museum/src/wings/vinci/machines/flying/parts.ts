/** THE FLYING MACHINE'S PARTS, built from plan.ts: the body of bound cane
 * (74v, 77v), the hoops, the pivot M, the two wings (spars after 74v and 77v,
 * ribs and skin after 74r), the sheaves, drums, bow and stirrups. Pure: every
 * surface is a BufferGeometry in metres, so the checks build it in node. */
import type { BufferGeometry } from 'three/webgpu'
import {
  AXIS, BEAK, BODY, BOW, DRUM, FRAMES, GUIDE, HOOP, HUB, PIN, RAILS, RAIL_R, SHEAVE, SMALL_HOOP, WING,
  railAt, hubCentre, twistEye,
} from './plan'
import { Mesher, caneBundle, hash, lashing, lath, line, ring, rod, bar, tube, v3, wheel, type V3 } from './shapes'

export type Kind = 'cane' | 'lash' | 'fir' | 'skin' | 'hem' | 'iron' | 'wood' | 'leather' | 'chamois' | 'ash'
export type Batch = Partial<Record<Kind, BufferGeometry>>
class Batches {
  readonly m = new Map<Kind, Mesher>()
  get(k: Kind): Mesher { let x = this.m.get(k); if (!x) { x = new Mesher(); this.m.set(k, x) } return x }
  done(): Batch { const out: Batch = {}; for (const [k, x] of this.m) if (x.count) out[k] = x.geometry(); return out }
}
const { add, sub, mul, unit, cross, len } = v3

/** the top rail's half width at z */
const halfAt = (z: number): number => railAt({ side: 1, level: 'top' }, z)[0]
const railR = (z: number): number => RAIL_R.head + (RAIL_R.foot - RAIL_R.head) * (BODY.head - z) / (BODY.head - BODY.foot)

/** THE BODY: six rails, four frames, two hoops, two braces, the pin's fork,
 * the sling. Everything that does not move. */
export function buildBody(): Batch {
  const b = new Batches()
  const cane = b.get('cane'), lash = b.get('lash'), iron = b.get('iron')
  RAILS.forEach((rail, k) => {
    const path = line(railAt(rail, BODY.head + 0.03), railAt(rail, BODY.foot - 0.03), 0.05)
    caneBundle(cane, lash, path, { r0: RAIL_R.head, r1: RAIL_R.foot, seed: 11 + k, lashEvery: 0.14, lashStart: 0.07, up: [0, 0, 1] })
  })
  // the four frames across the body: top bar, bottom bar and side posts at the
  // two ends; a bottom bar at each hoop
  const frame = (z: number, r: number, seed: number, full: boolean): void => {
    const tl = railAt({ side: 1, level: 'top' }, z), tr = railAt({ side: -1, level: 'top' }, z)
    const bl = railAt({ side: 1, level: 'bottom' }, z), br = railAt({ side: -1, level: 'bottom' }, z)
    const ext = (p: V3, q: V3, e: number): [V3, V3] => { const d = unit(sub(q, p)); return [sub(p, mul(d, e)), add(q, mul(d, e))] }
    const [b0, b1] = ext(bl, br, railR(z) + 0.012)
    caneBundle(cane, lash, line(b0, b1, 0.05), { r0: r, r1: r, seed, lashEvery: 0.6, lashAt: [railR(z) * 1.6, len(sub(b1, b0)) - railR(z) * 1.6], up: [0, 0, 1] })
    if (!full) return
    const [t0, t1] = ext(tl, tr, railR(z) + 0.012)
    caneBundle(cane, lash, line(t0, t1, 0.05), { r0: r, r1: r, seed: seed + 1, lashEvery: 0.6, lashAt: [railR(z) * 1.6, len(sub(t1, t0)) - railR(z) * 1.6], up: [0, 0, 1] })
    for (const [top, bottom, s] of [[tl, bl, 2], [tr, br, 3]] as const) {
      const out = mul(unit([top[0], 0, 0]), railR(z) + r)
      const [p0, p1] = ext(add(top, out), add(bottom, out), 0.03)
      caneBundle(cane, lash, line(p0, p1, 0.04), { r0: r, r1: r, seed: seed + s, lashEvery: 0.5, lashAt: [0.05, len(sub(p1, p0)) - 0.05], up: [0, 0, 1] })
    }
  }
  frame(FRAMES.head, 0.017, 31, true)
  frame(FRAMES.hoop, 0.015, 35, false)
  frame(FRAMES.small, 0.014, 38, false)
  frame(FRAMES.foot, 0.013, 41, true)

  // the half-hoop: legs down the rails' outer sides, the arch over the body
  const hoopPath = (z: number, half: number, foot: number, top: number, crown: number, r: number, rail: number): V3[] => {
    const x0 = half + rail + r
    const pts: V3[] = []
    for (let y = foot; y < top; y += 0.04) pts.push([-x0, y, z])
    for (let i = 0; i <= 48; i++) {
      const a = Math.PI - (i / 48) * Math.PI
      pts.push([x0 * Math.cos(a), top + (crown - top) * Math.sin(a), z])
    }
    for (let y = top - 0.04; y >= foot - 1e-6; y -= 0.04) pts.push([x0, y, z])
    return pts
  }
  const big = hoopPath(HOOP.z, halfAt(HOOP.z), 1.25, BODY.topY, HOOP.crown, HOOP.r, railR(HOOP.z))
  caneBundle(cane, lash, big, { r0: HOOP.r, r1: HOOP.r, seed: 51, lashEvery: 0.16, up: [0, 0, 1], twist: 1.2 })
  // where each leg crosses the top and middle rails, a cross lashing
  for (const sx of [1, -1]) for (const level of ['top', 'mid'] as const) {
    const at = railAt({ side: sx as 1 | -1, level }, HOOP.z)
    lashing(lash, [at[0] + sx * 0.022, at[1], at[2]], [0, 1, 0], [1, 0, 0], 0.03, 4, 0.2)
  }
  const small = hoopPath(SMALL_HOOP.z, halfAt(SMALL_HOOP.z), 1.3, BODY.topY, BODY.topY + SMALL_HOOP.rise, SMALL_HOOP.r, railR(SMALL_HOOP.z))
  caneBundle(cane, lash, small, { r0: SMALL_HOOP.r, r1: SMALL_HOOP.r, seed: 57, lashEvery: 0.15, up: [0, 0, 1], twist: 1 })
  // the small hoop's fitting, an iron eye on its near side (purpose not written)
  {
    const x0 = halfAt(SMALL_HOOP.z) + railR(SMALL_HOOP.z) + SMALL_HOOP.r
    const a = Math.PI * 0.2
    const p: V3 = [x0 * Math.cos(a), BODY.topY + SMALL_HOOP.rise * Math.sin(a), SMALL_HOOP.z]
    const out = unit([Math.cos(a) * SMALL_HOOP.rise, Math.sin(a) * x0, 0])
    ring(iron, p, unit([-Math.sin(a) * x0, Math.cos(a) * SMALL_HOOP.rise, 0]), SMALL_HOOP.r + 0.006, 0.004, 6, 16, 0.9)
    ring(iron, add(p, mul(out, SMALL_HOOP.r + 0.026)), [0, 0, 1], 0.017, 0.0045, 6, 16, 0.9)
  }

  // two braces from the crown down to the head end's top corners (74v's lines from the hub)
  for (const sx of [1, -1]) {
    const corner = railAt({ side: sx as 1 | -1, level: 'top' }, FRAMES.head)
    const from: V3 = [sx * 0.03, HOOP.crown - 0.01, 0.02]
    const to: V3 = [corner[0] - sx * 0.02, corner[1] + 0.035, corner[2] - 0.03]
    caneBundle(cane, lash, line(from, to, 0.04), { r0: 0.015, r1: 0.014, seed: 61 + sx, lashEvery: 0.3, lashAt: [0.04, len(sub(to, from)) - 0.04], up: [0, 1, 0] })
  }

  // THE PIVOT M: an iron strap round the crown, two cheeks up to the pin's
  // ends, the pin itself along its leaning axis
  {
    const c: V3 = [0, PIN.y, 0]
    const fore = add(c, mul(AXIS, PIN.half)), aft = add(c, mul(AXIS, -PIN.half))
    rod(iron, add(c, mul(AXIS, -PIN.half - 0.02)), add(c, mul(AXIS, PIN.half + 0.02)), PIN.radius, 10, 0.95)
    for (const end of [fore, aft]) {
      ring(iron, end, AXIS, PIN.radius + 0.004, 0.005, 6, 14, 0.9)
      const foot: V3 = [0, HOOP.crown, Math.sign(end[2]) * (HOOP.r + 0.008)]
      bar(iron, end, foot, 0.03, 0.008, [0, 0, 1], 0.92)
    }
    // the bands that hold the cheeks to the crown
    for (const dx of [-0.045, 0, 0.045]) ring(iron, [dx, HOOP.crown, 0], [1, 0, 0], HOOP.r + 0.005, 0.0045, 6, 20, 0.9)
    // the beak: the pin's axis carried on forward, with the twist cords' eyes at its end
    const tip = add(c, mul(AXIS, BEAK))
    bar(iron, add(fore, mul(AXIS, 0.006)), add(tip, mul(AXIS, 0.012)), 0.018, 0.008, [1, 0, 0], 0.92)
    for (const sx of [1, -1]) ring(iron, twistEye(sx as 1 | -1), [1, 0, 0], 0.011, 0.0032, 6, 14, 0.9)
    bar(iron, add(tip, [-0.03, 0, 0]), add(tip, [0.03, 0, 0]), 0.014, 0.006, [0, 1, 0], 0.9)
  }

  // the guide eyes on the top rails, and the sheaves' iron straps
  for (const sx of [1, -1] as const) {
    const g: V3 = [GUIDE.x * sx, GUIDE.y, GUIDE.z]
    ring(iron, g, [0, 0, 1], 0.011, 0.0035, 6, 14, 0.9)
    const r = railAt({ side: sx, level: 'top' }, GUIDE.z)
    bar(iron, add(r, [0, railR(GUIDE.z), 0]), add(g, [0, -0.008, 0]), 0.012, 0.004, [0, 0, 1], 0.9)
    const s: V3 = [SHEAVE.x * sx, SHEAVE.y, SHEAVE.z]
    const rs = railAt({ side: sx, level: 'top' }, SHEAVE.z)
    for (const dx of [-0.022, 0.022]) {
      bar(iron, [s[0] + dx, s[1] + 0.006, s[2]], [rs[0] + dx * 0.6, rs[1] - railR(SHEAVE.z) * 0.2, rs[2]], 0.022, 0.005, [1, 0, 0], 0.9)
    }
    rod(iron, [s[0] - 0.03, s[1], s[2]], [s[0] + 0.03, s[1], s[2]], 0.005, 8, 0.95)
    lashing(lash, rs, [0, 0, 1], [0, 1, 0], railR(SHEAVE.z) + 0.005, 4, 0.3)
    // the drums' brackets on the head end's side posts
    const d: V3 = [DRUM.x * sx, DRUM.y, DRUM.z]
    const post: V3 = [railAt({ side: sx, level: 'top' }, FRAMES.head)[0] + sx * 0.035, DRUM.y, FRAMES.head]
    for (const dz of [-DRUM.len / 2 - 0.008, DRUM.len / 2 + 0.008]) {
      bar(iron, [post[0], post[1], d[2] + dz], [d[0], d[1], d[2] + dz], 0.026, 0.006, [0, 0, 1], 0.9)
    }
    rod(iron, [d[0], d[1], d[2] - DRUM.len / 2 - 0.02], [d[0], d[1], d[2] + DRUM.len / 2 + 0.02], 0.006, 8, 0.95)
  }
  // the bow's iron strap round the head end's bottom bar
  ring(iron, [0, railAt({ side: 1, level: 'bottom' }, FRAMES.head)[1] - 0.012, FRAMES.head], [1, 0, 0], 0.03, 0.005, 6, 18, 0.9)

  buildSling(b.get('chamois'), b.get('lash'))
  return b.done()
}

/** THE SLING (79v): a chamois skin under the body from the throat to the
 * crotch, wrapped over the top rails and laced */
function buildSling(m: Mesher, lash: Mesher): void {
  const z0 = 0.14, z1 = -0.56, nz = 22, nx = 18
  const base = m.count
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * (i / nz)
    const w = halfAt(z) - railR(z) * 0.2
    for (let j = 0; j <= nx; j++) {
      const u = j / nx * 2 - 1
      const x = u * w
      // over the rail at the edge, then sagging between
      const edge = Math.max(0, Math.abs(u) - 0.86) / 0.14
      const sag = 0.1 * (1 - u * u) * (1 - 0.25 * Math.pow(2 * (i / nz) - 1, 2))
      const y = BODY.topY + railR(z) * (1 - edge * edge * 0.2) * Math.cos(edge * 1.2) + 0.002 - sag
      const n = unit([-u * 0.2, 1, 0])
      m.vertex([x, y, z], n, x, z, 0.92 + 0.08 * hash(i, j))
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = base + i * (nx + 1) + j
    m.quad(a, a + 1, a + nx + 2, a + nx + 1)
  }
  for (let i = 1; i < 8; i++) {
    const z = z0 + (z1 - z0) * (i / 8)
    for (const sx of [1, -1]) lashing(lash, railAt({ side: sx as 1 | -1, level: 'top' }, z), [0, 0, 1], [0, 1, 0], railR(z) + 0.004, 2, i * 0.13, 0.003)
  }
}

/** the spar's height over its own axis line at a distance out (the outer
 * piece rides on the root piece at the step joint) */
export function sparLift(x: number): number {
  const u = Math.min(1, Math.max(0, (x - WING.joint.at) / (WING.root.end - WING.joint.at)))
  return WING.joint.lift * u * u * (3 - 2 * u)
}
export function sparRadius(x: number): number {
  if (x <= WING.joint.at) return WING.root.r0 + (WING.root.r1 - WING.root.r0) * (x + WING.lever) / (WING.root.end + WING.lever)
  return WING.outer.r0 + (WING.outer.r1 - WING.outer.r0) * (x - WING.joint.at) / (WING.tip - WING.joint.at)
}
/** where the skin meets the spar, in the wing's own frame (left wing) */
function leading(x: number): V3 {
  const r = sparRadius(x)
  return [x, sparLift(x) + 0.5 * r, -0.86 * r]
}
/** a rib's top line, from the spar back to its end */
function ribTop(i: number, v: number): V3 {
  const rib = WING.ribs[i]!
  const start = leading(rib.s)
  const dir: V3 = [Math.sin(rib.fan), 0, -Math.cos(rib.fan)]
  const arch = WING.rib.camber * rib.len * 4 * v * (1 - v)
  return add(add(start, mul(dir, rib.len * v)), [0, arch, 0])
}
/** the trailing edge between rib i's end and the next (or the tip) */
function trailing(i: number, u: number): V3 {
  const a = ribTop(i, 1)
  const b = i + 1 < WING.ribs.length ? ribTop(i + 1, 1) : leading(WING.tip - 0.01)
  const mid = add(a, mul(sub(b, a), u))
  // scalloped toward the spar, as 74r draws the bat's web
  const toward = unit(sub(leading(mid[0]), mid))
  const depth = 0.12 * len(sub(b, a))
  return add(mid, mul(toward, depth * Math.sin(Math.PI * u)))
}

/** ONE WING in its own frame: origin at its hub, spar along +X (the right
 * wing is mirrored in x). `turning` holds what rolls with the spar; the hub
 * turns only with the stroke. */
export function buildWing(side: 1 | -1): { turning: Batch; hub: Batch } {
  const b = new Batches(), hub = new Batches()
  const cane = b.get('cane'), lash = b.get('lash'), iron = b.get('iron'), fir = b.get('fir'), skin = b.get('skin'), hem = b.get('hem')
  const X = (p: V3): V3 => [p[0] * side, p[1], p[2]]
  const up: V3 = [0, 0, 1]
  // the root piece, from the lever's end through the hub to the step joint
  const rootPath = line([-WING.lever, 0, 0], [WING.root.end, 0, 0], 0.04).map(X)
  caneBundle(cane, lash, rootPath, {
    r0: WING.root.r0, r1: WING.root.r1, seed: side > 0 ? 71 : 73, lashEvery: 0.22, lashStart: 0.14, up,
    lashAt: [WING.lever + WING.joint.at + 0.04, WING.lever + WING.joint.at + 0.18, WING.lever + WING.root.end - 0.03],
  })
  // the outer piece, laid on the root piece over the joint (77v's stepped spar)
  const outerPath = line([WING.joint.at, WING.joint.lift, 0], [WING.tip, WING.joint.lift, 0], 0.04).map(X)
  caneBundle(cane, lash, outerPath, { r0: WING.outer.r0, r1: WING.outer.r1, seed: side > 0 ? 75 : 77, lashEvery: 0.26, lashStart: 0.5, up })
  // the joint's three wrappings round both pieces
  for (const at of [WING.joint.at + 0.06, WING.joint.at + 0.18, WING.root.end - 0.05]) {
    lashing(lash, X([at, WING.joint.lift * 0.5, 0]), [side, 0, 0], [0, 1, 0], WING.joint.lift * 0.5 + 0.022, 5, at)
  }
  // iron: bands either side of the hub, the lowering eye, the spring ring on
  // the lever, the twist arm, the eye near the tip
  for (const x of [-0.065, 0.065]) ring(iron, X([x, 0, 0]), [1, 0, 0], sparRadius(x) + 0.004, 0.0045, 6, 20, 0.9)
  const eyeBelow = (x: number, drop: number): void => {
    const r = sparRadius(x)
    ring(iron, X([x, sparLift(x), 0]), [1, 0, 0], r + 0.004, 0.0045, 6, 20, 0.9)
    bar(iron, X([x, sparLift(x) - r - 0.002, 0]), X([x, sparLift(x) - r - drop + 0.006, 0]), 0.014, 0.005, [0, 0, 1], 0.9)
    ring(iron, X([x, sparLift(x) - r - drop, 0]), [0, 0, 1], 0.011, 0.0035, 6, 14, 0.9)
  }
  eyeBelow(WING.lowerEye, 0.018)
  eyeBelow(WING.springRing, 0.013)
  eyeBelow(WING.eyeTip, 0.016)
  {
    const r = WING.root.r0
    ring(iron, X([WING.twistArm, 0, 0]), [1, 0, 0], sparRadius(WING.twistArm) + 0.004, 0.0045, 6, 20, 0.9)
    bar(iron, X([WING.twistArm, -r + 0.004, 0]), X([WING.twistArm, -r - WING.twistLength + 0.008, 0]), 0.016, 0.006, [0, 0, 1], 0.92)
    ring(iron, X([WING.twistArm, -r - WING.twistLength, 0]), [0, 0, 1], 0.011, 0.0038, 6, 14, 0.9)
  }

  // THE RIBS (74r A, fir): laths fanned back from the spar, lashed to it
  WING.ribs.forEach((rib, i) => {
    const pts: V3[] = []
    for (let k = 0; k <= 16; k++) pts.push(sub(ribTop(i, k / 16), [0, WING.rib.h / 2 + 0.0015, 0]))
    lath(fir, pts.map(X), WING.rib.w, WING.rib.h, [0, 1, 0], 0.92 + 0.12 * hash(i, side))
    lashing(lash, X([rib.s, sparLift(rib.s), 0]), [side, 0, 0], [0, 1, 0], sparRadius(rib.s) + 0.006, 4, i * 0.21)
  })

  // THE SKIN (74r B, fustian): one Coons patch per bay, sagging between the
  // ribs, scalloped behind
  const bays = WING.ribs.length
  const nu = 10, nv = 14
  const hemPath: V3[] = []
  for (let i = 0; i < bays; i++) {
    const s0 = WING.ribs[i]!.s, s1 = i + 1 < bays ? WING.ribs[i + 1]!.s : WING.tip - 0.01
    const P00 = leading(s0), P10 = leading(s1), P01 = ribTop(i, 1)
    const P11 = i + 1 < bays ? ribTop(i + 1, 1) : leading(WING.tip - 0.01)
    const side1 = (v: number): V3 => i + 1 < bays ? ribTop(i + 1, v) : leading(WING.tip - 0.01)
    const width = len(sub(P10, P00))
    const base = skin.count
    const point = (u: number, v: number): V3 => {
      const L = leading(s0 + (s1 - s0) * u), T = trailing(i, u)
      const A = ribTop(i, v), B = side1(v)
      const coons = sub(add(add(mul(L, 1 - v), mul(T, v)), add(mul(A, 1 - u), mul(B, u))),
        add(add(mul(P00, (1 - u) * (1 - v)), mul(P10, u * (1 - v))), add(mul(P01, (1 - u) * v), mul(P11, u * v))))
      // the cloth hangs between the ribs, most in the middle of the bay
      const sag = 0.018 * width * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.25)), 0.7)
      // and draws into soft ripples near the trailing edge
      const ripple = 0.0035 * Math.sin(u * Math.PI * 7 + i) * v * v
      return [coons[0], coons[1] - sag + ripple, coons[2]]
    }
    const grid: V3[][] = []
    for (let a = 0; a <= nv; a++) {
      const row: V3[] = []
      for (let c = 0; c <= nu; c++) row.push(point(c / nu, a / nv))
      grid.push(row)
    }
    for (let a = 0; a <= nv; a++) for (let c = 0; c <= nu; c++) {
      const p = grid[a]![c]!
      const du = sub(grid[a]![Math.min(nu, c + 1)]!, grid[a]![Math.max(0, c - 1)]!)
      const dv = sub(grid[Math.min(nv, a + 1)]![c]!, grid[Math.max(0, a - 1)]![c]!)
      let n = unit(cross(dv, du))
      if (n[1] < 0) n = mul(n, -1) as unknown as [number, number, number]
      const seam = c === 0 || c === nu ? 0.86 : 1
      const xp = X(p), nn = X(n)
      skin.vertex(xp, nn, p[0], -p[2], seam * (0.95 + 0.05 * hash(i, a, c)))
    }
    for (let a = 0; a < nv; a++) for (let c = 0; c < nu; c++) {
      const q = base + a * (nu + 1) + c
      if (side > 0) m4(skin, q, q + 1, q + nu + 2, q + nu + 1)
      else m4(skin, q, q + nu + 1, q + nu + 2, q + 1)
    }
    for (let c = 0; c <= nu; c++) if (!(i > 0 && c === 0)) hemPath.push(X(grid[nv]![c]!))
  }
  // the hem's bolt rope along the scallops, tied off at the tip eye
  tube(hem, hemPath, { sides: 6, radius: () => 0.0048, caps: true, capTone: 0.8, tone: (_i, along) => 0.94 + 0.06 * Math.sin(along * 40) })
  // the inner edge's hem along the first rib
  const inner: V3[] = []
  for (let k = 0; k <= 16; k++) inner.push(X(add(ribTop(0, k / 16), [0, 0.006, 0])))
  tube(hem, inner, { sides: 6, radius: () => 0.004, caps: true })

  // the hub: a wooden boss on the pin, the spar through it
  wheel(hub.get('wood'), [0, 0, 0], AXIS, HUB.radius, HUB.thick, 0, 28, 0.95)
  ring(hub.get('iron'), mul(AXIS, HUB.thick / 2 - 0.004), AXIS, HUB.radius - 0.003, 0.004, 6, 28, 0.9)
  ring(hub.get('iron'), mul(AXIS, -HUB.thick / 2 + 0.004), AXIS, HUB.radius - 0.003, 0.004, 6, 28, 0.9)
  return { turning: b.done(), hub: hub.done() }
}
function m4(m: Mesher, a: number, b: number, c: number, d: number): void { m.quad(a, b, c, d) }

/** a sheave or a drum, turned in its own frame (centre at the origin) */
export function buildSheave(): Batch {
  const b = new Batches()
  wheel(b.get('wood'), [0, 0, 0], [1, 0, 0], SHEAVE.r, 0.028, 0.008, 28, 0.95)
  // the turner's mark, so a turning wheel is seen to turn
  rod(b.get('iron'), [0.0141, SHEAVE.r * 0.5, 0], [0.0141, SHEAVE.r * 0.5 + 0.001, 0.001], 0.004, 6)
  return b.done()
}
export function buildDrum(): Batch {
  const b = new Batches()
  wheel(b.get('wood'), [0, 0, 0], [0, 0, 1], DRUM.r, DRUM.len, 0, 28, 0.95)
  for (const dz of [-DRUM.len / 2 + 0.006, DRUM.len / 2 - 0.006]) wheel(b.get('wood'), [0, 0, dz], [0, 0, 1], DRUM.r + 0.012, 0.012, 0, 28, 0.85)
  ring(b.get('iron'), [0, 0, DRUM.len / 2 - 0.016], [0, 0, 1], DRUM.r + 0.002, 0.003, 6, 28, 0.9)
  return b.done()
}

/** THE STIRRUP: a leather foot strap in its own frame, open toward the foot
 * (+Z), its cord's knot at the front */
export function buildStirrup(): Batch {
  const b = new Batches()
  const pts: V3[] = []
  // a strap standing on edge round the forefoot, the cord tied at its front
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2 + Math.PI / 2
    pts.push([0.05 * Math.cos(a), 0, -STIRRUP_LOOP + STIRRUP_LOOP * Math.sin(a)])
  }
  lath(b.get('leather'), pts, 0.005, 0.034, [0, 1, 0])
  lashing(b.get('lash'), [0, 0, 0.004], [0, 0, 1], [1, 0, 0], 0.006, 3, 0.4, 0.004)
  return b.done()
}
/** the loop's depth: the ball of the foot sits this far aft of the knot */
export const STIRRUP_LOOP = 0.034

/** THE BOW SPRING, bent: ash, its middle held, each tip lifted by its cord */
export function bowGeometryInto(m: Mesher, liftLeft: number, liftRight: number): void {
  const pts: V3[] = []
  for (let i = 0; i <= 40; i++) {
    const x = -BOW.half + (2 * BOW.half) * (i / 40)
    const u = Math.abs(x) / BOW.half
    const lift = x >= 0 ? liftLeft : liftRight
    pts.push([x * (1 - 0.18 * lift * u), BOW.y + lift * u * u, BOW.z])
  }
  lath(m, pts, 0.038, 0.022, [0, 0, 1])
}
export function bowTip(side: 1 | -1, lift: number): V3 {
  return [side * BOW.half * (1 - 0.18 * lift), BOW.y + lift, BOW.z]
}
/** the hub's centre, for the wing groups */
export { hubCentre }
/** a cord's radius in metres */
export const CORD = { lower: 0.0045, spring: 0.0045, twist: 0.0035 } as const
/** keep the shapes module's helpers reachable for the checks */
export const shapes = { line }
