/* STOP 6'S MATERIAL (TSL), grown from the gate's glaze kit (its bond, filtered lines and colours): one material for
   every court body, branching on where a point lies and which way its face looks, never on screen derivatives.
     the facade's court face   the glazed design on the brick module (columns, capitals with two rows of volutes,
                               joining palmettes, borders, the squares band, the white double palmettes)
     the door reveals, soffits the dark blue ground in its bond
     the court's other fronts  bare yellow-brown baked brick in its bond, bitumen joints
     the paving                plain baked brick, 33 cm square
     inside the room           white lime-gypsum wash, the sky's light cut by the room's walls
     everything else           the map's grey, so the palace's roofs and outer faces stay the city's massing
   Every line is box-filtered over one device pixel's footprint on the surface, so the jittered sub-frames agree. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { BR, C, PAL, band, bond, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, greyNode, uView, type ClassTones } from '../map/mass'
import type { CourtFrame } from './court-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, atan, attribute, clamp, float, floor, fract, length, max, min, mix, mx_noise_float, normalize, positionWorld, select, sin, smoothstep, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uCourtPix = uniform(0.0003)
export function setCourtPixel(vfovDeg: number, heightPx: number): void {
  uCourtPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
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

/** coverage of the inside of d over a footprint fw */
const cover = (d: N, fw: N): N => float(1).sub(smoothstep(fw.mul(-0.5), fw.mul(0.5), d))

