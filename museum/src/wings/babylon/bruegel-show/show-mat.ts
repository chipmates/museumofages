/* BRUEGEL'S TOWER AS A SHOWPIECE: ITS MATERIAL (TSL). The painting's worked-over surface, by kind of face: old stone
   weathered to cream and ochre with grey-blue streaks and grime under the ledges, each course of blocks and each bay
   its own batch; new stone whiter; red brick in short strokes of courses; the pale rock in planes with its cracks and
   moss on its ledges; timber, thatch, tiles and cloth; openings dark brown. Depth in the wall darkens a face, so a
   niche reads in shade. Forms and colours read off the painting by eye, never its pixels. Outside the evidence
   classes: the class view leaves it as it is. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { uTowerPix } from '../tower/tower-mat'
import { SK, type ShowFrame } from './show-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, atan, attribute, cameraPosition, clamp, float, floor, fract, max, mix, mx_noise_float, normalize, positionWorld, sin, smoothstep, sqrt, step, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** a value hashed from a node, 0 to 1 */
const h1 = (x: N): N => fract(sin(x.mul(12.9898)).mul(43758.5453))
/** a thin line every `period` along x, `width` wide, faded once a pixel's footprint passes it */
const lineEvery = (x: N, period: number, width: number, fw: N): N => {
  const d = abs(fract(x.div(period)).sub(0.5)).mul(period)
  const w = max(fw, float(width))
  return float(1).sub(smoothstep(w.mul(0.5), w, float(period / 2).sub(d))).mul(float(1).sub(smoothstep(float(width * 2), float(width * 6), fw)))
}

