/** THE CAR'S PIECES, built in metres from `plan.ts`. Each body (the tub that
 * stands, the cover, the guns, each wheel, each shaft) is a set of kits by
 * surface: rough sawn oak, finer turned oak, forged iron, cast bronze. A
 * wheel is built about its own hub and a shaft about its own axis, so the
 * joints turn them where they turn.
 */
import {
  COVER, CRANK, GUN, GUN_ANGLES_DEG, HUB, LANTERN, PEGS, POSTS, SHAFT, TAU, TUB, WHEEL,
  CONE_TOP_Y, SILL_TOP, CAP_FOOT, CAP_RING_TOP, KNOB_FOOT, capY, coneY, wallRadius,
} from './plan'
import { Kit, add, cross, dot, hash, len, mul, norm, sub, v, type V3 } from './kit'

export type Surface = 'rough' | 'fine' | 'iron' | 'bronze'
export type Body = Record<Surface, Kit>
const body = (): Body => ({ rough: new Kit(), fine: new Kit(), iron: new Kit(), bronze: new Kit() })

const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1]
const at = (r: number, a: number, y: number): V3 => [r * Math.cos(a), y, r * Math.sin(a)]
const radial = (a: number): V3 => [Math.cos(a), 0, Math.sin(a)]
const tone = (...seed: number[]): number => 0.86 + 0.26 * hash(...seed)

/* ── THE TUB ─────────────────────────────────────────────────────────────── */

/** Where the wheels pass through the floor: x from..to, z from..to, near side. */
export const SLOT = {
  x0: HUB.x - 0.42, x1: HUB.x + 0.42,
  z0: HUB.z - WHEEL.width / 2 - PEGS.stand - PEGS.r - 0.02, z1: HUB.z + WHEEL.width / 2 + 0.025,
}

function stave(k: Kit, i: number): void {
  const n = TUB.staves, da = TAU / n, ac = i * da
  const gap = 0.0016
  const ported = i % (n / TUB.ports.count) === 0
  const f = { tone: tone(1, i) }
  const ys: number[] = []
  for (let y: number = TUB.bottomY; y < TUB.rimY - 1e-6; ) {
    ys.push(y)
    const inPort = ported && Math.abs(y - TUB.ports.y) < TUB.ports.r + 0.02
    y = Math.min(TUB.rimY, y + (inPort ? 0.01 : 0.045))
  }
  ys.push(TUB.rimY)
  // positions across the stave by arc length s from its centre line
  const half = (r: number): number => (da / 2) * r - gap
  const outer = (s: number, y: number): V3 => { const r = wallRadius(y); return at(r, ac + s / r, y) }
  const inner = (s: number, y: number): V3 => { const r = wallRadius(y) - TUB.wall; return at(r, ac + s / wallRadius(y), y) }
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
    const spans: [number, number, number, number][] = w0 > 0 || w1 > 0
      ? [[-h0, -w0, -h1, -w1], [w0, h0, w1, h1]]
      : [[-h0, h0, -h1, h1]]
    for (const [a0, b0, a1, b1] of spans) {
      const inside = mid((a0 + b0 + a1 + b1) / 4, (y0 + y1) / 2)
      k.polygon([outer(a0, y0), outer(b0, y0), outer(b1, y1), outer(a1, y1)], Y, f, inside)
      k.polygon([inner(a0, y0), inner(b0, y0), inner(b1, y1), inner(a1, y1)], Y, f, inside)
    }
    // the stave's own two long edges
    const centre = mid(0, (y0 + y1) / 2)
    k.polygon([outer(-h0, y0), outer(-h1, y1), inner(-h1, y1), inner(-h0, y0)], Y, f, centre)
    k.polygon([outer(h0, y0), outer(h1, y1), inner(h1, y1), inner(h0, y0)], Y, f, centre)
    // the port's round wall, row by row
    if (w0 > 0 || w1 > 0) {
      for (const side of [-1, 1]) {
        const p = [outer(side * w0, y0), outer(side * w1, y1), inner(side * w1, y1), inner(side * w0, y0)]
        k.polygon(p, Y, f, mid(side * (Math.max(w0, w1) + 0.01), (y0 + y1) / 2))
      }
    }
  }
  const top = TUB.rimY, bottom = TUB.bottomY
  const ht = half(wallRadius(top)), hb = half(wallRadius(bottom))
  k.polygon([outer(-ht, top), outer(ht, top), inner(ht, top), inner(-ht, top)], radial(ac), f, mid(0, top - 0.05))
  k.polygon([outer(-hb, bottom), outer(hb, bottom), inner(hb, bottom), inner(-hb, bottom)], radial(ac), f, mid(0, bottom + 0.05))
}

