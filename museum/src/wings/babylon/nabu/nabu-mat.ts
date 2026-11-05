/* STOP 8'S MATERIAL (TSL): one material for the Nabu temple's bodies, branching on each face's surface code (the
   `surf` attribute the geometry writes from the space a face looks into) and on where a point lies, never on screen
   derivatives.
     the outer faces, towers, battlements   white lime-gypsum plaster, a fresh coat: a trowel's unevenness, earth
                                            splashed at the foot, faint streaks under the battlements
     Nabu's court, the cellas               the same plaster with plain black bitumen bands: a foot band, a dado of
                                            black piers under two bands, black frames round the doors
     the smaller court's south wall         all black with bitumen
     the floors                             baked brick under a bitumen coat, worn to the brick where people walked
     the roof                               an earth deck behind the parapet
   Every line is box-filtered over one device pixel's footprint. The stack carries no bounce: the rooms are lit only
   through their doors and the court's floor sees the sky its walls leave, both modelled here from the plan. */

import { MeshStandardNodeMaterial, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { band, footprint, hash2 } from '../gate/gate-mat'
import { classColour, uView, type ClassTones } from '../map/mass'
import { TONES } from '../open/earth'
import { pavingBrickCourt } from '../parts/paving-brick-court-babylon'
import { SURF, type Box2, type NabuFrame } from './nabu-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, clamp, exp, float, floor, fract, length, max, min, mix, mx_noise_float, normalize, positionWorld, select, smoothstep, sqrt, step, uniform, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uNabuPix = uniform(0.0003)
export function setNabuPixel(vfovDeg: number, heightPx: number): void {
  uNabuPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

/** the page's sun (toward it, and its colour times intensity) and sky light, read before each draw (nabu.ts) */
export const uNabuLight = {
  sun: uniform(new Vector3(0, 1, 0)),
  sunIrr: uniform(new Vector3(0, 0, 0)),
  sky: uniform(new Vector3(0.8, 0.93, 1.19)),
}

export function nabuMaterial(F: NabuFrame, np: J, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 })
  const P = positionWorld
  const n = normalize(attribute('normal', 'vec3'))
  const surf = attribute('surf', 'float')
  const U = { uPix: uNabuPix }
  const col = np.colours
  const B = np.bands
  const is = (code: number): N => step(abs(surf.sub(code)), 0.5)
  const any = (...codes: number[]): N => codes.reduce((acc: N, c) => max(acc, is(c)), float(0))
  const inBox = (b: Box2, e = 0.02): N => step(b.x0 - e, P.x).mul(step(P.x, b.x1 + e)).mul(step(b.z0 - e, P.z)).mul(step(P.z, b.z1 + e))

  /* ── where a point lies on its face: u along the face, y up from the floor ── */
  const alongZ = abs(n.x).greaterThan(0.5)
  const u = select(alongZ, P.z, P.x)
  const y = P.y.sub(F.pave)
  const fu = footprint(U, select(alongZ, vec3(0, 0, 1), vec3(1, 0, 0)), n), fy = footprint(U, vec3(0, 1, 0), n)
  const fw = max(fu, fy)
  const near = float(1).sub(smoothstep(0.004, 0.03, fw))

  /* ── the plaster: lime and gypsum, matte and a little warm, a fresh coat. A trowel leaves it a touch uneven in broad
     strokes; earth splashes the foot of every outer face; the battlements shed faint streaks down the wall ── */
  const plasterBase = V(col.plaster)
  const broad = mx_noise_float(P.mul(vec3(0.35, 0.5, 0.35))).mul(0.065)
  const stroke = mx_noise_float(P.mul(vec3(1.6, 3.2, 1.6))).mul(0.04).mul(float(1).sub(smoothstep(0.01, 0.06, fw)))
  const grain = mx_noise_float(P.mul(23)).mul(0.035).mul(near)
  let plaster: N = plasterBase.mul(float(1).add(broad).add(stroke).add(grain))
  // where the face meets the ground or the floor: the outer faces stand on the open ground (+7.98), the inner on the paving
  const outer = any(SURF.exterior, SURF.ashratum, SURF.merlon)
  const footY = P.y.sub(mix(float(F.pave), float(F.apronTop), outer))
  const splash = float(1).sub(smoothstep(0.05, 0.9, footY.add(mx_noise_float(vec3(u.mul(1.3), 0.5, 1.7)).mul(0.25)))).mul(0.45)
  const earth = V(col.apron)
  plaster = mix(plaster, earth.mul(1.05), splash.mul(max(outer, any(SURF.courtWall, SURF.smallCourt))))
  // streaks under the battlements: thin, faint, long, the rain's way down an outer face
  const streak = smoothstep(0.15, 0.55, mx_noise_float(vec3(u.mul(2.4), P.y.mul(0.12), 3.3))).mul(smoothstep(F.top - 5, F.top, P.y)).mul(0.07)
  plaster = plaster.mul(float(1).sub(streak.mul(outer)))
  // the tops: wall copings and tower tops weather greyer and take dust
  plaster = mix(plaster, mix(plaster, earth, 0.3).mul(0.92), is(SURF.coping))
  // the Ashratum's plaster a coat older than the Nabu temple's
  plaster = mix(plaster, plaster.mul(vec3(0.94, 0.93, 0.9)), is(SURF.ashratum))

  /* ── the black bands: plain bitumen, painted on the court's walls and in the cellas ── */
  const bitumen = V(col.bitumen).mul(float(1).add(mx_noise_float(P.mul(9)).mul(0.25).mul(near)))
  const pitch: number = B.pitch, pier: number = B.pier
  // u from the court's corner on each face, so a pier stands in each corner
  const uc = select(alongZ, P.z.sub(F.court.z0), P.x.sub(F.court.x0))
  const ucR = select(alongZ, P.z.sub(F.rooms['cella']!.z0), P.x.sub(F.rooms['cella']!.x0))
  const uLocal = mix(uc, ucR, any(SURF.bandedRoom))
  const pierAt = fract(uLocal.add(pier / 2).div(pitch)).mul(pitch)
  const piers = band(pierAt, 0, pier, fu).mul(step(y, B.low[0]))
  let ink: N = max(band(y, B.foot[0], B.foot[1], fy), max(band(y, B.low[0], B.low[1], fy), band(y, B.high[0], B.high[1], fy)))
  // round each door in these walls a frame of two bands, and no pier inside the outer band
  let frames: N = float(0), clear: N = float(0)
  for (const d of F.doors) {
    if (d.id === 'gate') continue
    const onWall = d.wall === 'x' ? abs(P.x.sub((d.box.x0 + d.box.x1) / 2)).lessThan((d.box.x1 - d.box.x0) / 2 + 0.05) : abs(P.z.sub((d.box.z0 + d.box.z1) / 2)).lessThan((d.box.z1 - d.box.z0) / 2 + 0.05)
    const across = abs((d.wall === 'x' ? P.z : P.x).sub(d.c)).sub(d.w / 2)
    const above = P.y.sub(d.top)
    // the distance outward from the opening's edge, on the sides and over the head
    const out = select(above.greaterThan(across), above, across)
    const inFrame = step(out, B.frame[3] + 0.02).mul(step(P.y, d.top + B.frame[3] + 0.02)).mul(step(-0.01, out))
    const fr = max(band(out, B.frame[0], B.frame[1], fw), band(out, B.frame[2], B.frame[3], fw)).mul(inFrame)
    frames = max(frames, select(onWall, fr, float(0)))
    clear = max(clear, select(onWall, step(out, B.frame[3] + 0.12).mul(step(P.y, d.top + B.frame[3] + 0.12)), float(0)))
  }
  ink = max(max(ink, piers.mul(float(1).sub(clear))), frames)
  // the dado bands stop at a frame's outer band
  ink = max(ink.mul(float(1).sub(clear.mul(step(B.foot[1] + 0.02, y)))), frames)
  const banded = any(SURF.courtWall, SURF.bandedRoom)
  // a painted edge is never ruler-straight: a few millimetres of wander, seen only close
  const wander = mx_noise_float(P.mul(6)).mul(0.5).add(0.5).mul(near)
  const inked = smoothstep(0.35, 0.65, ink.add(wander.sub(0.5).mul(0.15))).mul(banded)
  let wall: N = mix(plaster, bitumen, inked)
  wall = mix(wall, bitumen.mul(1.1), is(SURF.black))

  /* ── the floors: the court's square baked bricks laid in bitumen (part paving-brick-court-babylon), under a thin
     bitumen coat laid alike over every brick to the walls' feet, so the court reads as one brick surface; the walked
     ways wear the coat thinner, never through to a patch ── */
  const cellaDoor = F.doors.find((d) => d.id === 'cella')!, courtDoor = F.doors.find((d) => d.id === 'court')!
  const c = F.court
  const PV = np.paving
  const inDoorX = step(abs(P.x.sub(cellaDoor.c)), cellaDoor.w / 2)
  const more = F.doors.filter((d) => d.wall === 'x' && d.id !== 'gate').map((d) => ({ x: d.box.x0 > c.x0 ? c.x1 : c.x0, z: d.c, r: 1.3 }))
  const pv = pavingBrickCourt({
    p: P, U, ax: vec3(1, 0, 0), az: vec3(0, 0, 1), brick: PV.brick, court: c, front: c.z1,
    doors: [{ c: cellaDoor.c, x0: cellaDoor.box.x0, x1: cellaDoor.box.x1, r: cellaDoor.w / 2 }],
    way: { x: c.x1, z: courtDoor.c }, inDoorX, more, joint: PV.joint,
  })
  const { dWall, inCourt } = pv
  // the coat laid by hand: thicker and thinner over a metre or two, and a little each brick, by the part's own bond
  const kz = floor(P.z.div(PV.brick)), kx = floor(P.x.add(kz.sub(floor(kz.div(2)).mul(2)).mul(PV.brick / 2)).div(PV.brick))
  const mottle = mx_noise_float(vec3(P.x.mul(0.55), 3.3, P.z.mul(0.55))).mul(0.2).add(hash2(kx.add(3.7), kz.add(1.9)).sub(0.5).mul(0.22))
  const coatK = float(PV.coat).mul(float(1).sub(pv.wear.mul(PV.coatWear))).add(mottle)
  const floorCol: N = mix(pv.colour, V(col.paving), clamp(coatK, 0, 1))

  /* ── the roof's earth deck and the open ground before the gate ── */
  const deckCol = V(TONES.roof).mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.2), 3.1, P.z.mul(0.2))).mul(0.14)).add(mx_noise_float(P.mul(1.7)).mul(0.05)))
  const ground = earth.mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.5), 1.1, P.z.mul(0.5))).mul(0.12)).add(mx_noise_float(P.mul(4.1)).mul(0.06).mul(near)))
    .mul(float(1).sub(smoothstep(0.3, 0.7, mx_noise_float(vec3(P.x.mul(0.11), 5.5, P.z.mul(0.11)))).mul(0.12)))

  /* ── one colour per point ── */
  let stateCol: N = wall
  stateCol = mix(stateCol, floorCol, is(SURF.paving))
  stateCol = mix(stateCol, deckCol, is(SURF.deck))
  stateCol = mix(stateCol, ground, is(SURF.earth))
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // bitumen keeps a dull sheen; plaster and earth are matte
  const shiny = max(inked, is(SURF.black)).add(is(SURF.paving).mul(float(PV.sheen).sub(pv.wear.mul(0.25))))
  m.roughnessNode = mix(mix(float(0.92), float(0.42), clamp(shiny, 0, 1)), float(0.92), uView)

  /* ── the light the stack does not carry. A room is lit only through its doors: strongest in front of each, falling
     off with depth; its ceiling darker. The court's floor and the feet of its walls see less sky than the open street
     (the view factor of four walls round a court); a contact shade where a wall meets a floor ── */
  const R = F.rooms
  const roomDoors: Array<[Box2, string[]]> = [
    [R['vestibule']!, ['gate', 'court']], [R['cella']!, ['cella']], [R['smallCella']!, ['smallCella']],
    [R['west1']!, ['west1']], [R['west2']!, ['west2']], [R['east1']!, ['east1']],
  ]
  let indoors: N = float(0), roomAO: N = float(1)
  const below = step(P.y, F.ceiling + 0.02)
  for (const [box, ids] of roomDoors) {
    // the cella's niche is part of its room
    const inside = (box === R['cella'] ? max(inBox(box, 0.03), inBox(F.niche, 0.03)) : inBox(box, 0.03)).mul(below)
    let through: N = float(0)
    for (const id of ids) {
      const d = F.doors.find((q) => q.id === id)!
      const dx = d.wall === 'x' ? P.x.sub((d.box.x0 + d.box.x1) / 2) : P.x.sub(d.c)
      const dz = d.wall === 'x' ? P.z.sub(d.c) : P.z.sub((d.box.z0 + d.box.z1) / 2)
      const r = d.w / 2
      through = through.add(float(r * 1.3).div(length(vec2(dx, dz)).mul(0.8).add(r)))
    }
    // white plaster passes the doors' light round a room: its far corners stay readable
    const lit = clamp(float(0.24).add(min(through, 1.2).mul(0.45)), 0.2, 0.78)
    roomAO = mix(roomAO, lit, inside)
    indoors = max(indoors, inside)
  }
  // the niche lies deeper in the cella's back wall
  roomAO = roomAO.mul(float(1).sub(inBox(F.niche, 0.02).mul(step(P.y, F.niche.top)).mul(0.35)))
  const ceilingK = select(n.y.lessThan(-0.5), float(0.7), float(1))
  // in a door's passage the light falls off toward its middle
  const reveal = any(SURF.reveal, SURF.soffit)
  let passAO: N = float(1)
  for (const d of F.doors) {
    const depth = d.wall === 'x' ? min(P.x.sub(d.box.x0), float(d.box.x1).sub(P.x)) : min(P.z.sub(d.box.z0), float(d.box.z1).sub(P.z))
    const inD = step(abs((d.wall === 'x' ? P.z : P.x).sub(d.c)), d.w / 2 + 0.03).mul(d.wall === 'x' ? step(d.box.x0 - 0.02, P.x).mul(step(P.x, d.box.x1 + 0.02)) : step(d.box.z0 - 0.02, P.z).mul(step(P.z, d.box.z1 + 0.02)))
    passAO = mix(passAO, mix(float(0.92), float(0.6), smoothstep(0, 1.4, depth)), inD)
  }
  // the court: the view factor of a long wall H high at a distance d is (1 - d / sqrt(d^2 + H^2)) / 2
  const HW = F.top - F.pave
  const wallView = (d: N): N => float(0.5).mul(float(1).sub(d.div(sqrt(d.mul(d).add(HW * HW)))))
  const hidden = wallView(max(P.z.sub(c.z0), 0.05)).add(wallView(max(float(c.z1).sub(P.z), 0.05))).add(wallView(max(P.x.sub(c.x0), 0.05))).add(wallView(max(float(c.x1).sub(P.x), 0.05)))
  // the walls hide half their share of sky, and their white plaster gives back more than they hide: the stack carries no
  // bounce, and in a white court the walls light the floor about as much as the sky does
  const floorAO = float(1).add(hidden.mul(0.6)).mul(float(1).sub(float(1).sub(smoothstep(0.0, 0.9, dWall)).mul(0.3)))
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.8, footY)).mul(0.25))
  const courtWallAO = mix(float(1.0), float(1.25), smoothstep(0, HW, y))
  let ao: N = float(1)
  ao = mix(ao, footAO, max(outer, any(SURF.smallCourt, SURF.black)))
  ao = mix(ao, footAO.mul(1.2), is(SURF.smallCourt))
  ao = mix(ao, courtWallAO.mul(footAO), is(SURF.courtWall))
  ao = mix(ao, floorAO, is(SURF.paving).mul(inCourt))
  ao = mix(ao, passAO, reveal)
  ao = mix(ao, roomAO.mul(ceilingK), indoors)
  m.aoNode = mix(ao, float(1), uView)
  // no sun reaches into a room under its roof; the shadow map's contact edges leak it
  // the temple's floors: lit only where the ray toward the sun clears the court's walls (the shadow map leaks at their
  // feet); a passage's or a room's floor never sees the sun over them
  const sH = max(length(vec2(uNabuLight.sun.x, uNabuLight.sun.z)), 1e-4)
  const tx = select(uNabuLight.sun.x.greaterThan(0), float(c.x1).sub(P.x), P.x.sub(c.x0)).div(max(abs(uNabuLight.sun.x).div(sH), 1e-4))
  const tz = select(uNabuLight.sun.z.greaterThan(0), float(c.z1).sub(P.z), P.z.sub(c.z0)).div(max(abs(uNabuLight.sun.z).div(sH), 1e-4))
  const clearH = min(tx, tz).mul(uNabuLight.sun.y.div(sH))
  const courtSun = select(is(SURF.paving).mul(inBox(F.outline, -0.01)).greaterThan(0.5), smoothstep(HW - 0.05, HW + 0.05, clearH), float(1))
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors)).mul(courtSun)
  return m
}
