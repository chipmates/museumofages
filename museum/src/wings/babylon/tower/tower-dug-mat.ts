/* THE EXCAVATED STATE'S MATERIALS (TSL): the ruin's ground (the court where it meets the map ground, the robbers' banks
   damp toward the water, a pale salt line above it, the mud on the floor, the core's unbaked mud brick in eroded
   courses), the stairs' dug foundation walls in baked brick, and the water standing in the cut, giving back the sky.
   Every look here is ours, after a photograph of the ruin today (never a texture). The class view paints the ruin in
   its one class and keeps the court's own grey. */

import { DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { BR, PAL, footprint, lines } from '../gate/gate-mat'
import { classColour, uView, type ClassTones, type Sky } from '../map/mass'
import type { TowerFrame } from './tower-dug'
import { uTowerPix } from './tower-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, cameraPosition, clamp, dot, float, max, mix, mx_noise_float, normalize, positionWorld, pow, reflect, smoothstep, step, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)
const U = { uPix: uTowerPix }

/** the map ground's own colour before any stop paints it (mass.ts), so the patch's court meets it seamlessly */
function mapGroundBase(): N {
  const g0 = vec3(0.5, 0.48, 0.44)
  return g0.mul(mx_noise_float(positionWorld.mul(0.02)).mul(0.06).add(1)).mul(smoothstep(-4, 1, positionWorld.y).mul(0.4).add(0.6))
}

/** the ruin's distance in the tower's frame: the square softened at its corners, as the geometry draws it */
function ruinDist(f: TowerFrame): N {
  const dx = positionWorld.x.sub(f.x), dz = positionWorld.z.sub(f.z)
  const u = dx.mul(f.c).sub(dz.mul(f.s)), v = dx.mul(f.s).add(dz.mul(f.c))
  return pow(pow(abs(u), 8).add(pow(abs(v), 8)), 1 / 8)
}

export function ruinMaterial(f: TowerFrame, tp: J, tones: ClassTones, court: (base: N) => N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  const P = positionWorld
  const n = normalize(attribute('normal', 'vec3'))
  const kind = attribute('kind', 'float')
  const D = tp.dug
  const W: number = D.water.level
  const d = ruinDist(f)
  const inRuin = float(1).sub(smoothstep(D.trench.bankTop - 0.5, D.trench.bankTop + 1.5, d))
  const fw = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0))
  const steep = float(1).sub(smoothstep(0.55, 0.85, n.y))
  const base = mapGroundBase()
  const courtCol = court(base)
  /* the robbers' banks: earth, darker and damp toward the water, a pale salt line where it dries, broken brick here and there */
  const bankN = mx_noise_float(vec3(P.x.mul(0.3), P.y.mul(0.5), P.z.mul(0.3))).mul(0.08).add(mx_noise_float(P.mul(1.7)).mul(0.04).mul(smoothstep(0.4, 0.05, fw)))
  let bank: N = V(tp.colours.earth).mul(0.82).mul(float(1).add(bankN))
  const wet = float(1).sub(smoothstep(W + 0.1, W + 0.9, P.y))
  const salt = smoothstep(W + 0.7, W + 0.9, P.y).mul(float(1).sub(smoothstep(W + 1.0, W + 1.5, P.y))).mul(smoothstep(-0.2, 0.3, mx_noise_float(vec3(P.x.mul(0.2), 1.3, P.z.mul(0.2)))))
  bank = mix(bank, bank.mul(vec3(0.55, 0.52, 0.5)), wet)
  bank = mix(bank, vec3(0.62, 0.6, 0.55), salt.mul(0.5))
  const shards = smoothstep(0.62, 0.7, mx_noise_float(P.mul(0.9).add(vec3(3.3, 0, 1.1)))).mul(smoothstep(0.5, 0.1, fw))
  bank = mix(bank, mix(V(tp.colours.brick), V(PAL.redBrown as RGB), 0.3), shards.mul(0.6))
  /* the core: unbaked mud brick, its eroded sides showing the courses, its top a crust of weathered earth */
  const mudN = mx_noise_float(vec3(P.x.mul(0.15), P.y.mul(0.3), P.z.mul(0.15))).mul(0.07)
  // rain has washed the courses out in patches and cut runnels down the sides
  const washed = smoothstep(-0.1, 0.35, mx_noise_float(vec3(P.x.mul(0.18), P.y.mul(0.6), P.z.mul(0.18))))
  const courses = lines(P.y, 0.12, 0.012, fw.mul(0.6)).mul(smoothstep(0.08, 0.02, fw)).mul(steep).mul(washed)
  const runnels = smoothstep(0.25, 0.6, mx_noise_float(vec3(P.x.mul(0.9), P.y.mul(0.07), P.z.mul(0.9)))).mul(steep)
  let core: N = V(tp.colours.mud).mul(float(1).add(mudN)).mul(float(1).sub(courses.mul(0.22))).mul(float(1).sub(runnels.mul(0.18)))
  // the top: a dry crust, paler where it has cracked and lifted, darker in the hollows that hold the rain
  const crust = mx_noise_float(vec3(P.x.mul(0.05), 4.2, P.z.mul(0.05))).mul(0.1).add(mx_noise_float(vec3(P.x.mul(0.3), 1.7, P.z.mul(0.3))).mul(0.06))
  core = mix(core, core.mul(vec3(1.06, 1.03, 0.98)).mul(float(1).add(crust)), float(1).sub(steep))
  core = mix(core, core.mul(vec3(0.55, 0.52, 0.5)), wet)
  // which ground a point is: the core above its foot, the floor's mud under the water, the banks between
  const isCore = float(1).sub(smoothstep(D.core.half + 1.5, D.core.half + 3.5, d)).mul(smoothstep(W - 0.5, W + 0.5, P.y))
  const mud = V([0.13, 0.11, 0.085])
  let ruin: N = mix(bank, core, isCore)
  ruin = mix(mud, ruin, smoothstep(W - 0.6, W - 0.1, P.y))
  const groundCol = mix(courtCol, ruin, inRuin)
  /* the dug foundation walls' tops: baked brick laid flat in bitumen, worn and dusty */
  const fdx = P.x.sub(f.x), fdz = P.z.sub(f.z)
  const fu = fdx.mul(f.c).sub(fdz.mul(f.s)), fv = fdx.mul(f.s).add(fdz.mul(f.c))
  const flatB = clamp(lines(fu, BR, 0.008, fw).add(lines(fv, BR, 0.008, fw)), 0, 1)
  const brickCol = mix(mix(V(tp.colours.brick), V(PAL.dust as RGB), 0.35).mul(float(0.95).add(mx_noise_float(P.mul(0.7)).mul(0.08))), V(PAL.asphalt as RGB).mul(2.2), flatB.mul(0.6))
  const isBrick = step(abs(kind.sub(10)), 0.5)
  const stateCol = mix(groundCol, brickCol, isBrick)
  // the class view: the ruin and the dug stairs in their class, the court the map ground's own grey
  const cls = classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float'))
  m.colorNode = mix(stateCol, mix(base, cls, max(inRuin, isBrick)), uView)
  m.roughnessNode = mix(mix(float(0.97), float(0.7), wet.mul(inRuin)), float(0.95), uView)
  return m
}