/** The port's oak collar on the skirt, square to the wall. */
function collar(k: Kit, j: number): void {
  const a = (j * TAU) / TUB.ports.count, y = TUB.ports.y
  const r = wallRadius(y)
  const dr = (wallRadius(y + 0.01) - wallRadius(y - 0.01)) / 0.02
  const n = norm(add(radial(a), mul(Y, -dr)))
  const origin = add(at(r, a, y), mul(n, -0.004))
  k.lathe(origin, n, [[0, TUB.ports.r], [0, TUB.ports.collar], [0.028, TUB.ports.collar - 0.004], [0.03, TUB.ports.r + 0.006], [0.03, TUB.ports.r]], 20, { tone: tone(2, j) }, false)
}

function floor(k: Kit): void {
  const R = wallRadius(TUB.bottomY) - TUB.wall - 0.008
  const width = TUB.plank, pitch = width + 0.004
  const y0 = TUB.bottomY, y1 = TUB.floorTop
  const count = Math.floor((2 * R) / pitch)
  // the floor's own slots: a plank is ripped where a slot crosses it
  const slotsZ = [[SLOT.z0, SLOT.z1], [-SLOT.z1, -SLOT.z0]] as const
  for (let j = 0; j < count; j++) {
    const zc = (j - (count - 1) / 2) * pitch
    let zs: [number, number][] = [[zc - width / 2, zc + width / 2]]
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
      const edge = Math.max(Math.abs(z0), Math.abs(z1))
      if (edge >= R - 0.05) continue
      const L = Math.sqrt(R * R - edge * edge)
      const inSlot = slotsZ.some(([s0, s1]) => z0 >= s0 - 1e-6 && z1 <= s1 + 1e-6)
      const xs: [number, number][] = inSlot
        ? [[-L, -SLOT.x1], [-SLOT.x0, SLOT.x0], [SLOT.x1, L]]
        : [[-L, L]]
      for (const [x0, x1] of xs) {
        if (x1 - x0 < 0.08) continue
        const f = { tone: tone(3, j, z0), wear: 0 }
        k.box(v((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), [X, Y, Z], v((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), f, 0.004)
      }
    }
  }
}

function rings(k: Kit, iron: Kit): void {
  // the rim lip, eight sawn segments on the staves' heads
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.002, a1 = ((j + 1) * TAU) / 8 - 0.002
    k.arc(v(0, 0, 0), Y, X, TUB.lip.inner, TUB.lip.outer, a0, a1, TUB.rimY, TUB.lip.top, 12, { tone: tone(4, j) })
  }
  // an iron band round the bilge, where a cooper would drive one
  const b0 = TUB.bottomY + 0.1, b1 = b0 + 0.045
  iron.lathe(v(0, 0, 0), Y, [[b0, wallRadius(b0) + 0.0008], [b0, wallRadius(b0) + 0.007], [b1, wallRadius(b1) + 0.007], [b1, wallRadius(b1) + 0.0008]], 120, { tone: 1 }, false)
}

