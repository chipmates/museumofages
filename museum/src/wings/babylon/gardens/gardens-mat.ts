/* STOP 5'S MATERIALS (TSL), from the arrival's earth kit (its tones and its brick bond) and the gate's filtered lines.
     the bodies   by their `look`: the palace's bare yellow-brown baked brick and its plastered earth roofs, room by room;
                  the terraces' brick faces and trodden tops; the garden's tops in watered soil under low green (dry
                  earth when the garden is off); the courts' pale stone slabs; the vaulted building's earth roofs; stairs
     the plants   their vertex colours broken into leaf clumps, and the light the stack does not carry: a crown seen
                  against the sun glows at its sunward edge where the leaves let the light through
   Every line is box-filtered over one device pixel's footprint; the class view paints the record's classes over all. */

import { DoubleSide, MeshStandardNodeMaterial, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { lines, PAL } from '../gate/gate-mat'
import { classColour, uView, type ClassTones } from '../map/mass'
import { brickBond, TONES } from '../open/earth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, cameraPosition, dot, float, floor, fract, max, mix, mx_noise_float, mx_worley_noise_float, normalWorld, normalize, positionWorld, pow, sin, smoothstep, step, uniform, vec3 } = T

type RGB = [number, number, number]
const V3 = (c: readonly number[]): N => vec3(c[0]!, c[1]!, c[2]!)
const hash = (x: N): N => fract(sin(x.mul(12.9898)).mul(43758.5453))

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uGardensPix = uniform(0.0003)
export function setGardensPixel(vfovDeg: number, heightPx: number): void {
  uGardensPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}
/** the page's sun, read before each draw (gardens.ts): toward the sun, and its colour times its intensity */
export const uGardensSun = { dir: uniform(new Vector3(0, 1, 0)), irr: uniform(new Vector3(0, 0, 0)) }
/** 1 the garden planted, 0 its terraces bare */
export const uGarden = uniform(1)

/** the pixel's footprint on a surface of normal n, metres */
const footprint = (n: N): N => {
  const v = normalize(cameraPosition.sub(positionWorld))
  return uGardensPix.mul(positionWorld.distance(cameraPosition)).div(max(abs(dot(n, v)), 0.2))
}

/** a flat roof seen from the air: room roofs in a jittered grid 8 to 12 m, each its own shade, a parapet's dark line between */
function roofCells(p: N, w: N, S: number): N {
  const row = floor(p.z.div(S))
  const x = p.x.add(hash(row.mul(3.7).add(1.3)).mul(0.6 * S))
  const id = hash(floor(x.div(S)).mul(17.1).add(row.mul(31.7)).add(0.5))
  const line = max(lines(x, S, 0.25, w), lines(p.z, S, 0.25, w))
  return id.sub(0.5).mul(0.14).add(1).mul(float(1).sub(line.mul(0.2)))
}

/** the vaulted building's cells block in plan: its passage's line (origin o, unit direction a along it, c across) and
    its length, and how many cells lie each side of it */
export interface CellsPlan { o: [number, number]; a: [number, number]; c: [number, number]; len: number; cells: number; top: number }

export function bodiesMaterial(tones: ClassTones, V: CellsPlan): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 })
  const p = positionWorld, n = normalWorld
  const look = attribute('look', 'float')
  const is = (k: number): N => step(abs(look.sub(k)), 0.5)
  const up = smoothstep(0.55, 0.85, n.y)
  const w = footprint(n)
  const mottle = float(1).add(mx_noise_float(p.mul(0.05)).mul(0.06)).add(mx_noise_float(p.mul(0.6)).mul(0.03))

  // the faces: baked brick in its bond with dark joints, a little uneven in broad patches; the terraces' faces damper
  // and darker toward their feet where the beds above are watered
  const joint = mix(V3(PAL.asphalt as RGB).mul(2.2), V3(TONES.silt).mul(0.7), 0.5)
  const baked = V3(TONES.baked).mul(mottle)
  const wall = brickBond(baked, uGardensPix, joint)
  // the garden's faces a shade darker and damper: the beds above them are watered
  const faceCol = wall.mul(mix(float(1), float(0.9), is(2)))

  // the roofs: plastered earth over beams, room by room; the parapet's top a course of brick laid flat
  const roof = V3(TONES.roof).mul(0.95).mul(roofCells(p, w, 10.5)).mul(mottle)
  // the terrace's open top round the palace: trodden earth and brick dust
  const trodden = V3(TONES.silt).mul(1.12).mul(mottle).mul(float(1).sub(smoothstep(0.1, 0.5, mx_noise_float(vec3(p.x.mul(0.08), 2.1, p.z.mul(0.08)))).mul(0.08)))
  // the garden's tops: watered soil, low green in drifts and along the beds; dry earth when the garden is off
  const soil = vec3(0.06, 0.047, 0.032).mul(float(1).add(mx_noise_float(p.mul(0.9)).mul(0.12)))
  const drift = smoothstep(-0.25, 0.35, mx_noise_float(vec3(p.x.mul(0.22), 4.3, p.z.mul(0.22))).add(mx_noise_float(p.mul(1.1)).mul(0.3)))
  const herb = vec3(0.06, 0.082, 0.03).mul(float(0.85).add(mx_noise_float(p.mul(2.1)).mul(0.25)))
  const garden = mix(soil, herb, drift.mul(0.85))
  const dry = V3(TONES.silt).mul(0.95).mul(mottle)
  const gardenTop = mix(dry, garden, uGarden)
  // the courts: pale stone slabs about 66 cm, laid square, the joints filled with dust
  const slab = V3(TONES.slab).mul(float(0.95).add(hash(floor(p.x.div(0.66)).mul(13.1).add(floor(p.z.div(0.66)).mul(7.7))).mul(0.1).mul(float(1).sub(smoothstep(0.05, 0.3, w))))).mul(mottle)
  const slabJ = max(lines(p.x, 0.66, 0.006, w), lines(p.z, 0.66, 0.006, w))
  const paving = mix(slab, V3(TONES.silt).mul(0.8), slabJ.mul(0.6))
  // the vaulted building's roof: earth over brick, warmer than the palace's plaster; on the cells' block the plan below
  // shows through as a shallow line over each cross wall and a darker strip over the passage (the plan is dug; the
  // roof is ours)
  const dx = p.x.sub(V.o[0]), dz = p.z.sub(V.o[1])
  const along = dx.mul(V.a[0]).add(dz.mul(V.a[1])), across = dx.mul(V.c[0]).add(dz.mul(V.c[1]))
  const onCore = step(V.top - 0.05, p.y).mul(step(V.top + 0.05, p.y).oneMinus()).mul(step(0.3, along)).mul(step(along, V.len - 0.3))
  const passage = smoothstep(1.3, 1.0, abs(across))
  const walls = lines(along, V.len / V.cells, 0.22, w).mul(float(1).sub(passage))
  const vBase = mix(V3(TONES.roof), V3(TONES.baked), 0.4).mul(mottle)
  const vRoof = vBase.mul(mix(float(0.92), float(1.04), onCore)).mul(float(1).sub(onCore.mul(passage.mul(0.14).add(walls.mul(0.1)))))
  // stairs: baked brick treads, worn paler at their middle
  const tread = V3(TONES.baked).mul(0.98).mul(mottle)

  let topCol: N = roof
  topCol = mix(topCol, trodden, is(1))
  topCol = mix(topCol, gardenTop, is(2))
  topCol = mix(topCol, paving, is(3))
  topCol = mix(topCol, vRoof, is(4))
  topCol = mix(topCol, tread, is(5))
  const stateCol = mix(faceCol, topCol, up)
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the plants: vertex colours broken into leaf clumps that fade into their mean where a pixel covers them; the
    sunward edge of a crown seen against the sun lit through its leaves */
