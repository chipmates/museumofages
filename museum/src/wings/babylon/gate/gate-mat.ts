/* THE GATE'S MATERIALS (TSL): one wall material for every body (the bond,
   the plinth's rosettes and borders, the corner stripes, the lion frieze,
   plain and mud brick, cedar, copper, bronze), one panel material per relief
   kind (the moulded animal from its height map, its glaze colours, the joints
   that run through it, its own shadow in the raking sun), and the paving.
   Three states share the geometry: 0 grey massing, 1 flat (the first pass),
   2 full; the switch paints the classes over any of them.
   Every procedural line is box-filtered over its own footprint on the surface
   (pixel angle times distance, stretched by the view's slant), never over
   screen derivatives, so the jittered sub-frames agree. */

import { Color, DataTexture, DataUtils, DoubleSide, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix3, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, RGBAFormat, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { REG, type Field } from './gate-relief'
import { PAL } from './gate-colours'
import { uSkySet } from '../open/sky-set'
import { KEY_COLOUR } from '../switch-key'
// @ts-expect-error TS5097: the hatch's one home, imported by its extension so the forge's node checks load it too
import { hatchOf, lines } from '../switch-hatch.ts'

export { PAL }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { Fn, If, Loop, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cos, cross, dFdx, dFdy, dot, float, floor, fract, length, max, min, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionLocal, positionWorld, select, sin, smoothstep, sqrt, step, texture, uniform, uv, vec2, vec3, vec4, atan, log2 } = T

export const C = 0.086
export const BR = 0.33

const V = (c: [number, number, number]): N => vec3(...c)

/** the state shared by every material: the switch, the state, the pixel angle, the sun in the gate's frame, the frame's turn into the world */
export interface GateUniforms {
  uState: N
  uSwitch: N
  uPix: N
  uSunG: N
  uRot: N
  /** the class colours by CLASS_TONE's index: 0 in place, 1 reconstructed, 2 guessed, 3 found, 4 typical */
  uM: N
  uR: N
  uG: N
  uK: N
  uT: N
  /** the switch's own light, a share of each class colour emitted, so a class keeps its hue in shade and on the low-lit floor */
  uSelf: N
}

export function makeUniforms(classes: { M: string; R: string; G: string; K?: string; T?: string }): GateUniforms {
  const lin = (hex: string): Vector3 => {
    const c = new Color(hex)
    return new Vector3(c.r, c.g, c.b)
  }
  return {
    uState: uniform(2),
    uSwitch: uniform(0),
    uPix: uniform(0.0005),
    uSunG: uniform(new Vector3(0, 1, 0)),
    uRot: uniform(new Matrix3()),
    uM: uniform(lin(classes.M)),
    uR: uniform(lin(classes.R)),
    uG: uniform(lin(classes.G)),
    uK: uniform(lin(classes.K ?? KEY_COLOUR.found)),
    uT: uniform(lin(classes.T ?? KEY_COLOUR.typical)),
    uSelf: uniform(0),
  }
}

/* ── filtered patterns ── */
/* lines (coverage of a train of lines, box-filtered over a footprint) and the hatch live in switch-hatch.ts */
export { hatchOf, lines }
/** a band [a, b) of x with soft edges as wide as the footprint */
export const band = (x: N, a: N | number, b: N | number, w: N): N => smoothstep(float(a).sub(w.mul(0.5)), float(a).add(w.mul(0.5)), x).mul(float(1).sub(smoothstep(float(b).sub(w.mul(0.5)), float(b).add(w.mul(0.5)), x)))
export const hash2 = (a: N, b: N): N => fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453))

/** the footprint of one device pixel along a direction t in a surface of normal n, seen along v */
export const footprint = (U: Pick<GateUniforms, 'uPix'>, t: N, n: N): N => {
  const v = normalize(cameraPosition.sub(positionWorld))
  const d = positionWorld.distance(cameraPosition)
  const nv = max(dot(n, v).mul(dot(n, v)), 0.01)
  return U.uPix.mul(d).mul(sqrt(float(1).add(dot(t, v).mul(dot(t, v)).div(nv))))
}

/* ── the classes ── */
/** the class of a point: the plan's under its band, R up to the last relief row on a face that carries rows, the height's above */
export const classIndex = (cls: N, y: N): N => select(y.lessThan(cls.z), cls.x, select(y.lessThan(cls.w), float(1), cls.y))
/** the side mask for the class still's check (?mask=side, with a high self light): the known side white, the guessed black */
const SIDE_MASK = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mask') === 'side'
/** the bond's stretch check (?bondgrad=<limit>): the worst texel stretch of the bond's (u, y) against the gate frame, unlit;
 * a soffit green within the limit and red past it, any other wall blue and magenta */
const BOND_GRAD = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('bondgrad') ?? 0) : 0
const bondGrad = (m: MeshPhysicalNodeMaterial, p: N, u: N, y: N, soff: N): void => {
  const px = dFdx(p), py = dFdy(p), e1 = normalize(px)
  const s11 = length(px), s12 = dot(py, e1), s22 = max(length(py.sub(e1.mul(s12))), 1e-9)
  const ux = dFdx(u), vx = dFdy(u).sub(ux.mul(s12).div(s11)), yx = dFdx(y), yy = dFdy(y).sub(yx.mul(s12).div(s11))
  const a = ux.div(s11), b = vx.div(s22), c = yx.div(s11), d = yy.div(s22)
  // the screen-to-bond map in an orthonormal tangent frame; the stretch is its smaller singular value's inverse
  const e = a.mul(a).add(b.mul(b)).add(c.mul(c)).add(d.mul(d)), det = abs(a.mul(d).sub(b.mul(c)))
  const s1 = sqrt(e.add(sqrt(max(e.mul(e).sub(det.mul(det).mul(4)), 0))).mul(0.5))
  const over = step(float(BOND_GRAD), s1.div(max(det, 1e-12)))
  m.colorNode = vec3(0)
  m.emissiveNode = select(soff, mix(vec3(0, 1, 0), vec3(1, 0, 0), over), mix(vec3(0, 0, 1), vec3(1, 0, 1), over)).mul(3)
  m.clearcoatNode = float(0)
  m.roughnessNode = float(1)
  m.metalnessNode = float(0)
}
/** the class colour by CLASS_TONE's index, the albedos as measured; the guessed side (2 guessed, 4 typical) hatched */
export const classColour = (U: GateUniforms, idx: N, hu: N, hy: N, fw: N, n?: N): N => {
  const base = select(idx.lessThan(0.5), U.uM, select(idx.lessThan(1.5), U.uR, select(idx.lessThan(2.5), U.uG, select(idx.lessThan(3.5), U.uK, U.uT))))
  const guessed = step(1.5, idx).mul(step(idx, 2.5)).add(step(3.5, idx))
  if (SIDE_MASK) return vec3(1).sub(vec3(guessed))
  return base.mul(float(1).sub(hatchOf(hu.add(hy), fw, n).mul(guessed)))
}

