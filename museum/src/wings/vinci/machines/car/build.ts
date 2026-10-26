/** THE CAR'S PIECES, built in metres from `plan.ts`. Each body (the tub that
 * stands, the cover, the guns, each wheel, each shaft) is a set of kits by
 * surface: rough sawn oak, finer turned oak, forged iron, cast bronze. A
 * wheel is built about its own hub and a shaft about its own axis, so the
 * joints turn them where they turn.
 */
import {
  COVER, CRANK, GUN, PORT_ANGLES_DEG, HUB, LANTERN, PEGS, POSTS, RUNDLE, SHAFT, SPOKES, TAU, TUB, WHEEL,
  CONE_TOP_Y, SILL_TOP, CAP_FOOT, CAP_RING_TOP, KNOB_FOOT, capY, coneY, wallRadius,
} from './plan'
import { Kit, add, cross, dot, hash, len, mul, norm, sub, v, type Finish, type V3 } from './kit'

export type Surface = 'rough' | 'fine' | 'iron' | 'bronze'
export type Body = Record<Surface, Kit>
const body = (): Body => ({ rough: new Kit(), fine: new Kit(), iron: new Kit(), bronze: new Kit() })

const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1]
const at = (r: number, a: number, y: number): V3 => [r * Math.cos(a), y, r * Math.sin(a)]
const radial = (a: number): V3 => [Math.cos(a), 0, Math.sin(a)]
const tone = (...seed: number[]): number => 0.86 + 0.26 * hash(...seed)
const smooth = (a: number, b: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
/** The port angles in whole degrees, 0..359, as the staves are laid every 5 degrees. */
const PORTS = new Set(PORT_ANGLES_DEG.map(a => ((Math.round(a) % 360) + 360) % 360))
const portAngle = (deg: number): number => (deg * Math.PI) / 180

/* ── THE TUB ─────────────────────────────────────────────────────────────── */

/** Where the wheels pass through the floor: x from..to, z from..to, near side. */
export const SLOT = {
  x0: HUB.x - 0.42, x1: HUB.x + 0.42,
  z0: HUB.z - WHEEL.width / 2 - PEGS.stand - PEGS.r - 0.02, z1: HUB.z + WHEEL.width / 2 + 0.025,
}

const BEVEL = { w: 0.01, d: 0.007 } as const
const across = (a: number): V3 => [-Math.sin(a), 0, Math.cos(a)]

/** The wall's outward normal at angle `a` and height `y`, from the slope of its profile. */
function wallNormal(a: number, y: number): V3 {
  const e = 0.004
  const lo = Math.max(TUB.bottomY + 0.0005, y - e), hi = Math.min(TUB.rimY, y + e)
  const slope = (wallRadius(hi) - wallRadius(lo)) / (hi - lo)
  return norm(add(radial(a), mul(Y, -slope)))
}

function stave(k: Kit, i: number): void {
  const n = TUB.staves, da = TAU / n, ac = i * da
  const gap = 0.0016
  const ported = PORTS.has(Math.round((i * 360) / n) % 360)
  // staves come from different boards, so they differ more than the other pieces
  const f = { tone: 0.8 + 0.38 * hash(1, i) }
  // the ground's dirt splashed up the skirt's foot, and grime in the joints between staves
  const dirt = (y: number): number => 0.74 + 0.26 * smooth(TUB.bottomY, TUB.bottomY + 0.24, y)
  const at_ = (y: number, k = 1): { tone: number; seed: number } => ({ tone: f.tone * dirt(y) * k, seed: f.tone })
  // a row at the chime's top, so the corner the floor meets is in the mesh, then rows up the flare
  const ys: number[] = [TUB.bottomY]
  for (let y: number = TUB.floorTop; y < TUB.rimY - 1e-6; ) {
    ys.push(y)
    const inPort = ported && Math.abs(y - TUB.ports.y) < TUB.ports.r + 0.02
    const flare = y < TUB.floorTop + 0.06 ? 0.015 : 0.045
    y = Math.min(TUB.rimY, y + (inPort ? 0.01 : flare))
  }
  ys.push(TUB.rimY)
  // positions across the stave by arc length s from its centre line
  const half = (r: number): number => (da / 2) * r - gap
  const outer = (s: number, y: number): V3 => { const r = wallRadius(y); return at(r, ac + s / r, y) }
  const inner = (s: number, y: number): V3 => { const r = wallRadius(y) - TUB.wall; return at(r, ac + s / wallRadius(y), y) }
  const eased = (s: number, y: number): V3 => { const r = wallRadius(y) - BEVEL.d; return at(r, ac + s / wallRadius(y), y) }
  const holeHalf = (y: number): number => {
    if (!ported) return 0
    const d = y - TUB.ports.y
    return Math.abs(d) < TUB.ports.r ? Math.sqrt(TUB.ports.r * TUB.ports.r - d * d) : 0
  }
  const mid = (s: number, y: number): V3 => { const r = wallRadius(y) - TUB.wall / 2; return at(r, ac + s / wallRadius(y), y) }
  for (let j = 0; j + 1 < ys.length; j++) {
    const y0 = ys[j]!, y1 = ys[j + 1]!
    const h0 = half(wallRadius(y0)), h1 = half(wallRadius(y1))
    const w0 = holeHalf(y0), w1 = holeHalf(y1)
    const fr = at_((y0 + y1) / 2), fj = at_((y0 + y1) / 2, 0.8)
    const spans: [number, number, number, number][] = w0 > 0 || w1 > 0
      ? [[-h0, -w0, -h1, -w1], [w0, h0, w1, h1]]
      : [[-h0, h0, -h1, h1]]
    // flat across the stave, smooth up its curve, so the rows never show as facets
    const n0 = wallNormal(ac, y0), n1 = wallNormal(ac, y1), m0 = mul(n0, -1), m1 = mul(n1, -1)
    for (const [a0, b0, a1, b1] of spans) {
      const ea = a0 === -h0, eb = b0 === h0
      const [p0, q0, p1, q1] = [ea ? a0 + BEVEL.w : a0, eb ? b0 - BEVEL.w : b0, ea ? a1 + BEVEL.w : a1, eb ? b1 - BEVEL.w : b1]
      const uv: [number, number][] = [[y0, p0], [y0, q0], [y1, q1], [y1, p1]]
      k.smoothQuad([outer(p0, y0), outer(q0, y0), outer(q1, y1), outer(p1, y1)], [n0, n0, n1, n1], uv, fr)
      k.smoothQuad([inner(a0, y0), inner(b0, y0), inner(b1, y1), inner(a1, y1)], [m0, m0, m1, m1], [[y0, a0], [y0, b0], [y1, b1], [y1, a1]], fr)
      // the eased arris along each long edge, which is what shows the joint between staves
      const t = across(ac)
      if (ea) {
        const e0 = norm(sub(n0, t)), e1 = norm(sub(n1, t))
        k.smoothQuad([eased(-h0, y0), outer(p0, y0), outer(p1, y1), eased(-h1, y1)], [e0, e0, e1, e1], [[y0, -h0], [y0, p0], [y1, p1], [y1, -h1]], fj)
      }
      if (eb) {
        const e0 = norm(add(n0, t)), e1 = norm(add(n1, t))
        k.smoothQuad([outer(q0, y0), eased(h0, y0), eased(h1, y1), outer(q1, y1)], [e0, e0, e1, e1], [[y0, q0], [y0, h0], [y1, h1], [y1, q1]], fj)
      }
    }
    // the stave's own two long edges
    const centre = mid(0, (y0 + y1) / 2)
    k.polygon([eased(-h0, y0), eased(-h1, y1), inner(-h1, y1), inner(-h0, y0)], Y, fj, centre)
    k.polygon([eased(h0, y0), eased(h1, y1), inner(h1, y1), inner(h0, y0)], Y, fj, centre)
    // the port's round wall, row by row
    if (w0 > 0 || w1 > 0) {
      for (const side of [-1, 1]) {
        const p = [outer(side * w0, y0), outer(side * w1, y1), inner(side * w1, y1), inner(side * w0, y0)]
        k.polygon(p, Y, at_((y0 + y1) / 2, 0.85), mid(side * (Math.max(w0, w1) + 0.01), (y0 + y1) / 2))
      }
    }
  }
  const top = TUB.rimY, bottom = TUB.bottomY
  const ht = half(wallRadius(top)), hb = half(wallRadius(bottom))
  k.polygon([outer(-ht, top), outer(ht, top), inner(ht, top), inner(-ht, top)], radial(ac), f, mid(0, top - 0.05))
  k.polygon([outer(-hb, bottom), outer(hb, bottom), inner(hb, bottom), inner(-hb, bottom)], radial(ac), at_(bottom), mid(0, bottom + 0.05))
}

/** The port's oak collar on the skirt, square to the wall: a low, plain ring 2 cm wide that stands 1 cm proud, as a
 * board thickened round a hole, not a ship's porthole. */
function collar(k: Kit, deg: number, j: number): void {
  const a = portAngle(deg), y = TUB.ports.y
  const r = wallRadius(y)
  const dr = (wallRadius(y + 0.01) - wallRadius(y - 0.01)) / 0.02
  const n = norm(add(radial(a), mul(Y, -dr)))
  const origin = add(at(r, a, y), mul(n, -0.004))
  // the collar's face blackened round the muzzle by the guns' smoke; oval up the leaning wall, as the hole is cut
  // level through it, so the level barrel clears its lips
  k.lathe(origin, n, [[0, TUB.ports.r], [0, TUB.ports.collar - 0.015], [0.008, TUB.ports.collar - 0.018], [0.01, TUB.ports.r + 0.008], [0.01, TUB.ports.r]], 24, { tone: tone(2, j) }, false, undefined, s => (s > 0.007 ? 0.55 : 0.85), Math.hypot(1, dr))
}

/** A floor board between z0 and z1 and the cuts xa..xb (an infinite cut runs to the wall), its ends sawn on the
 * circle R so it meets the staves at the chime, its long top edges eased so the joints read. */
function board(k: Kit, z0: number, z1: number, xa: number, xb: number, R: number, f: Finish): void {
  const y0 = TUB.bottomY, y1 = TUB.floorTop, e = 0.004
  const span = (z: number): [number, number] => {
    const s = Math.sqrt(Math.max(0, R * R - z * z))
    return [Math.max(xa, -s), Math.min(xb, s)]
  }
  // a board stands only where it is more than 3 cm wide: trim its z range to that
  const wide = (z: number): boolean => { const [l, r] = span(z); return r - l > 0.03 }
  let za = z0, zb = z1
  while (za < zb && !wide(za)) za += 0.002
  while (zb > za && !wide(zb)) zb -= 0.002
  if (zb - za < 0.02) return
  const n = Math.max(2, Math.ceil((zb - za) / 0.02))
  const at_ = (z: number, y: number, side: 0 | 1): V3 => [span(z)[side], y, z]
  const zs = Array.from({ length: n + 1 }, (_, i) => za + ((zb - za) * i) / n)
  const zt = zs.map(z => Math.min(zb - e, Math.max(za + e, z)))
  const centre: V3 = [(span((za + zb) / 2)[0] + span((za + zb) / 2)[1]) / 2, (y0 + y1) / 2, (za + zb) / 2]
  // the outline at the shoulder (under the eased edge) and the top, point for point
  const ring = (z: number[], y: number): V3[] => [...z.map(q => at_(q, y, 1)), ...[...z].reverse().map(q => at_(q, y, 0))]
  const bottom = ring(zs, y0), shoulder = ring(zs, y1 - e), top = ring(zt, y1)
  k.polygon(top, X, f, centre)
  k.polygon(bottom, X, f, centre)
  for (let i = 0; i < bottom.length; i++) {
    const j = (i + 1) % bottom.length
    k.polygon([bottom[i]!, bottom[j]!, shoulder[j]!, shoulder[i]!], X, f, centre)
    k.polygon([shoulder[i]!, shoulder[j]!, top[j]!, top[i]!], X, f, centre)
  }
}

/** The floor: boards along the car, laid out to the wall all round, ripped where the wheels pass through. */
function floor(k: Kit): void {
  // the staves' inner face at the chime, less the joint's play
  const R = TUB.bottomR - TUB.wall - 0.003
  const width = TUB.plank, pitch = width + 0.004
  const count = Math.ceil((2 * R) / pitch)
  const slotsZ = [[SLOT.z0, SLOT.z1], [-SLOT.z1, -SLOT.z0]] as const
  for (let j = 0; j < count; j++) {
    const zc = (j - (count - 1) / 2) * pitch
    let zs: [number, number][] = [[Math.max(-R, zc - width / 2), Math.min(R, zc + width / 2)]]
    for (const [s0, s1] of slotsZ) {
      zs = zs.flatMap(([a, b]): [number, number][] => {
        if (b <= s0 || a >= s1) return [[a, b]]
        const parts: [number, number][] = []
        if (a < s0) parts.push([a, s0 - 0.002])
        parts.push([Math.max(a, s0), Math.min(b, s1)])
        if (b > s1) parts.push([s1 + 0.002, b])
        return parts
      })
    }
    for (const [z0, z1] of zs) {
      if (z1 - z0 < 0.02) continue
      const inSlot = slotsZ.some(([s0, s1]) => z0 >= s0 - 1e-6 && z1 <= s1 + 1e-6)
      const xs: [number, number][] = inSlot
        ? [[-Infinity, -SLOT.x1], [-SLOT.x0, SLOT.x0], [SLOT.x1, Infinity]]
        : [[-Infinity, Infinity]]
      // the boards darkened by the dirt eight men carry in on their feet, a step under the walls
      for (const [xa, xb] of xs) board(k, z0, z1, xa, xb, R, { tone: 0.48 + 0.12 * hash(3, j, z0, xa), wear: 0 })
    }
  }
}

function rings(k: Kit, iron: Kit): void {
  // the rim lip, eight sawn segments on the staves' heads
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.002, a1 = ((j + 1) * TAU) / 8 - 0.002
    k.arc(v(0, 0, 0), Y, X, TUB.lip.inner, TUB.lip.outer, a0, a1, TUB.rimY, TUB.lip.top, 12, { tone: tone(4, j) })
  }
  // an iron hoop round the chime, where a cooper drives one over the bottom's groove
  const b0 = TUB.bottomY + 0.006, b1 = TUB.floorTop - 0.004
  iron.lathe(v(0, 0, 0), Y, [[b0, wallRadius(b0) + 0.0008], [b0, wallRadius(b0) + 0.007], [b1, wallRadius(b1) + 0.007], [b1, wallRadius(b1) + 0.0008]], 120, { tone: 1 }, false)
}

