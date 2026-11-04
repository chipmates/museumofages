/* STOP 9'S MATERIAL (TSL), on the gate's kit (its bond, filtered lines, hash and colours): one material for every body
   of the stop, branching on the body's `kind` attribute and the face's own data, never on screen derivatives.
     0 the precinct's walls   white lime-gypsum plaster over mud brick, guessed: patches of older and newer coats, the
                              mud showing where splash and flaking took the plaster at the foot, runs under the tops
     1 the tower's brick      baked brick in thick bitumen joints on the kit's bond, the faces in tall panels
     2 the temple on top      blue-glazed brick (the king's claim), each brick fired a little differently
     3 the street             the dug 6.4 m: seven breccia slabs across on the west, brick in asphalt on the east; the
                              map street's wider shoulders as trodden dust
     4 the threshold          brick, where the destroyed gate stood
     5 the stairs             brick, the treads drawn on the ramp's slope, the cheeks in the bond
   Every line is box-filtered over one device pixel's footprint on the surface, so the jittered sub-frames agree.
   `groundPaint` tints the map's ground inside the precinct and on the open ground before Gate 5. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { BR, PAL, bond, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, greyNode, uView, type ClassTones } from '../map/mass'
import type { GateFrame } from './tower-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, clamp, dot, float, floor, fract, max, min, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionWorld, select, smoothstep, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uTowerPix = uniform(0.0003)
export function setTowerPixel(vfovDeg: number, heightPx: number): void {
  uTowerPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

const U = { uPix: uTowerPix }
/** a band [a, b) of x with soft edges as wide as the footprint */
const bandF = (x: N, a: N | number, b: N | number, w: N): N => smoothstep(float(a).sub(w.mul(0.5)), float(a).add(w.mul(0.5)), x).mul(float(1).sub(smoothstep(float(b).sub(w.mul(0.5)), float(b).add(w.mul(0.5)), x)))
/** fades a detail out once a pixel's footprint passes its size */
const seen = (fw: N, size: number): N => float(1).sub(smoothstep(size * 0.25, size, fw))

/** the inward distance from the wall's centre line, for the ground's level under a wall's foot */
function inward(F: GateFrame): N {
  return positionWorld.x.sub(F.a[0]).mul(F.i[0]).add(positionWorld.z.sub(F.a[1]).mul(F.i[1]))
}

