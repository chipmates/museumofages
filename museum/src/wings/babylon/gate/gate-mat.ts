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

export { PAL }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { Fn, If, Loop, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dot, float, floor, fract, length, max, min, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionLocal, positionWorld, select, sin, smoothstep, sqrt, step, texture, uniform, uv, vec2, vec3, vec4, atan, log2 } = T

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
  uM: N
  uR: N
  uG: N
  /** the switch's own light, a share of each class colour emitted, so a class keeps its hue in shade and on the low-lit floor */
  uSelf: N
}

export function makeUniforms(classes: { M: string; R: string; G: string }): GateUniforms {
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
    uSelf: uniform(0),
  }
}

/* ── filtered patterns ── */
/** the integral of a train of lines of half width h at multiples of P */
const lineInt = (x: N, P: number, h: number): N => {
  const m = x.sub(floor(x.div(P)).mul(P))
  return floor(x.div(P)).mul(2 * h).add(min(m, h)).add(max(m.sub(P - h), 0))
}
/** coverage of those lines, box-filtered over a footprint w */
export const lines = (x: N, P: number, h: number, w: N): N => {
  const ww = max(w, 1e-4)
  return clamp(lineInt(x.add(ww.mul(0.5)), P, h).sub(lineInt(x.sub(ww.mul(0.5)), P, h)).div(ww), 0, 1)
}
/** a band [a, b) of x with soft edges as wide as the footprint */
const band = (x: N, a: N | number, b: N | number, w: N): N => smoothstep(float(a).sub(w.mul(0.5)), float(a).add(w.mul(0.5)), x).mul(float(1).sub(smoothstep(float(b).sub(w.mul(0.5)), float(b).add(w.mul(0.5)), x)))
const hash2 = (a: N, b: N): N => fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453))

/** the footprint of one device pixel along a direction t in a surface of normal n, seen along v */
const footprint = (U: GateUniforms, t: N, n: N): N => {
  const v = normalize(cameraPosition.sub(positionWorld))
  const d = positionWorld.distance(cameraPosition)
  const nv = max(dot(n, v).mul(dot(n, v)), 0.01)
  return U.uPix.mul(d).mul(sqrt(float(1).add(dot(t, v).mul(dot(t, v)).div(nv))))
}

/* ── the classes ── */
/** the class of a point: the plan's under its band, R up to the last relief row on a face that carries rows, the height's above */
export const classIndex = (cls: N, y: N): N => select(y.lessThan(cls.z), cls.x, select(y.lessThan(cls.w), float(1), cls.y))
/** the class colour: M a little darker and solid, R as it is, G lighter and hatched (value and texture as well as hue) */
export const classColour = (U: GateUniforms, idx: N, hu: N, hy: N, fw: N): N => {
  const base = mix(mix(U.uM.mul(0.82), U.uR, step(0.5, idx)), U.uG.mul(1.08), step(1.5, idx))
  // hatching on G: diagonal lines 0.6 m apart, faded where the footprint passes their width
  const hatch = lines(hu.add(hy), 0.6, 0.09, fw.mul(1.4)).mul(float(1).sub(smoothstep(0.08, 0.2, fw)))
  return base.mul(float(1).sub(hatch.mul(0.28).mul(step(1.5, idx))))
}