/** Each wheel's stub axle in an outboard oak cheek, braced to the wall. */
function bearings(k: Kit, fine: Kit, iron: Kit): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hx = sx * HUB.x, hz = sz * HUB.z
    const cz = hz + sz * (WHEEL.hubLen / 2 + 0.08)
    const f = { tone: tone(5, sx, sz) }
    k.box(v(hx, (TUB.floorTop + 0.7) / 2 + 0.001, cz), [X, Y, Z], v(0.15, (0.7 - TUB.floorTop) / 2, 0.06), f, 0.008, Y)
    const rIn = wallRadius(0.55) - TUB.wall
    const zWall = Math.sqrt(rIn * rIn - hx * hx) - 0.01
    const z0 = cz + sz * 0.06, z1 = sz * zWall
    k.box(v(hx, 0.55, (z0 + z1) / 2), [Z, Y, X], v(Math.abs(z1 - z0) / 2, 0.045, 0.055), { tone: tone(6, sx, sz) }, 0.008)
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
      const pz = z + side * (SHAFT.half + 0.006 + 0.015)
      k.box(v(x, top + 0.055, pz), [Y, X, Z], v(0.06, w, 0.015), f, 0.004)
    }
    iron.arc(v(x, HUB.y, z), X, Y, SHAFT.half + 0.006, SHAFT.half + 0.014, -1.1, 1.1, -0.02, 0.02, 12, { tone: 1 })
  }
}

/** Eight kneeling boards: four at each crank, two each side of it. */
function places(k: Kit): void {
  for (const sz of [-1, 1]) for (const side of [-1, 1]) for (const sx of [-1, 1]) {
    const z = sz * (SHAFT.z + side * 0.56)
    k.box(v(sx * 0.22, TUB.floorTop + 0.016, z), [X, Y, Z], v(0.19, 0.015, 0.14), { tone: tone(9, sz, side, sx), wear: 0.85 }, 0.006)
  }
}

/* ── THE COVER ───────────────────────────────────────────────────────────── */

const BAND = COVER.band