/** Each wheel's stub axle in an outboard oak cheek, braced to the wall. */
function bearings(k: Kit, fine: Kit, iron: Kit): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hx = sx * HUB.x, hz = sz * HUB.z
    const cz = hz + sz * (WHEEL.hubLen / 2 + 0.08)
    const f = { tone: tone(5, sx, sz) }
    const top = HUB.y + 0.07
    k.box(v(hx, (TUB.floorTop + top) / 2 + 0.001, cz), [X, Y, Z], v(0.15, (top - TUB.floorTop) / 2, 0.06), f, 0.008, Y)
    // braced to the wall above the guns' barrels, just under the rim, its end sawn to the flaring wall corner by corner
    const braceY = TUB.rimY - 0.05
    const z0 = cz + sz * 0.06
    const c8: V3[] = []
    for (let i = 0; i < 8; i++) {
      const x = hx + (i & 1 ? 0.05 : -0.05), y = braceY + (i & 2 ? 0.035 : -0.035)
      const rIn = wallRadius(y) - TUB.wall - 0.004
      c8.push(v(x, y, i & 4 ? sz * Math.sqrt(rIn * rIn - x * x) : z0))
    }
    k.slab(c8, Z, { tone: tone(6, sx, sz) }, 0.008)
    // the axle, through the cheek and the hub, a linchpin past the hub
    const zOut = cz + sz * 0.06, zIn = hz - sz * (WHEEL.hubLen / 2 + 0.035)
    fine.rod(v(hx, HUB.y, zOut + sz * 0.02), v(hx, HUB.y, zIn), WHEEL.axleR, 14, { tone: tone(7, sx, sz), wear: 0.4 }, 0.006)
    iron.box(v(hx, HUB.y + 0.035, hz - sz * (WHEEL.hubLen / 2 + 0.02)), [Y, X, Z], v(0.05, 0.008, 0.005), { tone: 1 }, 0.002)
  }
}

