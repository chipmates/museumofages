/* STOP 8'S MATERIAL (TSL): one material for the Nabu temple's bodies, branching on each face's surface code (the
   `surf` attribute the geometry writes from the space a face looks into) and on where a point lies, never on screen
   derivatives.
     the outer faces, towers, battlements   white lime-gypsum plaster, a fresh coat: a trowel's unevenness, earth
                                            splashed at the foot, faint streaks under the battlements
     Nabu's court, the cellas               the same plaster with plain black bitumen bands: a foot band, a dado of
                                            black piers under two bands, black frames round the doors; the court's
                                            faces and altars under the shared wash's grain, a fresh coat
     the smaller court's south wall         all black with bitumen
     the floors                             baked brick under a bitumen coat, worn to the brick where people walked;
                                            Nabu's court one black asphalt skin over its brick, scuffed where trodden
     the roof                               an earth deck behind the parapet
   Every line is box-filtered over one device pixel's footprint. The stack carries no bounce: the rooms are lit only
   through their doors and the court's floor sees the sky its walls leave, both modelled here from the plan. */

import { MeshPhysicalNodeMaterial, Vector3, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { band, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, uView, type ClassTones } from '../map/mass'
import { TONES } from '../open/earth'
import { pavingBrickCourt } from '../parts/paving-brick-court-babylon'
import { plasterWash } from '../parts/plaster-wash-babylon'
import { SURF, type Box2, type NabuFrame } from './nabu-geom'
import { uSkySet } from '../open/sky-set'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, atan, attribute, cameraPosition, clamp, dot, exp, float, floor, fract, length, max, min, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionWorld, reflect, select, smoothstep, sqrt, step, uniform, vec2, vec3 } = T

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
  // physical only for its specular intensity (the court's specular occlusion below); no other physical lobe is on
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.92, metalness: 0 })
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
  // Nabu's court is floored with asphalt: no earth splashes its walls' feet
  plaster = mix(plaster, earth.mul(1.05), splash.mul(max(outer, is(SURF.smallCourt))))
  // streaks under the battlements: thin, faint, long, the rain's way down an outer face
  const streak = smoothstep(0.15, 0.55, mx_noise_float(vec3(u.mul(2.4), P.y.mul(0.12), 3.3))).mul(smoothstep(F.top - 5, F.top, P.y)).mul(0.07)
  plaster = plaster.mul(float(1).sub(streak.mul(outer)))
  // the tops: wall copings and tower tops weather greyer and take dust
  plaster = mix(plaster, mix(plaster, earth, 0.3).mul(0.92), is(SURF.coping))
  // the Ashratum's plaster a coat older than the Nabu temple's
  plaster = mix(plaster, plaster.mul(vec3(0.94, 0.93, 0.9)), is(SURF.ashratum))
  /* ── Nabu's court (its walls, its coping and battlements, the altar blocks) under the shared wash's grain as a fairly
     fresh coat: the courses ghost faintly, no band of wear at the foot; the sand of the wash on the walls, where it
     reads, not on the altar blocks seen near. Taken as a factor on the plaster above, so the court keeps its tone ── */
  const WG = np.wash, FLAT = { wall: [1, 1, 1] as RGB, ceiling: [1, 1, 1] as RGB }
  const washCoat = { ...WG.coat, fine: mix(float(WG.coat.fine ?? 0), float(WG.altar.fine), is(SURF.altar)) }
  const washed = plasterWash(P, n, col.plaster, FLAT, { pix: uNabuPix, floor: F.pave, course: WG.course, brick: WG.brick, joint: WG.joint, mud: col.apron, coat: washCoat })
  const grainRel = washed.div(plasterWash(P, n, col.plaster, FLAT))
  const courtFace = max(any(SURF.courtWall, SURF.altar), any(SURF.merlon, SURF.coping).mul(inBox(F.court, 1.4)))
  // the court's faces are seen close: their trowel strokes three times tighter and lower, so a near wall keeps detail
  // instead of soft blotches (the strokes stay as they are where the temple is seen from afar)
  const strokeNear = mx_noise_float(P.mul(vec3(4.8, 9.6, 4.8)).add(7.3)).mul(np.wash.near.tight).mul(float(1).sub(smoothstep(0.0035, 0.02, fw)))
    .add(stroke.mul(np.wash.near.stroke))
  plaster = mix(plaster, plaster.mul(float(1).add(strokeNear).sub(stroke)), courtFace)
  plaster = mix(plaster, plaster.mul(grainRel), courtFace)
  const relL = dot(grainRel, vec3(0.2126, 0.7152, 0.0722))

  /* ── the black bands: plain bitumen, painted on the court's walls and in the cellas ── */
  const banded = any(SURF.courtWall, SURF.bandedRoom)
  const bitumen = V(col.bitumen).mul(float(1).add(mx_noise_float(P.mul(9)).mul(0.25).mul(near)))
  const pitch: number = B.pitch, pier: number = B.pier
  // u from the court's corner on each face, so a pier stands in each corner
  const uc = select(alongZ, P.z.sub(F.court.z0), P.x.sub(F.court.x0))
  // in a banded room, u from that room's own corner
  let ucR: N = select(alongZ, P.z.sub(F.rooms['cella']!.z0), P.x.sub(F.rooms['cella']!.x0))
  for (const k of ['west1', 'west2', 'east1', 'smallCella']) {
    const r = F.rooms[k]!
    ucR = select(inBox(r, 0.05).greaterThan(0.5), select(alongZ, P.z.sub(r.z0), P.x.sub(r.x0)), ucR)
  }
  const uLocal = mix(uc, ucR, any(SURF.bandedRoom))
  const pierAt = fract(uLocal.add(pier / 2).div(pitch)).mul(pitch)
  const piers = band(pierAt, 0, pier, fu).mul(step(y, B.low[0]))
  let ink: N = max(band(y, B.foot[0], B.foot[1], fy), max(band(y, B.low[0], B.low[1], fy), band(y, B.high[0], B.high[1], fy)))
  // round each door in these walls a frame of two bands, and no pier inside the outer band
  let frames: N = float(0), clear: N = float(0), sideV: N = float(0)
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
    sideV = max(sideV, select(onWall, fr.mul(step(above, across)), float(0)))
    clear = max(clear, select(onWall, step(out, B.frame[3] + 0.12).mul(step(P.y, d.top + B.frame[3] + 0.12)), float(0)))
  }
  ink = max(max(ink, piers.mul(float(1).sub(clear))), frames)
  // the dado bands stop at a frame's outer band
  ink = max(ink.mul(float(1).sub(clear.mul(step(B.foot[1] + 0.02, y)))), frames)
  // a painted edge is never ruler-straight: a few millimetres of wander, seen only close
  const wander = mx_noise_float(P.mul(6)).mul(0.5).add(0.5).mul(near)
  // the niche, the god's place, stays plain white
  const inked = smoothstep(0.35, 0.65, ink.add(wander.sub(0.5).mul(0.15))).mul(banded).mul(float(1).sub(inBox(F.niche, 0.02)))
  /* ── the bands as a coat of bitumen paint: thinner and browner at its edge (a fringe of about a centimetre where the
     plaster shows through), a little proud of the plaster (a lit lip over a band, a shade under it), its gloss with its
     thickness. The dado's three bands carry the lip; all of it seen only close ── */
  const CO = B.coat, fr: number = CO.fringe
  const nearC = float(1).sub(smoothstep(0.003, 0.012, fw))
  const edgeIn = (v: N, a: number, b: number): N => step(a, v).mul(step(v, b)).mul(float(1).sub(smoothstep(0, fr, min(v.sub(a), float(b).sub(v)))))
  // the dado's edges stop where its bands stop, at a frame's outer band; a frame band is painted over everything under it
  const dadoKeep = float(1).sub(clear.mul(step(B.foot[1] + 0.02, y)))
  let fringe: N = max(edgeIn(y, B.foot[0], B.foot[1]), max(edgeIn(y, B.low[0], B.low[1]), edgeIn(y, B.high[0], B.high[1])).mul(dadoKeep))
  fringe = max(fringe, edgeIn(pierAt, 0, pier).mul(step(y, B.low[0])).mul(float(1).sub(clear)))
  fringe = fringe.mul(float(1).sub(frames))
  // the lip: just over each band's top edge a lit line, just under its foot a shade
  const lipAt = (v: N, a: number, b: number): N => band(v, b, b + 0.006, fy).sub(band(v, a - 0.006, a, fy).mul(0.8))
  const lip = lipAt(y, B.low[0], B.low[1]).add(lipAt(y, B.high[0], B.high[1])).mul(dadoKeep).add(lipAt(y, B.foot[1] - 1, B.foot[1])).mul(banded).mul(nearC)
  const coatVar = mx_noise_float(vec3(u.mul(1.7), P.y.mul(2.3), 5.1)).mul(0.5).add(0.5)
  // the paint follows the plaster's grain under it (the wash's relief, a little stronger in the thin black coat) and
  // keeps its brush's marks, laid along each band, down each pier and frame side
  const vStroke = max(piers.mul(float(1).sub(clear)), sideV)
  const sAlong = mix(u, y, vStroke), sAcross = mix(y, u, vStroke)
  const fX = mix(fy, fu, vStroke)
  const keepX = (lambda: number): N => smoothstep(fX.mul(2), fX.mul(4), float(lambda))
  const brush = mx_noise_float(vec3(sAlong.mul(2.5), sAcross.mul(70), 4.2)).mul(keepX(1 / 70)).mul(0.6)
    .add(mx_noise_float(vec3(sAlong.mul(1.1), sAcross.mul(24), 8.1)).mul(keepX(1 / 24)).mul(0.4))
  const paintTex = float(1).add(relL.sub(1).mul(CO.relief)).add(brush.mul(CO.brush)).mul(mix(float(1), float(CO.court), is(SURF.courtWall)))
  const bitCoat = mix(bitumen, plaster.mul(vec3(0.34, 0.26, 0.19)), fringe.mul(0.55).mul(nearC)).mul(mix(float(0.85), float(1.35), coatVar)).mul(paintTex)
  let wall: N = mix(plaster, bitCoat, inked)
  wall = wall.mul(float(1).add(lip.mul(0.16).mul(float(1).sub(inked))))
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
  let floorCol: N = mix(pv.colour, V(col.paving), clamp(coatK, 0, 1))
  /* ── Nabu's court: one black asphalt skin over the brick (bab.nabu.floor), young and lightly worn. A dull mastic with
     a fine mineral grain; scuffed lighter and duller along the trodden lines (the court's door to the cella's, round
     the altars, at the side doors); thin over the bricks' arrises in patches, so the joints ghost faintly. Never bare
     brick, never the bed laid open ── */
  const SK = PV.skin
  // the side doors' passages carry the court's skin through to the rooms' sills; dJamb, the distance to a passage's side
  let inSide: N = float(0), inPass: N = float(0), dJamb: N = float(9)
  for (const d of F.doors.filter((e) => e.wall === 'x' && e.id !== 'gate')) {
    const inP = inBox(d.box, 0.02)
    inSide = max(inSide, inP)
    inPass = max(inPass, inBox(d.box, -0.01))
    dJamb = min(dJamb, mix(float(9), float(d.w / 2).sub(abs(P.z.sub(d.c))), inP))
  }
  const inNabu = max(inBox(c, 0.03), inSide)
  const fpx = footprint(U, vec3(1, 0, 0), n), fpz = footprint(U, vec3(0, 0, 1), n)
  const keepF = (lambda: number): N => smoothstep(max(fpx, fpz).mul(2), max(fpx, fpz).mul(4), float(lambda))
  let dAltar: N = float(9)
  for (const a of F.altar) dAltar = min(dAltar, length(vec2(max(max(float(a.x0).sub(P.x), P.x.sub(a.x1)), 0), max(max(float(a.z0).sub(P.z), P.z.sub(a.z1)), 0))))
  // the trodden lines: the way from the court's door to the cella's, a ring round the altars, the side doors' mouths
  const wx = c.x1, wz = courtDoor.c, vx = cellaDoor.c - wx, vz = c.z1 - wz
  const wt = clamp(P.x.sub(wx).mul(vx).add(P.z.sub(wz).mul(vz)).div(vx * vx + vz * vz), 0, 1)
  const wd = length(vec2(P.x.sub(wx).sub(wt.mul(vx)), P.z.sub(wz).sub(wt.mul(vz))))
  let trod: N = max(exp(wd.div(0.9).mul(wd.div(0.9)).negate()), exp(dAltar.sub(0.35).div(0.45).mul(dAltar.sub(0.35).div(0.45)).negate()).mul(0.8))
  // a side door's mouth: feet and the air through the doorway keep the wall's foot clear of drift there
  let mouth: N = float(0)
  for (const d of more) {
    const dd = length(vec2(P.x.sub(d.x), P.z.sub(d.z)))
    trod = max(trod, exp(dd.div(1.1).mul(dd.div(1.1)).negate()).mul(0.7))
    mouth = max(mouth, exp(dd.div(SK.dust.mouth).mul(dd.div(SK.dust.mouth)).negate()))
  }
  trod = clamp(trod.mul(float(0.75).add(mx_noise_float(vec3(P.x.mul(0.7), 2.3, P.z.mul(0.7))).mul(0.5))), 0, 1)
  const temper = mx_noise_float(P.mul(vec3(90, 1, 90))).mul(keepF(1 / 90)).mul(0.5).add(mx_noise_float(P.mul(vec3(38, 1, 38)).add(4.4)).mul(keepF(1 / 38)).mul(0.4))
    .add(mx_noise_float(P.mul(vec3(180, 1, 180)).add(2.2)).mul(keepF(1 / 180)).mul(0.4))
  const thinSkin = clamp(smoothstep(0.05, 0.6, mx_noise_float(vec3(P.x.mul(0.8), 6.6, P.z.mul(0.8))).add(mx_noise_float(vec3(P.x.mul(2.3), 1.2, P.z.mul(2.3))).mul(0.4))).mul(SK.thin).add(trod.mul(SK.thin * 0.6)), 0, 1)
  // the brick under the skin shows only where the skin is thin: its courses telegraph faintly in the thin patches, and
  // the joints and arrises only where feet have worn the skin on the trodden ways, never as a grid across the court
  const sz = floor(P.z.div(PV.brick)), spx = P.x.add(sz.sub(floor(sz.div(2)).mul(2)).mul(PV.brick / 2))
  const jl = max(lines(P.z, PV.brick, SK.joint, fpz), lines(spx, PV.brick, SK.joint, fpx))
  // where the skin is thin, each brick's own tone comes through a little
  const perBrick = hash2(floor(spx.div(PV.brick)).add(5.1), sz.add(2.7)).sub(0.5).mul(keepF(PV.brick))
  // a brick's arrises stand a hair proud, so a thin skin wears lightest just inside each joint
  const ex = fract(spx.div(PV.brick)).mul(PV.brick), ez = fract(P.z.div(PV.brick)).mul(PV.brick)
  const edgeD = min(min(ex, float(PV.brick).sub(ex)), min(ez, float(PV.brick).sub(ez)))
  const rim = float(1).sub(smoothstep(SK.joint, SK.joint + 0.025, edgeD)).mul(float(1).sub(jl)).mul(keepF(0.05))
  const ghost = clamp(dot(pv.colour, vec3(0.2126, 0.7152, 0.0722)).div(0.3).sub(1), -0.85, 0.6)
  const scuffTex: N = smoothstep(-0.3, 0.45, mx_noise_float(vec3(P.x.mul(5), 3.9, P.z.mul(5))).add(mx_noise_float(P.mul(vec3(22, 1, 22)).add(1.3)).mul(0.5).mul(keepF(1 / 22))))
  // the scuffs feet leave on the trodden lines, in patches
  const scuff = trod.mul(scuffTex).mul(SK.scuff)
  // the skin worn thin by feet, in patches along the trodden ways: there alone the joints sink
  const footWorn = trod.mul(scuffTex)
  let skin: N = V(SK.colour).mul(float(1).add(temper.mul(SK.temper))).mul(float(1).add(ghost.mul(SK.ghost).mul(thinSkin)))
    .mul(float(1).add(perBrick.mul(SK.brickTone).mul(thinSkin))).mul(float(1).add(rim.mul(footWorn).mul(SK.arris)))
  // the mastic's grit: fine, sparse, a little lighter, seen only near
  const grit = smoothstep(0.35, 0.6, mx_noise_float(P.mul(vec3(150, 1, 150)).add(7.7))).mul(keepF(1 / 75))
  skin = skin.mul(float(1).add(grit.mul(SK.grit)))
  skin = mix(skin, V(SK.scuffed), scuff)
  // soles scuff and polish the trodden skin unevenly at a hand's scale: its tone and sheen vary there, their mean kept
  const tread = mx_noise_float(P.mul(vec3(26, 1, 26)).add(4.1)).mul(0.6).add(mx_noise_float(P.mul(vec3(43, 1, 43)).add(1.7)).mul(0.4)).mul(keepF(1 / 26)).mul(trod)
  skin = skin.mul(float(1).add(tread.mul(SK.tread[0])))
  /* the dust of crumbled mud brick the wind lays on any open floor (bab.wear.dust.drift, guessed): gathered into
     drifts where the air stills (the walls' feet, the blocks' feet, the corners, a few slow patches), a thin film on
     the open skin and thinner on the trodden lines; matte, blind to the brick under it */
  const DU = SK.dust
  const fpM = max(fpx, fpz)
  // a drift's reach wanders along its wall in lobes a metre or two long, so its edge is never ruled
  const lobe = mx_noise_float(vec3(P.x.mul(0.9), 2.9, P.z.mul(0.9))).mul(0.85).add(mx_noise_float(vec3(P.x.mul(2.3), 6.3, P.z.mul(2.3))).mul(0.15))
  const reach = (w: number): N => float(w).mul(float(1).add(lobe.mul(DU.lobe)))
  const dCorner = length(vec2(min(P.x.sub(c.x0), float(c.x1).sub(P.x)), min(P.z.sub(c.z0), float(c.z1).sub(P.z))))
  const footDrift = float(1).sub(smoothstep(reach(DU.footW * DU.plateau), reach(DU.footW), mix(pv.dWall, dJamb.mul(3), inSide))).mul(float(1).sub(mouth))
  const cornerDrift = float(1).sub(smoothstep(0.3, reach(DU.cornerW), dCorner)).mul(float(1).sub(inSide))
  const blockDrift = float(1).sub(smoothstep(0.02, reach(DU.blockW), dAltar))
  const drift = smoothstep(DU.open[0], DU.open[1], mx_noise_float(vec3(P.x.mul(0.4), 8.1, P.z.mul(0.4))).add(0.5))
  // hairline cracks in the mastic, a millimetre wide, in patches and broken into short runs (never a closed net), seen only
  // near; dust settles in them
  const cw = mx_worley_noise_vec2(vec2(P.x, P.z).mul(SK.crack[0]))
  const crackW = float(SK.crack[1])
  const crack = float(1).sub(smoothstep(crackW.mul(0.5), crackW.add(fpM), cw.y.sub(cw.x).div(2 * SK.crack[0])))
    .mul(min(crackW.div(max(fpM, 1e-4)), 1)).mul(smoothstep(0.0, 0.4, mx_noise_float(vec3(P.x.mul(1.1), 5.1, P.z.mul(1.1)))))
    .mul(smoothstep(0.05, 0.35, mx_noise_float(vec3(P.x.mul(14), 3.4, P.z.mul(14))))).mul(keepF(0.015))
  // the joints' hollows where feet wore the skin into them lie in their own shade, darker and more matte than the skin
  // round them, never lit by the dust in them (by sinkThin, so the lattice share stays measured)
  const hollow = jl.mul(footWorn).mul(SK.sinkThin)
  const dustGrain = mx_noise_float(P.mul(vec3(9, 1, 9)).add(3.3)).mul(0.5).add(mx_noise_float(P.mul(vec3(19, 1, 19)).add(8.4)).mul(0.35).mul(keepF(1 / 19)))
    .add(mx_noise_float(P.mul(vec3(31, 1, 31)).add(5.9)).mul(0.45).mul(keepF(1 / 31)))
  const dustMottle = mx_noise_float(vec3(P.x.mul(1.3), 4.7, P.z.mul(1.3))).mul(0.6).add(mx_noise_float(vec3(P.x.mul(3.1), 9.2, P.z.mul(3.1))).mul(0.4))
  const dustFine = mx_noise_float(P.mul(vec3(45, 1, 45)).add(6.1)).mul(keepF(1 / 45)).mul(0.65).add(mx_noise_float(P.mul(vec3(110, 1, 110)).add(1.9)).mul(keepF(1 / 110)).mul(0.35))
  const filmBase = float(DU.cover).add(dustMottle.mul(DU.mottle)).add(footDrift.mul(DU.foot)).add(cornerDrift.mul(DU.corner)).add(drift.mul(DU.drift))
    .mul(float(1).sub(trod.mul(DU.swept))).add(blockDrift.mul(DU.block).mul(float(1).sub(trod.mul(DU.swept * 0.5)))).add(crack.mul(DU.crack))
  // a deep drift lies smoother than a thin film: its fine unevenness calms where the dust is thick
  const calm = float(1).sub(smoothstep(0.3, 0.7, filmBase).mul(DU.calm))
  const film = clamp(filmBase.mul(float(1).add(dustGrain.mul(DU.grain).add(dustFine.mul(DU.fine)).mul(calm))), 0, DU.max)
  skin = mix(skin, V(DU.colour), film)
  skin = skin.mul(float(1).sub(hollow.mul(DU.hollow)))
  // a soft dark line where the floor meets a block, darkest at the foot: a short steep core and a long gentle falloff
  // past the block's cast shadow, so neither the shadow's edge nor a rim bounds it. The ao node reaches only the sky's
  // light, so the core is laid in the colour and the falloff on the sun alone (the received shadow below): in the
  // block's shadow the ao grades the sky's light and the falloff would darken it twice
  const coreT = float(1).sub(clamp(dAltar.div(reach(SK.contact[0])), 0, 1))
  skin = skin.mul(float(1).sub(coreT.mul(coreT).mul(SK.contact[1])))
  const contactFall = float(1).sub(float(1).sub(smoothstep(reach(SK.contact[2] * SK.contact[4]), reach(SK.contact[2]), dAltar)).mul(SK.contact[3]))
  floorCol = mix(floorCol, skin, inNabu)

  /* ── the roof's earth deck and the open ground before the gate ── */
  const deckCol = V(TONES.roof).mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.2), 3.1, P.z.mul(0.2))).mul(0.14)).add(mx_noise_float(P.mul(1.7)).mul(0.05)))
  const ground = earth.mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.5), 1.1, P.z.mul(0.5))).mul(0.12)).add(mx_noise_float(P.mul(4.1)).mul(0.06).mul(near)))
    .mul(float(1).sub(smoothstep(0.3, 0.7, mx_noise_float(vec3(P.x.mul(0.11), 5.5, P.z.mul(0.11)))).mul(0.12)))

  /* ── one colour per point ── */
  let stateCol: N = wall
  stateCol = mix(stateCol, floorCol, is(SURF.paving))
  stateCol = mix(stateCol, deckCol, is(SURF.deck))
  stateCol = mix(stateCol, ground, is(SURF.earth))
  /* ── the court's altars and the god's pedestal: plastered mud brick under the same white coat; an altar's top
     darkened by what was laid and burnt on it ── */
  const isAltar = is(SURF.altar), isPed = is(SURF.pedestal)
  let block: N = plaster.mul(vec3(0.97, 0.95, 0.92))
  // an altar's fresh wash a little uneven in faint patches, its top stained dark
  const worn = smoothstep(0.1, 0.45, mx_noise_float(P.mul(vec3(2.2, 3.0, 2.2))).add(mx_noise_float(P.mul(7.0)).mul(0.25)))
  block = mix(block, V(col.apron).mul(1.2), isAltar.mul(worn.mul(0.1)))
  block = mix(block, mix(block, earth, 0.35).mul(0.88), isAltar.mul(smoothstep(0.5, 0.9, n.y)))
  // knocks thin the wash along each block's arrises, a ragged band to the mud plaster under it; the court's dust settles
  // at the blocks' feet, the floor's film climbing a hand's breadth
  const AW = np.altarWear
  let arrisD: N = float(9)
  for (const a of F.altar) {
    const dx = min(P.x.sub(a.x0), float(a.x1).sub(P.x)), dz = min(P.z.sub(a.z0), float(a.z1).sub(P.z)), dt = float(a.top).sub(P.y)
    const on = step(-0.01, min(min(dx, dz), dt))
    const d = select(abs(n.y).greaterThan(0.5), min(dx, dz), select(abs(n.x).greaterThan(0.5), min(dz, dt), min(dx, dt)))
    arrisD = min(arrisD, mix(float(9), d, on))
  }
  const rag = mx_noise_float(P.mul(vec3(14, 14, 14)).add(2.6)).mul(0.6).add(mx_noise_float(P.mul(vec3(37, 37, 37)).add(0.8)).mul(0.4))
  const arrisW = float(AW.arris[0]).add(rag.add(0.5).clamp(0, 1).mul(AW.arris[1] - AW.arris[0]))
  const arrisK = float(1).sub(smoothstep(arrisW.mul(0.35), arrisW, arrisD)).mul(AW.arrisMix)
  block = mix(block, V(col.apron), isAltar.mul(arrisK))
  const footH = P.y.sub(F.pave), footW = float(AW.foot[0]).add(rag.add(0.5).clamp(0, 1).mul(AW.foot[1] - AW.foot[0]))
  const footK = float(1).sub(smoothstep(footW.mul(0.3), footW, footH)).mul(AW.footMix).mul(float(1).sub(smoothstep(0.5, 0.9, n.y)))
  block = mix(block, V(PV.skin.dust.colour), isAltar.mul(footK))
  stateCol = mix(stateCol, block, max(isAltar, isPed))
  /* ── the doors: cedar leaves, boards about 22 cm wide down their length, the grain long, weathered grey toward the
     foot; a sill of plain baked brick, worn ── */
  const isLeaf = is(SURF.leaf), isSill = is(SURF.sill)
  const flat = abs(n.y).lessThan(0.5)
  const across = select(flat, select(alongZ, P.z, P.x), P.x)
  const board = floor(across.div(0.22))
  const boardJ = lines(across, 0.22, 0.004, fu)
  const grainW = mx_noise_float(vec3(across.mul(40), P.y.mul(1.5), board.mul(3.1))).mul(0.12).add(hash2(board, float(7)).sub(0.5).mul(0.18))
  let wood: N = V(col.cedar).mul(float(1).add(grainW))
  wood = mix(wood, vec3(0.3, 0.27, 0.23), float(1).sub(smoothstep(0.0, 1.2, y)).mul(0.35))
  wood = mix(wood, wood.mul(0.45), boardJ)
  let sillCol: N = V(col.sill).mul(float(1).add(mx_noise_float(P.mul(3.3)).mul(0.12)).add(hash2(floor(P.x.div(0.33)), floor(P.z.div(0.33))).sub(0.5).mul(0.1)))
  // one course of square bricks laid in bitumen: a riser shows their head joints along its face, a top both ways
  const onX = abs(n.x).greaterThan(0.5)
  const sillJ = select(abs(n.y).greaterThan(0.5), max(lines(P.x, 0.33, 0.012, fpx), lines(P.z, 0.33, 0.012, fpz)), lines(select(onX, P.z, P.x), 0.33, 0.012, select(onX, fpz, fpx)))
  sillCol = mix(sillCol, V(col.bitumen), sillJ.mul(0.85))
  stateCol = mix(stateCol, wood, isLeaf)
  stateCol = mix(stateCol, sillCol, isSill)
  // between the wall's faces a side door's sill top carries the court's skin; its lips and risers stay baked brick
  const passTop = isSill.mul(step(0.5, n.y)).mul(inPass)
  // dust lodges on a sill top in the lee of its leaf, as a film
  stateCol = mix(stateCol, mix(skin, V(PV.skin.dust.colour), float(PV.skin.dust.sill)), passTop)
  // bitumen keeps a dull sheen; plaster and earth are matte
  const shiny = max(inked, is(SURF.black)).add(is(SURF.paving).mul(float(PV.sheen).sub(pv.wear.mul(0.25))))
  // the coat's gloss with its thickness; the leaves' wood oiled to a faint sheen
  const coatRough = mix(float(CO.sheen[0]), float(CO.sheen[1]), float(1).sub(coatVar).add(fringe.mul(0.5)))
  let rough0: N = mix(float(0.92), mix(float(0.42), coatRough.add(brush.mul(0.12)), max(inked, is(SURF.black))), clamp(shiny, 0, 1))
  // feet polish the skin where it shows on the trodden ways: a low, broad sheen, its roughness kept free of the fine octaves
  const polish = clamp(trod.mul(float(1).sub(film.div(DU.max))).mul(SK.polish[1]), 0, 1)
  const skinRough = mix(mix(float(SK.rough[0]), float(SK.rough[1]), clamp(scuff.mul(1.6), 0, 1)).add(temper.mul(SK.temperRough)).add(perBrick.mul(thinSkin).mul(SK.brickRough)), float(SK.polish[0]).add(perBrick.mul(thinSkin).mul(SK.brickRough * 0.4)).add(tread.mul(SK.tread[1])), polish).add(hollow.mul(0.25))
  rough0 = mix(rough0, mix(skinRough, float(0.97), smoothstep(0, DU.matte, film)), max(is(SURF.paving).mul(inNabu), passTop))
  m.roughnessNode = mix(mix(rough0, float(0.7), is(SURF.leaf)), float(0.92), uView)

  /* ── the light the stack does not carry. A room is lit only through its doors: strongest in front of each, falling
     off with depth; its ceiling darker. The court's floor and the feet of its walls see less sky than the open street
     (the view factor of four walls round a court); a contact shade where a wall meets a floor ── */
  const R = F.rooms
  const BOUNCE: number = np.lamp.bounce ?? 0.3
  const roomDoors: Array<[Box2, string[]]> = [
    [R['vestibule']!, ['gate', 'court']], [R['cella']!, ['cella']], [R['smallCella']!, ['smallCella']],
    [R['west1']!, ['west1']], [R['west2']!, ['west2']], [R['east1']!, ['east1']],
  ]
  let indoors: N = float(0), roomAO: N = float(1)
  const below = step(P.y, F.ceiling + 0.02)
  for (const [box, ids] of roomDoors) {
    // the cella's niche is part of its room
    const inside = (box === R['cella'] ? max(inBox(box, 0.03), inBox(F.niche, 0.03)) : inBox(box, 0.03)).mul(below)
    let through: N = float(0), facing: N = float(0)
    for (const id of ids) {
      const d = F.doors.find((q) => q.id === id)!
      const dx = d.wall === 'x' ? P.x.sub((d.box.x0 + d.box.x1) / 2) : P.x.sub(d.c)
      const dz = d.wall === 'x' ? P.z.sub(d.c) : P.z.sub((d.box.z0 + d.box.z1) / 2)
      const r = d.w / 2
      const dd = length(vec2(dx, dz))
      through = through.add(float(r * 1.3).div(dd.mul(0.8).add(r)))
      // a face turned toward the door sees the lit court through it
      facing = max(facing, max(dot(vec2(n.x, n.z), vec2(dx, dz).div(max(dd, 0.05)).negate()), 0))
    }
    // white plaster passes the doors' light round a room: its far corners stay readable
    const lit = clamp(float(0.24).add(min(through, 1.2).mul(0.45)).add(facing.mul(min(through, 1)).mul(BOUNCE)), 0.2, 0.86)
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
  // under the sky field (open/sky-set.ts) the walls' hidden sky and its give-back are the field's: these step aside
  const floorAO = float(1).add(hidden.mul(0.6).mul(float(1).sub(uSkySet))).mul(float(1).sub(float(1).sub(smoothstep(0.0, 0.9, dWall)).mul(0.3)))
  const footAO = float(1).sub(float(1).sub(smoothstep(0.0, 0.8, footY)).mul(0.25))
  // a wall's upper part takes the opposite white walls' light: bounce, kept beside the field
  const courtWallAO = mix(float(1.0), float(1.25), smoothstep(0, HW, y))
  let ao: N = float(1)
  ao = mix(ao, footAO, max(outer, any(SURF.smallCourt, SURF.black)))
  ao = mix(ao, footAO.mul(1.2), is(SURF.smallCourt))
  ao = mix(ao, courtWallAO.mul(footAO), is(SURF.courtWall))
  // the altars' feet and the paving round them: a contact shade
  const altarContact = float(1).sub(float(1).sub(smoothstep(0.0, 0.5, dAltar)).mul(0.35))
  ao = mix(ao, floorAO.mul(altarContact), is(SURF.paving).mul(inCourt))
  // and a contact shade on the block's own foot, the last 10 cm
  ao = mix(ao, footAO.mul(float(1).sub(float(1).sub(smoothstep(0.0, 0.1, footY)).mul(0.25))), isAltar)
  ao = mix(ao, passAO, reveal)
  ao = mix(ao, roomAO.mul(ceilingK), indoors)
  /* ── a top in the court sees mostly walls: by the view factor the floor's shade uses, the four walls hide about two
     thirds of an altar top's sky, yet the stack lights an up-facing face with the open sky's colour alone (the
     blue-grey tops). White walls give back about what the sky would have given (as for the floor), so on the court's
     tops that share of the light takes the walls' colour: their plaster lit by half the sky and by the sun on the
     part of each face the opposite wall leaves lit ── */
  const upH = max(float(F.top + 0.5).sub(P.y), 0.05)
  const vfTop = (d: N): N => float(0.5).mul(float(1).sub(d.div(sqrt(d.mul(d).add(upH.mul(upH))))))
  const sunY = max(uNabuLight.sun.y, 0)
  const walls: Array<[N, [number, number], number]> = [
    [P.z.sub(c.z0), [0, 1], c.x1 - c.x0], [float(c.z1).sub(P.z), [0, -1], c.x1 - c.x0],
    [P.x.sub(c.x0), [1, 0], c.z1 - c.z0], [float(c.x1).sub(P.x), [-1, 0], c.z1 - c.z0],
  ]
  let hiddenTop: N = float(0), wallLight: N = vec3(0)
  for (const [d, [nx, nz], across] of walls) {
    const vf = vfTop(max(d, 0.05))
    const onFace = min(max(dot(uNabuLight.sun, vec3(nx, 0, nz)), 0), sunY.mul(across / HW))
    hiddenTop = hiddenTop.add(vf)
    wallLight = wallLight.add(uNabuLight.sky.mul(0.5).add(uNabuLight.sunIrr.mul(onFace)).mul(vf))
  }
  const Y3 = vec3(0.2126, 0.7152, 0.0722)
  const hue = (v: N): N => v.div(max(dot(v, Y3), 1e-4))
  const topShare = min(hiddenTop, 0.85).mul(isAltar).mul(smoothstep(0.2, 0.7, n.y)).mul(inBox(c, 0.1))
  const wallHue = hue(wallLight.mul(V(col.plaster))).div(hue(uNabuLight.sky))
  // the tops' light takes the walls' colour for their hidden share: the walls' bounce, kept beside the field
  const topTint = mix(vec3(1), wallHue, topShare)
  m.aoNode = mix(ao, float(1), uView)
  /* ── the court's specular occlusion: the environment holds only the open sky, so a surface seen at a grazing angle
     reflects sky where the court's walls stand in front of it (the blue-grey tops). Its specular keeps the share of
     the reflected lobe that clears the walls' tops ── */
  const Rv = reflect(normalize(P.sub(cameraPosition)), n)
  const rh = max(length(vec2(Rv.x, Rv.z)), 1e-3)
  const rtx = select(Rv.x.greaterThan(0), float(c.x1).sub(P.x), P.x.sub(c.x0)).div(max(abs(Rv.x).div(rh), 1e-3))
  const rtz = select(Rv.z.greaterThan(0), float(c.z1).sub(P.z), P.z.sub(c.z0)).div(max(abs(Rv.z).div(rh), 1e-3))
  const wallUp = max(float(F.top + 0.5).sub(P.y), 0.05)
  const skyShare = smoothstep(-0.45, 0.45, atan(Rv.y.div(rh)).sub(atan(wallUp.div(max(min(rtx, rtz), 0.05)))))
  // kept beside the sky field: it stands for the walls in the mirror being dimmer than the sky they hide
  const occluded = isAltar.mul(smoothstep(0.5, 0.9, n.y)).mul(inBox(c, 0.1))
  ;(m as unknown as { specularIntensityNode: N }).specularIntensityNode = mix(float(1), mix(float(0.2), float(1), skyShare), occluded.mul(float(1).sub(uView)))
    // the skin's sheen under its dust film (spec, ours)
    .mul(mix(float(1), float(SK.spec ?? 1), is(SURF.paving).mul(inNabu)))
  // indoors the light is the court's, thrown back by warm-white walls and brick, warmer than the sky's
  stateCol = stateCol.mul(mix(vec3(1), vec3(1.07, 1.0, 0.88), indoors))
  stateCol = stateCol.mul(topTint)
  m.colorNode = mix(stateCol, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  /* ── the lamps' warm light in the cella (guessed): Lambert from each flame, falling off past its reach, on every face
     of the room, its niche and the pedestal; the stack carries no light of its own here ── */
  const LA = np.lamp
  let lampE: N = float(0)
  for (const a of F.lamps) {
    const d = vec3(a[0]!, a[1]!, a[2]!).sub(P), dist = max(length(d), 0.05)
    lampE = lampE.add(max(dot(n, d.div(dist)), 0).div(float(1).add(dist.div(LA.r).mul(dist.div(LA.r)))))
  }
  const inCella = max(inBox(R['cella']!, 0.03), inBox(F.niche, 0.03)).mul(below)
  // the niche's sides hide most of its back from flames standing beside the pedestal
  const nicheDeep = step(F.niche.x0 - 0.02, P.x).mul(step(P.x, F.niche.x1 + 0.02)).mul(step(F.niche.z0 + 0.02, P.z)).mul(step(P.z, F.niche.z1 + 0.05))
  lampE = lampE.mul(float(1).sub(nicheDeep.mul(0.45)))
  m.emissiveNode = stateCol.mul(V(LA.colour)).mul(lampE.mul(LA.gain)).mul(inCella).mul(ceilingK).mul(float(1).sub(uView))
  // no sun reaches into a room under its roof; the shadow map's contact edges leak it
  // the temple's floors: lit only where the ray toward the sun clears the court's walls (the shadow map leaks at their
  // feet); a passage's or a room's floor never sees the sun over them
  const sH = max(length(vec2(uNabuLight.sun.x, uNabuLight.sun.z)), 1e-4)
  const tx = select(uNabuLight.sun.x.greaterThan(0), float(c.x1).sub(P.x), P.x.sub(c.x0)).div(max(abs(uNabuLight.sun.x).div(sH), 1e-4))
  const tz = select(uNabuLight.sun.z.greaterThan(0), float(c.z1).sub(P.z), P.z.sub(c.z0)).div(max(abs(uNabuLight.sun.z).div(sH), 1e-4))
  const clearH = min(tx, tz).mul(uNabuLight.sun.y.div(sH))
  const courtSun = select(is(SURF.paving).mul(inBox(F.outline, -0.01)).greaterThan(0.5), smoothstep(HW - 0.05, HW + 0.05, clearH), float(1))
  // the rooms keep their own light under the sky field: it sees only their open sky's share
  ;(m as unknown as { skyOpenNode: N }).skyOpenNode = float(1).sub(indoors)
  /* under the sky field the court's white walls give back the sky they hide (sky-set.ts: a share of the hidden sky's
     light in place of the field's multi-bounce fit, and of the mirrored sky): the walls and the altar in full, as their
     bounce terms above assume (the walls' rise, the tops' tint and held-back specular); the paving, whose view factor
     the field's own sky replaces, at 1 + 0.9 x hidden: the field hides about three times the sky the floor term's
     view factor did, and the walls' gain (+0.6 x hidden on the whole light) is fitted to the hidden share alone */
  const onPave = max(is(SURF.paving).mul(inCourt), passTop)
  const ownCourt = max(is(SURF.courtWall), isAltar)
  /* the paving's give-back in the walls' own colour, not the hidden sky's: each wall as the floor sees it (its view
     factor), white plaster lit by half the sky, by the sun on its lit share and by the dark floor's own sunlit bounce
     (the skin under its film, a low albedo); its amount the fit's, its hue theirs */
  const PB = PV.bounce
  let floorWalls: N = vec3(0)
  const floorUp = V(PB.floor).mul(uNabuLight.sunIrr).mul(sunY.mul(PB.floorSun))
  for (const [d, [nx, nz], across] of walls) {
    const onFace = min(max(dot(uNabuLight.sun, vec3(nx, 0, nz)), 0), sunY.mul(across / HW))
    // a sill top inside its passage sees out past its own wall's thickness, not that wall's face
    floorWalls = floorWalls.add(uNabuLight.sky.mul(0.5).add(uNabuLight.sunIrr.mul(onFace)).add(floorUp).mul(wallView(max(d, 0.05)).mul(mix(float(1), step(0.0, d), passTop))))
  }
  // a sill top under its passage's lintel sees the court's walls and floor more than the sky
  const wallRatio = hue(floorWalls.mul(V(col.plaster))).div(hue(uNabuLight.sky))
  const floorTint = mix(vec3(1), wallRatio, mix(float(PB.hue), float(PB.passHue), passTop))
  ;(m as unknown as { skyBounceNode: N }).skyBounceNode = vec3(float(1).add(hidden.mul(PB.k)).mul(onPave)).mul(mix(vec3(1), floorTint, onPave)).add(ownCourt)
  // in a walled court the paving's mirror shows the walls as much as the sky: the mirrored sky takes the walls' hue
  // (mirror[0], its share) at mirror[1] of its light, so the dark skin's sheen in shade is not the open sky's blue
  const MR: number[] = PB.mirror ?? [0, 1]
  ;(m as unknown as { skyMirrorNode: N }).skyMirrorNode = mix(vec3(max(onPave, ownCourt)), mix(vec3(1), wallRatio, MR[0]).mul(MR[1]), onPave)
  const fallOn = is(SURF.paving).mul(inNabu)
  ;(m as unknown as { receivedShadowNode: (s: N) => N }).receivedShadowNode = (shadow: N): N => shadow.mul(float(1).sub(indoors)).mul(courtSun).mul(mix(float(1), contactFall, fallOn))
  return m
}