/* ── the bond ── */
export interface Bond { bed: N; head: N; brick: N; kk: N }
/** joints of a running bond of half bricks: courses of 8.6 cm, whole-ended courses where k minus the shift is odd */
export const bond = (u: N, y: N, shift: N, fu: N, fy: N, half: number): Bond => {
  const k = floor(y.div(C))
  const kk = k.sub(shift)
  const odd = kk.sub(floor(kk.div(2)).mul(2))
  const phase = float(1).sub(odd).mul(BR / 2)
  const bed = lines(y, C, half, fy)
  const headRaw = lines(u.sub(phase), BR, half, fu)
  // when a course is under a pixel the head joints average to their mean, so courses never shimmer
  const head = mix(headRaw, float((2 * half) / BR), smoothstep(C * 0.3, C * 0.9, fy))
  const brick = hash2(floor(u.sub(phase).div(BR)), k)
  return { bed, head, brick, kk }
}

/* ── the rosette band and borders (plinth and lion frieze) ── */
const rosettes = (u: N, yb: N, fw: N): N => {
  // yb: metres from the band's foot; 5 courses high, a rosette every two bricks
  const cu = floor(u.div(2 * BR)).add(0.5).mul(2 * BR)
  const dx = u.sub(cu), dy = yb.sub(2.5 * C)
  const r = length(vec2(dx, dy))
  const a = atan(dy, dx)
  const rp = float(0.165).mul(float(0.8).add(abs(cos(a.mul(6))).mul(0.2)))
  const petals = float(1).sub(smoothstep(rp.sub(fw), rp.add(fw), r))
  const centre = float(1).sub(smoothstep(float(0.05).sub(fw), float(0.05).add(fw), r))
  const ring = band(r, 0.047, 0.056, fw).add(band(r, rp.sub(0.006), rp.add(0.003), fw)).min(1)
  return vec3(petals, centre, ring)
}

/** the gate's glazed wall at a point: the plinth band, the corner stripes, the ground, by the course from the face's foot */
const gateGlaze = (u: N, y: N, kk: N, edge: N, borders: N, fu: N, fy: N): N => {
  const cob = V(PAL.cobalt), yel = V(PAL.yellow), wht = V(PAL.white), blk = V(PAL.black), red = V(PAL.red)
  let col: N = cob
  // the plinth: borders on courses 2-3 and 9-10, rosettes on 4-8, measured from the shifted course
  const yp = y.sub(floor(y.div(C)).sub(kk).mul(C))
  const bordLo = band(yp, 2 * C, 4 * C, fy), bordHi = band(yp, 9 * C, 11 * C, fy)
  const ros = band(yp, 4 * C, 9 * C, fy)
  const rr = rosettes(u, yp.sub(4 * C), max(fu, fy))
  const rosCol = mix(mix(cob, wht, rr.x), yel, rr.y)
  col = mix(col, mix(rosCol, blk, rr.z.mul(0.8)), ros)
  const bordCol = mix(yel, blk, lines(yp.sub(2 * C), 2 * C, 0.004, fy).mul(0.7))
  col = mix(col, bordCol, bordLo.add(bordHi).min(1))
  // the corners: a blue stripe a quarter brick wide, a red stripe, then the yellow border (faces with borders only)
  const e = min(edge.x, edge.y)
  const thread = lines(e.sub(0.0825), 10, 0.003, fu)
  const redS = band(e, 0.0825, 0.165, fu).mul(borders)
  const yelS = band(e, 0.165, 0.423, fu).mul(borders)
  const above = step(0, y)
  col = mix(col, red, redS.mul(above))
  col = mix(col, yel, yelS.mul(above))
  const edges = thread.add(lines(e.sub(0.165), 10, 0.003, fu).mul(borders)).add(lines(e.sub(0.423), 10, 0.003, fu).mul(borders)).min(1)
  col = mix(col, blk, edges.mul(0.75).mul(above).mul(step(e, 0.5)))
  return col
}

/** the lion frieze, 23 courses from its foot: border, rosettes on cobalt, border, turquoise for the lions, border */
const lionFrieze = (u: N, yf: N, fu: N, fy: N): { col: N; inside: N } => {
  const cob = V(PAL.cobalt), yel = V(PAL.yellow), wht = V(PAL.white), blk = V(PAL.black), tq = V(PAL.turquoise)
  const rr = rosettes(u, yf.sub(2 * C), max(fu, fy))
  const ros = mix(mix(mix(cob, wht, rr.x), yel, rr.y), blk, rr.z.mul(0.8))
  let col: N = mix(tq, ros, band(yf, 2 * C, 7 * C, fy))
  const bord = band(yf, 0, 2 * C, fy).add(band(yf, 7 * C, 9 * C, fy)).add(band(yf, 22 * C, 23 * C, fy)).min(1)
  col = mix(col, mix(yel, blk, lines(yf, C * 23, 0.004, fy).mul(0.7)), bord)
  return { col, inside: band(yf, 0, 23 * C, fy) }
}

/* ── the analytic sky openness of the chambers and passages (the stack has no GI; the bounce and sky are modelled) ── */
export interface Rooms {
  boxes: Array<{ x0: number; x1: number; z0: number; z1: number; y1: number; open: number }>
  /** the mouths onto the open: a rectangle in the plane z (half-width hw, height h over the floor), `out` the side the open
      lies on (-1 south), `lit` the light of the open beyond it as a share of the street's (the court between the gates less) */
  mouths?: Array<{ z: number; out: 1 | -1; hw: number; h: number; lit: number }>
  /** the paving's colour as a hue (luminance 1): the open street's bounce through a mouth */
  hue?: [number, number, number]
}
/** the open street's bounce through the mouths: the reach of a mouth's view (its area's scale: 3, as the passage's floor
    and walls carry the light on past the direct view), the share of the hidden sky the lit open gives back at a mouth
    (1.5: at the mouth's floor line the passage stays darker than the street beyond), and the glaze's
    own base gloss inside the rooms (1 off); the give-back held under `top`, so the floor just inside a mouth, under the vault,
    stays darker than the street beyond it */