/** The shafts' forked posts, an iron cap over each. */
function forks(k: Kit, iron: Kit): void {
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const x = sx * POSTS.x, z = sz * SHAFT.z, w = POSTS.w / 2
    const f = { tone: tone(8, sx, sz) }
    const top = HUB.y - SHAFT.half - 0.002
    k.box(v(x, (TUB.floorTop + top) / 2 + 0.001, z), [Y, X, Z], v((top - TUB.floorTop) / 2, w, w), f, 0.006)
    for (const side of [-1, 1]) {
      const pz = z + side * (SHAFT.half + 0.006 + 0.02)
      k.box(v(x, top + 0.06, pz), [Y, X, Z], v(0.065, w, 0.02), f, 0.005)
    }
    iron.arc(v(x, HUB.y, z), X, Y, SHAFT.half + 0.006, SHAFT.half + 0.014, -1.1, 1.1, -0.02, 0.02, 12, { tone: 1 })
  }
}

/** A board of thickness y0..y1 on a convex outline in plan (x, z), its grain along x. */
function prism(k: Kit, outline: [number, number][], y0: number, y1: number, f: Finish): void {
  const pts = outline.filter((p, i) => i === 0 || Math.hypot(p[0] - outline[i - 1]![0], p[1] - outline[i - 1]![1]) > 1e-4)
  const c: V3 = [pts.reduce((a, p) => a + p[0], 0) / pts.length, (y0 + y1) / 2, pts.reduce((a, p) => a + p[1], 0) / pts.length]
  k.polygon(pts.map(([x, z]) => v(x, y1, z)), X, f, c)
  k.polygon(pts.map(([x, z]) => v(x, y0, z)), X, f, c)
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[(i + 1) % pts.length]!
    k.polygon([v(ax, y0, az), v(bx, y0, bz), v(bx, y1, bz), v(ax, y1, az)], X, f, c)
  }
}

/** Under each wheel's slot a boarded well, its bottom cut only where the tread meets the ground, and a curb round
 * the slot on the floor, so wood shows through the floor where the stone did. */
function wells(k: Kit): void {
  const W = { t: 0.03, bottom: [0.012, 0.032] as const, curb: { w: 0.04, h: 0.024 } }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hx = sx * HUB.x
    const xa = sx > 0 ? SLOT.x0 : -SLOT.x1, xb = sx > 0 ? SLOT.x1 : -SLOT.x0
    const za = sz > 0 ? SLOT.z0 : -SLOT.z1, zb = sz > 0 ? SLOT.z1 : -SLOT.z0
    const tread = [sz * HUB.z - WHEEL.width / 2 - 0.02, sz * HUB.z + WHEEL.width / 2 + 0.02].sort((p, q) => p - q) as [number, number]
    const cutX = 0.24
    // under the floor, out of the light and in the ground's dirt: darker than the floor
    const f = (j: number): Finish => ({ tone: 0.36 + 0.08 * hash(70, sx, sz, j), wear: 0 })
    // the slot's far corners run into the wall, which closes them: on the floor a board stops 5 mm short of the
    // staves; under the floor, where the staves end, the well runs 1 cm on under their foot and no further, so no
    // board shows under the skirt's foot from outside
    const Rc = TUB.bottomR - TUB.wall - 0.005, Rb = TUB.bottomR - TUB.wall + 0.01
    // a board that runs out to where an eye outside sees in under the skirt's foot (about 17 cm in from it) lies in the
    // ground's mud and the skirt's shadow, so it never shows pale through the gap under the foot
    const MUD = TUB.bottomR - 0.17
    const mud = (j: number): Finish => ({ tone: 0.12 + 0.03 * hash(71, sx, sz, j), wear: 0 })
    const slabAt = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, j: number, grain: V3 = X): void => {
      const R = y1 <= TUB.bottomY ? Rb : Rc
      const reach = Math.sqrt(Math.max(0, R * R - Math.max(z0 * z0, z1 * z1)))
      x0 = Math.max(x0, -reach); x1 = Math.min(x1, reach)
      if (x1 - x0 < 0.02 || z1 - z0 < 0.005) return
      const out = Math.hypot(Math.max(Math.abs(x0), Math.abs(x1)), Math.max(Math.abs(z0), Math.abs(z1)))
      k.box(v((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), [X, Y, Z], v((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), y1 <= TUB.bottomY && out > MUD ? mud(j) : f(j), 0.003, grain)
    }
    const [y0, y1] = W.bottom
    const X0 = xa - W.t, X1 = xb + W.t, Z0 = za - W.t, Z1 = zb + W.t
    // the bottom, in four boards round the tread's cut; the one toward the wall sawn on the wall's curve
    const reachAt = (z: number): number => Math.sqrt(Math.max(0, Rb * Rb - z * z))
    const curved = (inner: number, outer: number, j: number): void => {
      const n = 12, pts: [number, number][] = [[inner, Z0]]
      for (let i = 0; i <= n; i++) { const z = Z0 + ((Z1 - Z0) * i) / n; pts.push([sx * Math.min(Math.abs(outer), reachAt(z)), z]) }
      pts.push([inner, Z1])
      prism(k, pts, y0, y1, mud(j))
    }
    if (sx > 0) { slabAt(X0, hx - cutX, y0, y1, Z0, Z1, 0); curved(hx + cutX, X1, 1) }
    else { curved(hx - cutX, X0, 0); slabAt(hx + cutX, X1, y0, y1, Z0, Z1, 1) }
    slabAt(hx - cutX + 0.002, hx + cutX - 0.002, y0, y1, Z0, tread[0], 2)
    slabAt(hx - cutX + 0.002, hx + cutX - 0.002, y0, y1, tread[1], Z1, 3)
    // its four sides, from the bottom to the floor's underside
    const top = TUB.bottomY - 0.002
    slabAt(X0, X1, y1 + 0.001, top, Z0, za - 0.002, 4)
    slabAt(X0, X1, y1 + 0.001, top, zb + 0.002, Z1, 5)
    slabAt(X0, xa - 0.002, y1 + 0.001, top, za, zb, 6, Z)
    slabAt(xb + 0.002, X1, y1 + 0.001, top, za, zb, 7, Z)
    // the curb on the floor, its corners lapped
    const c = W.curb, fy0 = TUB.floorTop + 0.001, fy1 = TUB.floorTop + c.h
    slabAt(xa - c.w, xb + c.w, fy0, fy1, za - c.w - 0.003, za - 0.003, 8)
    slabAt(xa - c.w, xb + c.w, fy0, fy1, zb + 0.003, zb + c.w + 0.003, 9)
    slabAt(xa - c.w - 0.003, xa - 0.003, fy0, fy1 - 0.004, za - 0.002, zb + 0.002, 10, Z)
    slabAt(xb + 0.003, xb + c.w + 0.003, fy0, fy1 - 0.004, za - 0.002, zb + 0.002, 11, Z)
  }
}

