/* THE HOUSE STOP'S MATERIAL (TSL): one material for every body of the house stop, branching on each face's zone (what it looks
   into, written by house-geom.ts) and its place in its house's own frame (`loc`), never on screen derivatives.
     street and court walls   mud plaster under a white gypsum wash, the wash worn at the foot and at the arrises where
                              the mud shows, a slow drift of older and newer coats, faint runs from the parapets
     door reveals and soffits the wash, worn darker by hands and shoulders
     inside the rooms         the wash (part plaster-wash-babylon), lit only through the doors, warm from the court
     the room floors          Room 4's 40 cm baked brick, the other rooms' beaten earth, Room 7's asphalt
     the court's construction the roof's edge in mud plaster, the caps in the roof's earth, lintels, leaves and a
                              ladder of weathered poplar, baked-brick sills, limestone pivot stones
     House VI's court         the 40 cm baked-brick paving (part paving-brick-court-babylon)
     the roofs                earth over the beams behind mud parapets (part roof-earth-throneroom-babylon)
     the other courts         plain baked brick with dust
     the lanes                trodden dust
   Every colour is ours (TONES, house-plan.json colours). The stack carries no bounce and no sky occlusion in a court:
   the light inside the rooms, the court's hidden sky and the contact shade at the walls' feet are modelled here. */

