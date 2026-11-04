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
import { TONES } from '../open/earth'
import type { CourtFrame } from './court-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, atan, attribute, cameraPosition, clamp, dot, exp, float, floor, fract, length, max, min, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionWorld, pow, reflect, select, sin, smoothstep, step, uniform, vec2, vec3 } = T

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
     the dark blue ground lighter or darker by up to a half, one brick in three a good deal darker, one in six thin
     and pale, some leaning to teal, bricks of one batch in small clusters; the light glazes of the design vary less (their bricks read whole, not
     scorched); in patches from a brick's length to a few metres; the glaze pooling darker at its edges (by a share: an
     amount would eat a dark blue's red first). ── */
  const bF = bond(u, y, float(0), fu, fy, 0.0035)
  const jointF = bF.bed.add(bF.head).min(1)
  const each = float(1).sub(smoothstep(0.08, 0.3, fu))
  const h1 = bF.brick, h3 = hb(5.3, 1.7), h4 = hb(2.9, 13.1), h5 = hb(8.1, 4.4)
  // how much of a point is the plain ground: the design's light glazes take a gentler firing
  const onGround = float(1).sub(smoothstep(0.02, 0.12, length(g.sub(G))))
  // bricks laid from one firing's batch sit in small clusters, a couple of bricks along and a few courses up
  const lot = hash2(floor(bi.div(2)).add(0.37), floor(k.div(3)).add(5.1)).sub(0.5).mul(0.6)
  const vary = h1.sub(0.5).mul(1.0).add(lot).sub(step(0.7, h4).mul(0.5)).mul(each).mul(mix(float(0.4), float(1), onGround))
  const pale = step(h4, 0.18).mul(each).mul(onGround)
  const lean = h5.sub(0.5).mul(2).mul(each)
  const tint = vec3(1).add(vec3(-0.03, 0.05, -0.01).mul(lean))
  const pool = lines(y, C, 0.012, fy).add(lines(u, BR / 2, 0.012, fu)).min(1).mul(0.12)
  const patch = mx_noise_float(P.mul(0.7)).mul(0.2).add(mx_noise_float(P.mul(2.6)).mul(0.16)).mul(float(1).sub(smoothstep(0.3, 1.2, fu)))
  const glazeCol = g.mul(float(1).add(vary).add(patch)).mul(tint).add(vec3(0.11, 0.12, 0.13).mul(pale)).mul(float(1).sub(pool))
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
  const gloss = float(0.15).add(h3.mul(1.7).mul(each)).add(float(0.85).mul(float(1).sub(each)))
  const sheen = met.mul(fres).mul(gloss).mul(front).mul(float(1).sub(jointF)).mul(float(1).sub(uView))

  /* ── the reveals and soffits: the ground in its bond, along the wall's depth ── */
  const rU = select(abs(n.x).greaterThan(0.5), P.z, P.x)
  const fr = footprint(U, select(abs(n.x).greaterThan(0.5), vec3(0, 0, 1), vec3(1, 0, 0)), n), fry = footprint(U, vec3(0, 1, 0), n)
  const bR = bond(rU, y, float(0), fr, fry, 0.0025)
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

  /* ── the paving: square baked bricks laid in bitumen, each row half a brick on. The bricks of one firing alike,
     so the tone drifts over metres rather than jumping brick by brick; grain and pits inside each brick; the joints
     opened and chipped, half filled with dust; the edges worn round. People walked from the main door out along its
     axis, through the three doors, and across from the court's east side (its gate's place there is not known): there
     the bricks are cleaner and the edges rounder; dust lies where nobody walked and along the walls' feet ── */
  const fpX = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0)), fpZ = footprint(U, vec3(0, 0, 1), vec3(0, 1, 0))
  const fpw = max(fpX, fpZ)
  const kz = floor(P.z.div(BR))
  const px = P.x.add(kz.sub(floor(kz.div(2)).mul(2)).mul(BR / 2))
  const kx = floor(px.div(BR))
  const pNear = float(1).sub(smoothstep(0.012, 0.05, fpw))
  const pSeen = float(1).sub(smoothstep(0.06, 0.25, fpw))
  const main = [...F.doors].sort((a, b) => b.r - a.r)[0]!
  const axis = exp(P.x.sub(main.c).div(3.0).mul(P.x.sub(main.c).div(3.0)).negate()).mul(float(1).sub(clamp(float(F.zF).sub(P.z).div(F.zF - c.z0), 0, 1).mul(0.65)))
  let thresh: N = float(0)
  for (const d of F.doors) {
    const dd = length(vec2(P.x.sub(d.c), max(float(F.zF).sub(P.z), 0)))
    thresh = max(thresh, exp(dd.div(3.2).mul(dd.div(3.2)).negate()))
  }
  // the way from the east side's middle to the main door, a segment in plan
  const ax = c.x1, az = (c.z0 + c.z1) / 2, bxW = main.c, bzW = F.zF
  const sx = bxW - ax, sz = bzW - az
  const sh = clamp(P.x.sub(ax).mul(sx).add(P.z.sub(az).mul(sz)).div(sx * sx + sz * sz), 0, 1)
  const segD = length(vec2(P.x.sub(ax).sub(sh.mul(sx)), P.z.sub(az).sub(sh.mul(sz))))
  const way = exp(segD.div(2.6).mul(segD.div(2.6)).negate()).mul(0.65)
  const wearRaw = max(axis, max(thresh, way)).add(mx_noise_float(vec3(P.x.mul(0.5), 6.1, P.z.mul(0.5))).mul(0.18))
  const wear = clamp(wearRaw, 0, 1)
  const hp = hash2(kx, kz), hp2 = hash2(kx.add(7.7), kz.add(3.1))
  const batch = mx_noise_float(vec3(P.x.mul(0.33), 1.3, P.z.mul(0.33)))
  const fire = clamp(float(0.36).add(batch.mul(0.18)).add(hp.sub(0.5).mul(0.16).mul(pSeen)), 0, 1)
  let pTone: N = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), fire).mul(float(0.96).add(hp2.sub(0.5).mul(0.09).mul(pSeen))).mul(vec3(1.04, 1.0, 0.88))
  const grain = mx_noise_float(P.mul(vec3(26, 3, 26))).mul(0.11).mul(pNear)
  const pits = smoothstep(0.32, 0.5, mx_noise_float(P.mul(vec3(70, 5, 70)))).mul(0.22).mul(pNear)
  pTone = pTone.mul(float(1).add(grain).sub(pits))
  // where in its brick a point lies: the distance to the brick's nearest edge, metres
  const fxB = fract(px.div(BR)).mul(BR), fzB = fract(P.z.div(BR)).mul(BR)
  const edgeD = min(min(fxB, float(BR).sub(fxB)), min(fzB, float(BR).sub(fzB)))
  const chip = mx_noise_float(P.mul(vec3(14, 2, 14))).add(0.5)
  const jh = float(0.0045).add(chip.mul(0.005)).add(wear.mul(0.003))
  const jFar = max(lines(P.z, BR, 0.0045, fpZ), lines(px, BR, 0.0045, fpX))
  const jNear = float(1).sub(smoothstep(jh.sub(0.0015), jh.add(0.0015).add(fpw.mul(0.5)), edgeD))
  const jointP = mix(jFar, jNear, pNear)
  const arris = float(1).sub(smoothstep(jh, jh.add(0.014).add(wear.mul(0.012)), edgeD)).mul(pNear)
  pTone = pTone.mul(float(1).sub(arris.mul(0.16)))
  // dust: drifts where nobody walked and along the walls' feet; the walked ways swept cleaner and a shade darker
  const dWall = min(min(P.z.sub(c.z0), float(F.zF).sub(P.z)), min(P.x.sub(c.x0), float(c.x1).sub(P.x)))
  const inCourt = step(P.z, F.zF)
  const foot = float(1).sub(smoothstep(0.1, 2.2, dWall)).mul(inCourt).mul(float(1).sub(min(inDoorX, 1).mul(step(float(F.zF).sub(P.z), 2.0))))
  const drift = smoothstep(0.15, 0.8, mx_noise_float(vec3(P.x.mul(0.23), 2.7, P.z.mul(0.23))).add(0.5))
  const dust = clamp(drift.mul(0.24).add(foot.mul(0.36)).add(float(0.18).mul(float(1).sub(inCourt))), 0, 1).mul(float(1).sub(wear.mul(0.85)))
  const dustCol = vec3(0.5, 0.45, 0.37)
  pTone = mix(pTone.mul(float(1).sub(wear.mul(0.07))), dustCol, dust.mul(0.5))
  // the joints: bitumen, half filled with the court's dust; swept emptier and darker on the walked ways
  const jointPCol = mix(mix(V(PAL.asphalt as RGB).mul(2), dustCol.mul(0.78), float(0.55).add(chip.mul(0.35))), V(PAL.asphalt as RGB).mul(2.5), wear.mul(0.35))
  const pavingCol = mix(pTone, jointPCol, jointP.mul(0.72))

  /* ── inside the room: a white wash, warmed by the light the brick floors throw in ── */
  const plaster = V(col.plaster).mul(vec3(1.14, 1.0, 0.8)).mul(mx_noise_float(P.mul(0.9)).mul(0.04).add(1))

  /* ── the roof: an earth deck in broad patches of older and newer plaster, fine cracks, damp along the parapet's foot;
     the parapet's top a course of baked brick laid flat ── */
  const fR = max(footprint(U, vec3(1, 0, 0), vec3(0, 1, 0)), footprint(U, vec3(0, 0, 1), vec3(0, 1, 0)))
  const dPar = min(min(P.x.sub(o.x0 + pt), float(o.x1 - pt).sub(P.x)), min(P.z.sub(o.z0 + pt), float(o.z1 - pt).sub(P.z)))
  const fresh = smoothstep(0.15, 0.4, mx_noise_float(vec3(P.x.mul(0.21), 8.3, P.z.mul(0.21))))
  const crackCell = mx_worley_noise_vec2(vec2(P.x, P.z).mul(1.6))
  const cracks = smoothstep(0.06, 0.0, crackCell.y.sub(crackCell.x)).mul(float(1).sub(smoothstep(0.01, 0.05, fR)))
  const old = smoothstep(0.1, 0.45, mx_noise_float(vec3(P.x.mul(0.11), 1.9, P.z.mul(0.11))).negate())
  const deckTone = V(TONES.roof).mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.05), 4.1, P.z.mul(0.05))).mul(0.16)).add(mx_noise_float(vec3(P.x.mul(0.45), 2.2, P.z.mul(0.45))).mul(0.08)))
  // newer plaster paler, older patches weathered darker and greyer, a darker damp margin along the parapet's foot
  const deckCol = mix(deckTone.mul(mix(float(1), float(1.12), fresh.mul(0.8))), deckTone.mul(vec3(0.8, 0.8, 0.82)), old.mul(0.7))
    .mul(float(1).sub(float(1).sub(smoothstep(0.0, 1.2, dPar)).mul(0.2))).mul(float(1).sub(cracks.mul(0.35)))
  const copeU = select(abs(P.x.sub((o.x0 + o.x1) / 2)).greaterThan((o.x1 - o.x0) / 2 - pt), P.z, P.x)
  const copeCol = mix(V(PAL.buff as RGB).mul(0.86), V(PAL.asphalt as RGB), lines(copeU, BR, 0.006, fR).mul(0.8))

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
  m.emissiveNode = sheen
  const glazed = max(front, reveal).mul(float(1).sub(jointF.mul(front)))
  m.roughnessNode = mix(mix(float(0.92), float(0.3), glazed), float(0.92), uView)

  /* ── the light the stack does not carry: inside the room only what comes through the doors (strongest in front of
     each, spreading and falling off with depth; the niche's steps darker as they recede); the passages darker deeper
     in; a contact shade where the walls meet the paving and the deck meets its parapet ── */
  const zIn = max(P.z.sub(F.zB), 0)
  let through: N = float(0)
  for (const d of F.doors) {
    const s = zIn.mul(0.55).add(d.r)
    through = through.add(float(d.r * 1.15).div(zIn.mul(0.9).add(d.r)).mul(exp(P.x.sub(d.c).div(s).mul(P.x.sub(d.c).div(s)).negate())))
  }
  const facing = select(n.y.lessThan(-0.5), float(0.82), select(n.y.greaterThan(0.5), float(0.95), select(abs(n.x).greaterThan(0.5), float(0.68), float(1))))
  const nicheIn = clamp(P.z.sub(F.niche.z).div(F.niche.d1 + F.niche.d2), 0, 1)
  // the doors' light comes in low: a wall takes less of it toward the ceiling
  const high = select(n.y.lessThan(-0.5), float(0), smoothstep(2.5, 10, y).mul(0.32))
  const roomAO = clamp(float(0.44).add(min(through, 1).mul(0.32)), 0.3, 0.78).mul(facing).mul(float(1).sub(high)).mul(float(1).sub(nicheIn.mul(0.3)))
  const passAO = mix(float(0.92), float(0.55), clamp(P.z.sub(F.zF).div(F.zB - F.zF), 0, 1))
  const dFloorWall = select(min(inDoorX, 1).greaterThan(0.5), min(min(P.z.sub(c.z0), P.x.sub(c.x0)), float(c.x1).sub(P.x)), dWall)
  const floorAO = float(1).sub(float(1).sub(smoothstep(0.0, 1.1, dFloorWall)).mul(0.42).mul(inCourt))
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.7, y)).mul(0.3))
  const deckAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.7, dPar)).mul(0.35))
  let ao: N = float(1)
  ao = mix(ao, footAO, max(courtFace, front).mul(float(1).sub(room)))
  ao = mix(ao, passAO, reveal)
  ao = mix(ao, floorAO, paving.mul(inCourt))
  ao = mix(ao, deckAO, deck)
  ao = mix(ao, roomAO, room.mul(float(1).sub(reveal)))
  m.aoNode = mix(ao, float(1), uView)
  // no sun reaches into the room or its passages through doors that face north; the shadow map's contact edges leaked it
  const indoors = max(room, reveal)
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors))
  return m
}