/** Eight kneeling boards: four at each crank, two each side of it. */
function places(k: Kit): void {
  for (const sz of [-1, 1]) for (const side of [-1, 1]) for (const sx of [-1, 1]) {
    const z = sz * (SHAFT.z + side * 0.5)
    // polished by knees and darkened by sweat and the floor's dirt, not paled
    k.box(v(sx * 0.2, TUB.floorTop + 0.016, z), [X, Y, Z], v(0.18, 0.015, 0.1), { tone: 0.6 + 0.08 * hash(9, sz, side, sx), wear: 0.3 }, 0.006)
  }
}

/* ── THE COVER ───────────────────────────────────────────────────────────── */

const BAND = COVER.band
const CONE_TOP_R = COVER.topR + COVER.sill.w / 2

/** A cone board's outer end and thickness: each sawn and split a little differently. */
function coneBoard(i: number): { r0: number; th: number } {
  return { r0: COVER.kick.from + 0.008 * (hash(11, i) - 0.5), th: COVER.boardT * (0.92 + 0.16 * hash(12, i)) }
}
/** The kick course's top surface: a line at the kick's slope that passes just under every cone board's lower
 * foot corner, so the boards above lap over it with no board running into it. */
const KICK_TOP = (() => {
  const { kick, slope } = COVER
  let y0 = Infinity
  for (let i = 0; i < COVER.boards; i++) {
    const { r0, th } = coneBoard(i)
    const rb = r0 - th * Math.sin(slope), yb = coneY(r0) - th * Math.cos(slope)
    y0 = Math.min(y0, yb - 0.003 + (rb - kick.from) * Math.tan(kick.slope))
  }
  return (r: number): number => y0 - (r - kick.from) * Math.tan(kick.slope)
})()

export interface CoverNail { board: number; ring: number; slot: number; r: number; a: number; across: number; head: number; tilt: number; tone: number; reach: number }
/** The nails through the cone boards into the hidden hoops, set by hand: each hoop bent a little out of round,
 * each nail driven where the board took it (off its middle line, a little up or down the slope), a second nail
 * beside it on some boards, each head its own size and lean; some bleed a black run down the wet oak below them. */
export function coverNails(): CoverNail[] {
  const out: CoverNail[] = []
  const n = COVER.boards, da = TAU / n
  for (let i = 0; i < n; i++) {
    const { r0 } = coneBoard(i)
    COVER.nailRings.forEach((s, ring) => {
      const a0 = i * da
      const bend = 0.014 * Math.sin(2 * (a0 + 0.9 * ring)) + 0.007 * Math.sin(5 * a0 + 2.1 * ring)
      const base = r0 + (CONE_TOP_R - r0) * s + bend
      const pair = hash(50, i, ring) < 0.28
      for (let slot = 0; slot < (pair ? 2 : 1); slot++) {
        const side = pair ? (slot === 0 ? -1 : 1) : 0
        const across = side * (0.17 + 0.08 * hash(51, i, ring, slot)) + (hash(52, i, ring, slot) - 0.5) * (pair ? 0.12 : 0.44)
        const r = base + (hash(53, i, ring, slot) - 0.5) * (pair ? 0.02 : 0.034)
        const bleeds = hash(54, i, ring, slot) < 0.36
        out.push({
          board: i, ring, slot, r, a: a0 + (0.5 + across) * da, across,
          head: 0.0082 + 0.0036 * hash(55, i, ring, slot),
          tilt: hash(56, i, ring, slot) < 0.2 ? 0.08 + 0.14 * hash(57, i, ring, slot) : 0.03 * hash(58, i, ring, slot),
          tone: 0.75 + 0.4 * hash(15, i, ring, slot),
          reach: bleeds ? 0.08 + 0.24 * hash(59, i, ring, slot) : 0,
        })
      }
    })
  }
  return out
}

function cone(k: Kit, iron: Kit): void {
  // the eave band, a thick rim of eight curved boards on the tub's lip
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.0015, a1 = ((j + 1) * TAU) / 8 - 0.0015
    k.arc(v(0, 0, 0), Y, X, BAND.r0, BAND.r1, a0, a1, BAND.y0, BAND.y1, 16, { tone: tone(10, j) })
  }
  const n = COVER.boards, da = TAU / n
  // the kick: short boards laid flatter under the cone boards' feet, their joints between the boards above
  const K = COVER.kick
  for (let i = 0; i < n; i++) {
    const a0 = (i + 0.5) * da, a1 = (i + 1.5) * da
    const rOut = COVER.eaveEdge + 0.008 * (hash(60, i) - 0.5)
    const p00 = at(rOut, a0, KICK_TOP(rOut)), p01 = at(rOut, a1, KICK_TOP(rOut)), p10 = at(K.inner, a0, KICK_TOP(K.inner)), p11 = at(K.inner, a1, KICK_TOP(K.inner))
    const nOut = norm(cross(sub(p10, p00), sub(p01, p00)))
    const outward = dot(nOut, radial((a0 + a1) / 2)) + nOut[1] > 0 ? nOut : mul(nOut, -1)
    const d = mul(outward, -K.t * (0.93 + 0.14 * hash(61, i)))
    const c8 = [add(p00, d), add(p01, d), p00, p01, add(p10, d), add(p11, d), p10, p11]
    k.slab(c8, norm(sub(p10, p00)), { tone: tone(62, i), weather: 1 }, 0.004)
  }
  const nails = coverNails()
  const faces: { p: V3; n: V3 }[] = []
  for (let i = 0; i < n; i++) {
    const a0 = i * da, a1 = (i + 1) * da
    const { r0, th } = coneBoard(i)
    const r1 = CONE_TOP_R
    const p00 = at(r0, a0, coneY(r0)), p01 = at(r0, a1, coneY(r0)), p10 = at(r1, a0, coneY(r1)), p11 = at(r1, a1, coneY(r1))
    const nOut = norm(cross(sub(p10, p00), sub(p01, p00)))
    const outward = dot(nOut, radial((a0 + a1) / 2)) + nOut[1] > 0 ? nOut : mul(nOut, -1)
    const d = mul(outward, -th)
    // index = x + 2y + 4z: x across the board, y through it, z along it
    const c8 = [add(p00, d), add(p01, d), p00, p01, add(p10, d), add(p11, d), p10, p11]
    const grain = norm(sub(p10, p00))
    k.slab(c8, grain, { tone: tone(13, i), weather: 1 }, 0.0045)
    faces.push({ p: p00, n: outward })
  }
  // each nail's head on its board's flat face, square to it but for the few that went in crooked
  for (const nail of nails) {
    const face = faces[nail.board]!
    const onCone = at(nail.r, nail.a, coneY(nail.r))
    const p = add(onCone, mul(face.n, 0.0004 - dot(sub(onCone, face.p), face.n)))
    const sideways = norm(cross(face.n, radial(nail.a)))
    const lean = norm(add(face.n, mul(sideways, nail.tilt * (hash(63, nail.board, nail.ring, nail.slot) < 0.5 ? -1 : 1))))
    const h = nail.head
    iron.lathe(p, lean, [[0, h], [0.003, h * 0.93], [0.0055 + 0.002 * hash(64, nail.board, nail.ring, nail.slot), h * 0.6], [0.0072, 0]], 8, { tone: nail.tone }, true)
  }
  // the lookout as the sheet draws it: a flat ring on the cone, a narrow
  // sighting slot all round, a low cap of boards and ribs, a spike on top
  const sillY0 = CONE_TOP_Y - COVER.sill.below
  for (let j = 0; j < 6; j++) {
    const a0 = (j * TAU) / 6 + 0.002, a1 = ((j + 1) * TAU) / 6 - 0.002
    k.arc(v(0, 0, 0), Y, X, COVER.sill.r - COVER.sill.w / 2, COVER.sill.r + COVER.sill.w / 2, a0, a1, sillY0, SILL_TOP, 12, { tone: tone(16, j) })
  }
  for (let j = 0; j < COVER.posts; j++) {
    const a = ((j + 0.5) * TAU) / COVER.posts
    const p = at(COVER.postR, a, (SILL_TOP + CAP_FOOT) / 2)
    k.box(p, [Y, radial(a), cross(radial(a), Y)], v(COVER.slot / 2 + 0.006, COVER.postW / 2, COVER.postW / 2), { tone: tone(17, j) }, 0.005)
  }
  const cap = COVER.cap
  const ringTop = CAP_RING_TOP
  for (let j = 0; j < 6; j++) {
    const a0 = (j * TAU) / 6 + 0.002, a1 = ((j + 1) * TAU) / 6 - 0.002
    k.arc(v(0, 0, 0), Y, X, cap.ringR - 0.05, cap.ringR + 0.05, a0, a1, CAP_FOOT, ringTop, 12, { tone: tone(18, j) })
  }
  const cn = cap.boards, cda = TAU / cn
  for (let i = 0; i < cn; i++) {
    const a0 = i * cda, a1 = (i + 1) * cda
    const r0 = cap.r + 0.02, r1 = 0.03
    const p00 = at(r0, a0, capY(r0)), p01 = at(r0, a1, capY(r0)), p10 = at(r1, a0, capY(r1)), p11 = at(r1, a1, capY(r1))
    const nOut = norm(cross(sub(p10, p00), sub(p01, p00)))
    const outward = dot(nOut, radial((a0 + a1) / 2)) + nOut[1] > 0 ? nOut : mul(nOut, -1)
    const d = mul(outward, -cap.t)
    const c8 = [add(p00, d), add(p01, d), p00, p01, add(p10, d), add(p11, d), p10, p11]
    k.slab(c8, norm(sub(p10, p00)), { tone: tone(19, i) }, 0.004)
    // a rib over the joint, as the sheet's cap is drawn in ribs, ending with the boards
    const a = a0, w = 0.02 / r0
    const b0 = at(r0, a - w, capY(r0)), b1 = at(r0, a + w, capY(r0))
    const e0 = at(0.06, a - 0.02 / 0.06 * 0.5, capY(0.06)), e1 = at(0.06, a + 0.02 / 0.06 * 0.5, capY(0.06))
    const up = mul(norm(add(radial(a), mul(Y, 1 / Math.tan(cap.slope)))), 0.03)
    const lift = mul(up, 0.04)
    const rib = [add(b0, lift), add(b1, lift), add(b0, up), add(b1, up), add(e0, lift), add(e1, lift), add(e0, up), add(e1, up)]
    k.slab(rib, norm(sub(e0, b0)), { tone: tone(20, i) * 0.9 }, 0.004)
  }
  // the spike: a turned oak finial, an iron ferrule at its foot
  k.lathe(v(0, KNOB_FOOT, 0), Y, [[0, 0.05], [0.02, 0.058], [0.04, COVER.knob.r], [0.07, 0.03], [0.1, 0.02], [0.13, 0.009], [COVER.knob.h, 0]], 18, { tone: tone(21) }, true)
  iron.lathe(v(0, KNOB_FOOT + 0.004, 0), Y, [[0, 0.06], [0.014, 0.06]], 18, { tone: 1 }, false)
}

