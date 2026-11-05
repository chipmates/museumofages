/* BRUEGEL'S TOWER'S MATERIAL (TSL): the painting's cream stone facing and red brick, its bays round each ring (a pier,
   a pair of arched doors below and two-light windows above, round on the lower storeys, pointed higher up), the string
   course between, the frieze under each terrace's edge, and its pale rock. Forms and colours read off the painting by
   eye, never its pixels. Outside the evidence classes: the class view leaves it as it is. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { lines } from '../gate/gate-mat'
import { uTowerPix } from '../tower/tower-mat'
import type { BruegelFrame } from './bruegel-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, atan, attribute, cameraPosition, float, floor, fract, length, max, min, mix, mx_noise_float, normalize, positionWorld, select, sin, smoothstep, sqrt, step, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)
const TAU = Math.PI * 2

/** an opening's signed distance (negative inside): its half width a, its sill and its springing, round or pointed */
function arch(x: N, t: N, a: N, sill: N, spring: N, pointed: N): N {
  const below = max(x.sub(a), sill.sub(t))
  const round = length(vec2(x, t.sub(spring))).sub(a)
  const point = length(vec2(x.add(a.mul(0.5)), t.sub(spring))).sub(a.mul(1.5))
  return select(t.lessThan(spring), below, mix(round, point, pointed))
}