function cone(k: Kit, iron: Kit): void {
  for (let j = 0; j < 8; j++) {
    const a0 = (j * TAU) / 8 + 0.0015, a1 = ((j + 1) * TAU) / 8 - 0.0015
    k.arc(v(0, 0, 0), Y, X, BAND.r0, BAND.r1, a0, a1, BAND.y0, BAND.y1, 12, { tone: tone(10, j) })
  }
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
    k.slab(c8, grain, { tone: tone(13, i) }, 0.0045)
    // the rings of nail heads where the hidden hoops lie under the boards
    COVER.nailRings.forEach((s, ring) => {
      const r = r0 + (r1 - r0) * s
      const jitter = (hash(14, i, ring) - 0.5) * 0.4
      const a = (a0 + a1) / 2 + jitter * da * 0.5
      const p = add(at(r, a, coneY(r)), mul(outward, 0.0005))
      iron.lathe(p, outward, [[0, 0.0085], [0.003, 0.0078], [0.0055, 0.0052], [0.0068, 0]], 8, { tone: 0.85 + 0.3 * hash(15, i, ring) }, true)
    })
  }
  // the lookout: a sill ring, eight posts, the sighting slot, the cap
  const sillY0 = CONE_TOP_Y - COVER.sill.below
  for (let j = 0; j < 6; j++) {
    const a0 = (j * TAU) / 6 + 0.002, a1 = ((j + 1) * TAU) / 6 - 0.002
    k.arc(v(0, 0, 0), Y, X, COVER.sill.r - COVER.sill.w / 2, COVER.sill.r + COVER.sill.w / 2, a0, a1, sillY0, SILL_TOP, 10, { tone: tone(16, j) })
  }
  for (let j = 0; j < COVER.posts; j++) {
    const a = ((j + 0.5) * TAU) / COVER.posts
    const p = at(COVER.sill.r, a, (SILL_TOP + CAP_FOOT) / 2)
    k.box(p, [Y, radial(a), cross(radial(a), Y)], v(COVER.slot / 2 + 0.012, COVER.postW / 2, COVER.postW / 2), { tone: tone(17, j) }, 0.006)
  }
  const cap = COVER.cap
  const ringTop = CAP_RING_TOP
  for (let j = 0; j < 6; j++) {
    const a0 = (j * TAU) / 6 + 0.002, a1 = ((j + 1) * TAU) / 6 - 0.002
    k.arc(v(0, 0, 0), Y, X, cap.ringR - 0.045, cap.ringR + 0.045, a0, a1, CAP_FOOT, ringTop, 10, { tone: tone(18, j) })
  }
  const cn = cap.boards, cda = TAU / cn
  for (let i = 0; i < cn; i++) {
    const a0 = i * cda, a1 = (i + 1) * cda
    const r0 = cap.r + 0.025, r1 = 0.035
    const p00 = at(r0, a0, capY(r0)), p01 = at(r0, a1, capY(r0)), p10 = at(r1, a0, capY(r1)), p11 = at(r1, a1, capY(r1))
    const nOut = norm(cross(sub(p10, p00), sub(p01, p00)))
    const outward = dot(nOut, radial((a0 + a1) / 2)) + nOut[1] > 0 ? nOut : mul(nOut, -1)
    const d = mul(outward, -cap.t)
    const c8 = [add(p00, d), add(p01, d), p00, p01, add(p10, d), add(p11, d), p10, p11]
    k.slab(c8, norm(sub(p10, p00)), { tone: tone(19, i) }, 0.004)
    // a rib over the joint, as the sheet's cap is drawn in ribs
    const a = a0, w = 0.022 / r0
    const b0 = at(r0 - 0.01, a - w, capY(r0 - 0.01)), b1 = at(r0 - 0.01, a + w, capY(r0 - 0.01))
    const e0 = at(0.07, a - 0.022 / 0.07 * 0.5, capY(0.07)), e1 = at(0.07, a + 0.022 / 0.07 * 0.5, capY(0.07))
    const up = mul(norm(add(radial(a), mul(Y, 1 / Math.tan(cap.slope)))), 0.026)
    const lift = mul(up, 0.04)
    const rib = [add(b0, lift), add(b1, lift), add(b0, up), add(b1, up), add(e0, lift), add(e1, lift), add(e0, up), add(e1, up)]
    k.slab(rib, norm(sub(e0, b0)), { tone: tone(20, i) * 0.92 }, 0.004)
  }
  k.lathe(v(0, KNOB_FOOT, 0), Y, [[0, 0.04], [0.025, 0.05], [0.055, COVER.knob.r], [0.095, 0.048], [0.12, 0.022], [COVER.knob.h, 0]], 18, { tone: tone(21) }, true)
}

/* ── THE GUNS ────────────────────────────────────────────────────────────── */

const BARREL: [number, number][] = [
  [-0.07, 0], [-0.066, 0.022], [-0.045, 0.03], [-0.03, 0.02], [-0.016, 0.055], [0, GUN.breechR], [0.09, GUN.breechR],
  [0.1, 0.071], [0.48, 0.067], [0.5, 0.074], [0.53, 0.074], [0.545, 0.066], [0.93, GUN.muzzleR + 0.004],
  [0.97, GUN.muzzleR + 0.012], [1.02, GUN.muzzleR + 0.014], [GUN.length, GUN.muzzleR + 0.004], [GUN.length, GUN.bore],
]
const barrelR = (s: number): number => {
  for (let i = 0; i + 1 < BARREL.length; i++) {
    const [s0, r0] = BARREL[i]!, [s1, r1] = BARREL[i + 1]!
    if (s >= s0 && s <= s1 && s1 > s0) return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0)
  }
  return GUN.muzzleR
}