/* ── THE GUNS ────────────────────────────────────────────────────────────── */

/** A small bronze piece of the 1480s as a type, breech to muzzle: the
 * button, the base ring, two reinforces with their rings, the chase girdle,
 * the chase, the muzzle astragal and the swell of the muzzle. */
const BARREL: [number, number][] = [
  [-0.075, 0], [-0.072, 0.014], [-0.064, 0.024], [-0.052, 0.026], [-0.042, 0.018], [-0.03, 0.017], [-0.018, 0.045],
  [-0.006, 0.066], [0, GUN.breechR], [0.032, GUN.breechR], [0.037, 0.067],
  [0.3, 0.063], [0.3, 0.07], [0.33, 0.07], [0.336, 0.061],
  [0.52, 0.058], [0.52, 0.064], [0.545, 0.064], [0.55, 0.056],
  [0.79, GUN.muzzleR], [0.796, 0.057], [0.812, 0.057], [0.818, 0.051],
  [0.85, 0.053], [0.88, 0.059], [0.905, 0.064], [GUN.length, 0.061], [GUN.length, GUN.bore],
]
const barrelR = (s: number): number => {
  for (let i = 0; i + 1 < BARREL.length; i++) {
    const [s0, r0] = BARREL[i]!, [s1, r1] = BARREL[i + 1]!
    if (s >= s0 && s <= s1 && s1 > s0) return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0)
  }
  return GUN.muzzleR
}

function guns(k: Kit, iron: Kit, bronze: Kit): void {
  const muzzle = wallRadius(TUB.ports.y) + GUN.out
  const breech = muzzle - GUN.length
  const wallIn = wallRadius(TUB.ports.y) - TUB.wall
  PORT_ANGLES_DEG.forEach((deg, j) => {
    const a = portAngle(deg), g = radial(a), side = cross(Y, g)
    // the barrel lies low in its port: the collar is square to the leaning wall, the bore level, and its top would graze the collar's lip
    const origin = add(mul(g, breech), mul(Y, TUB.ports.y - 0.005))
    const shade = tone(22, j)
    // the muzzle end darkened by its own smoke, the breech dulled by hands
    bronze.lathe(origin, g, BARREL, 32, { tone: shade }, false, undefined, s => (s > GUN.length - 0.06 ? 0.7 : s < 0.04 ? 0.86 : 1))
    bronze.lathe(add(origin, mul(g, GUN.length)), mul(g, -1), [[0, GUN.bore], [0.12, GUN.bore]], 16, { tone: 0.1 }, true)
    // the oak stock the barrel is bedded in, resting on the floor, short of the wall where it turns in at the bilge
    const s0 = breech - 0.03, s1 = Math.min(wallIn, wallRadius(TUB.floorTop) - TUB.wall) - 0.02
    const top = TUB.ports.y - GUN.breechR * 0.5, bottom = TUB.floorTop + 0.001
    k.box(add(mul(g, (s0 + s1) / 2), mul(Y, (top + bottom) / 2)), [g, Y, side], v((s1 - s0) / 2, (top - bottom) / 2, 0.085), { tone: tone(23, j) }, 0.01)
    for (const s of [0.16, 0.42]) {
      const r = barrelR(s)
      iron.lathe(add(origin, mul(g, s - 0.018)), g, [[0, r - 0.002], [0, r + 0.007], [0.036, r + 0.007], [0.036, r - 0.002]], 24, { tone: 1 }, false)
    }
  })
}

/* ── A WHEEL, about its own hub ──────────────────────────────────────────── */

/** Each felloe is sawn from its own board. */
const FELLOE_TONES = [1.0, 0.93, 1.05, 0.96, 1.02] as const