const POND = vec3(0.03, 0.04, 0.028)

/** the water standing in the cut: still, murky and green, its body ours; until the page's sky arrives only its body */
export function pondMaterial(tones: ClassTones): Material {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide })
  const cls = classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float'))
  m.colorNode = mix(POND, cls, uView)
  m.fog = true
  m.userData['cls'] = cls
  return m
}


/** the pond gives back the page's sky as the map's canals do (mass.ts), a slower ripple for still water; never in the class view */
export function pondSky(m: Material, sky: Sky, sunDir: N): void {
  const P = positionWorld
  const v = normalize(P.sub(cameraPosition))
  const n = normalize(vec3(mx_noise_float(vec3(P.x.mul(0.12), 2.1, P.z.mul(0.12))).mul(0.025), 1, mx_noise_float(vec3(P.x.mul(0.12), 7.7, P.z.mul(0.12))).mul(0.025)))
  const r = reflect(v, n)
  const fres = float(0.03).add(float(0.97).mul(pow(float(1).sub(abs(v.y)), 4)))
  const glint = pow(max(dot(r, sunDir), 0), 90).mul(3.5)
  const sheen = pow(max(dot(r, sunDir), 0), 10).mul(0.35)
  const look = mix(POND, sky.colour(r).mul(vec3(0.62, 0.8, 0.95)), fres.mul(0.72)).add(vec3(1, 0.8, 0.58).mul(glint.add(sheen)))
  ;(m as MeshBasicNodeMaterial).colorNode = mix(look, m.userData['cls'] as N, uView)
  m.needsUpdate = true
}