/* ── the bond ── */
interface Bond { bed: N; head: N; brick: N; kk: N }
/** joints of a running bond of half bricks: courses of 8.6 cm, whole-ended courses where k minus the shift is odd */
const bond = (u: N, y: N, shift: N, fu: N, fy: N, half: number): Bond => {
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
export interface Rooms { boxes: Array<{ x0: number; x1: number; z0: number; z1: number; y1: number; open: number }> }
const openness = (rooms: Rooms, p: N): N => {
  let o: N = float(1)
  for (const r of rooms.boxes) {
    // soft along the passage (1.2 m), so a room's edge never draws a line across the floor
    const inX = step(r.x0, p.x).mul(step(p.x, r.x1)), inY = step(p.y, r.y1)
    const inZ = smoothstep(r.z0 - 0.6, r.z0 + 0.6, p.z).mul(float(1).sub(smoothstep(r.z1 - 0.6, r.z1 + 0.6, p.z)))
    o = min(o, mix(float(1), float(r.open), inX.mul(inZ).mul(inY)))
  }
  return o
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
  const tU = normalize(select(abs(nW.y).greaterThan(0.7), vec3(1, 0, 0), vec3(nW.z.negate(), 0, nW.x)))
  const fu = footprint(U, tU, nW), fy = footprint(U, up, nW)
  // one weight per kind: 0 gate glaze, 1 lion wall, 2 plain brick, 3 mud brick, 5 cedar, 6 copper, 7 bronze
  const isK = (k: number): N => step(k - 0.5, kind).mul(step(kind, k + 0.5))
  const k0 = isK(0), k1 = isK(1), k2 = isK(2).add(isK(4)), k3 = isK(3), k5 = isK(5), k6 = isK(6), k7 = isK(7)
  const b = bond(gU, p.y, gInfo.x, fu, fy, 0.0045)
  const joint = b.bed.add(b.head).min(1)
  const vary = b.brick.sub(0.5).mul(float(1).sub(smoothstep(0.08, 0.3, fu)))
  const fine = mx_noise_float(p.mul(31)).mul(float(1).sub(smoothstep(0.01, 0.04, max(fu, fy))))
  const jointCol = vec3(0.05, 0.048, 0.045)
  // 0: the gate's glazed brick, the glaze pooling a little darker at the brick's edges
  const pool = lines(p.y, C, 0.016, fy).add(lines(gU, BR / 2, 0.014, fu)).min(1).mul(0.07)
  const glaze0 = gateGlaze(gU, p.y, b.kk, gEdge, gInfo.y, fu, fy).mul(float(1).add(vary.mul(0.09)).add(fine.mul(0.025)).sub(pool))
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
  const cc = classColour(U, classIndex(gCls, p.y), gU, p.y, max(fu, fy))
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  const roughState = select(U.uState.lessThan(0.5), float(0.92), select(U.uState.lessThan(1.5), mix(float(0.88), float(0.45), k0.add(k1.mul(frieze))), roughFull))
  m.roughnessNode = mix(roughState, float(0.85), U.uSwitch)
  m.metalnessNode = mix(select(U.uState.lessThan(1.5), float(0), metalFull), float(0), U.uSwitch)
  // the glaze is glass fired on the brick: a clear coat over it in the full state
  m.clearcoatNode = mix(select(U.uState.lessThan(1.5), float(0), glazed), float(0), U.uSwitch)
  m.clearcoatRoughnessNode = float(0.06)
  m.aoNode = openness(rooms, p)
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
 * iA (bond u at the panel's u = 0, the feet course's base y, walking direction, course shift), iB (scheme index, ground: 0 cobalt 1 turquoise).
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
  let animal: N = vec4(0)
  for (const [sc, idx] of schemes) {
    const c = texture(maps.colour[sc]!, cuv).level(lod).mul(inside(u, v))
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
  const cc = classColour(U, float(1), bondU, yW, fw)
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
  m.aoNode = openness(rooms, attribute('iO', 'vec3').add(iU.mul(u)).add(vec3(0, v, 0)))
  return m
}

/* ── the paving: limestone on the axis, breccia beside it, brick with asphalt joints to the walls ── */
export interface PaveSpec { limestone: number; limestoneN: number; breccia: number; brecciaN: number; sd: [number, number]; st: [number, number]; turnZ: number }
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
  const vein = smoothstep(0.02, 0.0, edge).mul(step(0.78, mx_noise_float(vec3(s.mul(1.7), t.mul(1.7), 3.1)).add(0.5)))
  const brecNear = mix(mix(clast, V(PAL.brecciaDark), matrix.mul(0.5)), V(PAL.brecciaVein), vein.mul(0.45))
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
  // the class: limestone and breccia R (found), the brick paving to the walls G
  const ci = select(at.lessThan(outer), float(1), float(2))
  const cc = classColour(U, ci, s, t, fw)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  m.roughnessNode = mix(select(U.uState.lessThan(1.5), float(0.85), mix(mix(float(0.82), float(0.6), worn), mix(float(0.7), float(0.5), worn), inBrec)), float(0.9), U.uSwitch)
  m.aoNode = openness(rooms, p)
  return m
}

/* ── life without bodies: palms and birds in their vertex colours, grey in the massing state, class G in the switch ── */
export function lifeMaterial(U: GateUniforms): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0, side: DoubleSide })
  const fw = U.uPix.mul(positionWorld.distance(cameraPosition))
  const stateCol = select(U.uState.lessThan(0.5), vec3(0.6), attribute('color', 'vec3'))
  const cc = classColour(U, float(2), positionWorld.x, positionWorld.y, fw)
  m.colorNode = mix(stateCol, cc, U.uSwitch)
  m.emissiveNode = cc.mul(U.uSwitch.mul(U.uSelf))
  return m
}

export function classColoursFrom(plan: { classes: Record<string, { colour: string }> }): { M: string; R: string; G: string } {
  return { M: plan.classes['M']!.colour, R: plan.classes['R']!.colour, G: plan.classes['G']!.colour }
}