import { MeshStandardNodeMaterial, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { PAL, band, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, uView, type ClassTones } from '../map/mass'
import { TONES } from '../open/earth'
import { PRESETS as PAVING, pavingBrickCourt } from '../parts/paving-brick-court-babylon'
import { PRESETS as WASH, plasterWash } from '../parts/plaster-wash-babylon'
import { PRESETS as ROOF, roofEarth } from '../parts/roof-earth-throneroom-babylon'
import { Z } from './house-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, clamp, exp, float, floor, fract, length, max, min, mix, mx_noise_float, positionWorld, select, smoothstep, sqrt, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uHousePix = uniform(0.0003)
/** the page's sun as irradiance (colour times intensity), read before each draw: the court's bounce follows it */
export const uHouseSun = uniform(new Vector3(0, 0, 0))
/** the share of the court's light a room's door passes in */
export const uHouseIn = uniform(0.42)
/** toward the page's sun (world, unit), read before each draw: House VI's court draws its own walls' shade */
export const uHouseSunDir = uniform(new Vector3(0, 1, 0))
export function setHousePixel(vfovDeg: number, heightPx: number): void {
  uHousePix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

/** House VI's plan as the shader needs it: its frame's axes, the court, the doors' centres in the frame, Room 7 */
export interface HouseShade { a: [number, number]; c: [number, number]; hp: J }

export function houseMaterial(S: HouseShade, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0 })
  const P = positionWorld
  const n = attribute('normal', 'vec3')
  const zone = attribute('zone', 'float')
  const loc = attribute('loc', 'vec4')
  // the floor of the body a face belongs to, and 1 on House VI's own bodies
  const fl = attribute('fl', 'float'), six = attribute('six', 'float')
  const U = { uPix: uHousePix }
  const hp = S.hp, col = hp.colours, L = hp.levels
  const is = (z: number): N => step(abs(zone.sub(z)), 0.5)
  const ax = vec3(S.a[0], 0, S.a[1]), az = vec3(S.c[0], 0, S.c[1])
  const u = loc.x, v = loc.y
  const yF = P.y.sub(fl)
  // along the face: u on faces that look along v, v on faces that look along u (the frame's axes in the world)
  const nU = abs(n.x.mul(S.a[0]).add(n.z.mul(S.a[1])))
  const along = select(nU.greaterThan(0.5), v, u)
  const fAlong = footprint(U, select(nU.greaterThan(0.5), az, ax), n), fUp = footprint(U, vec3(0, 1, 0), n)
  const fw = max(fAlong, fUp)
  const seenAt = (f: N, size: number): N => float(1).sub(smoothstep(size * 0.25, size, f))

  /* ── the walls: a white gypsum wash over mud plaster ── */
  const wash = V(TONES.plaster as RGB), mud = V(TONES.mud as RGB)
  const big = mx_noise_float(vec3(along.mul(0.35), P.y.mul(0.5), u.add(v).mul(0.21)))
  const mid = mx_noise_float(vec3(along.mul(1.7), P.y.mul(2.1), 3.3))
  const fine = mx_noise_float(vec3(along.mul(9), P.y.mul(9), 7.7)).mul(float(1).sub(smoothstep(0.004, 0.02, fw)))
  // older coats greyer, newer whiter, over metres; the trowel's work at a hand's scale
  const coat = wash.mul(float(0.94).add(big.mul(0.08)).add(mid.mul(0.035)).add(fine.mul(0.03)))
  // the wash wears off where rain splashes and feet and carts brush: up to about half a metre on the streets, lower in
  // a court; its edge ragged at a hand's scale
  const outer = is(Z.outer).add(is(Z.terrace))
  const splashH = mix(float(0.14), float(0.45), outer).add(mid.mul(0.1)).add(mx_noise_float(vec3(along.mul(4.3), 2.9, 5.1)).mul(0.06))
  const worn = float(1).sub(smoothstep(splashH.sub(0.025), splashH.add(0.025), yF.sub(select(outer.greaterThan(0.5), float(L.street - L.floor), float(0)).mul(six))))
  // small chips of wash gone higher up, the mud showing; more on the streets; only where a chip spans pixels
  const chipN = mx_noise_float(vec3(along.mul(6.5), P.y.mul(7.5), 9.1)).add(mx_noise_float(vec3(along.mul(19), P.y.mul(21), 2.3)).mul(0.25))
  // in patches where the wash has aged, not spread evenly over a wall
  const aged = smoothstep(0.1, 0.35, mx_noise_float(vec3(along.mul(0.45), P.y.mul(0.6), u.add(v).mul(0.3).add(4.4))))
  const flake = smoothstep(0.52, 0.58, chipN).mul(aged).mul(mix(float(0.35), float(0.8), outer)).mul(float(1).sub(smoothstep(0.006, 0.03, fw)))
  // faint runs down from the parapets' tops
  const runs = smoothstep(0.55, 0.9, mx_noise_float(vec3(along.mul(3.1), P.y.mul(0.25), 1.7)).add(0.5)).mul(smoothstep(0.5, 3.0, yF)).mul(0.07)
  /* House VI's court (its walls' faces and its doors' reveals): the damp foot placed by exposure and the runs by sites */
  const ct = hp.courts[0], Cp = hp.build.cap
  const inCt = (g: number): N => step(ct.u[0] - g, u).mul(step(u, ct.u[1] + g)).mul(step(ct.v[0] - g, v)).mul(step(v, ct.v[1] + g)).mul(six)
  const courtSix = is(Z.court).mul(inCt(0.05))
  // the faces' outlook (scene x east, z south): the court's north-facing wall is in shade all day and stays damp highest,
  // its south-facing one dries in the sun; the west-facing takes the evening sun, the east-facing the morning's
  const nN = clamp(n.z.negate(), 0, 1), nS = clamp(n.z, 0, 1), nE = clamp(n.x, 0, 1), nW = clamp(n.x.negate(), 0, 1)
  const expo = float(1).add(nN.mul(0.75)).add(nE.mul(0.25)).sub(nS.mul(0.4)).sub(nW.mul(0.12))
  const dCorner = max(min(u.sub(ct.u[0]), float(ct.u[1]).sub(u)), min(v.sub(ct.v[0]), float(ct.v[1]).sub(v)))
  // each court door's jambs on the court line, as points in the frame
  let dJamb: N = float(9)
  for (const d of hp.doors as J[]) {
    const onS = Math.abs(d.v[0] - ct.v[1]) < 1e-6, onN = Math.abs(d.v[1] - ct.v[0]) < 1e-6, onE = Math.abs(d.u[0] - ct.u[1]) < 1e-6, onW = Math.abs(d.u[1] - ct.u[0]) < 1e-6
    if (!(onS || onN || onE || onW)) continue
    const pts: Array<[number, number]> = onS || onN ? [[d.u[0], onS ? ct.v[1] : ct.v[0]], [d.u[1], onS ? ct.v[1] : ct.v[0]]] : [[onE ? ct.u[1] : ct.u[0], d.v[0]], [onE ? ct.u[1] : ct.u[0], d.v[1]]]
    for (const [pu, pv] of pts) dJamb = min(dJamb, length(vec2(u.sub(pu), v.sub(pv))))
  }
  const wav = mx_noise_float(vec3(along.mul(0.55), 4.4, u.add(v).mul(0.13)))
  // higher by a corner and beside a jamb (the threshold's splash), low on the reveals over the sill: each door breaks it
  const onReveal = is(Z.reveal).mul(inCt(1.7))
  const dampH = float(0.15).mul(expo).mul(float(1).add(float(1).sub(smoothstep(0.1, 0.7, dCorner)).mul(0.3)))
    .mul(float(1).add(float(1).sub(smoothstep(0.05, 0.45, dJamb)).mul(0.35).mul(float(1).sub(onReveal))))
    .mul(float(1).add(wav.mul(0.7))).mul(mix(float(1), float(0.3), onReveal))
    .add(mx_noise_float(vec3(along.mul(4.3), 2.9, 5.1)).mul(0.035)).add(mx_noise_float(vec3(along.mul(13), 1.3, 7.1)).mul(0.012).mul(seenAt(fw, 0.02)))
  // its top soft in one stretch (the capillary fringe), crisp with a salt line in the next
  const crisp = smoothstep(-0.15, 0.25, mx_noise_float(vec3(along.mul(0.45), 7.7, 1.3)))
  const dampE = mix(float(0.07), float(0.012), crisp).add(fUp)
  const damp6 = float(1).sub(smoothstep(dampH.sub(dampE), dampH.add(dampE.mul(0.3)), yF))
  const salt = band(yF, dampH.add(0.006), dampH.add(0.026), fUp).mul(crisp).mul(seenAt(fw, 0.03)).mul(float(1).sub(onReveal))
  const six6 = max(courtSix, onReveal)
  const wornAll = mix(worn, damp6, six6)
  // runs down from the overhangs (the drip course's underside, the cap's): one run or none per site, the sites jittered
  // along the wall at two spacings and warped, so no period shows; each run its own width, length and depth
  const downO = select(P.y.lessThan(L.ceiling + 0.01), float(L.ceiling).sub(P.y), float(L.top - Cp.drop).sub(P.y))
  const runAt = (cell: number, seed: number): N => {
    const a2 = along.add(mx_noise_float(vec3(along.mul(0.37), seed, 1.1)).mul(cell * 0.9))
    const k = floor(a2.div(cell)), f = a2.div(cell).sub(k)
    const h1 = hash2(k, float(seed)), h2 = hash2(k.add(3.7), float(seed + 1)), h3 = hash2(k.add(9.1), float(seed + 2)), h4 = hash2(k.add(5.3), float(seed + 3))
    const len = h4.mul(h4).mul(0.75).add(0.1)
    const taper = clamp(float(1).sub(downO.div(len)), 0, 1)
    const w = h3.mul(0.05).add(0.015).mul(taper.mul(0.6).add(0.4)).div(cell)
    const dx = abs(f.sub(h2.mul(0.7).add(0.15)))
    return step(h1, 0.45).mul(float(1).sub(smoothstep(w.mul(0.4), w, dx))).mul(smoothstep(0.0, 0.25, taper)).mul(step(0, downO)).mul(hash2(k.add(1.3), float(seed + 4)).mul(0.6).add(0.4))
  }
  const runs6 = max(runAt(0.57, 11), runAt(1.37, 23)).mul(0.085).mul(seenAt(fw, 0.015))
  let wallCol: N = mix(coat, mud.mul(float(0.95).add(mid.mul(0.1))), max(wornAll.mul(0.6), flake.mul(0.7)))
  wallCol = wallCol.mul(float(1).sub(mix(runs, runs6, courtSix)))
  wallCol = mix(wallCol, coat.mul(1.04), salt.mul(0.3).mul(courtSix))

  /* ── the door reveals and soffits: the wash rubbed darker toward the arrises, mud low down ── */
  const revealCol = mix(coat.mul(0.9), mud, max(wornAll, float(0.25).mul(smoothstep(0.2, 0.6, mid.add(0.5)))))

  /* ── inside the rooms and their floors ── */
  const roomCol = plasterWash(P, n, WASH.house.colour)
  const room = (id: string): J => hp.rooms.find((r: J) => r.id === id)
  const inRoom = (r: J, g = 0): N => step(r.u[0] - g, u).mul(step(u, r.u[1] + g)).mul(step(r.v[0] - g, v)).mul(step(v, r.v[1] + g)).mul(six)
  const r4 = room('room-4'), r7 = room('room-7')
  const inR7 = inRoom(r7), inR4 = inRoom(r4)
  // Room 4: the court's 40 cm baked bricks laid on into the principal room, dust settled toward its walls
  // rows along u, each row half a brick on, the joints filled with dust, not dark lines
  const kzB = floor(v.div(0.4)), offB = kzB.sub(floor(kzB.div(2)).mul(2)).mul(0.2)
  const kB = floor(u.add(offB).div(0.4)).add(kzB.mul(17.3))
  const fBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), hash2(kB, float(3.1)).mul(0.55).add(0.25)).mul(float(0.82).add(hash2(kB, float(8.3)).mul(0.24)).add(mid.mul(0.06)))
  const fJoint = max(lines(u.add(offB), 0.4, 0.016, fAlong), lines(v, 0.4, 0.016, fAlong))
  const dWall4 = min(min(u.sub(r4.u[0]), float(r4.u[1]).sub(u)), min(v.sub(r4.v[0]), float(r4.v[1]).sub(v)))
  const dust4 = float(1).sub(smoothstep(0.1, 0.9, dWall4)).mul(0.45).add(0.2).add(big.mul(0.1))
  const brick4 = mix(mix(fBrick, V(PAL.dust as RGB), clamp(dust4, 0, 1)), V(PAL.dust as RGB).mul(0.78), fJoint.mul(0.8))
  // the other rooms: beaten earth, mottled in patches, its clay's grain and a sparse grit of mixed size, trodden darker
  // and smoother from the court door inward, hairline cracks where nobody walks
  // a grazing look stretches a pixel along the view: details fade by the mean of the two footprints, and the ones that
  // carry the earth (patches, trodden smooth, stones, cracks) are a few centimetres or more
  const fFl = sqrt(fAlong.mul(footprint(U, az, n))), nearFl = float(1).sub(smoothstep(0.003, 0.012, fFl)), midFl = float(1).sub(smoothstep(0.01, 0.04, fFl))
  let dCourtDoor: N = float(99)
  for (const id of ['room-4', 'room-3', 'room-8', 'room-1-court', 'room-10-court']) {
    const d = hp.doors.find((x: J) => x.id === id)
    dCourtDoor = min(dCourtDoor, length(vec2(u.sub((d.u[0] + d.u[1]) / 2), v.sub((d.v[0] + d.v[1]) / 2))))
  }
  const trod = exp(dCourtDoor.div(1.6).mul(dCourtDoor.div(1.6)).negate())
  const ePatch = mx_noise_float(vec3(u.mul(0.9), 3.3, v.mul(0.9))).mul(0.16).add(mx_noise_float(vec3(u.mul(2.6), 2.1, v.mul(2.6))).mul(0.12))
  const eMid = mx_noise_float(vec3(u.mul(7.5), 5.9, v.mul(7.5))).mul(0.14).add(mx_noise_float(vec3(u.mul(15), 0.7, v.mul(15))).mul(0.1)).mul(midFl).mul(float(1).sub(trod.mul(0.5)))
  const eGrain = mx_noise_float(vec3(u.mul(31), 1.7, v.mul(31))).mul(0.12).mul(nearFl)
  // stones and crumbs of two to four centimetres, sparse
  const eGrit = smoothstep(0.34, 0.4, mx_noise_float(vec3(u.mul(19), 8.1, v.mul(19)))).mul(0.22).sub(smoothstep(0.35, 0.41, mx_noise_float(vec3(u.mul(13), 2.6, v.mul(13)))).mul(0.18)).mul(midFl).mul(float(1).sub(trod.mul(0.7)))
  const eCrack = float(1).sub(smoothstep(0.006, fFl.mul(1.5).add(0.014), abs(mx_noise_float(vec3(u.mul(2.4), 6.6, v.mul(2.4)))))).mul(midFl).mul(float(1).sub(smoothstep(0.1, 0.5, trod)))
  const earth = mix(V(TONES.mud as RGB), V(PAL.dust as RGB), clamp(ePatch.add(0.3), 0, 1).mul(0.5)).mul(float(0.85).add(ePatch).add(eMid).add(big.mul(0.04)))
    .mul(float(1).add(eGrain).add(eGrit)).mul(float(1).sub(trod.mul(0.14))).mul(float(1).sub(eCrack.mul(0.3)))
  const floorCol = mix(mix(earth, brick4, inR4), V(PAL.asphalt as RGB).mul(3), inR7)

  /* ── House VI's court: the lower paving's 40 cm bricks ── */
  const dr = (id: string): J => hp.doors.find((d: J) => d.id === id)
  const d4 = dr('room-4')
  const cx = (r: J): number => (r.u[0] + r.u[1]) / 2, cz = (r: J): number => (r.v[0] + r.v[1]) / 2
  const inDoorX = step(d4.u[0], u).mul(step(u, d4.u[1]))
  const pv = pavingBrickCourt({
    p: vec3(u, P.y, v), U, ax, az, brick: PAVING.house.brick,
    court: { x0: ct.u[0], x1: ct.u[1], z0: ct.v[0], z1: ct.v[1] }, front: ct.v[1],
    doors: [{ c: cx(d4), x0: d4.u[0], x1: d4.u[1], r: (d4.u[1] - d4.u[0]) / 2 }],
    // the joints fuller of bitumen than the preset: a dust-filled joint between the arrises' shade read as two lines
    way: { x: ct.u[1], z: cz(dr('room-1-court')) }, inDoorX, joint: { cover: 0.62, dust: 0.4 },
    more: [
      { x: ct.u[1], z: cz(dr('room-10-court')), r: 2.2 },
      { x: ct.u[0], z: cz(dr('room-8')), r: 2.2 },
      { x: cx(dr('room-3')), z: ct.v[0], r: 2.2 },
    ],
  })

  /* ── the other courts: plain baked brick under dust ── */
  const kC = floor(u.div(0.33)).add(floor(v.div(0.33)).mul(13.7))
  const courtFloorCol = mix(mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), hash2(kC, float(7.7)).mul(0.4).add(0.2)), V(PAL.dust as RGB), float(0.45).add(big.mul(0.3)))

  /* ── the roofs: earth behind the parapets ── */
  // House VI's parapets in its frame: the street faces, the west face and its notch, the two courts
  const O = hp.outline, pt: number = O.parapet
  const lineAt = (e: number[][], t: N, i: number): N => float(e[0]![1 - i]!).add(t.sub(e[0]![i]!).mul((e[1]![1 - i]! - e[0]![1 - i]!) / (e[1]![i]! - e[0]![i]!)))
  let dPar6: N = min(min(v.sub(lineAt(O.north, u, 0)), lineAt(O.east, v, 1).sub(u)), min(lineAt(O.south, u, 0).sub(v), u.sub(O.west)))
  for (const r of hp.courts) dPar6 = min(dPar6, max(max(float(r.u[0]).sub(u), u.sub(r.u[1])), max(float(r.v[0]).sub(v), v.sub(r.v[1]))))
  const dPar = select(six.greaterThan(0.5), dPar6.sub(pt), float(9))
  const rf = roofEarth({ p: P, U, ax, az, dPar, copeU: along, tone: ROOF.house.tone, cracks: ROOF.house.cracks })
  // the houses' parapets are mud brick under mud plaster: their tops and backs in the deck's earth, a little paler
  const copeCol = rf.deck.mul(1.06)
  const backCol = rf.deck.mul(0.97)

  /* ── the lanes: trodden dust ── */
  const laneCol = V(col.lane).mul(float(0.92).add(big.mul(0.12)).add(mx_noise_float(P.mul(vec3(0.6, 1, 0.6))).mul(0.06)))

  /* ── the court's construction ── */
  const wl = vec2(loc.z, loc.w)
  // weathered poplar: grain along the pole or the board, a slow drift of grey, the boards' joints across the leaf
  const grainN = mx_noise_float(vec3(wl.x.mul(0.8), wl.y.mul(26), 1.9)).mul(0.5).add(mx_noise_float(vec3(wl.x.mul(3.0), wl.y.mul(70), 6.1)).mul(0.25))
  const woodBase = mix(vec3(0.2, 0.155, 0.11), vec3(0.27, 0.235, 0.19), smoothstep(-0.3, 0.6, big.add(0.2)))
  // checks along the grain and knots, the weathered surface's own dark
  const checks = smoothstep(0.62, 0.7, mx_noise_float(vec3(wl.x.mul(1.6), wl.y.mul(48), 3.7)).add(0.5)).mul(float(1).sub(smoothstep(0.003, 0.012, fw)))
  const knots = smoothstep(0.86, 0.9, mx_noise_float(vec3(wl.x.mul(18), wl.y.mul(30), 8.8)).add(0.5))
  const woodCol = woodBase.mul(float(0.86).add(grainN.mul(0.2))).mul(float(1).sub(checks.mul(0.45)).sub(knots.mul(0.2)))
  // a leaf: boards about 19 cm wide (its local s across them), rubbed darker where hands push it
  const board = floor(wl.x.add(9).div(0.19))
  const boardJoint = lines(wl.x.add(9), 0.19, 0.006, fAlong)
  const leafN = mx_noise_float(vec3(wl.x.mul(26), P.y.mul(0.9), board.mul(3.1))).mul(0.5).add(mx_noise_float(vec3(wl.x.mul(70), P.y.mul(3), 2.2)).mul(0.25))
  const leafCol = woodBase.mul(float(0.84).add(hash2(board, float(4.4)).mul(0.14)).add(leafN.mul(0.14))).mul(float(1).sub(boardJoint.mul(0.55)))
  // the sills: baked bricks a third of a metre, the middle worn darker and smoother by feet
  const kzS = floor(wl.y.add(3).div(0.33)), offS = kzS.sub(floor(kzS.div(2)).mul(2)).mul(0.165)
  const kS = floor(wl.x.add(offS).div(0.33)).add(kzS.mul(7.7))
  const sJoint = max(lines(wl.x.add(offS), 0.33, 0.014, fAlong), lines(wl.y.add(3), 0.33, 0.014, fAlong)).mul(step(0.5, n.y))
  // the walked middle of the opening darker and smoother, dust in the joints and at the jambs
  const sillBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), hash2(kS, float(2.7)).mul(0.5).add(0.3)).mul(float(0.64).add(hash2(kS, float(5.1)).mul(0.14)).add(mid.mul(0.06)))
  // the fired clay's grain and pits as the court's paving shows them; the faces of the course in its own shade
  const sGrain = mx_noise_float(vec3(wl.x.mul(38), wl.y.mul(38), 4.1)).mul(0.08).add(smoothstep(0.62, 0.7, mx_noise_float(vec3(wl.x.mul(90), wl.y.mul(90), 1.3)).add(0.5)).mul(-0.12)).mul(float(1).sub(smoothstep(0.002, 0.008, fw)))
  const sillTop = mix(sillBrick.mul(float(1).add(sGrain)), V(PAL.dust as RGB).mul(0.8), sJoint.mul(0.75))
  const sillCol = mix(sillTop, mix(sillBrick, vec3(sillBrick.dot(vec3(0.2126, 0.7152, 0.0722))), 0.35).mul(0.72), step(abs(n.y), 0.5))
  // the pivot stones: pale limestone, the cup round the pole dark and smooth
  const cup = float(1).sub(smoothstep(0.045, 0.075, length(wl))).mul(step(0.5, n.y))
  const stoneCol = mix(V(TONES.lime as RGB).mul(float(0.82).add(mid.mul(0.1))), V(TONES.damp as RGB), cup.mul(0.7))
  // the roof's edge: mud plaster, washed less often than the wall under it, its underside darker
  const edgeCol = mix(wallCol, mud.mul(float(0.95).add(mid.mul(0.1))), 0.3).mul(select(n.y.lessThan(-0.5), float(0.8), float(1)))

  /* ── one colour per point, the class view over it ── */
  /* ── the plaster lapped over each end pole of a court door's lintel, past the jambs ── */
  // found by place: the one court face off its wall's plane, beside a door's head; 0 on the plain face, 1 on the lap's
  // crown, feathered to its edges where it meets the face
  const LTe = hp.build.lintel, poleFoot = L.doorHead - 0.02, lapTo = LTe.enter * 1.2 + LTe.lap
  let lapM: N = float(0)
  for (const d of hp.doors as J[]) {
    const onS = Math.abs(d.v[0] - ct.v[1]) < 1e-6, onN = Math.abs(d.v[1] - ct.v[0]) < 1e-6, onE = Math.abs(d.u[0] - ct.u[1]) < 1e-6, onW = Math.abs(d.u[1] - ct.u[0]) < 1e-6
    if (!(onS || onN || onE || onW)) continue
    const alongU = onS || onN
    const sC = alongU ? u : v, tC = alongU ? v : u
    const line = onS ? ct.v[1] : onN ? ct.v[0] : onE ? ct.u[1] : ct.u[0]
    const past = max(float(alongU ? d.u[0] : d.v[0]).sub(sC), sC.sub(alongU ? d.u[1] : d.v[1]))
    const beside = step(0, past).mul(step(past, lapTo + 0.01)).mul(step(poleFoot - 0.01, P.y)).mul(step(P.y, poleFoot + LTe.d * 1.25))
    const off = abs(tC.sub(line))
    lapM = max(lapM, beside.mul(smoothstep(0.0002, 0.004, off)).mul(step(off, LTe.proud + 0.01)))
  }
  lapM = lapM.mul(courtSix)
  // mud daub, not the wash; darkest where it leaves the pole (the lap's own f, 0 at the pole), in the crevice it packs
  const lapCrev = lapM.mul(float(1).sub(smoothstep(0.0, 1.0, loc.z)))
  const daub = mix(mud.mul(float(0.66).add(mid.mul(0.08))), V(TONES.damp as RGB), lapCrev.mul(0.6))

  let c: N = wallCol
  c = mix(c, revealCol, is(Z.reveal))
  c = mix(c, daub, lapM)
  c = mix(c, roomCol, is(Z.room))
  c = mix(c, floorCol, is(Z.floor))
  // the paving's baked brick a little yellower and greyer than the court part's preset: a house court's floor under dust
  const pvL = pv.colour.dot(vec3(0.2126, 0.7152, 0.0722))
  // each brick its own firing a little lighter or darker, drifting over the court
  const kzP = floor(v.div(PAVING.house.brick)), kxP = floor(u.add(kzP.sub(floor(kzP.div(2)).mul(2)).mul(PAVING.house.brick / 2)).div(PAVING.house.brick))
  const brickTone = float(0.92).add(hash2(kxP.add(3.3), kzP.add(1.7)).mul(0.16)).add(mx_noise_float(vec3(u.mul(0.6), 3.7, v.mul(0.6))).mul(0.08))
  // the part's pits on every brick read as one stamp near: on about half the bricks they are worn smooth again; a
  // hand-sized blotch of stain or of paler wear on some, so no two bricks near the eye repeat
  const fPv = max(fAlong, footprint(U, az, n)), pvNear = float(1).sub(smoothstep(0.012, 0.05, fPv))
  const pits = smoothstep(0.32, 0.5, mx_noise_float(vec3(u, P.y, v).mul(vec3(70, 5, 70)))).mul(0.22).mul(pvNear)
  const kP = kxP.add(kzP.mul(31.7))
  const smooth = smoothstep(0.35, 0.75, hash2(kP, float(6.2))).mul(0.85)
  const blot = smoothstep(0.1, 0.35, mx_noise_float(vec3(u.mul(6.5), 2.2, v.mul(6.5)).add(hash2(kP, float(1.9)).mul(9)))).mul(step(0.55, hash2(kP, float(4.8))))
  // the fired clay's sand, its pores and its grains of lime, a few millimetres each: the paving next to the eye, where a
  // pixel spans less than two of them and the centimetre grain above alone read soft and magnified
  const pvFine = float(1).sub(smoothstep(0.0015, 0.004, fPv)), q = vec3(u, P.y, v)
  const sand = mx_noise_float(q.mul(vec3(160, 9, 160))).mul(0.1)
  const pore = smoothstep(0.36, 0.46, mx_noise_float(q.mul(vec3(140, 7, 140)).add(vec3(3.1, 0, 7.7)))).mul(0.18)
  const limeG = smoothstep(0.42, 0.5, mx_noise_float(q.mul(vec3(110, 5, 110)).add(vec3(9.4, 0, 1.3)))).mul(0.14)
  const pvGrain = float(1).add(sand.sub(pore).add(limeG).mul(pvFine))
  const pvFace = float(1).add(pits.mul(smooth)).mul(float(1).sub(blot.mul(0.1).mul(pvNear))).mul(float(1).add(mx_noise_float(vec3(u.mul(16), 1.1, v.mul(16))).mul(0.06).mul(pvNear)))
  c = mix(c, mix(pv.colour, vec3(pvL).mul(vec3(1.12, 1.0, 0.78)), 0.3).mul(brickTone).mul(pvFace).mul(pvGrain), is(Z.paving))
  c = mix(c, courtFloorCol, is(Z.courtFloor))
  c = mix(c, rf.deck, is(Z.deck))
  c = mix(c, copeCol, is(Z.coping))
  c = mix(c, backCol, is(Z.parapetBack))
  c = mix(c, laneCol, is(Z.lanes))
  c = mix(c, woodCol, is(Z.wood))
  c = mix(c, leafCol, is(Z.leaf))
  c = mix(c, sillCol, is(Z.sill))
  c = mix(c, stoneCol, is(Z.stone))
  c = mix(c, edgeCol, is(Z.edge))
  m.colorNode = mix(c, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)

  /* ── the light the stack does not carry ── */
  // inside: only what comes through the doors, from the nearest door to the court or the street, falling off with depth
  let dDoor: N = float(99)
  for (const d of hp.doors as J[]) {
    if (!['room-4', 'room-3', 'room-8', 'room-1-court', 'room-10-court', 'street'].includes(d.id)) continue
    dDoor = min(dDoor, length(vec2(u.sub(cx(d)), v.sub(cz(d)))))
  }
  const ceil = step(n.y, -0.5)
  // the sky's cold light reaches a room only near its door; the warm court lights the rest (roomLight below)
  const roomAO = clamp(float(0.07).add(exp(dDoor.mul(dDoor).div(-3)).mul(0.25)), 0.06, 0.32).mul(select(ceil.greaterThan(0.5), float(0.75), float(1))).mul(float(1).sub(smoothstep(1.0, 2.6, yF).mul(0.25)))
  // the reveals darker deeper in the wall and under their soffits
  const revealAO = mix(float(0.78), float(0.62), ceil)
  // House VI's court hides part of its sky from its floor and its walls' feet: a long wall H high at d hides
  // (1 - d / sqrt(d^2 + H^2)) / 2
  const HW = L.top - L.floor
  const hide = (d: N): N => float(0.5).mul(float(1).sub(d.div(sqrt(d.mul(d).add(HW * HW)))))
  const hidden = hide(max(u.sub(ct.u[0]), 0.05)).add(hide(max(float(ct.u[1]).sub(u), 0.05))).add(hide(max(v.sub(ct.v[0]), 0.05))).add(hide(max(float(ct.v[1]).sub(v), 0.05)))
  const pavingAO = float(1).sub(hidden.mul(0.5)).mul(float(1).sub(float(1).sub(smoothstep(0.0, 1.0, pv.dWall)).mul(0.35)))
  // a court's walls see less sky toward their feet
  const courtWallAO = mix(float(0.7), float(1), smoothstep(0.0, HW, yF))
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.6, yF)).mul(0.25))
  let ao: N = float(1)
  ao = mix(ao, footAO, is(Z.outer))
  ao = mix(ao, courtWallAO, is(Z.court))
  ao = mix(ao, revealAO, is(Z.reveal))
  // a room's own faces, and whatever stands inside a room (a leaf, its pole, a pivot stone), by place
  let inRooms: N = float(0)
  for (const r of hp.rooms as J[]) inRooms = max(inRooms, inRoom(r, -0.01))
  // under the ceiling only: the roofs over the rooms are out in the sun
  inRooms = inRooms.mul(step(P.y, L.ceiling - 0.01))
  const inRoomAny = max(max(is(Z.room), is(Z.floor)), inRooms.mul(float(1).sub(is(Z.sill))))
  ao = mix(ao, roomAO, inRoomAny)
  ao = mix(ao, pavingAO, is(Z.paving))
  // the court's parts see the court's sky as its walls do; the sills as its floor near a wall
  ao = mix(ao, courtWallAO, max(is(Z.wood), is(Z.edge)).mul(float(1).sub(inRooms)))
  ao = mix(ao, float(0.42), is(Z.sill))
  ao = mix(ao, float(0.72), is(Z.courtFloor))
  /* contact shade the stack's occlusion does not resolve at these sizes: the ladder's feet on the paving, the lintel
     poles' bearing ends over the court walls, the sills' room-side edge on the room floors */
  let contact: N = float(1)
  const LD = hp.build.ladder
  if (LD && LD.wall === 'v') {
    const ft = LD.at - Math.sign(LD.at) * LD.foot, toWall = Math.sign(LD.at)
    for (const s0 of LD.s as number[]) {
      const du = u.sub(s0).div(0.07), dv = v.sub(ft + toWall * 0.03).div(0.11)
      contact = contact.mul(float(1).sub(exp(du.mul(du).add(dv.mul(dv)).negate()).mul(0.72).mul(is(Z.paving))))
    }
  }
  const LT = hp.build.lintel, poleLow = L.doorHead - 0.02
  for (const d of hp.doors as J[]) {
    const onS = Math.abs(d.v[0] - ct.v[1]) < 1e-6, onN = Math.abs(d.v[1] - ct.v[0]) < 1e-6, onE = Math.abs(d.u[0] - ct.u[1]) < 1e-6, onW = Math.abs(d.u[1] - ct.u[0]) < 1e-6
    if (!(onS || onN || onE || onW)) continue
    const alongU = onS || onN
    const sC = alongU ? u : v, tC = alongU ? v : u
    const line = onS ? ct.v[1] : onN ? ct.v[0] : onE ? ct.u[1] : ct.u[0]
    const s0 = alongU ? d.u[0] : d.v[0], s1 = alongU ? d.u[1] : d.v[1]
    // on the court face beside the opening, under the pole's end and the plaster lapped over it
    const past = max(float(s0).sub(sC), sC.sub(s1))
    const under = float(1).sub(smoothstep(0.0, 0.07, float(poleLow).sub(P.y))).mul(step(P.y, poleLow + 0.01))
    const reach = float(1).sub(smoothstep(LT.enter * 0.8, LT.enter + LT.lap, past)).mul(step(0, past))
    contact = contact.mul(float(1).sub(under.mul(reach).mul(0.5).mul(step(abs(tC.sub(line)), 0.03)).mul(is(Z.court))))
    // the sill's room-side edge, three centimetres onto the room's floor
    const sg = onS || onE ? 1 : -1
    const depth = alongU ? d.v[1] - d.v[0] : d.u[1] - d.u[0]
    const edge = line + sg * (depth + hp.build.sill.out)
    const into = tC.sub(edge).mul(sg)
    const sideIn = step(s0 - 0.02, sC).mul(step(sC, s1 + 0.02))
    contact = contact.mul(float(1).sub(float(1).sub(smoothstep(0.0, 0.08, into)).mul(step(0, into)).mul(sideIn).mul(0.45).mul(is(Z.floor))))
    // and its court-side edge on the paving: a 40 cm row's joint lies 5 cm off the court's north and south faces, so
    // between it and the sill's front a strip of brick a centimetre or two wide caught the light alone
    const front = line - sg * hp.build.sill.out
    const before = float(front).sub(tC).mul(sg)
    contact = contact.mul(float(1).sub(float(1).sub(smoothstep(0.0, 0.04, before)).mul(step(0, before)).mul(sideIn).mul(0.5).mul(is(Z.paving))))
  }
  // the lap over a lintel's end pole sits in the pole's crevice, deepest against the pole
  ao = ao.mul(contact).mul(float(1).sub(lapM.mul(0.32)).sub(lapCrev.mul(0.38)))
  m.aoNode = mix(ao, float(1), uView)
  m.roughnessNode = float(0.94)
  // House VI's court: the light its sunlit band and its floor throw back into the shade, which the stack does not carry;
  // warm, a share of the sun's irradiance, more toward the floor where the lit east wall is seen whole
  const inCourt6 = step(abs(u), ct.u[1] + 2.0).mul(step(abs(v), ct.v[1] + 2.0)).mul(six)
  const bounceZ = max(max(max(is(Z.court), is(Z.paving)), max(is(Z.reveal), is(Z.wood))), max(max(is(Z.sill), is(Z.edge)), is(Z.coping))).mul(inCourt6)
  const bounce = uHouseSun.mul(vec3(1.0, 0.95, 0.88)).mul(float(0.018).add(float(1).sub(smoothstep(0.0, 3.4, yF)).mul(0.012)))
  // inside the rooms: each court door an opening of the lit court; the light a point gets from it falls with distance
  // and with the angles at both ends (a small area source, A cos cos / (pi d^2 + A)), within that door's room only
  const nF = vec3(n.dot(ax), n.y, n.dot(az))
  let inLight: N = float(0)
  for (const d of hp.doors as J[]) {
    const r = (hp.rooms as J[]).find((x: J) => {
      const onV = d.u[0] >= x.u[0] - 1e-6 && d.u[1] <= x.u[1] + 1e-6 && (Math.abs(d.v[1] - x.v[0]) < 1e-6 || Math.abs(d.v[0] - x.v[1]) < 1e-6)
      const onU = d.v[0] >= x.v[0] - 1e-6 && d.v[1] <= x.v[1] + 1e-6 && (Math.abs(d.u[1] - x.u[0]) < 1e-6 || Math.abs(d.u[0] - x.u[1]) < 1e-6)
      return onV || onU
    })
    const onCourt = Math.abs(d.v[0] - ct.v[1]) < 1e-6 || Math.abs(d.v[1] - ct.v[0]) < 1e-6 || Math.abs(d.u[0] - ct.u[1]) < 1e-6 || Math.abs(d.u[1] - ct.u[0]) < 1e-6
    if (!r || !onCourt) continue
    // the door's room-side centre and its normal into the room
    const alongV = Math.abs(d.v[0] - ct.v[1]) < 1e-6 || Math.abs(d.v[1] - ct.v[0]) < 1e-6
    const sg = alongV ? (d.v[0] >= ct.v[1] - 1e-6 ? 1 : -1) : (d.u[0] >= ct.u[1] - 1e-6 ? 1 : -1)
    const du0 = alongV ? (d.u[0] + d.u[1]) / 2 : sg > 0 ? d.u[1] : d.u[0]
    const dv0 = alongV ? (sg > 0 ? d.v[1] : d.v[0]) : (d.v[0] + d.v[1]) / 2
    const nd: [number, number] = alongV ? [0, sg] : [sg, 0]
    const A = (alongV ? d.u[1] - d.u[0] : d.v[1] - d.v[0]) * (L.doorHead - L.floor)
    const wu = float(du0).sub(u), wy = float(L.floor + 1.1).sub(P.y), wv = float(dv0).sub(v)
    const d2 = wu.mul(wu).add(wy.mul(wy)).add(wv.mul(wv)).add(0.05), dl = sqrt(d2)
    const cosS = max(nF.x.mul(wu).add(nF.y.mul(wy)).add(nF.z.mul(wv)).div(dl), 0)
    const cosD = max(wu.mul(-nd[0]).add(wv.mul(-nd[1])).div(dl), 0)
    inLight = inLight.add(cosS.mul(cosD).mul(A).div(d2.mul(Math.PI).add(A)).mul(inRoom(r, 0.05)))
  }
  // a floor near a door sees the court's floor and sky through it, lower than the door's middle: seven tenths as much again
  const roomLight = uHouseSun.mul(vec3(1.0, 0.9, 0.76)).mul(inLight).mul(uHouseIn).mul(inRoomAny).mul(mix(float(1), float(1.7), step(0.5, n.y)))
  m.emissiveNode = c.mul(bounce.mul(bounceZ).add(roomLight)).mul(contact).mul(float(1).sub(uView))
  // no sun reaches inside the rooms or under a door's head; the shadow map's contact edges leaked it, and leaked it onto
  // the jambs of the doors round House VI's court, which lie in the court's shade at the stop's low sun
  const indoors = max(max(inRoomAny, is(Z.leaf)), is(Z.reveal).mul(max(step(n.y, -0.5), inCourt6)))
  // House VI's court shades itself: the sun's ray from a point leaves the court over its caps or not. The page's one
  // shadow map, fitted to the whole frame, lays a few centimetres a texel: its edge on these walls steps and its bias
  // lets the sun past a parapet's corner. Near the court's own shadow edge that edge alone; elsewhere the darker of the
  // two, so the ladder's, the figure's and the city's shadows stay. A stand-in: it goes once fitShadow in open/light.ts
  // fits a sun box tight enough for an eye-level hold
  const sd = uHouseSunDir, su = sd.dot(ax), sv = sd.dot(az)
  const cu0 = ct.u[0] + 0.04, cu1 = ct.u[1] - 0.04, cv0 = ct.v[0] + 0.04, cv1 = ct.v[1] - 0.04
  const tU = select(su.lessThan(0), float(cu0).sub(u).div(min(su, -1e-4)), float(cu1).sub(u).div(max(su, 1e-4)))
  const tV = select(sv.lessThan(0), float(cv0).sub(v).div(min(sv, -1e-4)), float(cv1).sub(v).div(max(sv, 1e-4)))
  const tEx = max(min(tU, tV), 0)
  const crown = L.top + Cp.rise, yEx = P.y.add(tEx.mul(sd.y))
  // the sun's half degree as a penumbra
  const pen = tEx.mul(0.0047).add(0.004)
  const ownSun = smoothstep(float(crown).sub(pen), float(crown).add(pen), yEx)
  const nearOwn = float(1).sub(smoothstep(0.1, 0.2, abs(yEx.sub(crown))))
  // and the thin shade each overhang lays on the face under it (the cap's lip, the drip course): the map drew these as
  // a row of dashes, a texel apart
  const lipT = sd.y.div(max(sd.dot(n), 1e-3)), Eo: number = hp.build.edge.out
  const underCap = step(P.y, L.top - Cp.drop).mul(step(L.deck - 0.01, P.y)), underDrip = step(P.y, L.ceiling)
  const capLip = float(L.top - Cp.drop).sub(P.y).sub(lipT.mul(Cp.over)), dripLip = float(L.ceiling).sub(P.y).sub(lipT.mul(Eo))
  const lipSun = float(1).sub(underCap.mul(float(1).sub(smoothstep(-0.005, 0.005, capLip)))).mul(float(1).sub(underDrip.mul(float(1).sub(smoothstep(-0.006, 0.006, dripLip)))))
  const nearLip = max(underCap.mul(float(1).sub(smoothstep(0.06, 0.12, abs(capLip)))), underDrip.mul(float(1).sub(smoothstep(0.06, 0.12, abs(dripLip))))).mul(courtSix)
  const ownAll = ownSun.mul(mix(float(1), lipSun, courtSix)), nearAll = max(nearOwn, nearLip)
  const inOwn = inCt(0.15).mul(step(P.y, crown + 0.03)).mul(float(1).sub(max(is(Z.deck), is(Z.parapetBack))))
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N =>
    mix(shadow, mix(min(shadow, ownAll), ownAll, nearAll), inOwn).mul(float(1).sub(indoors))
  return m
}