export const uMouth = { reach: uniform(3), give: uniform(1.5), top: uniform(0.45), glaze: uniform(1) }
const openness = (rooms: Rooms, p: N): { open: N; inside: N } => {
  let o: N = float(1), inside: N = float(0)
  for (const r of rooms.boxes) {
    // soft along the passage (1.2 m), so a room's edge never draws a line across the floor
    const inX = step(r.x0, p.x).mul(step(p.x, r.x1)), inY = step(p.y, r.y1)
    const inZ = smoothstep(r.z0 - 0.6, r.z0 + 0.6, p.z).mul(float(1).sub(smoothstep(r.z1 - 0.6, r.z1 + 0.6, p.z)))
    const w = inX.mul(inZ).mul(inY)
    o = min(o, mix(float(1), float(r.open), w))
    inside = max(inside, w)
  }
  return { open: o, inside }
}

/** the rooms' light on a material: without the sky field the openness takes sky and bounce together; under it the
    field takes the sky a point cannot see, so the openness steps aside and stays on the ground bounce alone, which a
    room's floor gives in the sky's hue (open/sky-set.ts, skyGroundNode) */
export function roomLight(m: Material, rooms: Rooms, p: N, glaze?: N): void {
  const r = openness(rooms, p)
  // a point's view of the open through the mouths: half its hemisphere at the mouth, falling off as the opening's
  // projected share (area over area plus 2 pi d squared), d its distance to the opening's rectangle on the room's side
  let s: N = float(0)
  for (const mo of rooms.mouths ?? []) {
    const A = uMouth.reach.mul(2 * mo.hw * mo.h)
    const dz = max(p.z.sub(mo.z).mul(-mo.out), 0), dx = max(abs(p.x).sub(mo.hw), 0), dy = max(p.y.sub(mo.h), 0)
    const d2 = dz.mul(dz).add(dx.mul(dx)).add(dy.mul(dy))
    // only on the room's side: the open beyond keeps its own room's openness
    const side = step(0, p.z.sub(mo.z).mul(-mo.out))
    s = max(s, A.div(A.add(d2.mul(2 * Math.PI))).mul(side).mul(0.5 * mo.lit))
  }
  s = s.mul(r.inside)
  // the floor near a mouth is lit by the open, so the room's ground bounce rises toward it and keeps the open's hue
  const open = r.open.add(float(1).sub(r.open).mul(s))
  ;(m as unknown as { aoNode: N }).aoNode = mix(open, float(1), uSkySet)
  ;(m as unknown as { skyGroundNode: N }).skyGroundNode = vec2(open, r.inside.mul(float(1).sub(s)))
  // the lit street and fronts beyond a mouth stand where the field counts hidden sky: their warm light given back
  if (rooms.hue) (m as unknown as { skyBounceNode: N }).skyBounceNode = vec3(...rooms.hue).mul(min(s.mul(uMouth.give), uMouth.top))
  /* a glaze's gloss in a room is its coat's (the weight handed in is the clear coat's): the base layer's mirror there took the environment's sunlit east-walls band
     (no wall of the forecourt is in view inside), and the field's correction drove its green and blue below nothing */
  if (glaze) (m as unknown as { specularIntensityNode: N }).specularIntensityNode = float(1).sub(glaze.mul(r.inside).mul(uMouth.glaze))
}

/* ── the wall material: every body of the gate's soup ── */
export function wallMaterial(U: GateUniforms, rooms: Rooms): Material {
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.6, metalness: 0 })
  const gU = attribute('gU', 'float'), gEdge = attribute('gEdge', 'vec2'), gInfo = attribute('gInfo', 'vec4'), gCls = attribute('gCls', 'vec4')
  const p = positionLocal
  const kind = gInfo.z
  // the world normal from the gate-frame attribute: reading normalWorld here took the lighting's normal with it (the walls lost the lower hemisphere's bounce)
  const nW = normalize(U.uRot.mul(attribute('normal', 'vec3')))
  const up = vec3(0, 1, 0)
  // a vault's soffit (info.y -1) brings its course height in gU; its bond's u runs along the passage, as on the jamb below
  const soff = gInfo.y.lessThan(-0.5)
  const bu = select(soff, select(p.x.lessThan(0), p.z.negate(), p.z), gU), by = select(soff, gU, p.y)
  const tZ = normalize(U.uRot.mul(vec3(0, 0, 1)))
  const tU = select(soff, tZ, normalize(select(abs(nW.y).greaterThan(0.7), vec3(1, 0, 0), vec3(nW.z.negate(), 0, nW.x))))
  const fu = footprint(U, tU, nW), fy = footprint(U, select(soff, normalize(cross(nW, tZ)), up), nW)
  // one weight per kind: 0 gate glaze, 1 lion wall, 2 plain brick, 3 mud brick, 5 cedar, 6 copper, 7 bronze
  const isK = (k: number): N => step(k - 0.5, kind).mul(step(kind, k + 0.5))
  const k0 = isK(0), k1 = isK(1), k2 = isK(2).add(isK(4)), k3 = isK(3), k5 = isK(5), k6 = isK(6), k7 = isK(7)
  // a soffit's east half (x < 0) takes its shift from info.w, chosen per fragment so the crown's triangles do not blend it
  const b = bond(bu, by, select(soff.and(p.x.lessThan(0)), gInfo.w, gInfo.x), fu, fy, 0.0045)
  const joint = b.bed.add(b.head).min(1)
  const vary = b.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fu)))
  const fine = mx_noise_float(p.mul(31)).mul(float(1).sub(smoothstep(0.01, 0.04, max(fu, fy))))
  const jointCol = vec3(0.05, 0.048, 0.045)
  // 0: the gate's glazed brick, the glaze pooling a little darker at the brick's edges
  const pool = lines(by, C, 0.016, fy).add(lines(bu, BR / 2, 0.014, fu)).min(1).mul(0.07)
  const glaze0 = gateGlaze(bu, by, b.kk, gEdge, max(gInfo.y, 0), fu, fy).mul(float(1).add(vary.mul(0.09)).add(fine.mul(0.025)).sub(pool))
  const col0 = mix(glaze0, jointCol, joint)
  // 1: a lion wall, plain brick with the glazed frieze
  const fz = lionFrieze(gU, p.y.sub(gInfo.w), fu, fy)
  const brick = mix(V(PAL.buff), V(PAL.redBrown), b.brick.mul(0.8).add(fine.mul(0.1))).mul(float(1).add(vary.mul(0.12)))
  const col1 = mix(mix(brick, fz.col.mul(float(1).add(vary.mul(0.08))), fz.inside), mix(V(PAL.asphalt), jointCol, fz.inside), joint)
  // 2: plain brick with dark asphalt joints; 3: mud brick
  const col2 = mix(brick, V(PAL.asphalt), joint)
  const col3 = mix(V(PAL.mud).mul(float(1).add(vary.mul(0.06)).add(fine.mul(0.04))), V(PAL.mud).mul(0.82), joint.mul(0.6))
  // 5: cedar; door leaves (info.x 1) carry copper bands every 1.2 m
  const grain = mx_noise_float(vec3(p.x.mul(3), p.y.mul(0.25), p.z.mul(3))).mul(0.12)
  const bands = band(fract(p.y.div(1.2)), 0.0, 0.08, fy.div(1.2)).mul(step(0.5, gInfo.x)).mul(k5)
  const col5 = mix(V(PAL.cedar).mul(float(1).add(grain)), V(PAL.copper), bands)
  const col7 = V(PAL.bronze).mul(float(1).add(fine.mul(0.05)))
  const full = col0.mul(k0).add(col1.mul(k1)).add(col2.mul(k2)).add(col3.mul(k3)).add(col5.mul(k5)).add(V(PAL.copper).mul(k6)).add(col7.mul(k7))
  const glazed = k0.add(k1.mul(fz.inside)).mul(float(1).sub(joint))
  const roughFull = mix(float(0.9), float(0.18), glazed).mul(float(1).sub(k5).sub(k6).sub(k7)).add(mix(float(0.7), float(0.38), bands).mul(k5)).add(float(0.38).mul(k6)).add(float(0.34).mul(k7))
  const metalFull = bands.add(k6).add(k7)
  // grey: the map's massing grey; flat: the first pass, one flat colour per zone
  const grey = vec3(PAL.grey).mul(float(1).add(max(nW.y, 0).mul(0.08))).mul(mx_noise_float(positionWorld.mul(0.07)).mul(0.05).add(1))
  const frieze = step(gInfo.w, p.y).mul(step(p.y, gInfo.w.add(23 * C)))
  const flatCol = V(PAL.cobalt).mul(k0).add(mix(V(PAL.buff).mul(0.85), V(PAL.turquoise), frieze).mul(k1)).add(V(PAL.buff).mul(0.85).mul(k2)).add(V(PAL.mud).mul(k3)).add(V(PAL.cedar).mul(k5)).add(V(PAL.copper).mul(k6)).add(V(PAL.bronze).mul(k7))
  const stateCol = select(U.uState.lessThan(0.5), grey, select(U.uState.lessThan(1.5), flatCol, full))
  const cc = classColour(U, classIndex(gCls, p.y), bu, by, max(fu, fy), nW)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  const roughState = select(U.uState.lessThan(0.5), float(0.92), select(U.uState.lessThan(1.5), mix(float(0.88), float(0.45), k0.add(k1.mul(frieze))), roughFull))
  m.roughnessNode = mix(roughState, float(0.85), U.uSwitch)
  m.metalnessNode = mix(select(U.uState.lessThan(1.5), float(0), metalFull), float(0), U.uSwitch)
  // the glaze is glass fired on the brick: a clear coat over it in the full state
  m.clearcoatNode = mix(select(U.uState.lessThan(1.5), float(0), glazed), float(0), U.uSwitch)
  m.clearcoatRoughnessNode = float(0.06)
  roomLight(m, rooms, p, m.clearcoatNode)
  if (BOND_GRAD > 0) bondGrad(m, p, bu, by, soff)
  return m
}

