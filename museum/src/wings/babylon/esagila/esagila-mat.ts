/* STOP 9'S MATERIAL (TSL), on the gate's kit (its bond, filtered lines, hash and colours): one material for every body
   of the stop, branching on the body's `kind` attribute and the face's own data, never on screen derivatives.
     0 Esagila's walls     whitish lime-gypsum plaster, matte, slightly warm, guessed: coats of different age, faint runs
                           under the tops, dust thrown up at the foot; on the annex the grooved towers as a rhythm only
     1 the casing          small unstamped baked brick on the kit's bond, its joints dark; dust and splash at its foot
     2 the street          6.4 m of brick under an asphalt coat on the map street's middle, the coat worn to the brick
                           where feet and wheels went; the shoulders trodden dust
     3 the open ground     trodden earth; `esagilaGroundPaint` gives the map's ground round it the same earth
     4 the ramp            brick in asphalt on its slope and landing, the cheeks in the bond
     5 the door            cedar boards, dark, two bands across
     6 the wall before Gate 8   mud plaster over mud brick
   Every line is box-filtered over one device pixel's footprint on the surface, so the jittered sub-frames agree. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { BR, PAL, bond, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, greyNode, uView, type ClassTones } from '../map/mass'
import type { Face } from './esagila-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, clamp, dot, float, floor, fract, max, min, mix, mx_noise_float, normalize, positionWorld, smoothstep, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uEsagilaPix = uniform(0.0003)
export function setEsagilaPixel(vfovDeg: number, heightPx: number): void {
  uEsagilaPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

const U = { uPix: uEsagilaPix }
/** a band [a, b) of x with soft edges as wide as the footprint */
const bandF = (x: N, a: N | number, b: N | number, w: N): N => smoothstep(float(a).sub(w.mul(0.5)), float(a).add(w.mul(0.5)), x).mul(float(1).sub(smoothstep(float(b).sub(w.mul(0.5)), float(b).add(w.mul(0.5)), x)))
/** fades a detail out once a pixel's footprint passes its size */
const seen = (fw: N, size: number): N => float(1).sub(smoothstep(size * 0.25, size, fw))

/** the open ground's earth at a point of the ground, for the stop's sheet and the map ground's paint alike: trodden
    earth, lighter where feet went most, darker in broad loose patches, a few worn tracks (none to the gate) */
function earthAt(F: Face, ep: J, fw: N): N {
  const P = positionWorld
  const col = ep.colours
  const broad = mx_noise_float(vec3(P.x.mul(0.03), 2.1, P.z.mul(0.03)))
  const patch = mx_noise_float(vec3(P.x.mul(0.22), 5.3, P.z.mul(0.22))).mul(seen(fw, 1.5))
  const grit = mx_noise_float(vec3(P.x.mul(3.1), 8.8, P.z.mul(3.1))).mul(seen(fw, 0.12))
  const wide = mx_noise_float(vec3(P.x.mul(0.012), 7.4, P.z.mul(0.012)))
  const earth = V(col.earth).mul(float(1).add(wide.mul(0.08)).add(broad.mul(0.12)).add(patch.mul(0.08)).add(grit.mul(0.06)))
  const trod = smoothstep(0.05, 0.5, mx_noise_float(vec3(P.x.mul(0.05), 9.1, P.z.mul(0.08))))
  const loose = smoothstep(0.15, 0.55, mx_noise_float(vec3(P.x.mul(0.02), 3.9, P.z.mul(0.035))))
  let c: N = mix(earth, V(PAL.dust as RGB).mul(1.2), trod.mul(0.4))
  c = mix(c, earth.mul(vec3(0.8, 0.77, 0.74)), loose.mul(0.45))
  const gs = P.x.sub(F.o[0]).mul(F.a[0]).add(P.z.sub(F.o[1]).mul(F.a[1])), gt = P.x.sub(F.o[0]).mul(F.n[0]).add(P.z.sub(F.o[1]).mul(F.n[1]))
  const wob = mx_noise_float(vec3(gs.mul(0.03), 1.3, 0)).mul(3.0).add(mx_noise_float(vec3(gs.mul(0.11), 6.2, 0)).mul(0.6))
  const track = (d: N, half: number): N => float(1).sub(smoothstep(half * 0.4, half, abs(d))).mul(smoothstep(0.2, 0.6, mx_noise_float(vec3(gs.mul(0.08), gt.mul(0.08), 3.4)).add(0.6)))
  const TR = ep.ground.tracks
  let tracks: N = max(track(gt.sub(TR.along[0]).sub(wob), TR.half), track(gt.sub(TR.along[1]).add(wob.mul(0.7)), TR.half * 0.8))
  const sl = TR.slant
  const sd = gs.sub(sl[0]).mul(sl[3] - sl[1]).sub(gt.sub(sl[1]).mul(sl[2] - sl[0])).div(Math.hypot(sl[2] - sl[0], sl[3] - sl[1]))
  tracks = max(tracks, track(sd.add(wob.mul(0.5)), TR.half * 0.9))
  return mix(c, V(PAL.dust as RGB).mul(1.22).mul(float(1).add(grit.mul(0.04))), tracks.mul(ep.ground.tracks.share))
}