export function towerMaterial(F: GateFrame, tp: J, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  // the meshes stand untransformed, so the geometry's normal is the world's
  const n = normalize(attribute('normal', 'vec3'))
  const kind = attribute('kind', 'float')
  const fa = attribute('fa', 'vec4')
  const is = (k: number): N => step(abs(kind.sub(k)), 0.5)
  const vertical = step(abs(n.y), 0.5)
  const upward = step(0.5, n.y)
  const col = tp.colours
  // along a vertical face: its horizontal tangent
  const tan = normalize(vec3(n.z.negate(), 0, n.x).add(vec3(1e-5, 0, 0)))
  const uFace = dot(P, tan)
  const fu = footprint(U, tan, n), fy = footprint(U, vec3(0, 1, 0), n)
  const fw = max(fu, fy)

  /* ── 0 the precinct's walls: white plaster over mud brick ── */
  const tIn = inward(F)
  const yFoot = mix(float(2.75), float(3.45), smoothstep(-6, 8, tIn))
  const yUp = P.y.sub(yFoot)
  const coat = mx_noise_float(vec3(uFace.mul(0.07), P.y.mul(0.09), 3.7))
  const mottle = mx_noise_float(vec3(uFace.mul(0.6), P.y.mul(0.6), 1.3)).mul(seen(fw, 0.5))
  const trowel = mx_noise_float(vec3(uFace.mul(4.5), P.y.mul(3.0), 7.7)).mul(seen(fw, 0.06))
  let plaster: N = V(col.plaster).mul(float(1).add(coat.mul(0.08)).add(mottle.mul(0.035)).add(trowel.mul(0.03)))
  plaster = plaster.mul(mix(vec3(1.02, 1.0, 0.96), vec3(0.97, 0.99, 1.02), smoothstep(-0.2, 0.3, coat)))
  // runs from the tops: faint greyer streaks fading downward from the walls' and towers' coping
  const wallTop = float(tp.wall.top)
  const topNear = select(P.y.greaterThan(wallTop.add(0.01)), float(tp.wall.top + tp.wall.towers.over), wallTop)
  const below = topNear.sub(P.y)
  const runs = smoothstep(0.1, 0.45, mx_noise_float(vec3(uFace.mul(2.2), P.y.mul(0.12), 5.1))).mul(float(1).sub(smoothstep(0.3, 3.5, below))).mul(seen(fw, 0.4))
  plaster = mix(plaster, plaster.mul(vec3(0.86, 0.85, 0.84)), runs.mul(0.5))
  // the foot: splash and wear took the coat; the mud brick shows, its courses where near
  // the splash line wanders slowly along the wall; above it the coat broke away here and there in low, wide scars
  const edgeN = mx_noise_float(vec3(uFace.mul(0.35), 0, 2.2)).mul(0.25).add(mx_noise_float(vec3(uFace.mul(1.6), 0, 4.1)).mul(0.06).mul(seen(fw, 0.2)))
  const splash = float(1).sub(smoothstep(float(0.3).add(edgeN), float(0.42).add(edgeN), yUp))
  const flakeN = mx_noise_float(vec3(uFace.mul(0.6), P.y.mul(2.2), 9.3)).add(mx_noise_float(vec3(uFace.mul(2.4), P.y.mul(5), 1.7)).mul(0.25))
  const flake = smoothstep(0.47, 0.52, flakeN).mul(float(1).sub(smoothstep(0.5, 1.3, yUp)))
  const bare = max(splash, flake.mul(seen(fw, 0.3)).mul(0.7))
  const mb = bond(uFace, P.y, float(0), fu, fy, 0.006)
  const mudTone = V(col.mud).mul(float(1).add(mb.brick.sub(0.5).mul(0.12).mul(seen(fw, 0.3))))
  const mud = mix(mudTone, V(col.mud).mul(0.72), max(mb.bed, mb.head).mul(0.6))
  let wallCol: N = mix(plaster, mud, bare.mul(0.85))
  // dust thrown up against the foot of the coat, browner toward the ground
  wallCol = mix(wallCol, wallCol.mul(vec3(0.9, 0.84, 0.76)), float(1).sub(smoothstep(0.2, 1.6, yUp)).mul(0.5))
  // the wall tops: an earth roof
  const roofCol = V(col.earth).mul(float(0.9).add(mx_noise_float(P.mul(0.2)).mul(0.08)))
  wallCol = mix(wallCol, roofCol, upward)

  /* ── 1 the tower's baked brick, in panels ── */
  const ctr = vec2(fa.x, fa.y)
  const uT = P.x.sub(ctr.x).mul(tan.x).add(P.z.sub(ctr.y).mul(tan.z))
  const halfW = fa.z, pitch = max(fa.w, 0.01)
  const PN = tp.tower.panels
  const fP = fract(uT.div(pitch).add(0.5)).sub(0.5).mul(pitch)
  const corner = step(halfW.sub(pitch.mul(0.5)), abs(uT))
  const halfPanel = pitch.mul(PN.share / 2)
  const inPanel = float(1).sub(smoothstep(halfPanel.sub(fu.mul(0.5)), halfPanel.add(fu.mul(0.5)), abs(fP))).mul(float(1).sub(corner))
  // the inner corners of each recess hold the sky's light back, a little on both sides
  const edgeDist = abs(abs(fP).sub(halfPanel))
  const shade = float(1).sub(smoothstep(0.0, 0.9, edgeDist)).mul(step(halfPanel, abs(fP))).mul(float(1).sub(corner))
  const recess = float(1).sub(inPanel).mul(float(1).sub(corner))
  const tb = bond(uT, P.y, float(0), fu, fy, 0.008)
  const batch = mx_noise_float(vec3(uT.mul(0.05), P.y.mul(0.8), 6.6))
  const fire = tb.brick.sub(0.5).mul(0.16).mul(seen(fw, 0.4))
  // courses of one firing lie in long bands a metre or so high; each panel a little its own; under each stage's edge
  // the rain carried dust and bitumen down in streaks; the foot darker where the court's dust was thrown up
  const courses = mx_noise_float(vec3(uT.mul(0.012), P.y.mul(0.55), 2.9)).add(mx_noise_float(vec3(uT.mul(0.03), P.y.mul(1.7), 8.1)).mul(0.5))
  const panelId = hash2(floor(uT.div(pitch).add(0.5)), floor(P.y.div(40)))
  const streakN = smoothstep(0.05, 0.4, mx_noise_float(vec3(uT.mul(1.3), P.y.mul(0.06), 4.4)))
  const brickTone = mix(V(col.brick), V(PAL.redBrown as RGB), clamp(float(0.18).add(batch.mul(0.2)).add(fire), 0, 0.6))
    .mul(float(1).add(batch.mul(0.04)).add(courses.mul(0.07)).add(panelId.sub(0.5).mul(0.05).mul(inPanel)))
  const joint = clamp(tb.bed.add(tb.head), 0, 1)
  let towerCol: N = mix(brickTone, V(PAL.asphalt as RGB).mul(2.2), joint.mul(0.85))
  towerCol = towerCol.mul(mix(float(1), float(0.93), recess)).mul(float(1).sub(streakN.mul(0.09)))
  towerCol = towerCol.mul(mix(float(0.86), float(1), smoothstep(3.5, 6.0, P.y)))
  // the stage tops: brick laid flat, dust lying on it
  const flatB = max(lines(P.x, BR, 0.008, fw), lines(P.z, BR, 0.008, fw))
  const towerTop = mix(mix(V(col.brick), V(PAL.dust as RGB), 0.5), V(PAL.asphalt as RGB).mul(2.2), flatB.mul(0.6))
  towerCol = mix(towerCol, towerTop, upward)

  /* ── 2 the temple's blue glaze ── */
  const gb = bond(uT, P.y, float(0), fu, fy, 0.004)
  // the cobalt range's light end (0.22 of the white), so the glaze in shade stays blue
  const glazeG: RGB = [0.11, 0.163, 0.298]
  const gVary = gb.brick.sub(0.5).mul(0.3).mul(seen(fw, 0.3))
  const glaze = mix(V(glazeG).mul(float(1).add(gVary)), V(PAL.black as RGB), clamp(gb.bed.add(gb.head), 0, 1).mul(0.7)).mul(mix(float(1), float(0.9), recess))
  const glazeCol = mix(glaze, towerTop, upward)

  /* ── 3 the street: the dug paving on the map street's middle, its shoulders trodden dust ── */
  const s = fa.x, t = fa.y, w = fa.z, lip = step(0.5, fa.w)
  const margin = w.sub(tp.street.dug).mul(0.5)
  const tt = t.sub(margin)
  const BW = tp.street.breccia.w, BN = tp.street.breccia.n
  const brecW = BW * BN
  const fS = footprint(U, vec3(0, 0, 1), vec3(0, 1, 0)), fT = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0))
  const fSt = max(fS, fT)
  const inBrec = bandF(tt, 0, brecW, fT), inBrick = bandF(tt, brecW, tp.street.dug, fT)
  const near = seen(fSt, 0.05)
  // breccia: angular clasts in a red matrix, white veins where the cells meet (the gate kit's stone); slab to slab a tone
  const cell = mx_worley_noise_vec2(vec2(s, t).mul(16))
  const edge = cell.y.sub(cell.x)
  const clastId = mx_noise_float(vec3(s.mul(11), t.mul(11), 0.7)).mul(0.6).add(0.5).add(cell.x.mul(0.25))
  const clast = mix(mix(V(PAL.brecciaDark as RGB), V(PAL.breccia as RGB), smoothstep(0.0, 0.5, clastId)), V(PAL.brecciaPale as RGB), smoothstep(0.6, 1.0, clastId))
  const vein = smoothstep(0.02, 0.0, edge).mul(step(0.78, mx_noise_float(vec3(s.mul(1.7), t.mul(1.7), 3.1)).add(0.5)))
  const brecNear = mix(mix(clast, V(PAL.brecciaDark as RGB), smoothstep(0.12, 0.05, edge).mul(0.5)), V(PAL.brecciaVein as RGB), vein.mul(0.45))
  const slabId = hash2(floor(s.div(BW)), floor(tt.div(BW)))
  const brecMean = V(PAL.breccia as RGB).mul(0.95).add(V(PAL.brecciaVein as RGB).mul(0.05))
  // reddish, not red: the stone's mean drawn toward the street's dust, as weathered slabs read in the dig photographs
  const brec = mix(mix(brecMean, brecNear, near), V(PAL.dust as RGB).mul(1.1), 0.48).mul(float(0.9).add(slabId.mul(0.2)))
  const jB = clamp(lines(tt, BW, 0.004, fT).add(lines(s, BW, 0.004, fS)), 0, 1)
  const kk = floor(s.div(BR))
  const jR = clamp(lines(s, BR, 0.006, fS).add(lines(tt.add(kk.sub(floor(kk.div(2)).mul(2)).mul(BR / 2)), BR, 0.006, fT)), 0, 1)
  const brickH = hash2(floor(tt.div(BR)), kk)
  // bricks of one firing alike: the tone drifts over metres, brick to brick only a little
  const brickDrift = mx_noise_float(vec3(s.mul(0.25), t.mul(0.25), 6.2))
  const pBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), clamp(float(0.3).add(brickDrift.mul(0.25)).add(brickH.sub(0.5).mul(0.18).mul(near)), 0, 1)).mul(0.9)
  const dustC = V(PAL.dust as RGB).mul(1.15)
  // dust: in the joints, drifting toward the edges, thin on the walked middle of the slabs
  const drift = smoothstep(0.25, 0.75, mx_noise_float(vec3(s.mul(0.3), t.mul(0.3), 1.9)).add(0.5))
  const toEdge = float(1).sub(smoothstep(0.3, 1.6, min(tt, float(tp.street.dug).sub(tt))))
  const dust = clamp(drift.mul(0.25).add(toEdge.mul(0.3)), 0, 0.6)
  let streetCol: N = mix(dustC.mul(0.92), mix(brec, mix(vec3(0.07, 0.05, 0.045), dustC, 0.35), jB.mul(0.8)), inBrec)
  streetCol = mix(streetCol, mix(pBrick, mix(V(PAL.asphalt as RGB), dustC, 0.3), jR), inBrick)
  streetCol = mix(streetCol, dustC, dust.mul(max(inBrec, inBrick)))
  // the shoulders: trodden dust with a ragged edge to the paving
  const shoulder = float(1).sub(max(inBrec, inBrick))
  streetCol = mix(streetCol, dustC.mul(float(0.92).add(mx_noise_float(vec3(s.mul(0.8), t.mul(0.8), 4.4)).mul(0.1))), shoulder)
  streetCol = mix(streetCol, dustC.mul(0.8), lip)

  /* ── 4 the threshold: brick laid flat on its top, its edges brick ── */
  const thCol = mix(mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), 0.35).mul(0.9), V(PAL.asphalt as RGB).mul(2), flatB.mul(0.7))

  /* ── 5 the stairs: the treads as bands on the slope (a step's run in phase 0 to 1), the cheeks in the bond ── */
  const sDir = normalize(vec3(fa.z, 0, fa.w).add(vec3(1e-6, 0, 0)))
  const kStep = vec2(fa.z, fa.w).length()
  const phase = P.x.sub(fa.x).mul(fa.z).add(P.z.sub(fa.y).mul(fa.w))
  const fStep = footprint(U, sDir, n).mul(kStep)
  // the riser's face fills about four tenths of each step as the slope is seen from its foot
  const rise = float(1).sub(smoothstep(float(0.19).sub(fStep.mul(0.5)), float(0.19).add(fStep.mul(0.5)), abs(fract(phase.sub(0.31)).sub(0.5))))
  const sBatch = mx_noise_float(vec3(P.x.mul(0.05), P.y.mul(0.8), P.z.mul(0.05)))
  const stairBrick = mix(V(col.brick), V(PAL.redBrown as RGB), 0.2).mul(float(1).add(sBatch.mul(0.05)))
  const tread = mix(stairBrick, V(PAL.dust as RGB), 0.4), riserC = stairBrick.mul(0.78)
  const stepCol = mix(mix(tread, riserC, 0.38), mix(tread, riserC, rise), seen(fStep, 0.6))
  const sb = bond(uFace, P.y, float(0), fu, fy, 0.008)
  const cheek = mix(stairBrick, V(PAL.asphalt as RGB).mul(2.2), clamp(sb.bed.add(sb.head), 0, 1).mul(0.85))
  const stairCol = mix(cheek, stepCol, step(0.2, n.y))

  /* ── one colour per point, the class view over it ── */
  let stateCol: N = greyNode(0.42)
  stateCol = mix(stateCol, wallCol, is(0))
  stateCol = mix(stateCol, towerCol, is(1))
  stateCol = mix(stateCol, glazeCol, is(2))
  stateCol = mix(stateCol, streetCol, is(3))
  stateCol = mix(stateCol, thCol, is(4))
  stateCol = mix(stateCol, stairCol, is(5))
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  const glazed = is(2).mul(float(1).sub(upward))
  m.roughnessNode = mix(mix(mix(float(0.92), float(0.35), glazed), float(0.75), is(3).mul(inBrec)), float(0.92), uView)
  // the light the stack does not carry: the panels' inner corners, the walls' foot and the towers' sides against the wall
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.9, yUp)).mul(0.28))
  let ao: N = float(1)
  ao = mix(ao, float(1).sub(shade.mul(0.22)), max(is(1), is(2)).mul(vertical))
  ao = mix(ao, footAO, is(0).mul(vertical))
  m.aoNode = mix(ao, float(1), uView)
  return m
}