/* ── relief panels ── */
export interface PanelMaps { height: DataTexture; colour: Record<string, DataTexture>; field: Field }

/** half-float RGBA with its own box-filtered mip chain (WebGPU's level sizes: floor halving) */
function halfTexture(w: number, h: number, data: Float32Array): DataTexture {
  const levels: Array<{ data: Uint16Array; width: number; height: number }> = []
  let cur = data, cw = w, ch = h
  for (;;) {
    const u16 = new Uint16Array(cur.length)
    for (let i = 0; i < cur.length; i++) u16[i] = DataUtils.toHalfFloat(cur[i]!)
    levels.push({ data: u16, width: cw, height: ch })
    if (cw === 1 && ch === 1) break
    const nw = Math.max(1, Math.floor(cw / 2)), nh = Math.max(1, Math.floor(ch / 2))
    const next = new Float32Array(nw * nh * 4)
    const sx = cw / nw, sy = ch / nh
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const i0 = Math.floor(i * sx), i1 = Math.max(i0 + 1, Math.floor((i + 1) * sx)), j0 = Math.floor(j * sy), j1 = Math.max(j0 + 1, Math.floor((j + 1) * sy))
      for (let c = 0; c < 4; c++) {
        let s = 0
        for (let jj = j0; jj < j1; jj++) for (let ii = i0; ii < i1; ii++) s += cur[(jj * cw + ii) * 4 + c]!
        next[(j * nw + i) * 4 + c] = s / ((i1 - i0) * (j1 - j0))
      }
    }
    cur = next
    cw = nw
    ch = nh
  }
  const t = new DataTexture(levels[0]!.data, w, h, RGBAFormat, HalfFloatType)
  t.mipmaps = levels as never
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

/** the glaze colours of one scheme over the animal's fields: alpha 1 on the animal, 0 on the ground */
export function bakePanel(f: Field, schemes: string[]): PanelMaps {
  const hdata = new Float32Array(f.w * f.h * 4)
  for (let k = 0; k < f.w * f.h; k++) {
    hdata[k * 4] = f.height[k]! + f.detail[k]!
    hdata[k * 4 + 1] = f.height[k]! > 0 ? 1 : 0
    hdata[k * 4 + 2] = f.thread[k]!
    hdata[k * 4 + 3] = 1
  }
  const colour: Record<string, DataTexture> = {}
  for (const sc of schemes) {
    const body = sc === 'yellow' || sc === 'lionYellow' ? PAL.yellow : PAL.white
    const mane = sc === 'yellow' ? PAL.cobalt : sc === 'white' ? PAL.yellow : sc === 'lionWhite' ? PAL.yellow : PAL.red
    const d = new Float32Array(f.w * f.h * 4)
    for (let k = 0; k < f.w * f.h; k++) {
      const r = f.region[k]!
      let c: [number, number, number] = body
      if (r === REG.ground) c = [0, 0, 0]
      else if (r === REG.mane) c = mane
      else if (r === REG.red || r === REG.mouth) c = PAL.red
      else if (r === REG.eyeWhite || r === REG.tooth || r === REG.stripe) c = PAL.white
      else if (r === REG.black) c = PAL.black
      const th = f.thread[k]!
      const a = r === REG.ground ? th : 1
      // the black thread drawn over the fields and round the outline (onto the ground as well)
      d[k * 4] = c[0] * (1 - th) + PAL.black[0] * th
      d[k * 4 + 1] = c[1] * (1 - th) + PAL.black[1] * th
      d[k * 4 + 2] = c[2] * (1 - th) + PAL.black[2] * th
      d[k * 4 + 3] = a
    }
    colour[sc] = halfTexture(f.w, f.h, d)
  }
  return { height: halfTexture(f.w, f.h, hdata), colour, field: f }
}

