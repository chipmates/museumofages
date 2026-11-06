/* STOP 6'S MATERIAL (TSL), grown from the gate's glaze kit (its bond, filtered lines and colours): one material for
   every court body, branching on where a point lies and which way its face looks, never on screen derivatives.
     the facade's court face   the glazed design on the brick module (columns, capitals with two rows of volutes,
                               joining palmettes, borders, the squares band, the white double palmettes, a white border
                               round each arch), each brick fired a little differently, the glass taking the court's sky
     the door reveals, soffits the dark blue ground in its bond, darker deeper in the passage
     the court's other fronts  bare yellow-brown baked brick in its bond, bitumen joints
     the paving                square baked bricks in bitumen, worn where people walked, dust where they did not
     inside the room           white lime-gypsum wash, lit only through the three doors
     the roof                  an earth deck behind a low brick parapet
     everything else           the map's grey, so the palace's other roofs and outer faces stay the city's massing
   Every line is box-filtered over one device pixel's footprint on the surface, so the jittered sub-frames agree.
   The stack has no reflections and no bounce: the glaze's reflection of the court and its sky, the light inside the
   room and the contact shade at the walls' feet are modelled here from the court's own geometry. */

import { MeshStandardNodeMaterial, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { BR, C, PAL, band, bond, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, greyNode, uView, type ClassTones } from '../map/mass'
import { PRESETS as PAVING, pavingBrickCourt } from '../parts/paving-brick-court-babylon'
import { plasterWash } from '../parts/plaster-wash-babylon'
import { PRESETS as ROOF, roofEarth } from '../parts/roof-earth-throneroom-babylon'
import type { CourtFrame } from './court-geom'
import { uSkySet } from '../open/sky-set'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, acos, atan, attribute, cameraPosition, clamp, cross, dot, exp, float, floor, fract, length, max, min, mix, mx_noise_float, mx_noise_vec3, mx_worley_noise_vec2, normalize, positionWorld, pow, reflect, select, sin, smoothstep, sqrt, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uCourtPix = uniform(0.0003)
export function setCourtPixel(vfovDeg: number, heightPx: number): void {
  uCourtPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

/** the page's light, read from its own sun and sky lights before each draw (court.ts), so the modelled reflection and
    bounce follow the hour */
export const uCourtLight = {
  /** toward the sun */
  sun: uniform(new Vector3(0, 1, 0)),
  /** the sun's colour times its intensity */
  sunIrr: uniform(new Vector3(0, 0, 0)),
  /** the sky light's upper and lower colours times its intensity */
  sky: uniform(new Vector3(0.8, 0.93, 1.19)),
  gnd: uniform(new Vector3(0.58, 0.57, 0.54)),
  /** the sky dome's brightness (the page's day factor) */
  day: uniform(1),
}

/** the room's light through its doors, as shares of the court's radiance: the floor pool's bounce (the pool's albedo
    times its mean form factor) and its depth in door widths (its brightest part, just inside), the walls' give-back,
    the power and gain the print takes the walls' light at, the tint kept, the plaster's undulation (radians), the
    niche's own shade at its back, its inside corners' shade and reach (m), the lift its outer edges take, the floor's
    power and gain (its share of the court's light), the ceiling's share of the doors' light and of the pool's under it,
    the shade where a wall meets the ceiling */
export const ROOM = Object.freeze({ bounce: 0.08, pool: 0.8, giveBack: 0.02, gamma: 1.0, gain: 7.0, tint: 0.15, undulate: 0.08, recess: 0.42, corner: 0.5, reach: 1.2, arris: 0.14, floorGamma: 0.9, floor: 4.0, ceiling: 0.16, ceilingPool: 1.0, head: 0.3 })

/* ── signed distances, metres, negative inside ── */
const circle = (p: N, cx: number, cy: number, r: number): N => length(p.sub(vec2(cx, cy))).sub(r)
const ellipse = (p: N, cx: number, cy: number, a: number, b: number): N => length(p.sub(vec2(cx, cy)).div(vec2(a, b))).sub(1).mul(Math.min(a, b))
const capsule = (p: N, ax: number, ay: number, bx: number, by: number, r: number): N => {
  const pa = p.sub(vec2(ax, ay)), ba = vec2(bx - ax, by - ay)
  const h = clamp(pa.dot(ba).div(ba.dot(ba)), 0, 1)
  return length(pa.sub(ba.mul(h))).sub(r)
}
const roundBox = (p: N, cx: number, cy: number, hx: number, hy: number, r: number): N => {
  const q = abs(p.sub(vec2(cx, cy))).sub(vec2(hx - r, hy - r))
  return length(max(q, vec2(0, 0))).add(min(max(q.x, q.y), 0)).sub(r)
}
/** a palmette's fan of separate petals round (cx, cy), opening up (dir 1) or down (-1); an odd count puts one upright */
const fan = (p: N, cx: number, cy: number, r: number, petals: number, dir: number, gap = 0.012): N => {
  const q = p.sub(vec2(cx, cy)).mul(vec2(1, dir))
  const th = atan(q.y, q.x)
  const s = abs(sin(th.mul(petals)))
  const rr = float(r).mul(float(0.72).add(s.mul(0.28)))
  // the ground between two petals: the arc distance to the nearest valley, a wedge that closes at the heart
  const valley = length(q).mul(s).div(petals)
  return max(max(length(q).sub(rr), q.y.negate().sub(0.01)), float(gap).sub(valley))
}
const union = (a: N, b: N): N => min(a, b)
/** distance to an Archimedean spiral about (ex, ey), mirrored by sx: `turns` turns from radius a at the eye out to rOut,
    whose outer end lies at angle phiOut (radians); outward runs anticlockwise */
const spiral = (p: N, ex: number, ey: number, sx: number, a: number, rOut: number, phiOut: number, turns: number): N => {
  const TT = turns * 2 * Math.PI, b = (rOut - a) / TT, phiE = phiOut - TT
  const q = vec2(p.x.sub(ex).mul(sx), p.y.sub(ey))
  const rho = length(q)
  const t0 = fract(atan(q.y, q.x).sub(phiE).div(2 * Math.PI)).mul(2 * Math.PI)
  const kmax = floor(float(TT).sub(t0).div(2 * Math.PI))
  const kk = clamp(floor(rho.sub(a).sub(t0.mul(b)).div(2 * Math.PI * b).add(0.5)), 0, kmax)
  return abs(rho.sub(t0.add(kk.mul(2 * Math.PI)).mul(b).add(a)))
}

/** coverage of the inside of d over a footprint fw */
const cover = (d: N, fw: N): N => float(1).sub(smoothstep(fw.mul(-0.5), fw.mul(0.5), d))

/** the sky dome's colour along a direction, as the map page draws it (map.ts), without the sun's disc */
const skyRadiance = (d: N): N => {
  const L = uCourtLight
  const up = clamp(d.y, 0, 1)
  const low = smoothstep(-0.04, 0.35, L.sun.y)
  const zenith = mix(vec3(0.05, 0.08, 0.16), vec3(0.16, 0.3, 0.6), low)
  const horizon = mix(vec3(0.5, 0.36, 0.26), vec3(0.72, 0.68, 0.6), low)
  const glow = vec3(1.0, 0.72, 0.45).mul(pow(max(dot(d, L.sun), 0), 8).mul(0.55))
  return mix(horizon, zenith, pow(up, 0.45)).add(glow).mul(L.day)
}

export function courtMaterial(F: CourtFrame, cp: J, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  // the meshes stand untransformed, so the geometry's normal is the world's
  const n = normalize(attribute('normal', 'vec3'))
  const U = { uPix: uCourtPix }
  const LT = uCourtLight
  const col = cp.colours
  const G = V(col.ground), L = V(col.light), Wt = V(PAL.white as RGB), Y = V(PAL.yellow as RGB), K = V(PAL.black as RGB)
  const Z = cp.facade.zones as Record<string, [number, number]>
  const c = F.court
  const vertical = step(abs(n.y), 0.5)
  const view = normalize(cameraPosition.sub(P))

  /* ── where a point lies ── */
  const inX = (a: number, b: number, e: number): N => step(a - e, P.x).mul(step(P.x, b + e))
  const inZ = (a: number, b: number, e: number): N => step(a - e, P.z).mul(step(P.z, b + e))
  const front = step(n.z, -0.9).mul(step(abs(P.z.sub(F.zF)), 0.03)).mul(inX(c.x0, c.x1, 0.02))
  let inDoor: N = float(0), inDoorX: N = float(0)
  for (const d of F.doors) {
    inDoor = inDoor.add(inX(d.x0, d.x1, 0.01).mul(step(P.y, d.crown + 0.01)))
    inDoorX = inDoorX.add(inX(d.x0, d.x1, 0))
  }
  const reveal = min(inDoor, 1).mul(inZ(F.zF + 0.005, F.zB + 0.01, 0)).mul(float(1).sub(front))
  const roomBack = F.niche.z + F.niche.d1 + F.niche.d2
  const room = inX(F.inner.x0, F.inner.x1, 0.02).mul(inZ(F.inner.z0, roomBack, 0.02)).mul(step(P.y, F.wallTop + 0.01))
  const paving = step(0.9, n.y).mul(step(abs(P.y.sub(F.pave)), 0.01))
  const courtFace = vertical.mul(inX(c.x0, c.x1, 0.02)).mul(inZ(c.z0, c.z1, 0.02))
  const o = F.outer, pt = F.parapet
  const onRoof = inX(o.x0, o.x1, 0.02).mul(inZ(o.z0, o.z1, 0.02))
  const deck = onRoof.mul(step(0.9, n.y)).mul(step(abs(P.y.sub(F.deck)), 0.02))
  const coping = onRoof.mul(step(0.9, n.y)).mul(step(abs(P.y.sub(F.top)), 0.02))
  const parapetFace = onRoof.mul(vertical).mul(step(F.deck - 0.01, P.y)).mul(float(1).sub(front))

  /* ── the facade's design: u along the face from its west end, y up from the paving ── */
  const u = P.x.sub(c.x0), y = P.y.sub(F.pave)
  const fu = footprint(U, vec3(1, 0, 0), vec3(0, 0, -1)), fy = footprint(U, vec3(0, 1, 0), vec3(0, 0, -1))
  const fw = max(fu, fy)
  // each glazed brick is its own: its course k and its place bi along the course (the bond's, half a brick on every other course)
  const k = floor(y.div(C))
  const bi = floor(u.sub(float(1).sub(k.sub(floor(k.div(2)).mul(2))).mul(BR / 2)).div(BR))
  const hb = (a: number, b: number): N => hash2(bi.mul(a).add(b), k.mul(1.37).add(a * 7.1 + b))
  // the bricks were glazed one by one, so a figure's outline steps a few millimetres at each joint (seen up close only)
  const near = float(1).sub(smoothstep(0.004, 0.012, fw))
  const ud = u.add(hb(1.1, 3.3).sub(0.5).mul(0.008).mul(near)), yd = y.add(hb(0.7, 9.1).sub(0.5).mul(0.004).mul(near))
  const zone = (key: string): N => band(yd, Z[key]![0] * C, Z[key]![1] * C, fy)
  const yz = (key: string): N => yd.sub(Z[key]![0] * C)
  /** a shape painted the glaze's way: a black thread round it, a white rim inside, then its colour */
  const paint = (base: N, d: N, fill: N, rim = 0.024, thread = 0.012): N => {
    let out = mix(base, K, cover(d.sub(thread), fw))
    out = mix(out, Wt, cover(d, fw))
    return mix(out, fill, cover(d.add(rim), fw))
  }

  // the arches: distance outside each opening (the jambs below the spring, the round head above), on the face's own u, y
  const arches = F.doors.map((d) => ({ cx: d.c - c.x0, sy: d.spring - F.pave, r: d.r }))
  let archD: N = float(1e3)
  for (const a of arches) archD = min(archD, select(y.greaterThan(a.sy), length(vec2(u.sub(a.cx), y.sub(a.sy))), abs(u.sub(a.cx))).sub(a.r))
  // a half course of ground round the opening, then a white border a course wide; the bands stop at the border
  const ringIn = 0.5 * C, ringOut = 1.5 * C
  const clear = smoothstep(ringOut - 0.004, ringOut + 0.004, archD.sub(fw.mul(0.5)))

  // the columns: centred in each stretch of wall between the court's corners and the doors, one every four bricks
  const pitch: number = cp.facade.pitch, margin: number = cp.facade.margin
  const edges = [c.x0, ...[...F.doors].sort((a, b) => a.x0 - b.x0).flatMap((d) => [d.x0, d.x1]), c.x1].map((x) => x - c.x0)
  const segs: Array<{ end: number; start: number; n: number }> = []
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i]!, b = edges[i + 1]!
    const cnt = Math.max(0, Math.floor((b - a - 2 * margin) / pitch))
    segs.push({ end: b, start: a + (b - a - cnt * pitch) / 2, n: cnt })
  }
  let start: N = float(segs[segs.length - 1]!.start), count: N = float(segs[segs.length - 1]!.n)
  for (let i = segs.length - 2; i >= 0; i--) {
    start = select(ud.lessThan(segs[i]!.end + 0.01), float(segs[i]!.start), start)
    count = select(ud.lessThan(segs[i]!.end + 0.01), float(segs[i]!.n), count)
  }
  const cell = ud.sub(start).div(pitch)
  const ci = floor(cell)
  const onColumn = step(0, ci).mul(step(ci, count.sub(1)))
  const cu = fract(cell).sub(0.5).mul(pitch)
  const bj = floor(cell.add(0.5))
  const between = step(1, bj).mul(step(bj, count.sub(1)))
  const bu = cell.sub(bj).mul(pitch)

  let g: N = G
  // the white borders and the squares band, across the whole face
  for (const key of ['borderLow', 'borderMid', 'borderTop', 'edge']) {
    const bz = zone(key).mul(clear)
    g = mix(g, Wt, bz)
    // a black thread along each edge of the border
    g = mix(g, K, bz.mul(lines(yz(key), C, 0.006, fy)).mul(0.8))
  }
  {
    // a course of yellow, a course of squares (a quarter brick each: black, white, black, yellow), a course of yellow
    const ys = yz('squares'), sq = zone('squares').mul(clear)
    const yellow = band(ys, 0, C, fy).add(band(ys, 2 * C, 3 * C, fy))
    const row = band(ys, C, 2 * C, fy)
    const q = floor(ud.div(BR / 4))
    const qi = q.sub(floor(q.div(4)).mul(4))
    const sqCol = select(qi.lessThan(0.5), K, select(qi.lessThan(1.5), Wt, select(qi.lessThan(2.5), K, Y)))
    let s: N = mix(G, Y, yellow)
    s = mix(s, sqCol, row)
    const threads = lines(ys, C, 0.004, fy).mul(step(ys, 3 * C + 0.01)).add(lines(ud, BR / 4, 0.004, fu).mul(row)).min(1)
    s = mix(s, K, threads.mul(0.85))
    g = mix(g, s, sq)
  }
  // the white double palmettes: a fan up and a fan down on one stem, each on a pair of curls; between two of them a
  // light blue four-pointed field whose white rims run on as the arcs to the curls. A palmette the arch's border would
  // cut is left out whole, and so is a field beside it.
  {
    const pz = zone('palmettes').mul(clear), pv = yz('palmettes')
    const y0 = Z['palmettes']![0] * C
    const ph = (Z['palmettes']![1] - Z['palmettes']![0]) * C
    const pp: number = cp.facade.frieze
    const pu = fract(ud.div(pp)).sub(0.5).mul(pp)
    const p = vec2(pu, pv)
    const outside = (uc: N, half: number): N => {
      let ok: N = float(1)
      for (const a of arches) {
        const dx = max(abs(uc.sub(a.cx)).sub(half), 0), dy = Math.max(y0 - a.sy, 0)
        ok = ok.mul(step(a.r + ringOut + 0.05, length(vec2(dx, dy))))
      }
      return ok
    }
    const keepP = outside(floor(ud.div(pp)).add(0.5).mul(pp), 0.2)
    const keepF = outside(floor(ud.div(pp).add(0.5)).mul(pp), pp / 2)
    const mid = ph / 2, hi = ph * 0.7, lo = ph * 0.3
    let f: N = G
    // the field centred on the cell's edge: inside the box, outside the four circles on its corners
    const wx = pp / 2 - 0.02, wy = ph * 0.13
    const q = vec2(abs(abs(pu).sub(pp / 2)).div(wx), abs(pv.sub(mid)).div(wy))
    const field = max(float(1).sub(length(q.sub(vec2(1, 1)))), max(q.x, q.y).sub(1)).mul(Math.min(wx, wy))
    f = mix(f, paint(f, field, L, 0.016, 0.008), keepF)
    let pal: N = paint(f, capsule(p, 0, lo, 0, hi, 0.012), Wt, 0.0, 0.007)
    for (const [cy, dir] of [[hi, 1], [lo, -1]] as const) {
      for (const sx of [-1, 1]) {
        const ring = abs(circle(p, sx * 0.055, cy - dir * 0.04, 0.032)).sub(0.011)
        pal = mix(pal, K, cover(ring.sub(0.007), fw).mul(0.9))
        pal = mix(pal, Wt, cover(ring, fw))
      }
      pal = paint(pal, fan(p, 0, cy, 0.165, 7, dir, 0.008), Wt, 0.0, 0.008)
      pal = paint(pal, circle(p, 0, cy, 0.045), Y, 0.0, 0.008)
    }
    pal = paint(pal, roundBox(p, 0, mid, 0.03, 0.03, 0.01), Y, 0.0, 0.008)
    f = mix(f, pal, keepP)
    g = mix(g, f, pz)
  }
  // the border round each arch: a course of white with its black threads, down the jambs to the paving
  g = paint(g, abs(archD.sub((ringIn + ringOut) / 2)).sub((ringOut - ringIn) / 2), Wt, 0.0, 0.012)
  // the columns' zone
  {
    // the palmettes that join the capitals, drawn first so the capitals lie over their garlands: a stem with a lily at
    // each row and a light blue garland under each row
    const joinZ = band(yd, Z['voluteLow']![0] * C, Z['crown']![1] * C, fy).mul(between)
    {
      let out: N = g
      for (const key of ['voluteLow', 'voluteHigh']) {
        const p = vec2(bu, yz(key))
        const h = 7 * C
        const garland = max(abs(length(vec2(bu, yz(key).sub(h * 0.95))).sub(0.5)).sub(0.02), yz(key).sub(h * 0.62))
        const lily = union(ellipse(p, 0, h * 0.62, 0.035, 0.11), union(capsule(p, 0, h * 0.5, -0.09, h * 0.78, 0.025), capsule(p, 0, h * 0.5, 0.09, h * 0.78, 0.025)))
        const zk = zone(key)
        out = mix(out, paint(out, garland, L, 0.01, 0.008), zk)
        out = mix(out, paint(out, lily, Y, 0.012, 0.008), zk)
      }
      out = mix(out, paint(out, abs(bu).sub(0.02), L, 0.008, 0.006), band(yd, Z['voluteLow']![0] * C, Z['voluteHigh']![0] * C + 0.15, fy))
      g = mix(g, out, joinZ)
    }
    const colZ = band(yd, Z['baseRing']![0] * C, Z['crown']![1] * C, fy).mul(onColumn)
    let f: N = g
    // the shaft
    f = mix(f, paint(f, abs(cu).sub(0.175), Y), zone('shaft'))
    // the rings: three pills a course each, yellow, light blue, yellow
    const ring = (key: string): N => {
      const yr = yz(key)
      let out: N = f
      for (let i = 0; i < 3; i++) out = paint(out, roundBox(vec2(cu, yr), 0, (i + 0.5) * C, 0.22, C / 2 - 0.006, C / 2 - 0.006), i === 1 ? L : Y, 0.014, 0.008)
      return out
    }
    f = mix(f, ring('baseRing'), zone('baseRing'))
    f = mix(f, ring('neckRing'), zone('neckRing'))
    // a capital's row of double volutes, seven courses: two light blue lobes in a broad white rim, the rim running on at
    // each lobe's outer foot into a white spiral that curls in and up to its eye (as on the Berlin panel), drawn broad
    // enough to read as a curl at the court's distance; their stems a white V over a yellow dart
    const volutes = (key: string): N => {
      const p = vec2(cu, yz(key))
      const h = 7 * C
      let lobes: N = union(circle(p, -0.245, h * 0.56, 0.255), circle(p, 0.245, h * 0.56, 0.255))
      const bite = union(circle(p, -0.09, h * 0.2, 0.085), circle(p, 0.09, h * 0.2, 0.085))
      lobes = max(lobes, bite.negate())
      const stems = union(capsule(p, 0, 0.02, -0.15, h * 0.42, 0.03), capsule(p, 0, 0.02, 0.15, h * 0.42, 0.03))
      let out: N = paint(f, union(lobes, stems), L, 0.036, 0.012)
      for (const sx of [-1, 1]) {
        const curl = spiral(p, sx * 0.245, h * 0.415, sx, 0.026, 0.205, -0.47, 1.25).sub(0.016)
        out = mix(out, K, cover(curl.sub(0.009), fw).mul(0.85))
        out = mix(out, Wt, cover(curl, fw))
      }
      return paint(out, ellipse(p, 0, h * 0.3, 0.04, h * 0.27), Y, 0.012, 0.008)
    }
    f = mix(f, volutes('voluteLow'), zone('voluteLow'))
    f = mix(f, volutes('voluteHigh'), zone('voluteHigh'))
    // the crown: a white palmette fan on a yellow heart
    {
      const p = vec2(cu, yz('crown'))
      let out = paint(f, fan(p, 0, 0.0, 0.3, 7, 1), Wt, 0.0)
      out = paint(out, circle(p, 0, 0.0, 0.1), Y, 0.0, 0.01)
      f = mix(f, out, zone('crown'))
    }
    g = mix(g, f, colZ)
  }

  /* ── the glaze on its bricks: courses of 8.6 cm in a half-brick bond, tight joints (the mortar stops short of the
     face). Each brick fired its own (the original fragments run from near black to a pale steel blue brick by brick):
     the dark blue ground lighter or darker by up to four fifths, one brick in four a good deal darker, one in five thin
     and pale (a lighter blue), some leaning to teal, bricks of one batch in small clusters; the light glazes of the
     design vary less (their bricks read whole, not scorched); in patches from a brick's length to a few metres; the
     glaze pooling darker at its edges (by a share: an amount would eat a dark blue's red first). ── */
  const bF = bond(u, y, float(0), fu, fy, 0.0035)
  const jointF = bF.bed.add(bF.head).min(1)
  const each = float(1).sub(smoothstep(0.08, 0.3, fu))
  const h1 = bF.brick, h3 = hb(5.3, 1.7), h4 = hb(2.9, 13.1), h5 = hb(8.1, 4.4)
  // how much of a point is the plain ground: the design's light glazes take a gentler firing
  const onGround = float(1).sub(smoothstep(0.02, 0.12, length(g.sub(G))))
  // bricks laid from one firing's batch sit in small clusters, a couple of bricks along and a few courses up
  const lot = hash2(floor(bi.div(2)).add(0.37), floor(k.div(3)).add(5.1)).sub(0.5)
  // the ground's spread sits in value: fewer very dark bricks, the pale ones a lighter blue, not grey; the design's
  // light glazes keep their own firing
  const varyG = h1.sub(0.5).mul(1.8).add(lot.mul(1.4)).sub(step(0.75, h4).mul(0.3)).sub(0.24)
  const varyD = h1.sub(0.5).mul(1.3).add(lot.mul(0.85)).sub(step(0.7, h4).mul(0.5)).mul(0.4)
  const vary = mix(varyD, varyG, onGround).mul(each)
  const pale = step(h4, 0.2).mul(each).mul(onGround)
  const lean = h5.sub(0.5).mul(2).mul(each)
  const tint = vec3(1).add(vec3(-0.03, 0.05, -0.01).mul(lean))
  const pool = lines(y, C, 0.012, fy).add(lines(u, BR / 2, 0.012, fu)).min(1).mul(0.12)
  const patch = mx_noise_float(P.mul(0.7)).mul(0.2).add(mx_noise_float(P.mul(2.6)).mul(0.16)).mul(float(1).sub(smoothstep(0.3, 1.2, fu)))
  // a dark brick stays a dark glaze, never a hole: under the map's print a ground brick under about half its value
  // prints near black
  const glazeCol = g.mul(max(float(1).add(vary).add(patch), mix(float(0.3), float(0.46), onGround))).mul(tint).add(vec3(0.118, 0.185, 0.336).mul(pale)).mul(float(1).sub(pool))
  const facadeCol = mix(glazeCol, V(col.jointGlaze), jointF.mul(0.85))

  /* ── the glass takes the court: Fresnel over what a ray reflected from the face meets (the court's floor, the court's
     fronts with the sun on the east one, the sky over them). Each brick's glass sits a few degrees off the wall's
     plane and some are duller, so the sheen differs brick by brick, as the fragments' does ── */
  const tilt = vec2(hb(3.7, 0.9).sub(0.5).mul(0.07), hb(6.1, 2.3).sub(0.5).mul(0.2)).mul(each)
  const nG = normalize(vec3(tilt.x, tilt.y, -1))
  const rr = reflect(view.negate(), nG)
  const eps = 1e-3
  const tN = P.z.sub(c.z0).div(max(rr.z.negate(), eps))
  const tE = float(c.x1).sub(P.x).div(max(rr.x, eps)), tW = P.x.sub(c.x0).div(max(rr.x.negate(), eps))
  const tWall = min(tN, min(tE, tW))
  const tFloor = select(rr.y.lessThan(0), P.y.sub(F.pave).div(max(rr.y.negate(), eps)), float(1e6))
  const yHit = P.y.add(rr.y.mul(tWall))
  const vertIrr = LT.sky.add(LT.gnd).mul(0.5)
  // the east front faces west, into the late sun; the others stand in shade
  const eastHit = step(tE, min(tN, tW))
  const brickL = V(PAL.buff as RGB).mul(0.9).mul(vertIrr.add(LT.sunIrr.mul(max(LT.sun.x.negate(), 0)).mul(eastHit))).div(Math.PI)
  const floorL = vec3(0.4, 0.33, 0.24).mul(LT.sky).mul(0.85).div(Math.PI)
  const overFronts = smoothstep(F.top + 0.4, F.top - 0.4, yHit)
  const met = mix(floorL, mix(skyRadiance(rr), brickL, overFronts), step(tWall, tFloor))
  const cosV = max(dot(nG, view), 0)
  const fres = float(0.04).add(float(0.96).mul(pow(float(1).sub(cosV), 5)))
  const gloss = float(0.5).add(h3.mul(each)).add(float(0.5).mul(float(1).sub(each)))
  const sheen = met.mul(fres).mul(gloss).mul(front).mul(float(1).sub(jointF)).mul(float(1).sub(uView))

  /* ── the reveals and soffits: the ground in its bond, along the wall's depth. Round each arch's head the courses
     follow the curve, their height the arc length from the spring, so no brick stretches where the soffit turns flat ── */
  let rY: N = y, onHead: N = float(0), tR: N = vec3(0, 1, 0)
  for (const d of F.doors) {
    const dx = P.x.sub(d.c), dy = max(P.y.sub(d.spring), 0)
    const head = inX(d.x0, d.x1, 0.01).mul(step(d.spring, P.y))
    const th = atan(dy, dx)
    rY = mix(rY, min(th, float(Math.PI).sub(th)).mul(d.r).add(d.spring - F.pave), head)
    tR = mix(tR, vec3(dy.negate(), dx, 0).div(d.r), head)
    onHead = max(onHead, head)
  }
  const alongZ = max(step(0.5, abs(n.x)), onHead).greaterThan(0.5)
  const rU = select(alongZ, P.z, P.x)
  const fr = footprint(U, select(alongZ, vec3(0, 0, 1), vec3(1, 0, 0)), n), fry = footprint(U, tR, n)
  const bR = bond(rU, rY, float(0), fr, fry, 0.0025)
  const hR = hash2(bR.brick.mul(91.3), bR.kk.add(3.3))
  const eachR = float(1).sub(smoothstep(0.08, 0.3, fr))
  const varyR = bR.brick.sub(0.5).mul(0.9).sub(step(0.7, hR).mul(0.45)).mul(eachR)
  const revealGlaze = G.mul(float(1).add(varyR)).add(vec3(0.11, 0.12, 0.13).mul(step(hR, 0.15).mul(eachR)))
  const revealCol = mix(revealGlaze, V(col.jointGlaze), bR.bed.add(bR.head).min(1).mul(0.85))

  /* ── the court's other fronts and the parapet: bare baked brick, thick bitumen joints ── */
  const wU = select(abs(n.x).greaterThan(0.5), P.z, P.x)
  const fwU = footprint(U, select(abs(n.x).greaterThan(0.5), vec3(0, 0, 1), vec3(1, 0, 0)), n), fwY = footprint(U, vec3(0, 1, 0), n)
  const bW = bond(wU, P.y, float(0), fwU, fwY, 0.006)
  const fine = mx_noise_float(P.mul(23)).mul(float(1).sub(smoothstep(0.01, 0.04, max(fwU, fwY))))
  const varyW = bW.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fwU)))
  const brick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), bW.brick.mul(0.45).add(fine.mul(0.08))).mul(float(1).add(varyW.mul(0.12)))
  const wallCol = mix(brick, V(PAL.asphalt as RGB), bW.bed.add(bW.head).min(1))

  /* ── the paving (part paving-brick-court-babylon): worn where people walked from the main door along its axis,
     through the three doors, and across from the court's east side (its gate's place there is not known) ── */
  const pv = pavingBrickCourt({
    p: P, U, ax: vec3(1, 0, 0), az: vec3(0, 0, 1), brick: PAVING.court.brick, court: c, front: F.zF, doors: F.doors,
    way: { x: c.x1, z: (c.z0 + c.z1) / 2 }, inDoorX,
  })
  const { dWall, inCourt } = pv
  const pavingCol = pv.colour

  /* ── inside the room: the white wash (part plaster-wash-babylon), laid on by hand: broad patches a little thicker or
     thinner, and the brush's run down the wall ── */
  const brushRun = mx_noise_float(vec3(P.x.mul(3.5), P.y.mul(1.2), P.z.mul(3.5))).mul(vertical)
  const washVar = float(1).add(mx_noise_float(P.mul(0.45)).mul(0.08)).add(mx_noise_float(P.mul(1.1).add(7.3)).mul(0.08)).add(mx_noise_float(P.mul(2.1)).mul(0.13)).add(mx_noise_float(P.mul(5.5)).mul(0.14)).add(brushRun.mul(0.025))
  const plaster = plasterWash(P, n, col.plaster).mul(washVar)

  /* ── the roof: an earth deck behind its parapet (part roof-earth-throneroom-babylon) ── */
  const dPar = min(min(P.x.sub(o.x0 + pt), float(o.x1 - pt).sub(P.x)), min(P.z.sub(o.z0 + pt), float(o.z1 - pt).sub(P.z)))
  const copeU = select(abs(P.x.sub((o.x0 + o.x1) / 2)).greaterThan((o.x1 - o.x0) / 2 - pt), P.z, P.x)
  const rf = roofEarth({ p: P, U, ax: vec3(1, 0, 0), az: vec3(0, 0, 1), dPar, copeU, tone: ROOF.court.tone })
  const deckCol = rf.deck, copeCol = rf.cope

  /* ── one colour per point, the class view over it ── */
  let stateCol: N = greyNode(0.42)
  stateCol = mix(stateCol, wallCol, max(courtFace, parapetFace))
  stateCol = mix(stateCol, plaster, room.mul(float(1).sub(paving)))
  stateCol = mix(stateCol, revealCol, reveal)
  stateCol = mix(stateCol, deckCol, deck)
  stateCol = mix(stateCol, copeCol, coping)
  stateCol = mix(stateCol, facadeCol, front)
  stateCol = mix(stateCol, pavingCol, paving)
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // the reveals take no sun (indoors, below): a gloss there could only mirror the page's sky, which a passage cannot see
  const glazed = front.mul(float(1).sub(jointF))
  m.roughnessNode = mix(mix(float(0.92), float(0.3), glazed), float(0.92), uView)

  /* ── the light the stack does not carry: inside the room only what comes through the doors; the passages darker
     deeper in; a contact shade where the walls meet the paving and the deck meets its parapet ── */
  const zIn = max(P.z.sub(F.zB), 0)
  let through: N = float(0)
  for (const d of F.doors) {
    const s = zIn.mul(0.55).add(d.r)
    through = through.add(float(d.r * 1.15).div(zIn.mul(0.9).add(d.r)).mul(exp(P.x.sub(d.c).div(s).mul(P.x.sub(d.c).div(s)).negate())))
  }
  // the niche's inside corners: each step's back darker toward its sides, each side darker toward its back
  const Nn = F.niche
  const step2 = step(Nn.z + Nn.d1 + 0.01, P.z), inNiche = step(Nn.z + 0.01, P.z)
  const sideD = select(step2.greaterThan(0.5), min(abs(P.x.sub(Nn.s0)), abs(P.x.sub(Nn.s1))), min(abs(P.x.sub(Nn.x0)), abs(P.x.sub(Nn.x1))))
  const backD = select(step2.greaterThan(0.5), float(Nn.z + Nn.d1 + Nn.d2), float(Nn.z + Nn.d1)).sub(P.z)
  const nicheD = select(abs(n.x).greaterThan(0.5), backD, sideD)
  const cornerAO = float(1).sub(float(1).sub(smoothstep(0.0, ROOM.reach, nicheD)).mul(ROOM.corner).mul(inNiche))

  /* the room sees the court only through its doors: each opening, cut by its 6 m passage, is an area source (Lambert's
     polygon form factor), sky above the line where a point sees past the court's far front and court below; the floor's
     pool throws a second share, the walls' give-back an even floor. The page's environment is a sky the room cannot see. */
  // a quad's vector irradiance (corners wound positive on its lit side): its form factor is the dot with a normal
  const quadVec = (q: N, cs: N[]): N => {
    const v = cs.map((w: N) => normalize(w.sub(q)))
    let s: N = vec3(0, 0, 0)
    for (let i = 0; i < 4; i++) {
      const a = v[i], b = v[(i + 1) % 4], g = cross(a, b)
      s = s.add(g.div(max(length(g), 1e-8)).mul(acos(clamp(dot(a, b), -1, 1))))
    }
    return s.div(2 * Math.PI)
  }
  // the wash lies on hand-laid plaster: its face undulates a little, which the doors' raking light finds
  const wob = mx_noise_vec3(P.mul(0.8)).mul(0.7).add(mx_noise_vec3(P.mul(2.3)).mul(0.3))
  const nb = normalize(n.add(wob.sub(n.mul(dot(n, wob))).mul(ROOM.undulate)))
  const q = P.add(n.mul(0.03))
  const qq = vec3(q.x, q.y, max(q.z, F.zB + 0.05))
  const tt = qq.z.sub(F.zB).div(qq.z.sub(F.zF))
  const cut = (lo: number, hi: number, p: N): [N, N] => [max(float(lo), p.add(tt.mul(float(lo).sub(p)))), min(float(hi), p.add(tt.mul(float(hi).sub(p))))]
  // the height on the doors' plane over which a point sees the sky past the court's far front
  const dQ = qq.z.sub(F.zB), farFront = F.zB - c.z0
  const ySky = qq.y.add(dQ.mul(float(F.top).sub(qq.y)).div(dQ.add(farFront)))
  // a point inside the niche sees the doors' plane only through the niche's openings: each opening, cast from the point
  // onto that plane, narrows every door, so the returns shade the steps' backs from the side doors
  const dzB = max(qq.z.sub(F.zB), 0.05)
  const nicheCut = (zo: number, o0: number, o1: number): [N, N] => {
    const r = max(qq.z.sub(zo), 1e-3).div(dzB), past = step(zo + 0.005, qq.z)
    return [mix(float(-1e4), qq.x.add(float(o0).sub(qq.x).div(r)), past), mix(float(1e4), qq.x.add(float(o1).sub(qq.x).div(r)), past)]
  }
  const [n1a, n1b] = nicheCut(Nn.z, Nn.x0, Nn.x1), [n2a, n2b] = nicheCut(Nn.z + Nn.d1, Nn.s0, Nn.s1)
  const nLo = max(n1a, n2a), nHi = min(n1b, n2b)
  let direct: N = float(0), skyIn: N = float(0), bounce: N = float(0)
  for (const d of F.doors) {
    // the round head as a flat top of the same area
    const [cx0, cx1] = cut(d.x0, d.x1, qq.x), [ay0, ay1] = cut(F.pave, d.spring + (Math.PI / 4) * d.r, qq.y)
    const ax0 = max(cx0, nLo), ax1 = min(cx1, nHi)
    const bx1 = max(ax1, ax0.add(0.01)), wide = step(ax0.add(0.01), ax1)
    const part = (ya: N, yb: N): N => {
      const yc = max(yb, ya.add(0.01))
      const vq = quadVec(qq, [vec3(ax0, ya, F.zB), vec3(ax0, yc, F.zB), vec3(bx1, yc, F.zB), vec3(bx1, ya, F.zB)])
      return max(dot(nb, vq), 0).mul(wide.mul(step(ya.add(0.01), yb)))
    }
    direct = direct.add(part(ay0, min(ay1, ySky)))
    skyIn = skyIn.add(part(max(ay0, ySky), ay1))
    const w = d.x1 - d.x0, px0 = Math.max(d.x0 - 0.15 * w, F.inner.x0), px1 = Math.min(d.x1 + 0.15 * w, F.inner.x1), pz1 = F.zB + ROOM.pool * w
    bounce = bounce.add(max(dot(nb, quadVec(qq, [vec3(px0, F.pave, F.zB), vec3(px1, F.pave, F.zB), vec3(px1, F.pave, pz1), vec3(px0, F.pave, pz1)])), 0))
  }
  // the junctions: a floor or ceiling point's distance to the nearest wall foot or head, a wall point's to the floor or ceiling
  const zS = float(F.inner.z1).add(inX(Nn.x0, Nn.x1, 0).mul(Nn.d1)).add(inX(Nn.s0, Nn.s1, 0).mul(Nn.d2))
  const dFlat = min(min(P.x.sub(F.inner.x0), float(F.inner.x1).sub(P.x)), min(P.z.sub(F.zB), zS.sub(P.z)))
  const dJ = select(abs(n.y).greaterThan(0.5), min(dFlat, select(inNiche.greaterThan(0.5), sideD, float(9))), min(y, float(F.wallTop).sub(P.y)))
  // under the ceiling the walls and the ceiling are dim already, so their junction takes the lighter shade
  const junction = select(n.y.greaterThan(0.5).or(abs(n.y).lessThan(0.5).and(y.lessThan(5))), float(0.4), float(ROOM.head))
  const contact = float(1).sub(float(1).sub(smoothstep(0.0, 0.8, dJ)).mul(junction))
  // the niche shades itself: each step back sees less of the room
  const recess = float(1).sub(clamp(P.z.sub(Nn.z).div(Nn.d1 + Nn.d2), 0, 1).mul(ROOM.recess))
  // each step's outer edge sees more of the room than its flat: a lighter arris beside the next step's dark corner
  const onFace = step(abs(P.z.sub(Nn.z)), 0.02), onStep = step(abs(P.z.sub(Nn.z + Nn.d1)), 0.02)
  const dArris = select(onFace.greaterThan(0.5), min(abs(P.x.sub(Nn.x0)), abs(P.x.sub(Nn.x1))), select(onStep.greaterThan(0.5), min(abs(P.x.sub(Nn.s0)), abs(P.x.sub(Nn.s1))), float(9)))
  const arris = float(1).add(float(1).sub(smoothstep(0.0, 0.14, dArris)).mul(ROOM.arris).mul(step(n.z, -0.5)))
  // a wall's foot sees the lit floor, its head the dark ceiling: the give-back falls with height
  const seenBelow = mix(float(1), mix(float(1.25), float(0.75), smoothstep(0.0, float(F.wallTop - F.pave), y)), vertical)
  const giveBack = float(0.45).add(min(through, 1).mul(0.55)).mul(contact).mul(cornerAO).mul(recess).mul(seenBelow)
  // what the room sees through a door: the court's paving, most of it in the shade of the fronts, and its far front in
  // shade, or the sky; the eye takes its measure from the court's paving with its share of sun
  const paveL = (sunShare: number): N => vec3(0.4, 0.33, 0.24).mul(LT.sky.mul(0.85).add(LT.sunIrr.mul(clamp(LT.sun.y, 0, 1)).mul(sunShare))).div(Math.PI)
  const frontL = V(PAL.buff as RGB).mul(0.9).mul(vertIrr).div(Math.PI)
  // the sky's brightness as the page draws it, in the colour of the page's sky light that tints the court's shade
  const LUM = vec3(0.2126, 0.7152, 0.0722)
  const skyY = dot(skyRadiance(normalize(vec3(0, 0.2, -1))), LUM)
  const Lc = paveL(0.15).mul(0.6).add(frontL.mul(0.4)), Ls = LT.sky.mul(skyY.div(max(dot(LT.sky, LUM), 1e-6)))
  const shade = mix(float(1), cornerAO, 0.5).mul(recess).mul(arris)
  // a ceiling sees the dark brick floor and the court's shaded paving more than the white walls: less of the doors' light
  // and of the walls' give-back comes to it; over the pool just inside a door, most of the pool's
  const onCeil = step(n.y, -0.5)
  const backTo = mix(float(1), float(ROOM.ceiling), onCeil), poolTo = mix(float(1), float(ROOM.ceilingPool), onCeil), giveTo = mix(float(1), float(0.5), onCeil)
  const lin = Lc.mul(direct.mul(backTo).add(bounce.mul(ROOM.bounce).mul(poolTo)).mul(shade).add(giveBack.mul(ROOM.giveBack).mul(giveTo))).add(Ls.mul(skyIn.mul(shade).mul(backTo)))
  // the print takes the walls' light at its own power and gain, the floor's at another: a room seen from a sunlit court
  // reads by its fall, the floor lit just inside the doors and the depths dim
  const linY = max(dot(lin, LUM), 1e-6), rel = linY.div(max(dot(paveL(0.5), LUM), 1e-6))
  // the eye keeps the court's white: the room's light takes the hue of the light in the court's shade, its own only in part
  const shadeIrr = LT.sky.mul(0.85).add(LT.sunIrr.mul(clamp(LT.sun.y, 0, 1)).mul(0.15))
  const hue0 = mix(shadeIrr.div(max(dot(shadeIrr, LUM), 1e-6)), lin.div(linY), ROOM.tint)
  // a ceiling's light is what the brick floor throws up; a wall's has passed the warm wash and the floor more than once,
  // the lower the more of the floor
  const floorSeen = float(1).sub(smoothstep(0.0, 6.0, y)).mul(0.8)
  const hue = select(n.y.lessThan(-0.5), hue0.mul(vec3(1.12, 1.0, 0.82)), hue0.mul(vec3(1.05, 1.0, 0.9)).mul(mix(vec3(1, 1, 1), vec3(1.08, 1.0, 0.88), floorSeen)))
  const roomLight = hue.mul(linY).mul(pow(rel, ROOM.gamma - 1)).mul(ROOM.gain)
  // the floor takes the same share of the light its bricks have in the court, so it reads as the court's paving, dimmer
  const onFloor = step(0.5, n.y)
  const floorShare = clamp(pow(rel, ROOM.floorGamma).mul(ROOM.floor), 0.04, 0.85)
  const inRoom = room.mul(float(1).sub(reveal))
  const passAO = mix(float(0.92), float(0.55), clamp(P.z.sub(F.zF).div(F.zB - F.zF), 0, 1))
  const dFloorWall = select(min(inDoorX, 1).greaterThan(0.5), min(min(P.z.sub(c.z0), P.x.sub(c.x0)), float(c.x1).sub(P.x)), dWall)
  const floorAO = float(1).sub(float(1).sub(smoothstep(0.0, 1.1, dFloorWall)).mul(0.42).mul(inCourt))
  // the court's fronts hide part of the sky from its floor: the view factor of a long wall H high at a distance d is
  // (1 - d / sqrt(d^2 + H^2)) / 2; a shaded front gives back a little of it, the sunlit east front more than it hides
  const HW = F.top - F.pave
  const wallView = (d: N): N => float(0.5).mul(float(1).sub(d.div(sqrt(d.mul(d).add(HW * HW)))))
  const hidden = wallView(max(P.z.sub(c.z0), 0.05)).add(wallView(max(float(F.zF).sub(P.z), 0.05))).add(wallView(max(P.x.sub(c.x0), 0.05)))
  // under the sky field (open/sky-set.ts) the fronts' hidden sky is the field's
  const skyAO = mix(float(1).sub(hidden.mul(0.6)), float(1), uSkySet)
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.7, y)).mul(0.3))
  const deckAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.7, dPar)).mul(0.35))
  let ao: N = float(1)
  ao = mix(ao, footAO, max(courtFace, front).mul(float(1).sub(room)))
  ao = mix(ao, passAO, reveal)
  ao = mix(ao, floorAO.mul(skyAO), paving.mul(inCourt))
  ao = mix(ao, deckAO, deck)
  ao = mix(ao, mix(float(0), floorShare, onFloor), inRoom)
  m.aoNode = mix(ao, float(1), uView)
  m.emissiveNode = sheen.add(stateCol.mul(roomLight).mul(inRoom.mul(float(1).sub(onFloor))).mul(float(1).sub(uView)))
  // no sun reaches into the room or its passages through doors that face north; the shadow map's contact edges leaked it
  const indoors = max(room, reveal)
  // the room and its passages keep their own light under the sky field: it sees only their open sky's share
  ;(m as unknown as { skyOpenNode: N }).skyOpenNode = float(1).sub(indoors)
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors))
  return m
}