function guns(k: Kit, iron: Kit, bronze: Kit): void {
  GUN_ANGLES_DEG.forEach((deg, j) => {
    const a = (deg * Math.PI) / 180, g = radial(a), side = cross(Y, g)
    const muzzle = wallRadius(TUB.ports.y) + GUN.out
    const breech = muzzle - GUN.length
    const origin = add(mul(g, breech), mul(Y, TUB.ports.y))
    bronze.lathe(origin, g, BARREL, 28, { tone: tone(22, j) }, false)
    bronze.lathe(add(origin, mul(g, GUN.length)), mul(g, -1), [[0, GUN.bore], [0.12, GUN.bore]], 16, { tone: 0.1 }, true)
    // the oak stock the barrel is bedded in, resting on the floor
    const s0 = breech - 0.04, s1 = 2.0
    const top = TUB.ports.y - GUN.breechR * 0.55, bottom = TUB.floorTop + 0.001
    k.box(add(mul(g, (s0 + s1) / 2), mul(Y, (top + bottom) / 2)), [g, Y, side], v((s1 - s0) / 2, (top - bottom) / 2, 0.1), { tone: tone(23, j) }, 0.01)
    for (const s of [0.28, 0.74]) {
      const r = barrelR(s)
      iron.lathe(add(origin, mul(g, s - 0.02)), g, [[0, r - 0.002], [0, r + 0.008], [0.04, r + 0.008], [0.04, r - 0.002]], 24, { tone: 1 }, false)
    }
  })
}

/* ── A WHEEL, about its own hub ──────────────────────────────────────────── */

export function wheel(sx: number, sz: number): Body {
  const b = body()
  const inward = -sz
  const seed = sx * 3 + sz
  const w2 = WHEEL.width / 2
  b.fine.lathe(v(0, 0, -WHEEL.hubLen / 2), Z, [
    [0, 0.094], [0.02, 0.108], [0.09, WHEEL.hubR], [0.19, WHEEL.hubR], [0.26, 0.108], [WHEEL.hubLen, 0.094],
  ], 24, { tone: tone(30, seed) }, true)
  for (const s of [-0.115, 0.105]) b.iron.lathe(v(0, 0, s), Z, [[0, 0.107], [0, 0.116], [0.02, 0.116], [0.02, 0.107]], 24, { tone: 1 }, false)
  for (let k = 0; k < WHEEL.spokes; k++) {
    const a = (k * TAU) / WHEEL.spokes
    const d: V3 = [Math.cos(a), Math.sin(a), 0], t: V3 = [-Math.sin(a), Math.cos(a), 0]
    const ends = [[0.1, 0.036, 0.028], [WHEEL.felloeIn + 0.03, 0.028, 0.022]] as const
    const c8: V3[] = []
    for (let i = 0; i < 8; i++) {
      const [r, hw, hz] = ends[i & 1]!
      c8.push(add(mul(d, r), add(mul(t, i & 2 ? hw : -hw), v(0, 0, i & 4 ? hz : -hz))))
    }
    b.rough.slab(c8, d, { tone: tone(31, seed, k) }, 0.007)
  }
  for (let j = 0; j < WHEEL.felloes; j++) {
    const joint = (j * TAU) / WHEEL.felloes + TAU / (WHEEL.spokes * 2)
    const a0 = joint + 0.003, a1 = joint + TAU / WHEEL.felloes - 0.003
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.felloeIn, WHEEL.tread, a0, a1, -w2, w2, 14, { tone: tone(32, seed, j), wear: 0 })
    // the tread, worn by the ground, a skin over the felloe's face
    b.rough.arc(v(0, 0, 0), Z, X, WHEEL.tread - 0.002, WHEEL.tread + 0.0012, a0, a1, -w2 + 0.0015, w2 - 0.0015, 14, { tone: tone(32, seed, j) * 0.9, wear: 0.9 }, false)
    // an iron strake nailed over the joint
    b.iron.arc(v(0, 0, 0), Z, X, WHEEL.tread + 0.0015, WHEEL.tread + 0.008, joint - 0.09, joint + 0.09, -w2 + 0.004, w2 - 0.004, 6, { tone: 1 })
  }
  for (let j = 0; j < PEGS.count; j++) {
    const a = (j * TAU) / PEGS.count
    const p: V3 = [PEGS.pitch * Math.cos(a), PEGS.pitch * Math.sin(a), 0]
    const from = add(p, v(0, 0, inward * (w2 - 0.02))), to = add(p, v(0, 0, inward * (w2 + PEGS.stand)))
    b.fine.rod(from, to, PEGS.r, 12, { tone: tone(33, seed, j), wear: 0.55 }, 0.007)
  }
  return b
}

