/* THE HOUSE STOP'S MATERIAL (TSL): one material for every body of the house stop, branching on each face's zone (what it looks
   into, written by house-geom.ts) and its place in its house's own frame (`loc`), never on screen derivatives.
     street and court walls   mud plaster under a white gypsum wash, the wash worn at the foot and at the arrises where
                              the mud shows, a slow drift of older and newer coats, faint runs from the parapets
     door reveals and soffits the wash, worn darker by hands and shoulders
     inside the rooms         the wash (part plaster-wash-babylon), lit only through the doors
     the room floors          baked brick in shade; Room 7's asphalt
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
const { abs, attribute, clamp, exp, float, floor, length, max, min, mix, mx_noise_float, positionWorld, select, smoothstep, sqrt, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uHousePix = uniform(0.0003)
/** the page's sun as irradiance (colour times intensity), read before each draw: the court's bounce follows it */
export const uHouseSun = uniform(new Vector3(0, 0, 0))
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
  const loc = attribute('loc', 'vec2')
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
  const kB = floor(u.div(0.4)).add(floor(v.div(0.4)).mul(17.3))
  const fBrick = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), hash2(kB, float(3.1)).mul(0.5).add(0.25)).mul(0.85)
  const fJoint = max(lines(u, 0.4, 0.005, fAlong), lines(v, 0.4, 0.005, fAlong))
  const r7 = hp.rooms.find((r: J) => r.id === 'room-7')
  const inR7 = step(r7.u[0], u).mul(step(u, r7.u[1])).mul(step(r7.v[0], v)).mul(step(v, r7.v[1])).mul(six)
  const floorCol = mix(mix(fBrick, V(PAL.dust as RGB), 0.35).mul(float(1).sub(fJoint.mul(0.4))), V(PAL.asphalt as RGB).mul(3), inR7)

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
  c = mix(c, laneCol, is(12))
  m.colorNode = mix(c, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)

  /* ── the light the stack does not carry ── */
  // inside: only what comes through the doors, from the nearest door to the court or the street, falling off with depth
  let dDoor: N = float(99)
  for (const d of hp.doors as J[]) {
    if (!['room-4', 'room-3', 'room-8', 'room-1-court', 'room-10-court', 'street'].includes(d.id)) continue
    dDoor = min(dDoor, length(vec2(u.sub(cx(d)), v.sub(cz(d)))))
  }
  const ceil = step(n.y, -0.5)
  const roomAO = clamp(float(0.12).add(exp(dDoor.mul(dDoor).div(-5)).mul(0.35)), 0.1, 0.47).mul(select(ceil.greaterThan(0.5), float(0.75), float(1))).mul(float(1).sub(smoothstep(1.0, 2.6, yF).mul(0.25)))
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
  ao = mix(ao, roomAO, max(is(Z.room), is(Z.floor)))
  ao = mix(ao, pavingAO, is(Z.paving))
  ao = mix(ao, float(0.72), is(Z.courtFloor))
  m.aoNode = mix(ao, float(1), uView)
  m.roughnessNode = float(0.94)
  // House VI's court: the light its sunlit band and its floor throw back into the shade, which the stack does not carry;
  // warm, a share of the sun's irradiance, more toward the floor where the lit east wall is seen whole
  const inCourt6 = step(abs(u), ct.u[1] + 2.0).mul(step(abs(v), ct.v[1] + 2.0)).mul(six)
  const bounceZ = max(max(is(Z.court), is(Z.paving)), is(Z.reveal)).mul(inCourt6)
  const bounce = uHouseSun.mul(vec3(1.0, 0.95, 0.88)).mul(float(0.018).add(float(1).sub(smoothstep(0.0, 3.4, yF)).mul(0.012)))
  m.emissiveNode = c.mul(bounce).mul(bounceZ).mul(float(1).sub(uView))
  // no sun reaches inside the rooms or under a door's head; the shadow map's contact edges leaked it, and leaked it onto
  // the jambs of the doors round House VI's court, which lie in the court's shade at the stop's low sun
  const indoors = max(max(is(Z.room), is(Z.floor)), is(Z.reveal).mul(max(step(n.y, -0.5), inCourt6)))
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors))
  return m
}