/**
 * The panel material of one kind. Instance attributes: iU (the face's u in the gate frame), iN (its normal),
 * iA (bond u at the panel's u = 0, the feet course's base y, walking direction, course shift), iB (scheme index, ground: 0 cobalt 1 turquoise,
 * the class tone for the switch).
 */
export function panelMaterial(U: GateUniforms, maps: PanelMaps, schemes: Array<[string, number]>, rooms: Rooms): Material {
  const f = maps.field
  // the same physical glaze as the wall around it (clear coat, pooling, brick variation), so the panel's ground never shows as a box
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.2, metalness: 0 })
  const iU = attribute('iU', 'vec3'), iN = attribute('iN', 'vec3'), iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4')
  const W = f.w * f.res, H = f.h * f.res
  const texUV = (u: N, v: N): N => {
    const ua = select(iA.z.greaterThan(0), u, float(f.L).sub(u))
    return vec2(ua.div(W).add(0.5 / f.w), v.div(H).add(0.5 / f.h))
  }
  const inside = (u: N, v: N): N => step(0, u).mul(step(u, f.L)).mul(step(0, v)).mul(step(v, f.H))
  const relief = select(U.uState.greaterThan(1.5), float(1), float(0))
  // the vertex: pushed out along the face's normal by the moulded height
  const uvL = uv()
  const hV = texture(maps.height, texUV(uvL.x, uvL.y)).level(0).x.mul(inside(uvL.x, uvL.y)).mul(relief)
  m.positionNode = positionLocal.add(iN.mul(hV))
  // the fragment
  const nG0 = normalize(iN)
  const nW = normalize(U.uRot.mul(nG0))
  const tW = normalize(U.uRot.mul(iU))
  const fu = footprint(U, tW, nW), fy = footprint(U, vec3(0, 1, 0), nW)
  const fw = max(fu, fy)
  const lod = max(float(0), log2(fw.div(f.res)))
  const u = uvL.x, v = uvL.y
  const yW = iA.y.add(v)
  const bondU = iA.x.add(u)
  const hAt = (du: number, dv: number, e: N): N => {
    const uu = u.add(e.mul(du)), vv = v.add(e.mul(dv))
    return texture(maps.height, texUV(uu, vv)).level(lod).x.mul(inside(uu, vv))
  }
  const e = max(fw, f.res)
  const b = bond(bondU, yW, iA.w, fu, fy, 0.0045)
  const joint = b.bed.add(b.head).min(1)
  // the joints cut 4 mm into the moulding, so the raking sun finds them
  const hu = hAt(1, 0, e).sub(hAt(-1, 0, e)).div(e.mul(2)).mul(relief)
  const hv = hAt(0, 1, e).sub(hAt(0, -1, e)).div(e.mul(2)).mul(relief)
  const nG = normalize(nG0.sub(iU.mul(hu)).sub(vec3(0, 1, 0).mul(hv)))
  const nWorld = normalize(U.uRot.mul(nG))
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nWorld, 0)).xyz)
  // colours: the scheme's map over the ground
  const cuv = texUV(u, v)
  /* the glaze runs over the moulding's edge: a steep face takes its colour from the top of its step, uphill, not the
     ground at its foot that the planar map and its blur put there (seen as a blue and orange rim at a grazing view) */
  const steep = float(1).sub(smoothstep(0.8, 0.98, dot(nWorld, nW)))
  const lean = steep.mul(max(float(0.012), e)).div(max(length(vec2(hu, hv)), 1e-4))
  const ucol = u.add(hu.mul(lean)), vcol = v.add(hv.mul(lean))
  const cuvA = texUV(ucol, vcol)
  let animal: N = vec4(0)
  for (const [sc, idx] of schemes) {
    const c = texture(maps.colour[sc]!, cuvA).level(lod).mul(inside(ucol, vcol))
    animal = schemes.length === 1 ? c : animal.add(c.mul(step(idx - 0.5, iB.x).mul(step(iB.x, idx + 0.5))))
  }
  const ground = mix(V(PAL.cobalt), V(PAL.turquoise), iB.y)
  const vary = b.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fu)))
  const pG = attribute('iO', 'vec3').add(iU.mul(u)).add(vec3(0, v, 0))
  const fine = mx_noise_float(pG.mul(31)).mul(float(1).sub(smoothstep(0.01, 0.04, fw)))
  const pool = lines(yW, C, 0.016, fy).add(lines(bondU, BR / 2, 0.014, fu)).min(1).mul(0.07)
  const glaze = mix(ground, animal.xyz, animal.w).mul(float(1).add(vary.mul(0.09)).add(fine.mul(0.025)).sub(pool))
  const full = mix(glaze, vec3(0.05, 0.048, 0.045), joint)
  // flat: the animal's silhouette in its body colour on the flat ground
  const body = select(iB.x.lessThan(0.5), V(PAL.yellow), select(iB.x.lessThan(1.5), V(PAL.white), select(iB.x.lessThan(2.5), V(PAL.white), V(PAL.yellow))))
  const sil = step(0.5, texture(maps.height, cuv).level(0).y.mul(inside(u, v)))
  const flat = mix(ground, body, sil)
  const grey = vec3(PAL.grey).mul(mx_noise_float(positionWorld.mul(0.07)).mul(0.05).add(1))
  const stateCol = select(U.uState.lessThan(0.5), grey, select(U.uState.lessThan(1.5), flat, full))
  const cc = classColour(U, iB.z, bondU, yW, fw, nW)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  m.roughnessNode = mix(select(U.uState.lessThan(1.5), select(U.uState.lessThan(0.5), float(0.92), float(0.45)), mix(float(0.18), float(0.9), joint)), float(0.85), U.uSwitch)
  m.clearcoatNode = mix(select(U.uState.lessThan(1.5), float(0), float(1).sub(joint)), float(0), U.uSwitch)
  m.clearcoatRoughnessNode = float(0.06)
  m.clearcoatNormalNode = m.normalNode
  // its own shadow: march from the point toward the sun over the height map
  const selfShadow = Fn(() => {
    const sU = dot(U.uSunG, iU).mul(select(iA.z.greaterThan(0), float(1), float(-1)))
    const sV = U.uSunG.y, sN = dot(U.uSunG, nG0)
    const lit = float(1).toVar()
    If(sN.greaterThan(0.01).and(relief.greaterThan(0.5)), () => {
      const hl = max(length(vec2(sU, sV)), 1e-3)
      const dir = vec2(dot(U.uSunG, iU), sV).div(hl)
      const rise = sN.div(hl)
      const h0 = hAt(0, 0, e)
      const stepL = max(float(0.013), e)
      Loop({ start: 1, end: 17 }, ({ i }: { i: N }) => {
        const t = float(i).mul(stepL)
        const uu = u.add(dir.x.mul(t)), vv = v.add(dir.y.mul(t))
        const hh = texture(maps.height, texUV(uu, vv)).level(lod).x.mul(inside(uu, vv))
        lit.assign(min(lit, float(1).sub(smoothstep(0.0, 0.003, hh.sub(h0.add(rise.mul(t)))))))
      })
    })
    return lit
  })()
  m.receivedShadowNode = Fn(([shadow]: [N]) => shadow.mul(selfShadow))
  // the point in the gate's frame from the instance's own origin (iO), not from positionLocal, which the instancing rewrites
  roomLight(m, rooms, attribute('iO', 'vec3').add(iU.mul(u)).add(vec3(0, v, 0)), m.clearcoatNode)
  return m
}