export function courtMaterial(F: CourtFrame, cp: J, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  // the meshes stand untransformed, so the geometry's normal is the world's
  const n = normalize(attribute('normal', 'vec3'))
  const U = { uPix: uCourtPix }
  const col = cp.colours
  const G = V(col.ground), L = V(col.light), Wt = V(PAL.white as RGB), Y = V(PAL.yellow as RGB), K = V(PAL.black as RGB)
  const Z = cp.facade.zones as Record<string, [number, number]>
  const c = F.court
  const vertical = step(abs(n.y), 0.5)

  /* ── where a point lies ── */
  const inX = (a: number, b: number, e: number): N => step(a - e, P.x).mul(step(P.x, b + e))
  const inZ = (a: number, b: number, e: number): N => step(a - e, P.z).mul(step(P.z, b + e))
  const front = step(n.z, -0.9).mul(step(abs(P.z.sub(F.zF)), 0.03)).mul(inX(c.x0, c.x1, 0.02))
  let inDoor: N = float(0)
  for (const d of F.doors) inDoor = inDoor.add(inX(d.x0, d.x1, 0.01).mul(step(P.y, d.crown + 0.01)))
  const reveal = min(inDoor, 1).mul(inZ(F.zF + 0.005, F.zB + 0.01, 0)).mul(float(1).sub(front))
  const roomBack = F.niche.z + F.niche.d1 + F.niche.d2
  const room = inX(F.inner.x0, F.inner.x1, 0.02).mul(inZ(F.inner.z0, roomBack, 0.02)).mul(step(P.y, F.wallTop + 0.01))
  const paving = step(0.9, n.y).mul(step(abs(P.y.sub(F.pave)), 0.01))
  const courtFace = vertical.mul(inX(c.x0, c.x1, 0.02)).mul(inZ(c.z0, c.z1, 0.02))

  /* ── the facade's design: u along the face from its west end, y up from the paving ── */
  const u = P.x.sub(c.x0), y = P.y.sub(F.pave)
  const fu = footprint(U, vec3(1, 0, 0), vec3(0, 0, -1)), fy = footprint(U, vec3(0, 1, 0), vec3(0, 0, -1))
  const fw = max(fu, fy)
  const zone = (k: string): N => band(y, Z[k]![0] * C, Z[k]![1] * C, fy)
  const yz = (k: string): N => y.sub(Z[k]![0] * C)
  /** a shape painted the glaze's way: a black thread round it, a white rim inside, then its colour */
  const paint = (base: N, d: N, fill: N, rim = 0.024, thread = 0.012): N => {
    let o = mix(base, K, cover(d.sub(thread), fw))
    o = mix(o, Wt, cover(d, fw))
    return mix(o, fill, cover(d.add(rim), fw))
  }

  // the columns: centred in each stretch of wall between the court's corners and the doors, one every four bricks
  const pitch: number = cp.facade.pitch, margin: number = cp.facade.margin
  const edges = [c.x0, ...[...F.doors].sort((a, b) => a.x0 - b.x0).flatMap((d) => [d.x0, d.x1]), c.x1].map((x) => x - c.x0)
  const segs: Array<{ end: number; start: number; n: number }> = []
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i]!, b = edges[i + 1]!
    const k = Math.max(0, Math.floor((b - a - 2 * margin) / pitch))
    segs.push({ end: b, start: a + (b - a - k * pitch) / 2, n: k })
  }
  let start: N = float(segs[segs.length - 1]!.start), count: N = float(segs[segs.length - 1]!.n)
  for (let i = segs.length - 2; i >= 0; i--) {
    start = select(u.lessThan(segs[i]!.end + 0.01), float(segs[i]!.start), start)
    count = select(u.lessThan(segs[i]!.end + 0.01), float(segs[i]!.n), count)
  }
  const cell = u.sub(start).div(pitch)
  const ci = floor(cell)
  const onColumn = step(0, ci).mul(step(ci, count.sub(1)))
  const cu = fract(cell).sub(0.5).mul(pitch)
  const bj = floor(cell.add(0.5))
  const between = step(1, bj).mul(step(bj, count.sub(1)))
  const bu = cell.sub(bj).mul(pitch)

  let g: N = G
  // the white borders and the squares band, across the whole face
  for (const k of ['borderLow', 'borderMid', 'borderTop', 'edge']) {
    const bz = zone(k)
    g = mix(g, Wt, bz)
    // a black thread along each edge of the border
    g = mix(g, K, bz.mul(lines(yz(k), C, 0.006, fy)).mul(0.8))
  }
  {
    const ys = yz('squares'), sq = zone('squares')
    const yellow = band(ys, 0, C / 2, fy).add(band(ys, C, 1.5 * C, fy))
    const row = band(ys, C / 2, C, fy)
    const q = floor(u.div(BR / 4))
    const qi = q.sub(floor(q.div(4)).mul(4))
    const sqCol = select(qi.lessThan(0.5), K, select(qi.lessThan(1.5), Wt, select(qi.lessThan(2.5), K, Y)))
    let s: N = mix(G, Y, yellow)
    s = mix(s, sqCol, row)
    const threads = lines(ys, C / 2, 0.004, fy).mul(step(ys, 1.5 * C + 0.01)).add(lines(u, BR / 4, 0.004, fu).mul(row)).min(1)
    s = mix(s, K, threads.mul(0.85))
    g = mix(g, s, sq)
  }
  // the white double palmettes: a fan up and a fan down on one stem, each on a pair of curls; between two of them a
  // light blue four-pointed field whose white rims run on as the arcs to the curls
  {
    const pz = zone('palmettes'), pv = yz('palmettes')
    const ph = (Z['palmettes']![1] - Z['palmettes']![0]) * C
    const pp: number = cp.facade.frieze
    const pu = fract(u.div(pp)).sub(0.5).mul(pp)
    const p = vec2(pu, pv)
    const mid = ph / 2, hi = ph * 0.7, lo = ph * 0.3
    let f: N = G
    // the field centred on the cell's edge: inside the box, outside the four circles on its corners
    const wx = pp / 2 - 0.02, wy = ph * 0.13
    const q = vec2(abs(abs(pu).sub(pp / 2)).div(wx), abs(pv.sub(mid)).div(wy))
    const field = max(float(1).sub(length(q.sub(vec2(1, 1)))), max(q.x, q.y).sub(1)).mul(Math.min(wx, wy))
    f = paint(f, field, L, 0.016, 0.008)
    f = paint(f, capsule(p, 0, lo, 0, hi, 0.012), Wt, 0.0, 0.007)
    for (const [cy, dir] of [[hi, 1], [lo, -1]] as const) {
      for (const sx of [-1, 1]) {
        const ring = abs(circle(p, sx * 0.055, cy - dir * 0.04, 0.032)).sub(0.011)
        f = mix(f, K, cover(ring.sub(0.007), fw).mul(0.9))
        f = mix(f, Wt, cover(ring, fw))
      }
      f = paint(f, fan(p, 0, cy, 0.165, 7, dir, 0.008), Wt, 0.0, 0.008)
      f = paint(f, circle(p, 0, cy, 0.045), Y, 0.0, 0.008)
    }
    f = paint(f, roundBox(p, 0, mid, 0.03, 0.03, 0.01), Y, 0.0, 0.008)
    g = mix(g, f, pz)
  }
  // the columns' zone
  {
    // the palmettes that join the capitals, drawn first so the capitals lie over their garlands: a stem with a lily at
    // each row and a light blue garland under each row
    const joinZ = band(y, Z['voluteLow']![0] * C, Z['crown']![1] * C, fy).mul(between)
    {
      let o: N = g
      for (const k of ['voluteLow', 'voluteHigh']) {
        const p = vec2(bu, yz(k))
        const h = 7 * C
        const garland = max(abs(length(vec2(bu, yz(k).sub(h * 0.95))).sub(0.5)).sub(0.02), yz(k).sub(h * 0.62))
        const lily = union(ellipse(p, 0, h * 0.62, 0.035, 0.11), union(capsule(p, 0, h * 0.5, -0.09, h * 0.78, 0.025), capsule(p, 0, h * 0.5, 0.09, h * 0.78, 0.025)))
        const zk = zone(k)
        o = mix(o, paint(o, garland, L, 0.01, 0.008), zk)
        o = mix(o, paint(o, lily, Y, 0.012, 0.008), zk)
      }
      o = mix(o, paint(o, abs(bu).sub(0.02), L, 0.008, 0.006), band(y, Z['voluteLow']![0] * C, Z['voluteHigh']![0] * C + 0.15, fy))
      g = mix(g, o, joinZ)
    }
    const colZ = band(y, Z['baseRing']![0] * C, Z['crown']![1] * C, fy).mul(onColumn)
    let f: N = g
    // the shaft
    f = mix(f, paint(f, abs(cu).sub(0.175), Y), zone('shaft'))
    // the rings: three pills a course each, yellow, light blue, yellow
    const ring = (k: string): N => {
      const yr = yz(k)
      let o: N = f
      for (let i = 0; i < 3; i++) o = paint(o, roundBox(vec2(cu, yr), 0, (i + 0.5) * C, 0.22, C / 2 - 0.006, C / 2 - 0.006), i === 1 ? L : Y, 0.014, 0.008)
      return o
    }
    f = mix(f, ring('baseRing'), zone('baseRing'))
    f = mix(f, ring('neckRing'), zone('neckRing'))
    // a capital's row of double volutes, seven courses: two light blue lobes in a broad white rim, each curling down
    // into a small white spiral eye; their stems a white V over a yellow dart
    const volutes = (k: string): N => {
      const p = vec2(cu, yz(k))
      const h = 7 * C
      let lobes: N = union(circle(p, -0.245, h * 0.56, 0.255), circle(p, 0.245, h * 0.56, 0.255))
      const bite = union(circle(p, -0.09, h * 0.2, 0.085), circle(p, 0.09, h * 0.2, 0.085))
      lobes = max(lobes, bite.negate())
      const stems = union(capsule(p, 0, 0.02, -0.15, h * 0.42, 0.03), capsule(p, 0, 0.02, 0.15, h * 0.42, 0.03))
      let o: N = paint(f, union(lobes, stems), L, 0.036, 0.012)
      // the eye: a white coil in the lobe's lower half, a white dot at its heart, the rim's curl running into it
      for (const sx of [-1, 1]) {
        const ex = sx * 0.225, ey = h * 0.4
        const coil = abs(circle(p, ex, ey, 0.042)).sub(0.01)
        const tail = max(abs(circle(p, ex + sx * 0.03, ey, 0.072)).sub(0.011), p.y.sub(ey))
        o = mix(o, Wt, cover(union(union(coil, tail), circle(p, ex, ey, 0.013)), fw))
      }
      return paint(o, ellipse(p, 0, h * 0.3, 0.04, h * 0.27), Y, 0.012, 0.008)
    }
    f = mix(f, volutes('voluteLow'), zone('voluteLow'))
    f = mix(f, volutes('voluteHigh'), zone('voluteHigh'))
    // the crown: a white palmette fan on a yellow heart
    {
      const p = vec2(cu, yz('crown'))
      let o = paint(f, fan(p, 0, 0.0, 0.3, 7, 1), Wt, 0.0)
      o = paint(o, circle(p, 0, 0.0, 0.1), Y, 0.0, 0.01)
      f = mix(f, o, zone('crown'))
    }
    g = mix(g, f, colZ)
  }
  // the glaze on its bricks: courses of 8.6 cm in a half-brick bond, tight joints (the mortar stops short of the face),
  // each brick a little different, the glaze pooling darker at its edges
  const bF = bond(u, y, float(0), fu, fy, 0.0025)
  const jointF = bF.bed.add(bF.head).min(1)
  const vary = bF.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fu)))
  // pooling darkens by a share, never by an amount: a fixed amount would eat the dark blue's red and green first
  const pool = lines(y, C, 0.012, fy).add(lines(u, BR / 2, 0.012, fu)).min(1).mul(0.12)
  // each glazed brick fired a little differently, and whole patches of them (the original fragments vary from navy to
  // mid blue brick by brick)
  const patch = mx_noise_float(P.mul(0.7)).mul(float(1).sub(smoothstep(0.3, 1.2, fu)))
  const glazeCol = g.mul(float(1).add(vary.mul(0.32)).add(patch.mul(0.12))).mul(float(1).sub(pool))
  const facadeCol = mix(glazeCol, V(col.jointGlaze), jointF.mul(0.85))

  /* ── the reveals and soffits: the ground in its bond, along the wall's depth ── */
  const rU = select(abs(n.x).greaterThan(0.5), P.z, P.x)
  const fr = footprint(U, select(abs(n.x).greaterThan(0.5), vec3(0, 0, 1), vec3(1, 0, 0)), n), fry = footprint(U, vec3(0, 1, 0), n)
  const bR = bond(rU, y, float(0), fr, fry, 0.0025)
  const revealCol = mix(G.mul(float(1).add(bR.brick.sub(0.5).mul(0.32))), V(col.jointGlaze), bR.bed.add(bR.head).min(1).mul(0.85))

  /* ── the court's other fronts: bare baked brick, thick bitumen joints ── */
  const wU = select(abs(n.x).greaterThan(0.5), P.z, P.x)
  const fwU = footprint(U, select(abs(n.x).greaterThan(0.5), vec3(0, 0, 1), vec3(1, 0, 0)), n), fwY = footprint(U, vec3(0, 1, 0), n)
  const bW = bond(wU, P.y, float(0), fwU, fwY, 0.006)
  const fine = mx_noise_float(P.mul(23)).mul(float(1).sub(smoothstep(0.01, 0.04, max(fwU, fwY))))
  const varyW = bW.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fwU)))
  const brick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), bW.brick.mul(0.45).add(fine.mul(0.08))).mul(float(1).add(varyW.mul(0.12)))
  const wallCol = mix(brick, V(PAL.asphalt as RGB), bW.bed.add(bW.head).min(1))

  /* ── the paving: square bricks, each row half a brick on ── */
  const fpX = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0)), fpZ = footprint(U, vec3(0, 0, 1), vec3(0, 1, 0))
  const kz = floor(P.z.div(BR))
  const px = P.x.add(kz.sub(floor(kz.div(2)).mul(2)).mul(BR / 2))
  const jp = lines(P.z, BR, 0.0035, fpZ).add(lines(px, BR, 0.0035, fpX)).min(1)
  const pb = hash2(floor(px.div(BR)), kz)
  const pfine = mx_noise_float(P.mul(9)).mul(float(1).sub(smoothstep(0.02, 0.08, max(fpX, fpZ))))
  const pave = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), pb.mul(0.5).add(pfine.mul(0.06))).mul(float(0.88).add(hash2(kz, floor(px.div(BR)).add(7)).mul(0.14)))
  const pavingCol = mix(mix(pave, V(PAL.dust as RGB), smoothstep(0.3, 0.8, mx_noise_float(P.mul(0.21)).add(0.5)).mul(0.3)), V(PAL.asphalt as RGB).mul(2.5), jp.mul(0.75))

  /* ── inside the room: a white wash ── */
  const plaster = V(col.plaster).mul(mx_noise_float(P.mul(0.9)).mul(0.04).add(1))

  /* ── one colour per point, the class view over it ── */
  let stateCol: N = greyNode(0.42)
  stateCol = mix(stateCol, wallCol, courtFace)
  stateCol = mix(stateCol, plaster, room.mul(float(1).sub(paving)))
  stateCol = mix(stateCol, revealCol, reveal)
  stateCol = mix(stateCol, facadeCol, front)
  stateCol = mix(stateCol, pavingCol, paving)
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  const glazed = max(front, reveal).mul(float(1).sub(jointF.mul(front)))
  m.roughnessNode = mix(mix(float(0.92), float(0.3), glazed), float(0.92), uView)
  // the sky reaches into the room only through its doors: the bounce inside falls off with depth from the north wall
  const depthIn = clamp(P.z.sub(F.zB).div(roomBack - F.zB), 0, 1)
  const facing = float(0.45).add(max(n.z.negate(), 0).mul(0.55)).add(max(n.y, 0).mul(0.2))
  m.aoNode = mix(float(1), mix(float(0.75), float(0.45), depthIn).mul(facing), room)
  return m
}