export function plantsMaterial(tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0, side: DoubleSide })
  const p = positionWorld, n = normalize(normalWorld)
  const leaf = attribute('leaf', 'float')
  const centre = attribute('centre', 'vec3')
  const base = attribute('color', 'vec3')
  const w = uGardensPix.mul(p.distance(cameraPosition))
  // clumps of leaves about 0.6 m and their dark gaps; smoothed out where a pixel spans more than a clump
  const near = float(1).sub(smoothstep(0.08, 0.35, w))
  const clump = mx_worley_noise_float(p.mul(1.7))
  const gaps = smoothstep(0.05, 0.45, clump).mul(0.45).add(0.6)
  const leafVar = float(1).add(mx_noise_float(p.mul(0.9)).mul(0.18))
  const clumped = base.mul(mix(float(0.86), gaps, near)).mul(leafVar)
  // a crown's lower and inner parts in its own shade
  const out = normalize(p.sub(centre))
  const shade = mix(float(0.62), float(1), smoothstep(-0.7, 0.4, out.y)).mul(mix(float(0.75), float(1), smoothstep(0.2, 0.9, dot(n, out))))
  const col = mix(base, clumped.mul(shade), leaf)
  m.colorNode = mix(col, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // the light through the leaves: looking toward the sun, from the crown's sunward side, a warm green; forward scatter
  const v = normalize(p.sub(cameraPosition))
  const L = normalize(uGardensSun.dir)
  const forward = pow(max(dot(v, L), 0), 3)
  const sunward = smoothstep(-0.1, 0.8, dot(out, L))
  const through = base.mul(vec3(1.5, 1.35, 0.7)).mul(uGardensSun.irr).mul(forward.mul(sunward).mul(0.55).add(sunward.mul(0.05)))
  m.emissiveNode = through.mul(leaf).mul(float(1).sub(uView))
  return m
}