export function wheel(sx: number, sz: number): Body {
  const b = body()
  const inward = -sz
  const seed = sx * 3 + sz
  const w2 = WHEEL.width / 2
  b.fine.lathe(v(0, 0, -WHEEL.hubLen / 2), Z, [
    [0, 0.094], [0.02, 0.108], [0.09, WHEEL.hubR], [0.19, WHEEL.hubR], [0.26, 0.108], [WHEEL.hubLen, 0.094],
  ], 24, { tone: tone(30, seed) }, true, undefined, s => (s < 0.03 || s > WHEEL.hubLen - 0.03 ? 0.72 : 1))
  for (const s of [-0.115, 0.105]) forgedBand(b.iron, v(0, 0, s), Z, 0.107, 0.116, 0.02, 32, [34, seed, s])
  for (let k = 0; k < WHEEL.spokes; k++) {
    const a = (k * TAU) / WHEEL.spokes + SPOKES.zero
    const d: V3 = [Math.cos(a), Math.sin(a), 0], t: V3 = [-Math.sin(a), Math.cos(a), 0]
    const ends = [[0.1, 0.036, 0.028], [WHEEL.felloeIn + 0.03, 0.028, 0.022]] as const
    const c8: V3[] = []
    for (let i = 0; i < 8; i++) {
      const [r, hw, hz] = ends[i & 1]!
      c8.push(add(mul(d, r), add(mul(t, i & 2 ? hw : -hw), v(0, 0, i & 4 ? hz : -hz))))
    }
    // one spoke of each wheel carries a painted band: the mark that shows the wheel's turn
    const marked = k === (sx < 0 ? SPOKES.rear : SPOKES.front)
    b.rough.slab(c8, d, { tone: 0.74 + 0.1 * hash(31, seed, k), ...(marked ? { mark: 1 } : {}) }, 0.007)
  }
  for (let j = 0; j < WHEEL.felloes; j++) {
    const joint = (j * TAU) / WHEEL.felloes
    const a0 = joint + 0.003, a1 = joint + TAU / WHEEL.felloes - 0.003
    const ft = FELLOE_TONES[j]! * (0.96 + 0.08 * hash(32, seed, j))
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.felloeIn, WHEEL.tread, a0, a1, -w2, w2, 14, { tone: ft, wear: 0, mark: 3 })
    // the tread, worn by the ground, a skin over the felloe's face
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.tread - 0.002, WHEEL.tread + 0.0012, a0, a1, -w2 + 0.0015, w2 - 0.0015, 14, { tone: ft * 0.82, wear: 0.9, seed: ft }, false)
    // an iron strake nailed over the joint
    b.iron.arc(v(0, 0, 0), Z, X, WHEEL.tread + 0.0015, WHEEL.tread + 0.008, joint - 0.09, joint + 0.09, -w2 + 0.004, w2 - 0.004, 6, { tone: 1 }, true)
  }
  for (let j = 0; j < PEGS.count; j++) {
    const a = (j * TAU) / PEGS.count
    const p: V3 = [PEGS.pitch * Math.cos(a), PEGS.pitch * Math.sin(a), 0]
    // each peg driven right through the felloe, its end standing a little proud of the outer face, as a mill's
    // cogs are mortised through the rim: the ring of round ends the sheet draws on the face it shows
    const back = w2 + PEGS.proud, length = back + w2 + PEGS.stand
    const from = add(p, v(0, 0, -inward * back)), to = add(p, v(0, 0, inward * (w2 + PEGS.stand)))
    // shaved from riven oak as the staves are, its grain along it; polished where the lantern's staves bear on the
    // peg's outer half, grimed at its root and at its outer end
    const past = (u: number): number => u * length - back - w2
    shaved(b.rough, from, to, PEGS.r, 7, { tone: tone(33, seed, j) * PEGS.endTone, wear: 0.15 }, [35, seed, j], 12, 0.004,
      u => 0.95 * smooth(0.05, 0.09, past(u)), u => (0.66 + 0.34 * smooth(0, 0.028, past(u))) / PEGS.endTone)
  }
  return b
}

/* ── A SHAFT, about its own axis, with its crank and its two lanterns ────── */

/** A lantern disc's two faces, each three boards across, their joints closed tight (the boards told apart by their
 * tone, as glued and pinned boards are; an open joint showed straight through the hollow disc), the face grain
 * dressed by hand so the tool's strokes show; a ring of grime round the shaft where the grease runs out. */
function discFaces(k: Kit, xd: number, seed: number): void {
  const R = LANTERN.discR - 0.012, T = LANTERN.discT
  const cuts = [-R, -R / 3 + 0.03 * (hash(48, seed) - 0.5), R / 3 + 0.03 * (hash(49, seed) - 0.5), R]
  for (const side of [-1, 1]) {
    const x = xd + (side * T) / 2
    for (let i = 0; i < 3; i++) {
      const z0 = cuts[i]!, z1 = cuts[i + 1]!
      const pts: V3[] = []
      const n = 14
      // up one chord, round the arc, down the other: a convex segment of the circle
      for (let j = 0; j <= n; j++) {
        const z = z0 + ((z1 - z0) * j) / n
        pts.push(v(x, Math.sqrt(Math.max(0, R * R - z * z)), z))
      }
      for (let j = n; j >= 0; j--) {
        const z = z0 + ((z1 - z0) * j) / n
        pts.push(v(x, -Math.sqrt(Math.max(0, R * R - z * z)), z))
      }
      const clean = pts.filter((p, j) => j === 0 || len(sub(p, pts[j - 1]!)) > 1e-5)
      k.polygon(clean, Y, { tone: tone(42, seed, i) * (0.92 + 0.16 * hash(65, seed, side, i)), mark: 2 }, v(xd, 0, (z0 + z1) / 2))
    }
  }
}

/** A rod shaved from riven stock: `facets` flat faces of their own widths round its axis, each face's corners on the
 * circle of radius `r` (so it is never fuller than the round rod it stands for) and every corner eased by a narrow
 * face; rows along it so wear and grime grade; flat end grain, the far end chamfered by `tip`. */
function shaved(k: Kit, a: V3, b: V3, r: number, facets: number, f: Finish, seed: number[], rows: number, tip = 0, wearAt?: (u: number) => number, grimeAt?: (u: number) => number): void {
  const d = sub(b, a), l = len(d), w = norm(d)
  const helper: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const e1 = norm(cross(helper, w)), e2 = cross(w, e1)
  // the corners' angles: each facet its own width, the set turned by its own amount
  const widths = Array.from({ length: facets }, (_, i) => 0.7 + 0.6 * hash(84, ...seed, i))
  const total = widths.reduce((s, x) => s + x, 0), turn = TAU * hash(85, ...seed)
  const corners: number[] = []
  let acc = 0
  for (const x of widths) { corners.push(turn + (acc / total) * TAU); acc += x }
  const ease = 0.16
  const angles = corners.flatMap(c => [c - ease / 2, c + ease / 2])
  const ring = (s: number, rr: number): V3[] => angles.map(t => add(add(a, mul(w, s)), add(mul(e1, Math.cos(t) * rr), mul(e2, Math.sin(t) * rr))))
  const faceNormal = (i: number): V3 => { const m = (angles[i]! + (angles[(i + 1) % angles.length]! + (i + 1 === angles.length ? TAU : 0))) / 2; return add(mul(e1, Math.cos(m)), mul(e2, Math.sin(m))) }
  const finishAt = (s: number): Finish => {
    let g: Finish = wearAt ? { ...f, wear: Math.max(f.wear ?? 0, wearAt(s / l)) } : f
    if (grimeAt) g = { ...g, seed: f.seed ?? f.tone, tone: f.tone * grimeAt(s / l) }
    return g
  }
  const body = l - tip
  const ss = Array.from({ length: rows + 1 }, (_, j) => (body * j) / rows)
  const n = angles.length
  const arc = (i: number): number => angles[i]! * r
  for (let j = 0; j < rows; j++) {
    const s0 = ss[j]!, s1 = ss[j + 1]!, p0 = ring(s0, r), p1 = ring(s1, r), f0 = finishAt(s0), f1 = finishAt(s1)
    for (let i = 0; i < n; i++) {
      const q = (i + 1) % n, nn = faceNormal(i), v1 = arc(i), v2 = q === 0 ? (angles[0]! + TAU) * r : arc(q)
      k.smoothQuad([p0[i]!, p0[q]!, p1[q]!, p1[i]!], [nn, nn, nn, nn], [[s0, v1], [s0, v2], [s1, v2], [s1, v1]], f, 0, [f0, f0, f1, f1])
    }
  }
  const inside = add(a, mul(w, l / 2))
  k.polygon(ring(0, r), w, finishAt(0), inside)
  if (tip > 0) {
    const pa = ring(body, r), pb = ring(l, r - tip), fa = finishAt(body), fb = finishAt(l)
    for (let i = 0; i < n; i++) {
      const q = (i + 1) % n, nn = norm(add(faceNormal(i), w))
      k.smoothQuad([pa[i]!, pa[q]!, pb[q]!, pb[i]!], [nn, nn, nn, nn], [[body, arc(i)], [body, arc(i) + 0.01], [l, arc(i) + 0.01], [l, arc(i)]], f, 0, [fa, fa, fb, fb])
    }
    k.polygon(pb, w, fb, inside)
  } else k.polygon(ring(l, r), w, finishAt(l), inside)
}