export function showMaterial(f: ShowFrame, sp: J): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  const k = attribute('sk', 'float')
  const A = attribute('sq', 'vec4')
  const n = normalize(attribute('normal', 'vec3'))
  const is = (v: number): N => float(1).sub(step(0.5, abs(k.sub(v))))
  const C = sp.colours
  // round the axis: the angle, the arc and the height over the foot
  const dx = P.x.sub(f.x), dz = P.z.sub(f.z)
  const u = dx.mul(f.c).sub(dz.mul(f.s)), v = dx.mul(f.s).add(dz.mul(f.c))
  const phi = atan(v.negate(), u)
  const rho = sqrt(u.mul(u).add(v.mul(v)))
  const arc = phi.mul(rho)
  const h = P.y.sub(f.base)
  const fw = uTowerPix.mul(P.distance(cameraPosition)).mul(1.2)
  const tone = A.x, fresh = A.y, depth = A.z, ledgeH = A.w
  const under = ledgeH.sub(h)
  const upright = float(1).sub(smoothstep(0.35, 0.6, abs(n.y)))
  const facing = float(1).sub(step(0.05, depth))

  /* ── stone: courses of blocks, each block, bay and patch its own shade; streaks, grime, cracks ── */
  const course = floor(h.div(0.6))
  const blockLen = float(1.25).add(h1(course.mul(3.1)).mul(0.5))
  const blockId = floor(arc.div(blockLen).add(h1(course).mul(0.7))).add(course.mul(57.3))
  const blockTone = h1(blockId).sub(0.5).mul(0.075)
  const bigPatch = mx_noise_float(vec3(arc.mul(0.045), h.mul(0.06), 1.7)).mul(0.13)
  const midPatch = mx_noise_float(vec3(arc.mul(0.18), h.mul(0.22), 4.1)).mul(0.05)
  const bayTone = tone.sub(0.5).mul(0.3)
  // grey-blue weathering streaks running down from sills and ledges, longer and darker under the ledge
  const streakN = mx_noise_float(vec3(arc.mul(1.1), h.mul(0.045), 7.3))
  const streak = smoothstep(0.25, 0.75, streakN).mul(0.55).mul(float(1).sub(fresh.mul(0.7)))
  const grime = float(1).sub(smoothstep(0.3, 3.2, under)).mul(step(0.0, under)).mul(0.22).mul(float(1).sub(fresh.mul(0.5)))
  const joints = max(lineEvery(h, 0.6, 0.035, fw), lineEvery(arc.add(h1(course).mul(0.7).mul(blockLen)), 1.5, 0.03, fw).mul(0.7)).mul(upright).mul(0.16)
  const oldC = V(C.old as RGB), newC = V(C.new as RGB), streakC = V(C.streak as RGB)
  let stone: N = mix(oldC, newC, fresh)
  stone = stone.mul(float(1).add(blockTone).add(bigPatch).add(midPatch).add(bayTone))
  // ochre and grey in patches, as the painter laid them over the cream
  stone = mix(stone, stone.mul(vec3(1.08, 0.96, 0.76)), smoothstep(0.1, 0.6, mx_noise_float(vec3(arc.mul(0.06), h.mul(0.05), 9.4))).mul(0.85))
  stone = mix(stone, stone.mul(vec3(0.9, 0.93, 0.98)), smoothstep(0.2, 0.7, mx_noise_float(vec3(arc.mul(0.09), h.mul(0.03), 5.5))).mul(0.5))
  stone = mix(stone, streakC.mul(stone.length().mul(0.9)), streak.mul(0.42).mul(upright))
  stone = stone.mul(float(1).sub(grime).sub(joints.mul(0.5)))
  // the corbel frieze under each cornice: a band of small round arches on corbels, their shadow under each
  const band = smoothstep(0.62, 0.7, under).mul(float(1).sub(smoothstep(1.35, 1.45, under))).mul(upright).mul(facing)
  const fx = fract(arc.div(0.95)).sub(0.5).mul(0.95)
  const archY = under.sub(0.72)
  const archD = sqrt(fx.mul(fx).add(max(archY, 0).mul(archY))).sub(0.34)
  const archLine = float(1).sub(smoothstep(0.0, max(fw, 0.05).mul(1.5), abs(archD))).mul(step(archY.negate(), 0.12))
  const corbel = step(abs(fx), 0.09).mul(smoothstep(1.0, 1.08, under))
  const frieze = band.mul(max(archLine.mul(0.35), corbel.mul(0.3))).mul(float(1).sub(smoothstep(0.08, 0.3, fw)))
  stone = stone.mul(float(1).sub(frieze)).mul(float(1).sub(band.mul(0.06)))

  /* ── red brick: courses in short strokes, new work salmon, older or shaded deep red ── */
  const bCourse = floor(h.div(0.22))
  const bStroke = fract(arc.div(0.55).add(h1(bCourse).mul(0.5)))
  const strokes = step(0.62, bStroke).mul(lineEvery(h.add(0.11), 0.22, 0.045, fw)).mul(float(1).sub(smoothstep(0.02, 0.07, fw)))
  const bPatch = mx_noise_float(vec3(arc.mul(0.07), h.mul(0.08), 3.3)).mul(0.14).add(mx_noise_float(vec3(arc.mul(0.4), h.mul(0.5), 6.6)).mul(0.06))
  let brick: N = mix(V(C.brickShade as RGB), V(C.brick as RGB), smoothstep(-0.4, 0.5, mx_noise_float(vec3(arc.mul(0.025), h.mul(0.04), 8.8))).mul(0.6).add(0.4))
  brick = brick.mul(float(1).add(bPatch).add(bayTone.mul(0.8))).mul(float(1).sub(strokes.mul(0.35)))
  brick = mix(brick, brick.mul(vec3(1.08, 0.98, 0.9)), smoothstep(0.4, 0.9, n.y).mul(0.6))
  // the core's top ring, still in the scaffold: its putlog holes in rows
  const ring = step(rho, float(13.0)).mul(step(float(104.4), h)).mul(upright).mul(facing)
  const putlog = step(abs(fract(arc.div(1.6)).sub(0.5)), float(0.11)).mul(step(abs(fract(h.div(1.3)).sub(0.5)), float(0.13)))
  // and on the brick faces where a scaffold stood, in patches of lifts, faded before a pixel spans them (a full grid
  // of them reads as dots from the vantage); lifts of brickwork, each its own batch, so the brick reads at a distance
  const holesSeen = max(float(1).sub(smoothstep(0.06, 0.14, fw)), ring)
  const holesHere = max(step(float(0.55), h1(floor(h.div(1.3)).mul(7.0).add(floor(arc.div(4.8)).mul(3.0)))), ring)
  brick = brick.mul(float(1).sub(putlog.mul(upright).mul(facing).mul(mix(float(0.45), float(0.78), ring)).mul(holesSeen).mul(holesHere)))
  brick = brick.mul(float(1).add(h1(floor(h.div(1.3)).add(floor(arc.div(7.0)).mul(13.0))).sub(0.5).mul(0.18)))
  // the lifts' bed joints, wide enough to hold a pixel from the hold, so the brick reads as laid work there
  brick = brick.mul(float(1).sub(lineEvery(h, 1.3, 0.14, fw).mul(0.16).mul(upright)))

  /* ── rock: pale planes, each facing its own shade, dark furrows and stains down them, ochre deposits,
     moss on the ledges; the shade by facing only, so pieces broken out side by side read as one face ── */
  // coarse bins, softly: a small bend in the face must not jump its tone (a mosaic of facets reads as an old game)
  const plane = h1(floor(n.x.mul(2.5)).add(floor(n.z.mul(2.5)).mul(11.0)).add(floor(n.y.mul(2.0)).mul(37.0)))
  const rN = mx_noise_float(P.mul(0.09)).mul(0.16).add(mx_noise_float(P.mul(0.45)).mul(0.07))
  // the grain close to: fine pits and chips, faded out before a pixel spans them
  const rFine = mx_noise_float(P.mul(2.6)).mul(0.07).add(mx_noise_float(P.mul(7.5)).mul(0.04)).mul(float(1).sub(smoothstep(0.04, 0.16, fw)))
  // the painter's strokes down each plane: tone that runs upright, fine across
  const stroke = mx_noise_float(vec3(P.x.mul(2.2), P.y.mul(0.09), P.z.mul(2.2))).mul(0.08)
  // stains run down the planes (noise stretched upright), broad furrows in shade between them; no course lines
  const rStain = smoothstep(0.15, 0.7, mx_noise_float(vec3(P.x.mul(0.7), P.y.mul(0.025), P.z.mul(0.7)))).mul(0.26)
  const furrow = smoothstep(0.2, 0.7, mx_noise_float(vec3(P.x.mul(0.34), P.y.mul(0.016), P.z.mul(0.34)).add(vec3(11, 3, 7)))).mul(0.5)
  // a quarried face (fresh 1) is cut clean: paler, half the stains and furrows, each step shaded toward its foot
  const cut = fresh
  const weather = float(1).sub(cut.mul(0.5))
  let rock: N = V(C.rock as RGB).mul(float(1).add(plane.sub(0.5).mul(0.22)).add(rN).add(rFine).add(stroke)).mul(float(1).sub(rStain.mul(weather)).sub(furrow.mul(weather)))
  rock = rock.mul(mix(float(1), mix(float(1.1), float(0.74), smoothstep(0.2, 5.0, under)), cut))
  rock = mix(rock, rock.mul(vec3(1.1, 0.98, 0.78)), smoothstep(-0.1, 0.5, mx_noise_float(P.mul(0.05).add(vec3(3, 1, 2)))).mul(0.5))
  // the yellow ochre the painter laid where the stone is broken and its dust lies
  rock = mix(rock, V(C.ochre as RGB).mul(float(1).add(rN)), smoothstep(0.05, 0.45, mx_noise_float(P.mul(0.07).add(vec3(5, 9, 1)))).mul(0.65))
  // moss on the ledges and in the shade of the clefts, olive as painted
  const mossy = max(smoothstep(0.45, 0.8, n.y), smoothstep(0.3, 0.7, mx_noise_float(P.mul(0.07).add(vec3(7, 2, 5)))).mul(0.45)).mul(smoothstep(-0.3, 0.4, mx_noise_float(P.mul(0.16))))
  rock = mix(rock, V(C.moss as RGB).mul(float(1).add(rN.mul(2))), mossy.mul(0.75))
  rock = rock.mul(mix(float(0.8), float(1), smoothstep(0, 8, h)))
  // a face turned sideways (along the ring) looks into a cleft between two masses: darker, as the painter laid them
  const radOut = vec3(u.mul(f.c).add(v.mul(f.s)), 0, u.mul(f.s).negate().add(v.mul(f.c))).div(max(rho, 0.01))
  const outward = n.x.mul(radOut.x).add(n.z.mul(radOut.z))
  rock = rock.mul(mix(float(0.45), float(1.05), smoothstep(-0.2, 0.75, outward)).mul(upright).add(float(1).sub(upright)))

  /* ── the rest: timber, thatch, tiles, cloth, openings, floors ── */
  const grain = mx_noise_float(vec3(P.x.mul(0.6), P.y.mul(4.0), P.z.mul(0.6))).mul(0.12)
  const timber = V(C.timber as RGB).mul(float(1).add(grain).add(tone.sub(0.5).mul(0.3)))
  const thatch = V(C.thatch as RGB).mul(float(1).add(mx_noise_float(vec3(P.x.mul(1.5), P.y.mul(0.3), P.z.mul(1.5))).mul(0.15)).add(tone.sub(0.5).mul(0.2)))
  const tile = V(C.tile as RGB).mul(float(1).sub(lineEvery(h, 0.32, 0.05, fw).mul(0.3)).add(tone.sub(0.5).mul(0.2)))
  const cloth = V(C.cloth as RGB).mul(float(1).add(tone.sub(0.5).mul(0.25)))
  const darkC = V(C.dark as RGB).mul(float(1).add(mx_noise_float(P.mul(0.7)).mul(0.25)))
  const floorC = V(C.floor as RGB).mul(float(1).add(mx_noise_float(P.mul(0.12)).mul(0.12)).add(tone.sub(0.5).mul(0.1)))
  const plaster = V(C.new as RGB).mul(0.92).mul(float(1).add(mx_noise_float(P.mul(0.3)).mul(0.08)))

  let col: N = stone
  col = mix(col, brick, is(SK.brick))
  col = mix(col, rock, is(SK.rock))
  col = mix(col, timber, is(SK.timber))
  col = mix(col, thatch, is(SK.thatch))
  col = mix(col, tile, is(SK.tile))
  col = mix(col, darkC, is(SK.dark))
  col = mix(col, cloth, is(SK.cloth))
  col = mix(col, floorC, is(SK.floor))
  col = mix(col, plaster, is(SK.plaster))
  // people in the house's grey-figure form: one grey, no face, no texture
  col = mix(col, vec3(0.16, 0.16, 0.16), is(SK.figure))
  // deep in the wall the sky's light thins (the page's contact occlusion reaches 1.2 m): reveals darken toward the back, a
  // niche's back to about two thirds of its face, as the painter shades them
  const notDark = float(1).sub(is(SK.dark))
  col = col.mul(mix(float(1), float(0.5), smoothstep(0.0, 1.4, depth).mul(notDark)))
  // tops and ledges dusted lighter, the foot darker with splash and soil
  col = mix(col, col.mul(vec3(1.05, 1.02, 0.96)), smoothstep(0.6, 0.95, n.y).mul(float(1).sub(is(SK.rock))).mul(0.5))
  col = col.mul(mix(float(0.86), float(1), smoothstep(0.0, 3.0, h)))
  m.colorNode = clamp(col, 0, 1)
  m.roughnessNode = mix(float(0.88), float(0.95), is(SK.dark).add(is(SK.thatch)).min(1))
  return m
}