/* ── the paving: limestone on the axis, breccia beside it, brick with asphalt joints to the walls ── */
export interface PaveSpec { limestone: number; limestoneN: number; breccia: number; brecciaN: number; sd: [number, number]; st: [number, number]; turnZ: number; cls?: [number, number, number] }
/** the paving's look at its far mean (pavingMaterial's full state, each strip's joints, slabs and clasts averaged; its dust
    drifts kept), for a ribbon of the map's street seen only from afar: s along the street, t across from its centre */
export function pavingMean(P: Pick<PaveSpec, 'limestone' | 'limestoneN' | 'breccia' | 'brecciaN'>, s: N, t: N): { col: N; rough: N } {
  const half = (P.limestone * P.limestoneN) / 2, outer = half + P.breccia * P.brecciaN
  const at = abs(t)
  const inLime = step(at, half), inBrec = step(half, at).mul(step(at, outer))
  const worn = float(1).sub(smoothstep(1.0, 4.5, at))
  // joints' shares of each strip: 4 mm both ways in 1.05 m slabs and 0.66 m breccia, 6 mm both ways in 0.33 m brick
  const lime = mix(V(PAL.limestone).mul(float(1).add(worn.mul(0.05))), vec3(0.12), 0.008)
  const brec = mix(V(PAL.breccia).mul(0.95).add(V(PAL.brecciaVein).mul(0.05)), vec3(0.08), 0.012)
  const brick = mix(mix(V(PAL.buff), V(PAL.redBrown), 0.35).mul(0.92), V(PAL.asphalt), 0.036)
  const drift = smoothstep(0.35, 0.75, mx_noise_float(vec3(s.mul(0.31), t.mul(0.31), 1.9)).add(0.5)).mul(float(0.35).add(smoothstep(2.5, 9, at).mul(0.65)))
  const col = mix(mix(mix(brick, brec, inBrec), lime, inLime), V(PAL.dust), drift.mul(worn.oneMinus()).mul(0.28))
  return { col, rough: mix(mix(float(0.82), float(0.6), worn), mix(float(0.7), float(0.5), worn), inBrec) }
}
export function pavingMaterial(U: GateUniforms, P: PaveSpec, rooms: Rooms): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
  const p = positionLocal
  // north of the bastions' ends the street's own axis, inside them the gate's
  const street = step(P.turnZ, p.z)
  const s = mix(p.z, p.x.mul(P.sd[0]).add(p.z.mul(P.sd[1])), street)
  const t = mix(p.x, p.x.mul(P.st[0]).add(p.z.mul(P.st[1])), street)
  const nW = vec3(0, 1, 0)
  const fs = footprint(U, normalize(U.uRot.mul(vec3(0, 0, 1))), nW), ft = footprint(U, normalize(U.uRot.mul(vec3(1, 0, 0))), nW)
  const fw = max(fs, ft)
  const half = (P.limestone * P.limestoneN) / 2, outer = half + P.breccia * P.brecciaN
  const at = abs(t)
  const inLime = step(at, half), inBrec = step(half, at).mul(step(at, outer))
  // slab joints: limestone 1.05 m square, breccia 0.66 m, brick paving 0.33 m with asphalt joints
  const jl = lines(t.add(half), P.limestone, 0.004, ft).add(lines(s, P.limestone, 0.004, fs)).min(1)
  const jb = lines(at.sub(half), P.breccia, 0.004, ft).add(lines(s.add(select(t.greaterThan(0), float(0), float(0.33))), P.breccia, 0.004, fs)).min(1)
  const kk = floor(s.div(BR))
  const jr = lines(s, BR, 0.006, fs).add(lines(t.add(kk.sub(floor(kk.div(2)).mul(2)).mul(BR / 2)), BR, 0.006, ft)).min(1)
  const slab = hash2(floor(t.div(P.limestone)), floor(s.div(P.limestone)))
  const fine = mx_noise_float(p.mul(9)).mul(float(1).sub(smoothstep(0.02, 0.08, fw)))
  // polished by feet: lighter and smoother along the middle of the walk, never rutted
  const worn = float(1).sub(smoothstep(1.0, 4.5, at))
  // slab to slab the stone varies by about 8 percent each way and a little in hue (a few slabs warmer, a few greyer)
  const slab2 = hash2(floor(s.div(P.limestone)).add(17), floor(t.div(P.limestone)).add(5))
  const lime = V(PAL.limestone).mul(float(1).add(slab.sub(0.5).mul(0.16)).add(fine.mul(0.04)).add(worn.mul(0.05))).mul(vec3(float(1).add(slab2.sub(0.5).mul(0.05)), 1, float(1).sub(slab2.sub(0.5).mul(0.06))))
  // breccia: angular clasts of a few centimetres, pale and dark reds in a red matrix, thin white veins where the cells meet;
  // the pattern fades to its mean once a pixel's footprint passes a clast
  const near = float(1).sub(smoothstep(0.012, 0.05, fw))
  const cell = mx_worley_noise_vec2(vec2(s, t).mul(16))
  const edge = cell.y.sub(cell.x)
  const clastId = mx_noise_float(vec3(s.mul(11), t.mul(11), 0.7)).mul(0.6).add(0.5).add(cell.x.mul(0.25))
  const clast = mix(mix(V(PAL.brecciaDark), V(PAL.breccia), smoothstep(0.0, 0.5, clastId)), V(PAL.brecciaPale), smoothstep(0.6, 1.0, clastId))
  const matrix = smoothstep(0.12, 0.05, edge)
  // a vein is a whole cell edge picked by a coarse noise; a finer noise breaks it along its length so no straight
  // segment of one width runs from end to end
  const veinRun = smoothstep(0.3, 0.6, mx_noise_float(vec3(s.mul(9), t.mul(9), 5.3)).add(0.5))
  const vein = smoothstep(0.02, 0.0, edge).mul(step(0.78, mx_noise_float(vec3(s.mul(1.7), t.mul(1.7), 3.1)).add(0.5))).mul(veinRun)
  const brecNear = mix(mix(clast, V(PAL.brecciaDark), matrix.mul(0.5)), V(PAL.brecciaVein), vein.mul(0.2))
  const brecMean = V(PAL.breccia).mul(0.95).add(V(PAL.brecciaVein).mul(0.05))
  const brec = mix(brecMean, brecNear, near)
  const brickH = hash2(floor(t.div(BR)), kk)
  const brick = mix(V(PAL.buff), V(PAL.redBrown), brickH.mul(0.7)).mul(0.92)
  const dark = V(PAL.asphalt)
  // dust: drifts in patches toward the walls and the slabs' edges, swept from the middle of the walk (G, life without bodies)
  const drift = smoothstep(0.35, 0.75, mx_noise_float(vec3(s.mul(0.31), t.mul(0.31), 1.9)).add(0.5)).mul(float(0.35).add(smoothstep(2.5, 9, at).mul(0.65)))
  const dust = drift.mul(worn.oneMinus()).mul(0.28)
  const full = mix(mix(mix(mix(brick, dark, jr), mix(brec, vec3(0.08), jb), inBrec), mix(lime, vec3(0.12), jl), inLime), V(PAL.dust), dust)
  const flat = mix(mix(V(PAL.buff).mul(0.8), V(PAL.breccia), inBrec), V(PAL.limestone), inLime)
  const grey = vec3(0.6).mul(mx_noise_float(positionWorld.mul(0.07)).mul(0.05).add(1))
  const stateCol = select(U.uState.lessThan(0.5), grey, select(U.uState.lessThan(1.5), flat, full))
  // the class per strip, the middle first (limestone, breccia, the brick to the walls): R, R, G unless the page names their rows
  const [c0, c1, c2] = P.cls ?? [1, 1, 2]
  const ci = select(at.lessThan(half), float(c0), select(at.lessThan(outer), float(c1), float(c2)))
  const cc = classColour(U, ci, s, t, fw, nW)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  m.roughnessNode = mix(select(U.uState.lessThan(1.5), float(0.85), mix(mix(float(0.82), float(0.6), worn), mix(float(0.7), float(0.5), worn), inBrec)), float(0.9), U.uSwitch)
  roomLight(m, rooms, p)
  return m
}