/** the map ground's colour on the open ground before Esagila: the stop's earth from the street's edge to the fronts and
    round the sheet's ends, fading to the map's grey over the paint's fade; the class view keeps the grey */
export function esagilaGroundPaint(F: Face, ep: J, mapPlan: J): (base: N) => N {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const pts = mapPlan.street.points
  const A = pts[ep.street.to - 1].at, B = pts[ep.street.to].at
  // the street's centre in scene z along x, on its last leg; its paved half width
  const ax = A[0] - E0, az = N0 - A[1], bx = B[0] - E0, bz = N0 - B[1]
  const P = positionWorld
  const zc = float(az).add(P.x.sub(ax).mul((bz - az) / (bx - ax)))
  const PG = ep.ground.paint
  const fade: number = PG.fade
  const x0 = ep.ground.from - E0 - PG.beyond, x1 = ep.ground.to - E0 + PG.beyond
  const zS = N0 - PG.south
  const w = smoothstep(x0 - fade, x0, P.x).mul(float(1).sub(smoothstep(x1, x1 + fade, P.x)))
    .mul(smoothstep(zc.add(PG.fromStreet - 1), zc.add(PG.fromStreet), P.z)).mul(float(1).sub(smoothstep(zS, zS + fade, P.z)))
  const fw = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0))
  const earth = earthAt(F, ep, fw)
  return (base: N): N => mix(mix(base, earth, w), base, uView)
}