/** the map ground's colour inside the precinct and on the open ground before Gate 5: packed earth, the perpendicular
    street's brick down the recess's middle, fading to the map's grey over 60 m outside; the class view keeps the grey */
export function groundPaint(F: GateFrame, tp: J, mapPlan: J): (base: N) => N {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const S = (E: number, Nn: number): [number, number] => [E - E0, N0 - Nn]
  const W = (id: string): J => mapPlan.walls.find((x: J) => x.id === id) ?? mapPlan.blocks.find((x: J) => x.id === id)
  // the precinct's four corners from the map's walls: NW, NE, SE, SW
  const nw = S(...(W('precinct-north-wall').line[0] as [number, number])), ne = S(...(W('precinct-east-wall').line[0] as [number, number]))
  const se = S(...(W('precinct-east-wall').line[1] as [number, number])), sw = S(...(W('precinct-south-rooms').line[0] as [number, number]))
  const P = positionWorld
  const side = (a: [number, number], b: [number, number]): N => {
    // positive on the quad's inside (the corners wind clockwise in plan, north up)
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez)
    return P.x.sub(a[0]).mul(-ez / l).add(P.z.sub(a[1]).mul(ex / l))
  }
  const dIn = min(min(side(nw, ne), side(ne, se)), min(side(se, sw), side(sw, nw)))
  const inside = smoothstep(-1.5, 1.5, dIn)
  // the open ground before the gate: within 70 m of the opening, fading out
  const gc = F.at(F.sG, -F.thick / 2)
  const dGate = vec2(P.x.sub(gc[0]), P.z.sub(gc[1])).length()
  const before = float(1).sub(smoothstep(70, 130, dGate)).mul(float(1).sub(inside))
  const col = tp.colours
  const fw = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0))
  const broad = mx_noise_float(vec3(P.x.mul(0.035), 2.1, P.z.mul(0.035)))
  const patch = mx_noise_float(vec3(P.x.mul(0.25), 5.3, P.z.mul(0.25))).mul(seen(fw, 1.5))
  const grit = mx_noise_float(vec3(P.x.mul(3.1), 8.8, P.z.mul(3.1))).mul(seen(fw, 0.12))
  const earth = V(col.earth).mul(float(1).add(broad.mul(0.1)).add(patch.mul(0.06)).add(grit.mul(0.05)))
  const dust = V(PAL.dust as RGB).mul(1.2).mul(float(1).add(broad.mul(0.08)).add(patch.mul(0.07)).add(grit.mul(0.05)))
  // the perpendicular street down the recess's middle, brick in asphalt, to the threshold
  const sA = P.x.sub(F.a[0]).mul(F.d[0]).add(P.z.sub(F.a[1]).mul(F.d[1])).sub(F.sG)
  const tA = P.x.sub(F.a[0]).mul(F.i[0]).add(P.z.sub(F.a[1]).mul(F.i[1]))
  const halfX = tp.cross.w / 2
  const inCross = bandF(sA, -halfX, halfX, fw).mul(bandF(tA, -F.thick / 2, F.tEnd - 2, fw))
  const kk = floor(tA.div(BR))
  const jC = clamp(lines(tA, BR, 0.006, fw).add(lines(sA.add(kk.sub(floor(kk.div(2)).mul(2)).mul(BR / 2)), BR, 0.006, fw)), 0, 1)
  const hC = hash2(floor(sA.div(BR)), kk)
  const crossCol = mix(mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), hC.mul(0.5)).mul(0.88), mix(V(PAL.asphalt as RGB), V(PAL.dust as RGB), 0.45), jC)
  const crossDust = smoothstep(0.2, 0.7, mx_noise_float(vec3(sA.mul(0.4), 3.3, tA.mul(0.15))).add(0.5)).mul(0.35)
  return (base: N): N => {
    let c: N = mix(base, earth, inside)
    c = mix(c, dust, before)
    c = mix(c, mix(crossCol, V(PAL.dust as RGB).mul(1.1), crossDust), inCross)
    return mix(c, base, uView)
  }
}