/** the earth banked against the paving's edge in `col` (the streetside earth at the point), grey in the massing state,
    `cls` in the switch; `p` the gate's frame point the class view's pattern runs on */
export function bankMaterial(U: GateUniforms, col: N, p: N, cls: number): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  const fw = U.uPix.mul(positionWorld.distance(cameraPosition))
  const cc = classColour(U, float(cls), p.z, p.x, fw)
  m.colorNode = mix(select(U.uState.lessThan(0.5), vec3(0.6), col), cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  return m
}

/* ── life without bodies: palms and birds in their vertex colours, grey in the massing state, class G in the switch unless the page names their row ── */
export function lifeMaterial(U: GateUniforms, cls = 2): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0, side: DoubleSide })
  const fw = U.uPix.mul(positionWorld.distance(cameraPosition))
  const stateCol = select(U.uState.lessThan(0.5), vec3(0.6), attribute('color', 'vec3'))
  const cc = classColour(U, float(cls), positionWorld.x, positionWorld.y, fw)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  return m
}

export function classColoursFrom(plan: { classes: Record<string, { colour: string }> }): { M: string; R: string; G: string } {
  return { M: plan.classes['M']!.colour, R: plan.classes['R']!.colour, G: plan.classes['G']!.colour }
}

/* ── the processional way's centre line south of the gate's paving (pure; gate.ts builds its paving on it) ── */
export type LinePoint = [number, number, number]
/** a centripetal Catmull-Rom through `ctl` (x, z, level; the first and last points only steer the ends), sampled every
    `step` metres of its length: an even spacing so no mitred leg is short, and no loop where the points' gaps differ
    (a uniform spline over a 10 m gap between 60 m and 31 m ones bunched its samples into a kink). The level runs
    straight between the points by length, as the map's ribbon does */
export function streetLine(ctl: LinePoint[], step = 2): LinePoint[] {
  const fine: Array<{ x: number; z: number; s: number; seg: number; f: number }> = []
  let s = 0
  for (let i = 1; i + 2 < ctl.length; i++) {
    const P = [ctl[i - 1]!, ctl[i]!, ctl[i + 1]!, ctl[i + 2]!]
    const tk = [0]
    for (let k = 1; k < 4; k++) tk.push(tk[k - 1]! + Math.sqrt(Math.max(1e-6, Math.hypot(P[k]![0] - P[k - 1]![0], P[k]![1] - P[k - 1]![1]))))
    const at = (t: number, c: 0 | 1): number => {
      // Barry and Goldman's pyramid for a non-uniform knot sequence
      const [t0, t1, t2, t3] = tk as [number, number, number, number]
      const p = P.map((q) => q[c])
      const a1 = ((t1 - t) * p[0]! + (t - t0) * p[1]!) / (t1 - t0), a2 = ((t2 - t) * p[1]! + (t - t1) * p[2]!) / (t2 - t1), a3 = ((t3 - t) * p[2]! + (t - t2) * p[3]!) / (t3 - t2)
      const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0), b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
      return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)
    }
    const n = 200
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const t = tk[1]! + ((tk[2]! - tk[1]!) * j) / n
      const x = at(t, 0), z = at(t, 1)
      if (fine.length) s += Math.hypot(x - fine[fine.length - 1]!.x, z - fine[fine.length - 1]!.z)
      fine.push({ x, z, s, seg: i, f: j / n })
    }
  }
  // the level by length inside each span between two points
  const spanLen = new Map<number, [number, number]>()
  for (const q of fine) { const r = spanLen.get(q.seg); spanLen.set(q.seg, r ? [Math.min(r[0], q.s), Math.max(r[1], q.s)] : [q.s, q.s]) }
  const level = (q: { s: number; seg: number }): number => {
    const [a, b] = spanLen.get(q.seg)!, f = b > a ? (q.s - a) / (b - a) : 0
    return ctl[q.seg]![2] + (ctl[q.seg + 1]![2] - ctl[q.seg]![2]) * f
  }
  const total = fine[fine.length - 1]!.s, out: LinePoint[] = []
  const count = Math.max(1, Math.round(total / step))
  let k = 0
  for (let m = 0; m <= count; m++) {
    const want = (total * m) / count
    while (k + 1 < fine.length - 1 && fine[k + 1]!.s < want) k++
    const a = fine[k]!, b = fine[k + 1]!, f = b.s > a.s ? (want - a.s) / (b.s - a.s) : 0
    out.push([a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, level(a) + (level(b) - level(a)) * f])
  }
  return out
}
/** the points a straight run may stand for: Douglas and Peucker over x and z, keeping every point a chord between kept
    neighbours misses by more than `eps` metres (the ends always kept) */
