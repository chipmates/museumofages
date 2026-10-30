/** THE BANKS' EARTH (the ground's form is `bank.ts`): packed earth and dry
 * turf on the level banks and the plain slope, an earth face where the water
 * cut the bank, gravel at the waterline, the stones.
 */
import { Color, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { attribute, float, fwidth, mix, mx_noise_float, mx_worley_noise_vec2, normalView, normalWorld, positionView, positionWorld, sin, smoothstep, step, uv, vec2, vec3 } from 'three/tsl'
import type { MaterialSet, Stack } from '../../../../stack'
import { loadMachineMaterial, materialDressed } from '../parts'
import { BANK, SEAT_HALF, SEAT_R, SEAT_XY } from './plan'
import { airBehind } from './surface'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const mx: N = mix
const lin = (hex: string): N => { const c = new Color(hex); return vec3(c.r, c.g, c.b) }
const luma = (n: N): N => n.dot(vec3(0.2126, 0.7152, 0.0722))
/** a height on the surface tilts the shading normal (the surface-gradient bump, from the screen's own derivatives) */
function bumped(base: N, height: N): N {
  const n = base.normalize()
  const dpx = positionView.dFdx(), dpy = positionView.dFdy()
  const r1 = dpy.cross(n), r2 = n.cross(dpx)
  const det = dpx.dot(r1)
  const grad = r1.mul(height.dFdx()).add(r2.mul(height.dFdy())).mul(det.sign())
  return n.mul(det.abs()).sub(grad).normalize()
}

/** THE BANK'S EARTH: packed earth and dry turf as before on the level banks and the plain slope; an earth face where the
 * water cut it, its layers and the roots that hang out of it, the turf's edge darker over it; gravel at the waterline;
 * the stones. Every fine pattern fades before a pixel holds a whole stroke of it */
export async function bankSurface(stack: Stack): Promise<{ earth: Material; sets: Set<MaterialSet> }> {
  const names = ['earth-packed', 'grass-short'] as const
  const loaded = await Promise.all(names.map(n => loadMachineMaterial(stack, n)))
  const se = loaded[0]!, sg = loaded[1]!
  const maps = (s: MaterialSet): number => (materialDressed(s) ? 1 : 0)
  const earth = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.95 })
  earth.name = `bridge-of-poles:earth:${se.name}`
  const ground = stack.detail(earth, { ...se, normalStrength: 0.35 }, { uv: uv(), count: 3, maps: maps(se), fade: [12, 90] })
  const grassMat = new MeshStandardNodeMaterial()
  const grass = stack.detail(grassMat, sg, { uv: uv().mul(1.3), count: 3, maps: maps(sg), fade: [12, 90] })
  const p: N = positionWorld
  const A: N = attribute('aBank', 'vec4')
  const faceK = A.x, gravelK = A.y, stoneK = A.z, turfK = A.w
  const up = normalWorld.y.clamp(0, 1)
  const ax = p.x.abs()
  // the level banks' turf as before, thinning toward the lip and the trodden ground by the pile, never on a face
  const lip = smoothstep(BANK.lip - 0.15, BANK.lip + 0.5, ax)
  const tufts = mx_noise_float(vec3(p.x.mul(6.5), p.z.mul(6.5), 4.4)).mul(0.22).add(mx_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 1.4)).mul(0.18)).add(0.5)
  const trodden = float(1).sub(smoothstep(1.2, 2.4, vec2(p.x.add(6.3), p.z.mul(0.6)).length()).mul(0.5).add(0.5)).clamp(0, 1)
  const grassy = smoothstep(0.82, 0.95, up).mul(lip.max(turfK)).mul(smoothstep(0.2, 0.55, tufts).mul(0.35).add(0.55)).mul(float(1).sub(trodden.mul(0.6)))
    .mul(float(1).sub(faceK)).mul(float(1).sub(gravelK))
  const wet = float(1).sub(smoothstep(BANK.water - 0.02, BANK.water + 0.16, p.y))
  // the plain slope as round 7 left it: runnels and patches of darker earth
  const slope = smoothstep(BANK.toe - 0.2, BANK.toe + 0.3, ax).mul(float(1).sub(smoothstep(BANK.lip - 0.1, BANK.lip + 0.25, ax)))
  const runnel = mx_noise_float(vec3(p.z.mul(3.2), p.y.mul(0.9), p.x.mul(0.4))).mul(0.5).add(0.5)
  const patch = mx_noise_float(vec3(p.z.mul(0.7), p.x.mul(0.5), 2.7)).mul(0.5).add(0.5)
  const worn = mx(float(1), smoothstep(0.3, 0.7, runnel).mul(0.22).add(0.86).mul(smoothstep(0.3, 0.7, patch).mul(0.45).add(0.7)), slope)
  const earthCol = lin('#6a5843').mul(luma(ground.albedo).mul(0.4).add(0.68)).mul(worn)
  // AN EARTH FACE: the bank's layers in bands, a darker loam under the turf, the roots hanging out of it
  const strata = sin(p.y.mul(31).add(mx_noise_float(vec3(p.z.mul(1.1), p.y.mul(3), 3.3)).mul(1.6))).mul(0.5).add(0.5)
  const strataFade = float(1).sub(fwidth(p.y.mul(31)).mul(0.6)).clamp(0, 1)
  const loam = smoothstep(-0.16, -0.04, p.y)
  const rootLine = mx_noise_float(vec3(p.z.mul(2.3), p.y.mul(1.4), 7.1)).abs()
  // a root about a centimetre thick, never drawn under a pixel and a half: widened, it pales by as much
  const rootW = fwidth(rootLine).mul(1.5).max(0.04)
  const root = float(1).sub(smoothstep(rootW.mul(0.25), rootW.mul(0.75), rootLine)).mul(float(0.04).div(rootW))
    .mul(smoothstep(-0.34, -0.06, p.y)).mul(smoothstep(0.3, 0.6, mx_noise_float(vec3(p.z.mul(0.8), 1.7, 5.9)).mul(0.5).add(0.5)))
  const faceCol = mx(lin('#574837'), lin('#43372b'), loam.mul(0.7)).mul(luma(ground.albedo).mul(0.4).add(0.68))
    .mul(float(1).sub(strata.mul(strataFade).mul(0.14))).mul(float(1).sub(root.mul(0.5)))
  // GRAVEL: pebbles a few centimetres across, each its own tone, the gaps between them dark; one tone far off
  const cells = mx_worley_noise_vec2(vec3(uv().x.mul(22), uv().y.mul(22), 2.2))
  const pebbleSeen = float(1).sub(smoothstep(0.25, 0.6, fwidth(uv().x.mul(22)).add(fwidth(uv().y.mul(22)))))
  const gap = float(1).sub(smoothstep(0.02, 0.12, cells.y.sub(cells.x)))
  const tone = mx_noise_float(vec3(uv().x.mul(22).floor(), uv().y.mul(22).floor(), 9.3)).mul(0.5).add(0.5)
  const gravelCol = mx(lin('#625b4f'), mx(lin('#77705f'), lin('#4f493f'), tone).mul(float(1).sub(gap.mul(0.45))), pebbleSeen)
  // A STONE: grey-brown, mottled, its lower part darker where the ground holds it
  const stoneCol = mx(lin('#423f39'), lin('#55504a'), mx_noise_float(p.mul(9)).mul(0.5).add(0.5)).mul(smoothstep(-0.06, 0.05, normalWorld.y).mul(0.3).add(0.7))
  // the cut faces where the model's bank ends: a section through the earth, darker with depth, its layers
  const section = step(BANK.halfX - 0.02, ax).max(step(p.z, BANK.zMin + 0.02)).max(step(BANK.zMax - 0.02, p.z))
  // a natural part steep enough to bare its earth reads as a face, whatever its form
  const bare = faceK.max(float(1).sub(smoothstep(0.35, 0.6, up))).mul(float(1).sub(stoneK)).mul(float(1).sub(section))
  const sectionStrata = sin(p.y.mul(23).add(mx_noise_float(vec3(p.x.mul(0.8), p.y.mul(2), p.z.mul(0.8))).mul(1.3))).mul(0.5).add(0.5)
  const sectionCol = mx(lin('#4f4031'), lin('#6b5a44'), sectionStrata.mul(0.5)).mul(luma(ground.albedo).mul(0.5).add(0.6)).mul(smoothstep(BANK.bottom, 0, p.y).mul(0.35).add(0.65))
  const grassCol = mx(lin('#56523b'), lin('#625a42'), tufts.mul(0.6).add(0.2)).mul(luma(grass.albedo).mul(0.25).add(0.78))
  // the bank darkens where the seat logs lie on it and round the stakes
  const seatGap = (x: number, y: number): N => vec2(p.x.sub(x), p.y.sub(y)).length().sub(SEAT_R)
  const onSeat = smoothstep(0.0, 0.16, seatGap(SEAT_XY[0][0], SEAT_XY[0][1]).min(seatGap(SEAT_XY[1][0], SEAT_XY[1][1]))).mul(0.5).add(0.5)
  const seatShade = mx(onSeat, float(1), smoothstep(SEAT_HALF - 0.05, SEAT_HALF + 0.12, p.z.abs()))
  let col: N = mx(mx(earthCol, grassCol, grassy), faceCol, bare)
  col = mx(col, gravelCol, gravelK.mul(float(1).sub(bare)))
  col = mx(col, sectionCol, section)
  col = mx(col, stoneCol, stoneK)
  col = col.mul(float(1).sub(wet.mul(0.42)))
  earth.colorNode = airBehind(col.mul(mx(float(1), ground.occlusion, 0.55)).mul(seatShade))
  earth.roughnessNode = mx(mx(ground.roughness.max(0.85), float(0.55), wet.mul(0.6)), float(0.8), stoneK)
  // the relief: the plain slope's runnels as before, the face's layers and roots, the pebbles, a stone's dents
  const relief = runnel.mul(0.035).add(patch.mul(0.06)).mul(slope).mul(float(1).sub(bare)).mul(float(1).sub(gravelK))
    .add(strata.mul(strataFade).mul(0.004).add(root.mul(0.006)).mul(bare))
    .add(cells.x.mul(-0.006).mul(pebbleSeen).mul(gravelK))
    .add(mx_noise_float(p.mul(14)).mul(0.004).mul(stoneK))
  earth.normalNode = bumped(earth.normalNode ?? normalView, relief)
  grassMat.dispose()
  return { earth, sets: new Set<MaterialSet>([se, sg]) }
}
