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
import { PAL, footprint, hash2, lines } from '../gate/gate-mat'
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
  let wallCol: N = mix(coat, mud.mul(float(0.95).add(mid.mul(0.1))), max(worn.mul(0.6), flake.mul(0.7)))
  wallCol = wallCol.mul(float(1).sub(runs))

  /* ── the door reveals and soffits: the wash rubbed darker toward the arrises, mud low down ── */
  const revealCol = mix(coat.mul(0.9), mud, max(worn, float(0.25).mul(smoothstep(0.2, 0.6, mid.add(0.5)))))

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
  // the other rooms: beaten earth, mottled, trodden darker and smoother from the door inward
  const earthN = mx_noise_float(vec3(u.mul(1.3), 2.1, v.mul(1.3))).mul(0.08).add(mx_noise_float(vec3(u.mul(7), 5.3, v.mul(7))).mul(0.04).mul(float(1).sub(smoothstep(0.004, 0.02, fAlong))))
  const earth = V(TONES.mud as RGB).mul(float(0.86).add(earthN).add(big.mul(0.06)))
  const floorCol = mix(mix(earth, brick4, inR4), V(PAL.asphalt as RGB).mul(3), inR7)

  /* ── House VI's court: the lower paving's 40 cm bricks ── */
  const ct = hp.courts[0]
  const dr = (id: string): J => hp.doors.find((d: J) => d.id === id)
  const d4 = dr('room-4')
  const cx = (r: J): number => (r.u[0] + r.u[1]) / 2, cz = (r: J): number => (r.v[0] + r.v[1]) / 2
  const inDoorX = step(d4.u[0], u).mul(step(u, d4.u[1]))
  const pv = pavingBrickCourt({
    p: vec3(u, P.y, v), U, ax, az, brick: PAVING.house.brick,
    court: { x0: ct.u[0], x1: ct.u[1], z0: ct.v[0], z1: ct.v[1] }, front: ct.v[1],
    doors: [{ c: cx(d4), x0: d4.u[0], x1: d4.u[1], r: (d4.u[1] - d4.u[0]) / 2 }],
    way: { x: ct.u[1], z: cz(dr('room-1-court')) }, inDoorX, joint: PAVING.house.joint,
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
  const knots = smoothstep(0.8, 0.86, mx_noise_float(vec3(wl.x.mul(9), wl.y.mul(16), 8.8)).add(0.5))
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
  const sillCol = mix(sillBrick, V(PAL.dust as RGB).mul(0.8), sJoint.mul(0.75))
  // the pivot stones: pale limestone, the cup round the pole dark and smooth
  const cup = float(1).sub(smoothstep(0.045, 0.075, length(wl))).mul(step(0.5, n.y))
  const stoneCol = mix(V(TONES.lime as RGB).mul(float(0.82).add(mid.mul(0.1))), V(TONES.damp as RGB), cup.mul(0.7))
  // the roof's edge: mud plaster, washed less often than the wall under it, its underside darker
  const edgeCol = mix(wallCol, mud.mul(float(0.95).add(mid.mul(0.1))), 0.3).mul(select(n.y.lessThan(-0.5), float(0.8), float(1)))

  /* ── one colour per point, the class view over it ── */
  let c: N = wallCol
  c = mix(c, revealCol, is(Z.reveal))
  c = mix(c, roomCol, is(Z.room))
  c = mix(c, floorCol, is(Z.floor))
  // the paving's baked brick a little yellower and greyer than the court part's preset: a house court's floor under dust
  const pvL = pv.colour.dot(vec3(0.2126, 0.7152, 0.0722))
  // each brick its own firing a little lighter or darker, drifting over the court
  const kzP = floor(v.div(PAVING.house.brick)), kxP = floor(u.add(kzP.sub(floor(kzP.div(2)).mul(2)).mul(PAVING.house.brick / 2)).div(PAVING.house.brick))
  const brickTone = float(0.92).add(hash2(kxP.add(3.3), kzP.add(1.7)).mul(0.16)).add(mx_noise_float(vec3(u.mul(0.6), 3.7, v.mul(0.6))).mul(0.08))
  c = mix(c, mix(pv.colour, vec3(pvL).mul(vec3(1.12, 1.0, 0.78)), 0.3).mul(brickTone), is(Z.paving))
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
  const inRoomAny = max(max(is(Z.room), is(Z.floor)), inRooms.mul(float(1).sub(is(Z.sill))))
  ao = mix(ao, roomAO, inRoomAny)
  ao = mix(ao, pavingAO, is(Z.paving))
  // the court's parts see the court's sky as its walls do; the sills as its floor near a wall
  ao = mix(ao, courtWallAO, max(is(Z.wood), is(Z.edge)).mul(float(1).sub(inRooms)))
  ao = mix(ao, float(0.42), is(Z.sill))
  ao = mix(ao, float(0.72), is(Z.courtFloor))
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
  // a floor near a door sees the court's floor and sky through it, lower than the door's middle: half as much again
  const roomLight = uHouseSun.mul(vec3(1.0, 0.9, 0.76)).mul(inLight).mul(uHouseIn).mul(inRoomAny).mul(mix(float(1), float(1.5), step(0.5, n.y)))
  m.emissiveNode = c.mul(bounce.mul(bounceZ).add(roomLight)).mul(float(1).sub(uView))
  // no sun reaches inside the rooms or under a door's head; the shadow map's contact edges leaked it, and leaked it onto
  // the jambs of the doors round House VI's court, which lie in the court's shade at the stop's low sun
  const indoors = max(max(inRoomAny, is(Z.leaf)), is(Z.reveal).mul(max(step(n.y, -0.5), inCourt6)))
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors))
  return m
}
