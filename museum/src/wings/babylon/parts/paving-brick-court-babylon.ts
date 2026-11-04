/* PART paving-brick-court-babylon: worn baked-brick paving of a court, square bricks laid in bitumen, each row half a
   brick on. The bricks of one firing alike, so the tone drifts over metres rather than jumping brick by brick; grain
   and pits inside each brick; the joints opened and chipped, half filled with dust; the edges worn round. Where people
   walked (along the main door's axis, through the doors, along a way across the court) the bricks are cleaner and the
   edges rounder; dust lies where nobody walked and along the walls' feet.
   Works in the court's own frame: `p` is the point in that frame (x along the court, z across it toward the doors'
   side, y up), `ax` and `az` the frame's x and z as world directions (the pixel footprints). Units metres. No room
   imports: the court and the house each pass their own frame and preset. */

import * as TSL from 'three/tsl'
import { PAL, footprint, hash2, lines } from '../gate/gate-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { clamp, exp, float, floor, fract, length, max, min, mix, mx_noise_float, smoothstep, step, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

export interface PavingDoor { c: number; x0: number; x1: number; r: number }
export interface PavingIn {
  /** the point in the court's frame */
  p: N
  U: { uPix: N }
  /** the frame's x and z axes as world directions */
  ax: N
  az: N
  /** the brick's side, metres */
  brick: number
  /** the court's box in its frame */
  court: { x0: number; x1: number; z0: number; z1: number }
  /** the court's side the doors open in (its larger z) */
  front: number
  /** the doors in that side; the widest is the main door */
  doors: PavingDoor[]
  /** where the walked way across the court starts (it runs to the main door) */
  way: { x: number; z: number }
  /** 1 inside a door's span along x */
  inDoorX: N
  /** more thresholds on the court's floor (x, z, radius), where doors open in its other sides */
  more?: Array<{ x: number; z: number; r: number }>
}

export const DEFAULTS = Object.freeze({ brick: 0.33 })
export const PRESETS = Object.freeze({
  /** the throne room's Main Courtyard: 33 cm bricks, guessed */
  court: Object.freeze({ brick: 0.33 }),
  /** House VI's court: the lower paving's 40 cm bricks (P2021 p. 250) */
  house: Object.freeze({ brick: 0.4 }),
})

export interface Paving { colour: N; wear: N; dWall: N; inCourt: N }