/** An iron band forged round a turned piece: drawn out under the hammer, so its face wanders a little in and its
 * edges a little in from true, its tone goes in patches where the hammer and the fire left it, and its two ends lap
 * where the smith welded it. Never fuller than the true band from `r0` to `r1` and `s0` to `s1` along `axis`. */
function forgedBand(k: Kit, origin: V3, axis: V3, r0: number, r1: number, width: number, segments: number, seed: number[]): void {
  const w = norm(axis)
  const helper: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const e1 = norm(cross(helper, w)), e2 = cross(w, e1)
  const ph = [0, 1, 2, 3, 4, 5].map(i => TAU * hash(86, ...seed, i))
  const wave = (t: number, o: number): number => 0.5 + 0.25 * Math.sin(3 * t + ph[o]!) + 0.15 * Math.sin(7 * t + ph[o + 1]!) + 0.1 * Math.sin(13 * t + ph[o + 2]!)
  const lap = TAU * hash(87, ...seed), lapLen = 0.22
  const inLap = (t: number): boolean => { let u = t - lap; u -= Math.floor(u / TAU) * TAU; return u < lapLen }
  // the face 0.4 to 1.2 mm in, but where the lapped end lies over the band; the edges 0 to 1.2 mm in
  const rOut = (t: number): number => (inLap(t) ? r1 : r1 - 0.0004 - 0.0008 * wave(t, 0))
  const sA = (t: number): number => 0.0012 * wave(t, 1), sB = (t: number): number => width - 0.0012 * wave(t, 3)
  const tone = (t: number): number => 0.62 + 0.42 * hash(88, ...seed, Math.floor((t / TAU) * 11)) + 0.22 * wave(t, 2)
  const at = (t: number, r: number, s: number): V3 => add(origin, add(mul(w, s), add(mul(e1, Math.cos(t) * r), mul(e2, Math.sin(t) * r))))
  const radial = (t: number): V3 => add(mul(e1, Math.cos(t)), mul(e2, Math.sin(t)))
  // two samples a hair apart where the lapped end stops, so its edge is a step, not a ramp
  const end = (((lap + lapLen) % TAU) + TAU) % TAU
  const ts = [...Array.from({ length: segments + 1 }, (_, i) => (i / segments) * TAU), end - 1e-4, end + 1e-4].filter(t => t >= 0 && t <= TAU).sort((p, q) => p - q)
  for (let i = 0; i + 1 < ts.length; i++) {
    const ta = ts[i]!, tb = ts[i + 1]!, fa = { tone: tone(ta) }, fb = { tone: tone(tb) }
    const ua = (ta * (r0 + r1)) / 2, ub = (tb * (r0 + r1)) / 2
    // each hammer blow leaves a flat: the face is flat between samples, tilted its own way along the band
    const tilt = 0.22 * (hash(92, ...seed, i) - 0.5), mid = (ta + tb) / 2, fn = norm(add(radial(mid), mul(w, tilt)))
    k.smoothQuad([at(ta, rOut(ta), sA(ta)), at(tb, rOut(tb), sA(tb)), at(tb, rOut(tb), sB(tb)), at(ta, rOut(ta), sB(ta))], [fn, fn, fn, fn], [[ua, 0], [ub, 0], [ub, width], [ua, width]], fa, 0, [fa, fb, fb, fa])
    for (const [s, sign] of [[sA, -1], [sB, 1]] as const) {
      const n = mul(w, sign)
      k.smoothQuad([at(ta, r0, s(ta)), at(tb, r0, s(tb)), at(tb, rOut(tb), s(tb)), at(ta, rOut(ta), s(ta))], [n, n, n, n], [[ua, 0], [ub, 0], [ub, r1 - r0], [ua, r1 - r0]], fa, 0, [fa, fb, fb, fa])
    }
  }
}

/** A lantern stave as a wheelwright shaves it: seven to nine flat facets of their own widths, eased where they meet,
 * thinning a little toward its tenons; and where the pegs bear on it, on both its flanks since the drive turns both
 * ways, a shallow worn flat, polished. Never fuller than the turned stave it replaces, so no clearance shrinks. */
function rundle(k: Kit, x0: number, l: number, o: V3, contact: number, f: Finish, seed: number[]): void {
  const R = LANTERN.staveR, n = 7 + Math.floor(3 * hash(80, ...seed))
  const out = norm(o), side = norm(cross(X, out))
  // the facets' edges, each facet its own width
  const edges: number[] = []
  let acc = 0
  for (let i = 0; i < n; i++) { edges.push(acc); acc += 0.75 + 0.5 * hash(81, ...seed, i) }
  const turn = TAU * hash(82, ...seed)
  const ang = edges.map(e => turn + (e / acc) * TAU)
  const faceted = (phi: number): number => {
    let p = phi - turn; p -= Math.floor(p / TAU) * TAU
    let i = 0; while (i + 1 < n && turn + p >= ang[i + 1]!) i++
    const lo = ang[i]! - turn, hi = (i + 1 < n ? ang[i + 1]! - turn : TAU), half = (hi - lo) / 2
    return Math.cos(half) / Math.cos(p - lo - half)
  }
  const { depth, half: bandHalf } = RUNDLE.wear
  const band = (x: number): number => 1 - smooth(bandHalf * 0.6, bandHalf, Math.abs(x - contact))
  // the flanks face along `side`; the wear takes a flat off each
  const flank = (phi: number): number => Math.max(0, Math.abs(Math.cos(phi)) - 0.55) / 0.45
  const thin = 0.02 * hash(83, ...seed)
  const radius = (phi: number, x: number): number => {
    const u = (x - x0) / l
    const r = R * (0.32 + 0.68 * faceted(phi)) * (1 - thin * (1 - Math.sin(Math.PI * u)))
    return Math.min(r, R) - depth * band(x) * flank(phi)
  }
  const at_ = (phi: number, x: number): V3 => add(v(x, 0, 0), add(o, add(mul(side, Math.cos(phi) * radius(phi, x)), mul(out, Math.sin(phi) * radius(phi, x)))))
  const xs = new Set<number>()
  for (let i = 0; i <= 10; i++) xs.add(x0 + (l * i) / 10)
  for (let d = -RUNDLE.wear.half - 0.01; d <= RUNDLE.wear.half + 0.0101; d += 0.01) {
    const x = contact + d
    if (x > x0 && x < x0 + l) xs.add(x)
  }
  const rows = [...xs].sort((p, q) => p - q)
  const segs = RUNDLE.segments
  const phis = Array.from({ length: segs + 1 }, (_, j) => (j / segs) * TAU)
  const normalAt = (phi: number, x: number): V3 => {
    const e = 1e-3
    const t = sub(at_(phi + e, x), at_(phi - e, x)), a2 = sub(at_(phi, x + e), at_(phi, x - e))
    const n2 = norm(cross(a2, t))
    const radial2 = sub(at_(phi, x), add(v(x, 0, 0), o))
    return dot(n2, radial2) < 0 ? mul(n2, -1) : n2
  }
  const grime = (x: number): number => { const u = (x - x0) / l; return 0.7 + 0.3 * smooth(0.12, 0.22, Math.min(u, 1 - u)) }
  const finishAt = (phi: number, x: number): Finish => ({ ...f, seed: f.tone, tone: f.tone * grime(x), wear: Math.max(f.wear ?? 0, 0.9 * band(x) * flank(phi)) })
  for (let i = 0; i + 1 < rows.length; i++) {
    const xa = rows[i]!, xb = rows[i + 1]!
    for (let j = 0; j < segs; j++) {
      const pa = phis[j]!, pb = phis[j + 1]!
      const p: [V3, V3, V3, V3] = [at_(pa, xa), at_(pb, xa), at_(pb, xb), at_(pa, xb)]
      const nn: [V3, V3, V3, V3] = [normalAt(pa, xa), normalAt(pb, xa), normalAt(pb, xb), normalAt(pa, xb)]
      const uvs: [number, number][] = [[xa, pa * R], [xa, pb * R], [xb, pb * R], [xb, pa * R]]
      k.smoothQuad(p, nn, uvs, f, 0, [finishAt(pa, xa), finishAt(pb, xa), finishAt(pb, xb), finishAt(pa, xb)])
    }
  }
  // the tenons' end grain, flat across each end
  for (const x of [x0, x0 + l]) k.polygon(phis.slice(0, segs).map(phi => at_(phi, x)), X, { ...f, tone: f.tone * grime(x) }, add(v(x0 + l / 2, 0, 0), o))
}