export function esagilaMaterial(F: Face, ep: J, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  // the meshes stand untransformed, so the geometry's normal is the world's
  const n = normalize(attribute('normal', 'vec3'))
  const kind = attribute('kind', 'float')
  const fa = attribute('fa', 'vec4')
  const is = (k: number): N => step(abs(kind.sub(k)), 0.5)
  const vertical = step(abs(n.y), 0.5)
  const upward = step(0.5, n.y)
  const col = ep.colours
  // along a vertical face: its horizontal tangent
  const tan = normalize(vec3(n.z.negate(), 0, n.x).add(vec3(1e-5, 0, 0)))
  const uFace = dot(P, tan)
  const fu = footprint(U, tan, n), fy = footprint(U, vec3(0, 1, 0), n)
  const fw = max(fu, fy)
  const fS = footprint(U, vec3(0, 0, 1), vec3(0, 1, 0)), fT = footprint(U, vec3(1, 0, 0), vec3(0, 1, 0))
  const fFlat = max(fS, fT)

  /* ── 0 the walls: whitish plaster ── */
  const yTop = fa.x, yFoot = fa.y, pitch = fa.z
  const coat = mx_noise_float(vec3(uFace.mul(0.07), P.y.mul(0.09), 3.7))
  const mottle = mx_noise_float(vec3(uFace.mul(0.6), P.y.mul(0.6), 1.3)).mul(seen(fw, 0.5))
  const trowel = mx_noise_float(vec3(uFace.mul(4.5), P.y.mul(3.0), 7.7)).mul(seen(fw, 0.06))
  let plaster: N = V(col.plaster).mul(float(1).add(coat.mul(0.07)).add(mottle.mul(0.035)).add(trowel.mul(0.03)))
  plaster = plaster.mul(mix(vec3(1.02, 1.0, 0.96), vec3(0.97, 0.99, 1.02), smoothstep(-0.2, 0.3, coat)))
  // runs from the tops: faint greyer streaks fading downward from each body's coping
  const below = yTop.sub(P.y)
  const runs = smoothstep(0.1, 0.45, mx_noise_float(vec3(uFace.mul(2.2), P.y.mul(0.12), 5.1))).mul(float(1).sub(smoothstep(0.3, 3.0, below))).mul(step(0, yTop)).mul(seen(fw, 0.4))
  plaster = mix(plaster, plaster.mul(vec3(0.86, 0.85, 0.84)), runs.mul(0.45))
  // longer, fainter washes down the whole height, and patches of a newer, whiter coat over an older, warmer one
  const washes = smoothstep(0.15, 0.55, mx_noise_float(vec3(uFace.mul(0.9), P.y.mul(0.035), 2.6))).mul(seen(fw, 0.8))
  plaster = mix(plaster, plaster.mul(vec3(0.9, 0.89, 0.87)), washes.mul(0.35).mul(step(0, yTop)))
  const renew = smoothstep(0.05, 0.25, mx_noise_float(vec3(uFace.mul(0.04), P.y.mul(0.05), 9.9)))
  plaster = mix(plaster.mul(vec3(0.97, 0.94, 0.89)), plaster.mul(vec3(1.03, 1.03, 1.02)), renew)
  // the coping: the top edge's last half metre a little darker, where rain sits longest
  plaster = mix(plaster, plaster.mul(0.9), float(1).sub(smoothstep(0.15, 0.5, below)).mul(step(0, yTop)).mul(vertical))
  // the foot: dust thrown up against the coat, browner toward the ground or the casing's ledge; splash wore it
  const yUp = P.y.sub(yFoot)
  const edgeN = mx_noise_float(vec3(uFace.mul(0.35), 0, 2.2)).mul(0.2)
  const splash = float(1).sub(smoothstep(float(0.25).add(edgeN), float(0.4).add(edgeN), yUp))
  const mb = bond(uFace, P.y, float(0), fu, fy, 0.006)
  const mud = mix(V(col.mud).mul(float(1).add(mb.brick.sub(0.5).mul(0.12).mul(seen(fw, 0.3)))), V(col.mud).mul(0.72), max(mb.bed, mb.head).mul(0.6))
  let wallCol: N = mix(plaster, mud, splash.mul(0.75))
  wallCol = mix(wallCol, wallCol.mul(vec3(0.9, 0.84, 0.76)), float(1).sub(smoothstep(0.2, 1.6, yUp)).mul(0.45))
  // the annex's grooved towers as a rhythm in its coat: a pair of shallow grooves on each tower
  const pp = max(pitch, 0.01)
  const ph = fract(uFace.div(pp)).sub(0.5).mul(pp)
  const grooves = max(bandF(ph, -1.1, -0.7, fu), bandF(ph, 0.7, 1.1, fu)).mul(step(0.5, pitch)).mul(vertical)
  const towerTone = bandF(ph, -2.2, 2.2, fu).mul(step(0.5, pitch)).mul(vertical)
  wallCol = wallCol.mul(float(1).sub(grooves.mul(0.16))).mul(float(1).add(towerTone.mul(0.025)))
  // the tops: an earth roof over a plaster coping
  const roofCol = V(col.earth).mul(float(0.92).add(mx_noise_float(P.mul(0.2)).mul(0.08)))
  wallCol = mix(wallCol, roofCol, upward)

  /* ── 1 the casing: small baked brick, dark joints ── */
  const cb = bond(uFace, P.y, float(0), fu, fy, 0.007)
  const batch = mx_noise_float(vec3(uFace.mul(0.05), P.y.mul(0.8), 6.6))
  const fire = cb.brick.sub(0.5).mul(0.16).mul(seen(fw, 0.4))
  const courses = mx_noise_float(vec3(uFace.mul(0.012), P.y.mul(0.55), 2.9)).add(mx_noise_float(vec3(uFace.mul(0.03), P.y.mul(1.7), 8.1)).mul(0.5))
  const brickTone = mix(V(col.brick), V(PAL.redBrown as RGB), clamp(float(0.15).add(batch.mul(0.2)).add(fire), 0, 0.6))
    .mul(float(1).add(batch.mul(0.04)).add(courses.mul(0.06)))
  const cJoint = clamp(cb.bed.add(cb.head), 0, 1)
  let caseCol: N = mix(brickTone, V(PAL.asphalt as RGB).mul(2.4), cJoint.mul(0.7))
  const cUp = P.y.sub(yFoot)
  caseCol = mix(caseCol, caseCol.mul(vec3(0.88, 0.82, 0.74)).add(V(PAL.dust as RGB).mul(0.12)), float(1).sub(smoothstep(0.1, 1.4, cUp)).mul(0.55))
  // the ledge: brick laid flat, dust lying on it
  const flatB = max(lines(P.x, BR, 0.008, fFlat), lines(P.z, BR, 0.008, fFlat))
  const ledge = mix(mix(V(col.brick), V(PAL.dust as RGB), 0.55), V(PAL.asphalt as RGB).mul(2.2), flatB.mul(0.5))
  caseCol = mix(caseCol, ledge, upward)

  /* ── 2 the street: brick under an asphalt coat on the middle 6.4 m, the coat worn through on the walked way ── */
  const s = fa.x, t = fa.y, w = fa.z, lip = step(0.5, fa.w)
  const margin = w.sub(ep.street.paved).mul(0.5)
  const tt = t.sub(margin)
  const inPave = bandF(tt, 0, ep.street.paved, fT)
  const near = seen(fFlat, 0.05)
  const kk = floor(s.div(BR))
  const tB = tt.add(kk.sub(floor(kk.div(2)).mul(2)).mul(BR / 2))
  const jR = clamp(lines(s, BR, 0.006, fS).add(lines(tB, BR, 0.006, fT)), 0, 1)
  const hB = hash2(floor(tB.div(BR)), kk)
  const dustC = V(PAL.dust as RGB).mul(1.15)
  // the along-street noises go to their mean once a pixel spans metres of street, or the lens folds them into cross
  // bands (footprint() holds its grazing term at n.v 0.1, so far down a street it reads a few times short)
  const far = seen(fFlat, 0.15)
  const drift = mx_noise_float(vec3(s.mul(0.25), t.mul(0.25), 6.2)).mul(far)
  const sBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), clamp(float(0.3).add(drift.mul(0.25)).add(hB.sub(0.5).mul(0.3).mul(near)), 0, 1))
    .mul(float(0.8).add(hash2(kk.add(7), floor(tB.div(BR)).add(3)).mul(0.1)))
  // the joints full of asphalt and dust: dark only where the coat broke off them, never an even grid
  const jFill = clamp(mx_noise_float(vec3(s.mul(0.9), 3.3, t.mul(0.9))).mul(0.7).add(0.45), 0.15, 0.6)
  const paveBrick = mix(sBrick, mix(V(col.asphalt), dustC, 0.35), jR.mul(jFill).mul(near))
  // the bricks lie in asphalt; a thin coat of it, dusty, over them, worn through on the walked middle first
  const coatC = mix(V(col.asphalt), dustC, 0.45).mul(float(1).add(mx_noise_float(vec3(s.mul(1.3), 1.7, t.mul(1.3))).mul(0.1)))
  const mid = abs(tt.sub(float(ep.street.paved / 2)).add(mx_noise_float(vec3(s.mul(0.04), 2.2, 0)).mul(0.6)))
  const wornN = mx_noise_float(vec3(s.mul(0.35), 4.2, t.mul(0.5))).mul(0.35).add(mx_noise_float(vec3(s.mul(1.6), 5.9, t.mul(1.6))).mul(0.12)).mul(far)
  const patch = mix(float(0.5), smoothstep(-0.15, 0.25, mx_noise_float(vec3(s.mul(0.22), 8.1, t.mul(0.4)))), far)
  const cover = clamp(smoothstep(1.0, 3.0, mid).mul(0.8).add(wornN).add(patch.mul(0.4)).add(0.18), 0, 0.85)
  const thin = float(1).sub(cover)
  let paveCol: N = mix(paveBrick, coatC, cover)
  const sDrift = mix(float(0.5), smoothstep(0.25, 0.75, mx_noise_float(vec3(s.mul(0.3), t.mul(0.3), 1.9)).add(0.5)), far)
  const toEdge = float(1).sub(smoothstep(0.3, 1.5, min(tt, float(ep.street.paved).sub(tt))))
  // a film of dust over the whole street between rains, thicker toward the edges
  const sDust = clamp(sDrift.mul(0.2).add(toEdge.mul(0.35)).add(0.15), 0, 0.7)
  paveCol = mix(paveCol, dustC, sDust.mul(inPave))
  const shoulder = float(1).sub(inPave)
  let streetCol: N = mix(paveCol, dustC.mul(float(0.92).add(mx_noise_float(vec3(s.mul(0.8), t.mul(0.8), 4.4)).mul(0.1))), shoulder)
  streetCol = mix(streetCol, dustC.mul(0.8), lip)

  /* ── 3 the open ground: trodden earth (the map's ground under and round it is painted the same) ── */
  const groundCol = earthAt(F, ep, fFlat)

  /* ── 4 the ramp: brick in asphalt on its slope and landing, its cheeks in the bond ── */
  const ra = vec2(F.a[0], F.a[1]), rn = vec2(F.n[0], F.n[1])
  const ru = P.x.mul(ra.x).add(P.z.mul(ra.y)), rv = P.x.mul(rn.x).add(P.z.mul(rn.y))
  const fR = max(fS, fT)
  const rk = floor(rv.div(BR))
  const ruB = ru.add(rk.sub(floor(rk.div(2)).mul(2)).mul(BR / 2))
  const jRamp = clamp(lines(rv, BR, 0.006, fR).add(lines(ruB, BR, 0.006, fR)), 0, 1)
  const hR = hash2(floor(ruB.div(BR)), rk)
  const rBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), clamp(float(0.32).add(hR.sub(0.5).mul(0.2)), 0, 1)).mul(0.88)
  // the walked middle of the ramp, along the passage's axis
  const axis = F.at((ep.gate.passage[0] + ep.gate.passage[1]) / 2, 0)
  const rWorn = smoothstep(0.3, 1.4, float(1.75).sub(abs(ru.sub(axis[0] * F.a[0] + axis[1] * F.a[1]))))
  let rampTop: N = mix(V(col.asphalt).mul(1.1), mix(V(col.asphalt), rBrick, 0.5), rWorn.mul(float(1).sub(jRamp)))
  rampTop = mix(rampTop, dustC, float(0.25).add(mx_noise_float(vec3(ru.mul(0.7), 3.3, rv.mul(0.7))).mul(0.1)))
  const rb = bond(uFace, P.y, float(0), fu, fy, 0.007)
  const cheek = mix(brickTone, V(PAL.asphalt as RGB).mul(2.4), clamp(rb.bed.add(rb.head), 0, 1).mul(0.7))
  const rampCol = mix(cheek, rampTop, step(0.2, n.y))

  /* ── 5 the door: cedar boards, two bands across ── */
  const boards = lines(uFace, 0.28, 0.012, fu)
  const bandsD = max(bandF(P.y, 6.2, 6.45, fy), bandF(P.y, 9.0, 9.25, fy))
  const grain = mx_noise_float(vec3(uFace.mul(8), P.y.mul(0.4), 2.5)).mul(seen(fw, 0.05))
  let doorCol: N = V(PAL.cedar as RGB).mul(0.42).mul(float(1).add(grain.mul(0.12)).add(hash2(floor(uFace.div(0.28)), float(3)).sub(0.5).mul(0.12)))
  doorCol = mix(doorCol, doorCol.mul(0.45), boards)
  doorCol = mix(doorCol, V(PAL.bronze as RGB).mul(0.32), bandsD)

  /* ── 6 the wall before Gate 8: mud plaster over mud brick, flaking at the foot and in patches, washed from the top ── */
  const mudN = mx_noise_float(vec3(uFace.mul(0.5), P.y.mul(0.8), 4.4))
  const flakeM = smoothstep(0.42, 0.5, mx_noise_float(vec3(uFace.mul(0.45), P.y.mul(1.6), 6.1)).add(mx_noise_float(vec3(uFace.mul(2.1), P.y.mul(3.2), 2.3)).mul(0.2)))
  const mudUp = P.y.sub(fa.y)
  const wash = smoothstep(0.3, 0.6, mx_noise_float(vec3(uFace.mul(3.0), P.y.mul(0.3), 8.4))).mul(smoothstep(-0.6, 0.0, P.y.sub(fa.x)))
  let mudCol: N = V(col.mud).mul(float(1.08).add(mudN.mul(0.1)))
  mudCol = mix(mudCol, mud, max(flakeM.mul(0.8), float(1).sub(smoothstep(0.2, 0.55, mudUp.sub(0.3)))).mul(seen(fw, 0.4).mul(0.5).add(0.5)))
  mudCol = mix(mudCol, mudCol.mul(0.84), wash.mul(0.5))
  mudCol = mix(mudCol, V(col.earth).mul(float(0.95).add(mx_noise_float(P.mul(1.3)).mul(0.08))), upward)

  /* ── one colour per point, the class view over it ── */
  let stateCol: N = greyNode(0.42)
  stateCol = mix(stateCol, wallCol, is(0))
  stateCol = mix(stateCol, caseCol, is(1))
  stateCol = mix(stateCol, streetCol, is(2))
  stateCol = mix(stateCol, groundCol, is(3))
  stateCol = mix(stateCol, rampCol, is(4))
  stateCol = mix(stateCol, doorCol, is(5))
  stateCol = mix(stateCol, mudCol, is(6))
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // asphalt keeps a dull sheen where its coat is whole; plaster, brick and earth are matte
  const coated = is(2).mul(inPave).mul(float(1).sub(thin.mul(0.7))).mul(float(1).sub(sDust)).add(is(4).mul(upward).mul(float(1).sub(rWorn.mul(0.6))).mul(0.6))
  m.roughnessNode = mix(mix(float(0.93), float(0.55), clamp(coated, 0, 1)), float(0.92), uView)
  // the light the stack does not carry: the casing's foot, the walls' foot on the ledge
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.9, P.y.sub(yFoot))).mul(0.25))
  let ao: N = float(1)
  ao = mix(ao, footAO, max(is(0), is(1)).mul(vertical))
  m.aoNode = mix(ao, float(1), uView)
  return m
}