export function pavingBrickCourt(I: PavingIn): Paving {
  const P = I.p, U = I.U, BR = I.brick, c = I.court
  const fpX = footprint(U, I.ax, vec3(0, 1, 0)), fpZ = footprint(U, I.az, vec3(0, 1, 0))
  const fpw = max(fpX, fpZ)
  const kz = floor(P.z.div(BR))
  const px = P.x.add(kz.sub(floor(kz.div(2)).mul(2)).mul(BR / 2))
  const kx = floor(px.div(BR))
  const pNear = float(1).sub(smoothstep(0.012, 0.05, fpw))
  const pSeen = float(1).sub(smoothstep(0.06, 0.25, fpw))
  const main = [...I.doors].sort((a, b) => b.r - a.r)[0]!
  const axis = exp(P.x.sub(main.c).div(3.0).mul(P.x.sub(main.c).div(3.0)).negate()).mul(float(1).sub(clamp(float(I.front).sub(P.z).div(I.front - c.z0), 0, 1).mul(0.65)))
  let thresh: N = float(0)
  for (const d of I.doors) {
    const dd = length(vec2(P.x.sub(d.c), max(float(I.front).sub(P.z), 0)))
    thresh = max(thresh, exp(dd.div(3.2).mul(dd.div(3.2)).negate()))
  }
  for (const m of I.more ?? []) {
    const dd = length(vec2(P.x.sub(m.x), P.z.sub(m.z)))
    thresh = max(thresh, exp(dd.div(m.r).mul(dd.div(m.r)).negate()))
  }
  // the way from its start to the main door, a segment in plan
  const ax = I.way.x, az = I.way.z, bxW = main.c, bzW = I.front
  const sx = bxW - ax, sz = bzW - az
  const sh = clamp(P.x.sub(ax).mul(sx).add(P.z.sub(az).mul(sz)).div(sx * sx + sz * sz), 0, 1)
  const segD = length(vec2(P.x.sub(ax).sub(sh.mul(sx)), P.z.sub(az).sub(sh.mul(sz))))
  const way = exp(segD.div(2.6).mul(segD.div(2.6)).negate()).mul(0.65)
  const wearRaw = max(axis, max(thresh, way)).add(mx_noise_float(vec3(P.x.mul(0.5), 6.1, P.z.mul(0.5))).mul(0.18))
  const wear = clamp(wearRaw, 0, 1)
  const hp = hash2(kx, kz), hp2 = hash2(kx.add(7.7), kz.add(3.1))
  const batch = mx_noise_float(vec3(P.x.mul(0.33), 1.3, P.z.mul(0.33)))
  const fire = clamp(float(0.36).add(batch.mul(0.18)).add(hp.sub(0.5).mul(0.16).mul(pSeen)), 0, 1)
  let pTone: N = mix(V(PAL.buff as RGB), V(PAL.redBrown as RGB), fire).mul(float(0.96).add(hp2.sub(0.5).mul(0.09).mul(pSeen))).mul(vec3(1.07, 1.0, 0.84))
  const grain = mx_noise_float(P.mul(vec3(26, 3, 26))).mul(0.11).mul(pNear)
  const pits = smoothstep(0.32, 0.5, mx_noise_float(P.mul(vec3(70, 5, 70)))).mul(0.22).mul(pNear)
  pTone = pTone.mul(float(1).add(grain).sub(pits))
  // where in its brick a point lies: the distance to the brick's nearest edge, metres
  const fxB = fract(px.div(BR)).mul(BR), fzB = fract(P.z.div(BR)).mul(BR)
  const edgeD = min(min(fxB, float(BR).sub(fxB)), min(fzB, float(BR).sub(fzB)))
  const chip = mx_noise_float(P.mul(vec3(14, 2, 14))).add(0.5)
  const jh = float(0.0035).add(chip.mul(0.004)).add(mx_noise_float(P.mul(vec3(5, 1, 5))).add(0.5).mul(0.005)).add(wear.mul(0.004))
  const jFar = max(lines(P.z, BR, 0.0045, fpZ), lines(px, BR, 0.0045, fpX))
  // a corner broken off here and there, the gap filled like a joint
  const cornerD = length(vec2(min(fxB, float(BR).sub(fxB)), min(fzB, float(BR).sub(fzB))))
  const hc = hash2(kx.add(19.3), kz.add(2.9))
  const broken = step(0.62, hc).mul(float(1).sub(smoothstep(hc.mul(0.05).sub(0.012), hc.mul(0.05).sub(0.008).add(fpw.mul(0.5)), cornerD)))
  const jNear = max(float(1).sub(smoothstep(jh.sub(0.0015), jh.add(0.0015).add(fpw.mul(0.5)), edgeD)), broken)
  const jointP = mix(jFar, jNear, pNear)
  const arris = float(1).sub(smoothstep(jh, jh.add(0.014).add(wear.mul(0.012)), edgeD)).mul(pNear)
  pTone = pTone.mul(float(1).sub(arris.mul(0.16)))
  // dust: drifts where nobody walked and along the walls' feet; the walked ways swept cleaner and a shade darker
  const dWall = min(min(P.z.sub(c.z0), float(I.front).sub(P.z)), min(P.x.sub(c.x0), float(c.x1).sub(P.x)))
  const inCourt = step(P.z, I.front)
  const foot = float(1).sub(smoothstep(0.1, 2.2, dWall)).mul(inCourt).mul(float(1).sub(min(I.inDoorX, 1).mul(step(float(I.front).sub(P.z), 2.0))))
  const drift = smoothstep(0.1, 0.8, mx_noise_float(vec3(P.x.mul(0.23), 2.7, P.z.mul(0.23))).add(0.5))
  const dust = clamp(drift.mul(0.4).add(foot.mul(0.4)).add(float(0.2).mul(float(1).sub(inCourt))).add(0.1), 0, 1).mul(float(1).sub(wear.mul(0.9)))
  const dustCol = vec3(0.52, 0.47, 0.39)
  pTone = mix(pTone.mul(mix(vec3(1), vec3(0.97, 0.91, 0.86), wear)), dustCol, dust.mul(0.62))
  // the joints: bitumen, half filled with the court's dust; swept emptier and darker on the walked ways
  const jointPCol = mix(mix(V(PAL.asphalt as RGB).mul(2), dustCol.mul(0.78), float(0.55).add(chip.mul(0.35))), V(PAL.asphalt as RGB).mul(2.5), wear.mul(0.35))
  const colour = mix(pTone, jointPCol, jointP.mul(0.72))
  return { colour, wear, dWall, inCourt }
}