export function bruegelMaterial(f: BruegelFrame, bp: J): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 })
  const P = positionWorld
  const k = attribute('bk', 'float')
  const R = attribute('bring', 'vec4')
  const n = normalize(attribute('normal', 'vec3'))
  const is = (v: number): N => float(1).sub(step(0.5, abs(k.sub(v))))
  const brickish = is(1).add(is(4)).add(is(6))
  const rock = is(2)
  // round the axis: the angle from the stairs' side, growing to the right, and the height over the foot
  const dx = P.x.sub(f.x), dz = P.z.sub(f.z)
  const u = dx.mul(f.c).sub(dz.mul(f.s)), v = dx.mul(f.s).add(dz.mul(f.c))
  const phi = atan(v.negate(), u)
  const rho = sqrt(u.mul(u).add(v.mul(v)))
  const h = P.y.sub(f.base)
  // one device pixel on the surface, near enough for these edges (the tower's own pixel uniform)
  const fw = uTowerPix.mul(P.distance(cameraPosition)).mul(1.2)
  /* ── the bays: arc metres across one bay, metres up the storey ── */
  const bays = max(R.z, 1)
  const bayW = rho.mul(TAU).div(bays)
  const s = fract(phi.div(TAU).mul(bays).add(0.5))
  const x = s.sub(0.5).mul(bayW)
  const t = h.sub(R.x), H = max(R.y.sub(R.x), 0.1)
  const pointed = step(1.5, R.w)
  const arcaded = step(0.5, R.z).mul(float(1).sub(rock))
  // the pier at the bay's edge, a little proud: lit on its face, a shadow line where it meets the wall
  const pierW = bayW.mul(0.1)
  const edge = bayW.mul(0.5).sub(abs(x))
  const pier = float(1).sub(smoothstep(pierW.sub(fw), pierW.add(fw), edge))
  const pierLine = float(1).sub(smoothstep(float(0), fw.mul(1.5).add(0.06), abs(edge.sub(pierW))))
  // two openings per bay, mirrored about its middle
  const xo = abs(abs(x).sub(bayW.mul(0.22)))
  // the doors below
  const da = bayW.mul(0.085)
  const dSpring = H.mul(0.44).sub(da)
  const door = arch(xo, t, da, H.mul(0.04), dSpring, pointed)
  // the windows above, two lights split by a mullion
  const wa = bayW.mul(0.065)
  const wSpring = H.mul(0.78).sub(wa)
  const win = max(arch(xo, t, wa, H.mul(0.57), wSpring, pointed), bayW.mul(0.012).sub(xo))
  const d = min(door, win)
  const open = float(1).sub(smoothstep(fw.negate(), fw, d)).mul(arcaded).mul(float(1).sub(pier))
  // the reveal round each opening, in its own shade
  const reveal = float(1).sub(smoothstep(float(0), fw.add(0.22), d)).mul(float(1).sub(open)).mul(arcaded).mul(float(1).sub(pier))
  // the string course between doors and windows, its shadow under it
  const course = smoothstep(H.mul(0.5).sub(fw), H.mul(0.5).add(fw), t).mul(float(1).sub(smoothstep(H.mul(0.53).sub(fw), H.mul(0.53).add(fw), t))).mul(arcaded)
  const courseShadow = smoothstep(H.mul(0.47).sub(fw), H.mul(0.47).add(fw), t).mul(float(1).sub(smoothstep(H.mul(0.5).sub(fw), H.mul(0.5).add(fw), t))).mul(arcaded)
  /* ── the stone and the brick ── */
  const C = bp.colours
  const big = mx_noise_float(P.mul(0.035)).mul(0.07)
  const blockId = floor(h.div(0.62)).add(floor(phi.mul(rho).div(1.25)).mul(7.31))
  const blockTone = fract(sin(blockId.mul(12.9898)).mul(43758.5453)).sub(0.5).mul(0.06)
  const joints = lines(h, 0.62, 0.012, fw).mul(smoothstep(0.08, 0.02, fw)).mul(0.5)
  // each bay its own batch of stone, and rain streaks down from the ledges and sills
  const bayId = floor(phi.div(TAU).mul(bays).add(0.5)).add(floor(R.x).mul(3.7))
  const bayTone = fract(sin(bayId.mul(78.233)).mul(43758.5453)).sub(0.5).mul(0.08)
  const streaks = smoothstep(0.15, 0.6, mx_noise_float(vec3(phi.mul(rho).mul(0.6), h.mul(0.05), 2.3))).mul(0.1)
  let stone: N = V(C.stone as RGB).mul(float(1).add(big.mul(1.5)).add(blockTone).add(bayTone).sub(streaks)).mul(float(1).sub(joints.mul(0.12)))
  stone = mix(stone, stone.mul(vec3(1.03, 0.98, 0.9)), smoothstep(0.2, 0.7, mx_noise_float(P.mul(0.02).add(vec3(9, 2, 4)))))
  const courses = lines(h, 0.09, 0.008, fw).mul(smoothstep(0.05, 0.015, fw))
  let brick: N = V(C.brick as RGB).mul(float(1).add(big.mul(1.4)).add(mx_noise_float(P.mul(0.4)).mul(0.06))).mul(float(1).sub(courses.mul(0.2)))
  // stains: rain under the ledges, dust on the terraces
  const under = smoothstep(H.mul(0.86), H.mul(0.95), t).mul(arcaded).mul(0.18)
  stone = stone.mul(float(1).sub(under))
  brick = brick.mul(float(1).sub(under.mul(0.7)))
  const tops = is(3).add(is(4))
  const dust = mx_noise_float(P.mul(0.15)).mul(0.05).add(0.92)
  let col: N = mix(stone, brick, brickish)
  col = mix(col, col.mul(dust).mul(vec3(1.0, 0.97, 0.92)), tops)
  // the pier lighter, its shadow line darker; the course a light band with its shade under it
  col = col.mul(float(1).add(pier.mul(arcaded).mul(0.06)).sub(pierLine.mul(arcaded).mul(0.22)))
  col = col.mul(float(1).add(course.mul(0.08)).sub(courseShadow.mul(0.16)))
  // the frieze of small arches under each terrace's edge, on the cornice's band
  const plain = is(5).add(is(6))
  const frieze = smoothstep(0.05, 0.015, fw).mul(float(1).sub(smoothstep(float(0.05), float(0.16), abs(fract(phi.mul(rho).div(0.9)).sub(0.5))))).mul(step(n.y.abs(), 0.5)).mul(plain).mul(0.35)
  col = col.mul(float(1).sub(frieze))
  // openings: a dark inside and a darker reveal round it
  const dark = V(C.dark as RGB)
  col = mix(col, col.mul(0.6), reveal.mul(0.5))
  col = mix(col, dark, open)
  /* ── the rock: pale grey-ochre, broken in facets, darker in its clefts ── */
  const rn = mx_noise_float(P.mul(0.12)).mul(0.12).add(mx_noise_float(P.mul(0.9)).mul(0.05))
  let rk: N = V(C.rock as RGB).mul(float(1).add(rn))
  rk = mix(rk, rk.mul(vec3(0.86, 0.88, 0.78)), smoothstep(0.1, 0.5, mx_noise_float(P.mul(0.07).add(vec3(5, 1, 3)))).mul(0.3))
  rk = mix(rk.mul(0.72), rk, smoothstep(-0.3, 0.6, n.y))
  col = mix(col, rk, rock)
  m.colorNode = col
  m.roughnessNode = mix(mix(float(0.88), float(0.92), brickish), float(0.95), open)
  return m
}