/* ── A SHAFT, about its own axis, with its crank and its two lanterns ────── */

export function shaft(sz: number): Body {
  const b = body()
  const seed = sz
  const half = SHAFT.half
  for (const sx of [-1, 1]) {
    const x0 = sx * CRANK.cheekX, x1 = sx * SHAFT.end
    b.rough.lathe(v(Math.min(x0, x1), 0, 0), X, [[0, half], [Math.abs(x1 - x0), half]], 14, { tone: tone(40, seed, sx) }, true)
    // the crank's cheek, from the axis to the throw
    b.rough.box(v(x0, (CRANK.throw - 0.06) / 2 + 0.02, 0), [Y, X, Z], v((CRANK.throw + 0.1) / 2, CRANK.cheekT / 2, CRANK.cheekW / 2), { tone: tone(41, seed, sx) }, 0.008)
    // the lantern: two discs bound with iron, six staves between them
    const xl = sx * LANTERN.x
    for (const e of [-1, 1]) {
      const xd = xl + e * LANTERN.half
      b.fine.lathe(v(xd - LANTERN.discT / 2, 0, 0), X, [[0, LANTERN.discR - 0.01], [0.008, LANTERN.discR], [LANTERN.discT - 0.008, LANTERN.discR], [LANTERN.discT, LANTERN.discR - 0.01]], 28, { tone: tone(42, seed, sx, e) }, true)
      b.iron.lathe(v(xd - 0.012, 0, 0), X, [[0, LANTERN.discR - 0.002], [0, LANTERN.discR + 0.006], [0.024, LANTERN.discR + 0.006], [0.024, LANTERN.discR - 0.002]], 28, { tone: 1 }, false)
    }
    for (let k = 0; k < LANTERN.staves; k++) {
      const beta = ((k + 0.5) * TAU) / LANTERN.staves
      // turned about +X from the point nearest the wheel, so two staves straddle the contact
      const o: V3 = [0, Math.sin(beta) * LANTERN.pitch, Math.cos(beta) * sz * LANTERN.pitch]
      b.fine.rod(add(v(xl - LANTERN.half - 0.01, 0, 0), o), add(v(xl + LANTERN.half + 0.01, 0, 0), o), LANTERN.staveR, 10, { tone: tone(43, seed, sx, k), wear: 0.55 }, 0.003)
    }
  }
  // the grip, worn smooth by the crew's hands
  b.fine.rod(v(-CRANK.cheekX - 0.035, CRANK.throw, 0), v(CRANK.cheekX + 0.035, CRANK.throw, 0), CRANK.gripR, 16, { tone: tone(44, seed), wear: 1 }, 0.006)
  return b
}

/* ── THE BODIES ──────────────────────────────────────────────────────────── */

export interface Bodies {
  tub: Body
  cover: Body
  guns: Body
}

export function buildBodies(): Bodies {
  const tub = body(), cover = body(), gun = body()
  for (let i = 0; i < TUB.staves; i++) stave(tub.rough, i)
  for (let j = 0; j < TUB.ports.count; j++) collar(tub.rough, j)
  floor(tub.rough)
  rings(tub.rough, tub.iron)
  bearings(tub.rough, tub.fine, tub.iron)
  forks(tub.rough, tub.iron)
  places(tub.rough)
  cone(cover.rough, cover.iron)
  guns(gun.rough, gun.iron, gun.bronze)
  return { tub, cover, guns: gun }
}

