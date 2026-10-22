/** THE CAR'S PIECES, built in metres from `plan.ts`. Each body (the tub that
 * stands, the cover, the guns, each wheel, each shaft) is a set of kits by
 * surface: rough sawn oak, finer turned oak, forged iron, cast bronze. A
 * wheel is built about its own hub and a shaft about its own axis, so the
 * joints turn them where they turn.
 */
import {
  COVER, CRANK, GUN, PORT_ANGLES_DEG, HUB, LANTERN, PEGS, POSTS, SHAFT, SPOKES, TAU, TUB, WHEEL,
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

/** The port's oak collar on the skirt, square to the wall. */
function collar(k: Kit, deg: number, j: number): void {
  const a = portAngle(deg), y = TUB.ports.y
  const r = wallRadius(y)
  const dr = (wallRadius(y + 0.01) - wallRadius(y - 0.01)) / 0.02
  const n = norm(add(radial(a), mul(Y, -dr)))
  const origin = add(at(r, a, y), mul(n, -0.004))
  // the collar's face blackened round the muzzle by the guns' smoke
  k.lathe(origin, n, [[0, TUB.ports.r], [0, TUB.ports.collar], [0.026, TUB.ports.collar - 0.004], [0.03, TUB.ports.r + 0.012], [0.03, TUB.ports.r]], 24, { tone: tone(2, j) }, false, undefined, s => (s > 0.027 ? 0.62 : 1))
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

function cone(k: Kit, iron: Kit): void {
  // the eave band, a thick rim of eight curved boards on the tub's lip
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.0015, a1 = ((j + 1) * TAU) / 8 - 0.0015
    k.arc(v(0, 0, 0), Y, X, BAND.r0, BAND.r1, a0, a1, BAND.y0, BAND.y1, 16, { tone: tone(10, j) })
  }
  // the fascia: eight curved boards hung from the boards' ends, the sheet's thick rim, an iron band round its foot
  const F = COVER.fascia, under = coneY(F.r1) - (COVER.boardT * 1.09) / Math.cos(COVER.slope) - 0.002
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.0015, a1 = ((j + 1) * TAU) / 8 - 0.0015
    k.arc(v(0, 0, 0), Y, X, F.r0, F.r1, a0 + 0.1, a1 + 0.1, F.bottom, under, 18, { tone: tone(9, j) })
  }
  iron.lathe(v(0, 0, 0), Y, [[F.bottom + 0.014, F.r1 + 0.0008], [F.bottom + 0.014, F.r1 + 0.007], [F.bottom + 0.056, F.r1 + 0.007], [F.bottom + 0.056, F.r1 + 0.0008]], 180, { tone: 1 }, false)
  const n = COVER.boards, da = TAU / n, t = COVER.boardT
  for (let i = 0; i < n; i++) {
    const a0 = i * da, a1 = (i + 1) * da
    const r0 = COVER.eaveEdge + 0.01 * (hash(11, i) - 0.5), r1 = COVER.topR + COVER.sill.w / 2
    const p00 = at(r0, a0, coneY(r0)), p01 = at(r0, a1, coneY(r0)), p10 = at(r1, a0, coneY(r1)), p11 = at(r1, a1, coneY(r1))
    const nOut = norm(cross(sub(p10, p00), sub(p01, p00)))
    const outward = dot(nOut, radial((a0 + a1) / 2)) + nOut[1] > 0 ? nOut : mul(nOut, -1)
    const th = t * (0.92 + 0.16 * hash(12, i))
    const d = mul(outward, -th)
    // index = x + 2y + 4z: x across the board, y through it, z along it
    const c8 = [add(p00, d), add(p01, d), p00, p01, add(p10, d), add(p11, d), p10, p11]
    const grain = norm(sub(p10, p00))
    k.slab(c8, grain, { tone: tone(13, i), weather: 1 }, 0.0045)
    // the rings of nail heads where the hidden hoops lie under the boards
    COVER.nailRings.forEach((s, ring) => {
      const r = r0 + (r1 - r0) * s
      const jitter = (hash(14, i, ring) - 0.5) * 0.4
      const a = (a0 + a1) / 2 + jitter * da * 0.5
      const p = add(at(r, a, coneY(r)), mul(outward, 0.0005))
      iron.lathe(p, outward, [[0, 0.0095], [0.003, 0.0088], [0.006, 0.0058], [0.0074, 0]], 8, { tone: 0.85 + 0.3 * hash(15, i, ring) }, true)
    })
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
    const p = at(COVER.sill.r, a, (SILL_TOP + CAP_FOOT) / 2)
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
    // a rib over the joint, as the sheet's cap is drawn in ribs, standing past the eave
    const a = a0, w = 0.02 / r0
    const b0 = at(r0 + 0.03, a - w, capY(r0 + 0.03)), b1 = at(r0 + 0.03, a + w, capY(r0 + 0.03))
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
  for (const s of [-0.115, 0.105]) b.iron.lathe(v(0, 0, s), Z, [[0, 0.107], [0, 0.116], [0.02, 0.116], [0.02, 0.107]], 24, { tone: 1 }, false)
  for (let k = 0; k < WHEEL.spokes; k++) {
    const a = (k * TAU) / WHEEL.spokes + SPOKES.zero
    const d: V3 = [Math.cos(a), Math.sin(a), 0], t: V3 = [-Math.sin(a), Math.cos(a), 0]
    const ends = [[0.1, 0.036, 0.028], [WHEEL.felloeIn + 0.03, 0.028, 0.022]] as const
    const c8: V3[] = []
    for (let i = 0; i < 8; i++) {
      const [r, hw, hz] = ends[i & 1]!
      c8.push(add(mul(d, r), add(mul(t, i & 2 ? hw : -hw), v(0, 0, i & 4 ? hz : -hz))))
    }
    // one spoke of pale ash among darker oak: the hand that shows the wheel's turn
    if (k === (sx < 0 ? SPOKES.rear : SPOKES.front)) {
      const broad = c8.map((p, i): V3 => add(p, mul(t, (i & 2 ? 1 : -1) * (i & 1 ? 0.006 : 0.008))))
      b.fine.slab(broad, d, { tone: 2.6, seed: 0.913 }, 0.007)
    } else b.rough.slab(c8, d, { tone: 0.74 + 0.1 * hash(31, seed, k) }, 0.007)
  }
  for (let j = 0; j < WHEEL.felloes; j++) {
    const joint = (j * TAU) / WHEEL.felloes
    const a0 = joint + 0.003, a1 = joint + TAU / WHEEL.felloes - 0.003
    const ft = FELLOE_TONES[j]! * (0.96 + 0.08 * hash(32, seed, j))
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.felloeIn, WHEEL.tread, a0, a1, -w2, w2, 14, { tone: ft, wear: 0 })
    // the tread, worn by the ground, a skin over the felloe's face
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.tread - 0.002, WHEEL.tread + 0.0012, a0, a1, -w2 + 0.0015, w2 - 0.0015, 14, { tone: ft * 0.82, wear: 0.9, seed: ft }, false)
    // an iron strake nailed over the joint
    b.iron.arc(v(0, 0, 0), Z, X, WHEEL.tread + 0.0015, WHEEL.tread + 0.008, joint - 0.09, joint + 0.09, -w2 + 0.004, w2 - 0.004, 6, { tone: 1 }, true)
  }
  for (let j = 0; j < PEGS.count; j++) {
    const a = (j * TAU) / PEGS.count
    const p: V3 = [PEGS.pitch * Math.cos(a), PEGS.pitch * Math.sin(a), 0]
    const from = add(p, v(0, 0, inward * (w2 - 0.02))), to = add(p, v(0, 0, inward * (w2 + PEGS.stand)))
    // polished where the lantern's staves bear on the peg's outer half, grimed at its root
    const root = 0.02 / (0.02 + PEGS.stand)
    b.fine.rod(from, to, PEGS.r, 12, { tone: tone(33, seed, j), wear: 0.15 }, 0.007, {
      rows: 10, wearAt: u => 0.95 * smooth(0.45, 0.8, u), grimeAt: u => 0.66 + 0.34 * smooth(root, root + 0.18, u),
    })
  }
  return b
}