export function straightest(pts: LinePoint[], eps: number): LinePoint[] {
  if (pts.length < 3) return pts.slice()
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const run = (a: number, b: number): void => {
    let far = -1, dMax = eps
    const [ax, az] = pts[a]!, [bx, bz] = pts[b]!, ux = bx - ax, uz = bz - az, l = Math.hypot(ux, uz) || 1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i]![0] - ax) * uz - (pts[i]![1] - az) * ux) / l
      if (d > dMax) { dMax = d; far = i }
    }
    if (far < 0) return
    keep[far] = true
    run(a, far); run(far, b)
  }
  run(0, pts.length - 1)
  return pts.filter((_, i) => keep[i])
}
/** the street's line through `pts` (its first point only steers the start): straight runs where the points allow
    (straightest), each point the spline then misses by more than `eps` put back, the worst first, until it passes
    within `eps` of every point it stands for */
export function processionLine(pts: LinePoint[], eps: number, step = 2): LinePoint[] {
  const lead = pts[0]!, real = pts.slice(1)
  const kept = new Set(straightest(real, eps).map((p) => real.indexOf(p)))
  const off = (line: LinePoint[], p: LinePoint): number => {
    let d = Infinity
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i]!, [bx, bz] = line[i + 1]!, ux = bx - ax, uz = bz - az, l2 = ux * ux + uz * uz || 1
      const f = Math.max(0, Math.min(1, ((p[0] - ax) * ux + (p[1] - az) * uz) / l2))
      d = Math.min(d, Math.hypot(ax + ux * f - p[0], az + uz * f - p[1]))
    }
    return d
  }
  for (;;) {
    const ctl = [lead, ...real.filter((_, i) => kept.has(i))]
    const a = ctl[ctl.length - 1]!, b = ctl[ctl.length - 2]!
    ctl.push(a.map((v, i) => 2 * v - b[i]!) as LinePoint)
    const line = streetLine(ctl, step)
    let worst = -1, dw = eps
    real.forEach((p, i) => { if (!kept.has(i)) { const d = off(line, p); if (d > dw) { dw = d; worst = i } } })
    if (worst < 0) return line
    kept.add(worst)
  }
}

/* ── the open ground beside the processional way south of the gate (the map's ground, painted for this page) ── */
/** beaten earth in the city's silt, a little paler where dust lies against the paving's edge, trodden in streaks along
    the street, with pebbles and sherds a stride apart (G: life without bodies); `p` is the gate's frame, `half` the
    paving's half width, `xs` the street's centre at the point (gate frame x). Every detail fades to its mean once a
    pixel's footprint passes it, so nothing shimmers at the street's far end */
export function streetsideEarth(U: Pick<GateUniforms, 'uPix'>, p: N, half: number, xs: N): N {
  const t = abs(p.x.sub(xs))
  // the footprint along the view's own heading on the level ground, its longest side
  const v = cameraPosition.sub(positionWorld)
  const fw = footprint(U, normalize(vec3(v.x, 0, v.z.add(1e-4))), vec3(0, 1, 0))
  // the city's silt (open/earth.ts TONES.silt as the map's city ground takes it) at the paint's own paler brightness
  const silt = vec3(0.346, 0.26, 0.154)
  const broad = mx_noise_float(vec3(p.x.mul(0.045), 4.1, p.z.mul(0.045))).mul(0.16)
  // each pattern fades between a quarter and a half of its own period (the 4.8 m patches, the 1.8 m streaks), no sooner
  const patch = mx_noise_float(vec3(p.x.mul(0.21), 2.7, p.z.mul(0.21))).mul(0.1).mul(float(1).sub(smoothstep(1.2, 2.4, fw)))
  // trodden: streaks along the street, darker and a little smoother, most where people step off the paving
  const tread = smoothstep(0.1, 0.45, mx_noise_float(vec3(p.x.mul(0.55), 6.3, p.z.mul(0.05))).add(0.5).mul(0.9))
  const trodden = tread.mul(float(1).sub(smoothstep(half + 2, half + 14, t))).mul(0.12).mul(float(1).sub(smoothstep(0.45, 0.9, fw)))
  // dust drifted against the paving's edge, paler
  const drift = float(1).sub(smoothstep(half + 0.2, half + 2.6, t)).mul(smoothstep(-0.1, 0.35, mx_noise_float(vec3(p.x.mul(0.8), 1.3, p.z.mul(0.8)))))
  // pebbles and sherds: a few cells in a stride's grid hold a stone (pale) or a potsherd (red), each a few centimetres
  const cell = mx_worley_noise_vec2(vec2(p.x, p.z).mul(4.5))
  const pick = hash2(floor(p.x.mul(4.5).add(cell.x.mul(0.01))), floor(p.z.mul(4.5)))
  const stone = smoothstep(0.16, 0.06, cell.x).mul(step(0.82, pick)).mul(float(1).sub(smoothstep(0.012, 0.035, fw)))
  const sherd = step(0.93, pick)
  const grain = mx_noise_float(vec3(p.x.mul(23), 0.5, p.z.mul(23))).mul(0.06).mul(float(1).sub(smoothstep(0.01, 0.03, fw)))
  let c: N = silt.mul(float(1).add(broad).add(patch).add(grain).sub(trodden))
  c = mix(c, vec3(0.42, 0.36, 0.27), drift.mul(0.55))
  c = mix(c, mix(vec3(0.46, 0.43, 0.38), vec3(0.4, 0.19, 0.11), sherd), stone)
  return c
}