export function shaft(sz: number): Body {
  const b = body()
  const seed = sz
  const half = SHAFT.half
  // the shaft runs whole through the crank frame's feet: the frame's lower rail, hewn eight-square from one oak and
  // turned round only where it runs in the fork posts' iron caps
  const journal = POSTS.w / 2 + 0.03
  const cuts = [-SHAFT.end, -POSTS.x - journal, -POSTS.x + journal, POSTS.x - journal, POSTS.x + journal, SHAFT.end]
  for (let i = 0; i + 1 < cuts.length; i++) {
    const x0 = cuts[i]!, x1 = cuts[i + 1]!, f = { tone: tone(40, seed) }
    if (i % 2 === 1) b.rough.lathe(v(x0, 0, 0), X, [[0, half - 0.004], [0.004, half], [x1 - x0 - 0.004, half], [x1 - x0, half - 0.004]], 16, { ...f, wear: 0.5 }, false)
    else shaved(b.rough, v(x0, 0, 0), v(x1, 0, 0), half, 8, f, [41, seed, i], 3)
  }
  for (const sx of [-1, 1]) {
    const x0 = sx * CRANK.cheekX
    // the crank's heavy cheek, from below the axis to past the grip
    b.rough.box(v(x0, (CRANK.throw - 0.06) / 2 + 0.02, 0), [Y, X, Z], v((CRANK.throw + 0.1) / 2, CRANK.cheekT / 2, CRANK.cheekW / 2), { tone: tone(41, seed, sx) }, 0.012)
    // iron straps binding the cheek to the shaft at its foot and to the grip at its head
    for (const [y, h] of [[0, 0.05], [CRANK.throw - 0.01, 0.045]] as const) b.iron.box(v(x0, y, 0), [Y, X, Z], v(h, CRANK.cheekT / 2 + 0.004, CRANK.cheekW / 2 + 0.005), { tone: 1 }, 0.003)
    // the lantern: two thick discs bound with iron, ten staves between them
    const xl = sx * LANTERN.x
    for (const e of [-1, 1]) {
      const xd = xl + e * LANTERN.half
      b.fine.lathe(v(xd - LANTERN.discT / 2, 0, 0), X, [[0, LANTERN.discR - 0.012], [0.01, LANTERN.discR], [LANTERN.discT - 0.01, LANTERN.discR], [LANTERN.discT, LANTERN.discR - 0.012]], 36, { tone: tone(42, seed, sx, e) }, false)
      discFaces(b.fine, xd, seed * 10 + sx * 3 + e)
      forgedBand(b.iron, v(xd - 0.016, 0, 0), X, LANTERN.discR - 0.002, LANTERN.discR + 0.004, 0.032, 48, [42, seed, sx, e])
      // the band's nails, eight round it, none quite where the last smith would have put it, each headed by hand to
      // its own size and height, some driven in crooked
      for (let j = 0; j < 8; j++) {
        const g = ((j + 0.5 + 0.55 * (hash(45, seed, sx, e, j) - 0.5)) * TAU) / 8
        const out: V3 = [0, Math.sin(g), Math.cos(g)]
        const h = 0.0055 + 0.002 * hash(89, seed, sx, e, j), up = 0.0035 + 0.002 * hash(90, seed, sx, e, j)
        const lean = norm(add(out, v(0.25 * (hash(91, seed, sx, e, j) - 0.5), 0, 0)))
        b.iron.lathe(add(v(xd + 0.008 * (hash(46, seed, sx, e, j) - 0.5), 0, 0), mul(out, LANTERN.discR + 0.0035)), lean, [[0, h], [0.0025, h * 0.93], [up - 0.001, h * 0.55], [up, 0]], 8, { tone: 0.7 + 0.45 * hash(47, seed, sx, e, j) }, true)
      }
    }
    // the staves run through the discs and stand a little proud of their outer faces, as through-tenons;
    // shaved by hand, each worn on both flanks where the pegs bear on it, grimed where it enters the discs; in the
    // hewn oak, whose photograph runs its grain along the stave (the veneer's figure lies across a rod)
    const a = xl - LANTERN.half - LANTERN.discT / 2 - 0.003, l = 2 * (LANTERN.half + LANTERN.discT / 2 + 0.003)
    const contact = sx * (HUB.x - PEGS.pitch + RUNDLE.wear.shift)
    for (let k = 0; k < LANTERN.staves; k++) {
      const beta = ((k + 0.5) * TAU) / LANTERN.staves
      // turned about +X from the point nearest the wheel, so two staves straddle the contact
      const o: V3 = [0, Math.sin(beta) * LANTERN.pitch, Math.cos(beta) * sz * LANTERN.pitch]
      rundle(b.rough, a, l, o, contact, { tone: tone(43, seed, sx, k), wear: 0.1 }, [seed, sx, k])
    }
  }
  // the grip, shaved from riven oak as the staves are and worn by the crew's hands, palest where the hands go
  shaved(b.rough, v(-CRANK.cheekX - 0.06, CRANK.throw, 0), v(CRANK.cheekX + 0.06, CRANK.throw, 0), CRANK.gripR, 9, { tone: tone(44, seed), wear: 0.6 }, [44, seed], 8, 0,
    u => 0.6 + 0.4 * smooth(0.1, 0.25, Math.min(u, 1 - u)))
  return b
}

/* ── THE BODIES ──────────────────────────────────────────────────────────── */

export interface Bodies {
  tub: Body
  cover: Body
  guns: Body
}

/** The tub's pieces apart, for the geometry checks: the wall (staves, collars, lip, hoop), the floor, the fittings. */
export function tubPieces(): { wall: Kit; floor: Kit; fittings: Kit } {
  const wall = new Kit(), boards = new Kit(), fittings = new Kit()
  for (let i = 0; i < TUB.staves; i++) stave(wall, i)
  PORT_ANGLES_DEG.forEach((deg, j) => collar(wall, deg, j))
  rings(wall, wall)
  floor(boards)
  bearings(fittings, fittings, fittings)
  forks(fittings, fittings)
  places(fittings)
  wells(fittings)
  return { wall, floor: boards, fittings }
}

export function buildBodies(): Bodies {
  const tub = body(), cover = body(), gun = body()
  for (let i = 0; i < TUB.staves; i++) stave(tub.rough, i)
  PORT_ANGLES_DEG.forEach((deg, j) => collar(tub.rough, deg, j))
  floor(tub.rough)
  rings(tub.rough, tub.iron)
  bearings(tub.rough, tub.fine, tub.iron)
  forks(tub.rough, tub.iron)
  places(tub.rough)
  wells(tub.rough)
  cone(cover.rough, cover.iron)
  guns(gun.rough, gun.iron, gun.bronze)
  return { tub, cover, guns: gun }
}