/* ── A SHAFT, about its own axis, with its crank and its two lanterns ────── */

export function shaft(sz: number): Body {
  const b = body()
  const seed = sz
  const half = SHAFT.half
  // the shaft runs whole through the crank frame's feet: the frame's lower rail
  b.rough.lathe(v(-SHAFT.end, 0, 0), X, [[0, half], [2 * SHAFT.end, half]], 16, { tone: tone(40, seed) }, true)
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
      b.fine.lathe(v(xd - LANTERN.discT / 2, 0, 0), X, [[0, LANTERN.discR - 0.012], [0.01, LANTERN.discR], [LANTERN.discT - 0.01, LANTERN.discR], [LANTERN.discT, LANTERN.discR - 0.012]], 36, { tone: tone(42, seed, sx, e) }, true)
      b.iron.lathe(v(xd - 0.016, 0, 0), X, [[0, LANTERN.discR - 0.002], [0, LANTERN.discR + 0.004], [0.032, LANTERN.discR + 0.004], [0.032, LANTERN.discR - 0.002]], 36, { tone: 1 }, false)
    }
    // where the pegs bear on the staves (the ring's side toward the car's middle), polished; grimed where they enter the discs
    const a = xl - LANTERN.half - 0.01, l = 2 * LANTERN.half + 0.02
    const contact = (sx * (HUB.x - PEGS.pitch) - a) / l
    for (let k = 0; k < LANTERN.staves; k++) {
      const beta = ((k + 0.5) * TAU) / LANTERN.staves
      // turned about +X from the point nearest the wheel, so two staves straddle the contact
      const o: V3 = [0, Math.sin(beta) * LANTERN.pitch, Math.cos(beta) * sz * LANTERN.pitch]
      b.fine.rod(add(v(a, 0, 0), o), add(v(a + l, 0, 0), o), LANTERN.staveR, 12, { tone: tone(43, seed, sx, k), wear: 0.1 }, 0.003, {
        rows: 18, wearAt: u => 0.8 * (1 - smooth(0.04, 0.17, Math.abs(u - contact))), grimeAt: u => 0.7 + 0.3 * smooth(0.04, 0.14, Math.min(u, 1 - u)),
      })
    }
  }
  // the grip, worn smooth by the crew's hands
  b.fine.rod(v(-CRANK.cheekX - 0.06, CRANK.throw, 0), v(CRANK.cheekX + 0.06, CRANK.throw, 0), CRANK.gripR, 18, { tone: tone(44, seed), wear: 1 }, 0.008)
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
  cone(cover.rough, cover.iron)
  guns(gun.rough, gun.iron, gun.bronze)
  return { tub, cover, guns: gun }
}

