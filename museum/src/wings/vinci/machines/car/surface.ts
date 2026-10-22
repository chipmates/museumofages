/** THE CAR'S SURFACES. Oak sawn and hewn by hand for the boards, staves and
 * frames; a finer turned oak for the pegs, staves, shafts and grips; forged
 * iron only where the trade of the time needed it (nails, strakes, straps,
 * hoops, pins); the gun barrels bronze, as a type. The library's photograph
 * gives the grain along each member (the geometry's UVs are metres along the
 * grain); `aTone` gives each piece its own tone, where it is worn, and its
 * end grain. Wear lightens and smooths: the grip, the kneeling boards, the
 * treads, where pegs and staves meet.
 */
import { Color, DataTexture, MeshStandardNodeMaterial, NearestFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu'
import { atan, attribute, float, mix, mx_noise_float, positionGeometry, smoothstep, texture, uv, vec2, vec3 } from 'three/tsl'
import type { MaterialSet, Stack } from '../../../../stack'
import { COVER } from './plan'
import { coverNails } from './build'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const lin = (hex: string): N => { const c = new Color(hex); return vec3(c.r, c.g, c.b) }

export type CarSurface = 'rough' | 'fine' | 'iron' | 'bronze'
/** Which library set dresses which surface. */
export const SET_OF: Record<CarSurface, string> = {
  rough: 'oak-beams',
  fine: 'oak-veneer-light',
  iron: 'iron-forged',
  bronze: 'bronze-dark',
}

const WOOD = {
  rough: { base: '#93744f', worn: '#b3946e', end: '#5e4632', rough: [0.74, 0.9] as const, fibre: [0.62, 0.42] as const },
  fine: { base: '#987551', worn: '#b9986f', end: '#624a34', rough: [0.6, 0.8] as const, fibre: [0.55, 0.5] as const },
}

function wood(stack: Stack, set: MaterialSet, kind: 'rough' | 'fine'): MeshStandardNodeMaterial {
  const spec = WOOD[kind]
  const m = new MeshStandardNodeMaterial({ metalness: 0, roughness: spec.rough[1] })
  m.name = `armoured-car:${kind}:${set.name}`
  const detailSet: MaterialSet = kind === 'rough'
    ? { ...set, normalStrength: 0.35, grain: set.grain ? { ...set.grain, relief: 0.14, shade: 0.16, sheen: 0.04 } : null }
    : { ...set, normalStrength: 0.18, grain: set.grain ? { ...set.grain, relief: 0.08, shade: 0.12, sheen: 0.06 } : null }
  const nodes = stack.detail(m, detailSet, { uv: uv(), count: 3, maps: 1, fade: [6, 40] })
  const T: N = attribute('aTone', 'vec3')
  const tone = T.x, wear = T.y, end = T.z
  const fibres = nodes.albedo.dot(vec3(0.2126, 0.7152, 0.0722))
  // a hand-wide mottle so no two lengths of one board read alike
  const mottle = mx_noise_float(positionGeometry.mul(2.3)).mul(0.5).add(0.5)
  const base = mix(lin(spec.base).mul(0.92), lin(spec.base).mul(1.06), mottle)
  const grained = base.mul(fibres.mul(spec.fibre[0]).add(spec.fibre[1]))
  // worn wood loses its weathered skin and shows the paler fibre under it
  const worn = mix(grained, lin(spec.worn).mul(fibres.mul(0.4).add(0.66)), smoothstep(0.2, 1, wear).mul(0.75))
  const col = mix(worn, lin(spec.end).mul(fibres.mul(0.5).add(0.6)), end.mul(0.85))
  m.colorNode = weathered(col).mul(tone).mul(nodes.occlusion)
  m.roughnessNode = mix(nodes.roughness.clamp(spec.rough[0], spec.rough[1]), float(0.5), smoothstep(0.4, 1, wear).mul(0.6))
  return m
}

/** The nails as a table the cover's shader reads, one texel a nail (ring and slot across, board down): its radius
 * in two bytes, where it sits across its board, how far it bleeds (0: it does not, or there is no second nail). */
const NAIL_R = [0.8, 2.8] as const
let nailTable: DataTexture | null = null
function nails(): DataTexture {
  if (nailTable) return nailTable
  const w = COVER.nailRings.length * 2, h = COVER.boards
  const data = new Uint8Array(w * h * 4)
  for (const n of coverNails()) {
    const i = (n.board * w + n.ring * 2 + n.slot) * 4
    const q = Math.round(((n.r - NAIL_R[0]) / (NAIL_R[1] - NAIL_R[0])) * 65535)
    data[i] = q >> 8; data[i + 1] = q & 255
    data[i + 2] = Math.round((n.across + 0.5) * 255)
    data[i + 3] = n.reach > 0 ? Math.max(1, Math.round((n.reach / 0.32) * 255)) : 0
  }
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true
  nailTable = t
  return t
}

/** The cover's boards in the weather, read from where a point sits on the cone: iron in wet oak leaves a black
 * run below some nails (the tannin's stain), rain lingers longest at the eave, and the sun greys the upper boards. */
function weathered(col: N): N {
  const w: N = attribute('aWeather', 'float')
  const p: N = positionGeometry
  const rho = p.xz.length(), theta = atan(p.z, p.x)
  const n = COVER.boards, cols = COVER.nailRings.length * 2
  const turns = theta.mul(n / (Math.PI * 2))
  const board = turns.floor().add(n).mod(n), across = turns.fract().sub(0.5)
  const table = nails()
  let run: N = float(0)
  for (let k = 0; k < cols; k++) {
    const t: N = texture(table, vec2((k + 0.5) / cols, board.add(0.5).div(n)))
    const r = t.x.mul(255 * 256).add(t.y.mul(255)).div(65535).mul(NAIL_R[1] - NAIL_R[0]).add(NAIL_R[0])
    const reach = t.w.mul(0.32)
    const side = float(1).sub(smoothstep(0.04, 0.12, across.sub(t.z.sub(0.5)).abs()))
    const along = smoothstep(r.sub(0.004), r.add(0.01), rho).mul(float(1).sub(smoothstep(r.add(0.015), r.add(reach).add(0.016), rho)))
    run = run.add(along.mul(side).mul(smoothstep(0, 0.01, t.w)))
  }
  const r0 = COVER.eaveEdge, r1 = COVER.topR + COVER.sill.w / 2
  const breakup = smoothstep(0.2, 0.7, mx_noise_float(vec3(theta.mul(170), rho.mul(6), 3.1)).mul(0.5).add(0.5))
  const stain = run.min(1).mul(breakup.mul(0.6).add(0.4)).mul(w)
  const wet = smoothstep(r0 - 0.5, r0, rho).mul(w)
  const sun: N = float(1).sub(smoothstep(r1 + 0.3, r1 + 1.1, rho)).mul(w)
  const grey: N = vec3(col.dot(vec3(0.2126, 0.7152, 0.0722)))
  const bleached: N = mix(col, grey.mul(1.08), sun.mul(0.3))
  return bleached.mul(float(1).sub(wet.mul(0.16))).mul(float(1).sub(stain.mul(0.55)))
}

function iron(stack: Stack, set: MaterialSet): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ metalness: 0.15, roughness: set.roughness })
  m.name = `armoured-car:iron:${set.name}`
  const detailSet: MaterialSet = { ...set, normalStrength: 0.3, scale: [0.3, 0.3], scales: [0.25, 0.045, 0.0012], detail: { ...set.detail, macro: 0.25, macroContrast: 0.2, mid: 0.45, micro: 0.2 } }
  const nodes = stack.detail(m, detailSet, { uv: uv(), count: 3, maps: 1, fade: [6, 35] })
  const T: N = attribute('aTone', 'vec3')
  const grain = nodes.albedo.dot(vec3(0.2126, 0.7152, 0.0722))
  // forged iron, dark but not black, a little rust where it is never touched
  const rust = smoothstep(0.55, 0.8, mx_noise_float(positionGeometry.mul(9)).mul(0.5).add(0.5))
  const col = mix(lin('#56504a'), lin('#6a4a34'), rust.mul(0.35)).mul(grain.mul(0.55).add(0.42))
  m.colorNode = col.mul(T.x).mul(nodes.occlusion)
  m.roughnessNode = nodes.roughness.mul(0.9).clamp(0.58, 0.88)
  return m
}

function bronze(stack: Stack, set: MaterialSet): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.45 })
  m.name = `armoured-car:bronze:${set.name}`
  const detailSet: MaterialSet = { ...set, normalStrength: 0.15, detail: { ...set.detail, macro: 0.15, macroContrast: 0.15 } }
  const nodes = stack.detail(m, detailSet, { uv: uv(), count: 3, maps: 0.6, fade: [6, 35] })
  const T: N = attribute('aTone', 'vec3')
  const lum = nodes.albedo.dot(vec3(0.2126, 0.7152, 0.0722))
  // cast bronze gone dark with handling and weather, a green-grey patina over much of it, bright where it is rubbed
  const patina = smoothstep(0.3, 0.7, mx_noise_float(positionGeometry.mul(6)).mul(0.5).add(0.5))
  const col = mix(lin('#73603c'), lin('#4d5c4d'), patina.mul(0.65)).mul(lum.mul(0.35).add(0.75))
  m.colorNode = col.mul(T.x).mul(nodes.occlusion)
  m.roughnessNode = mix(float(0.26), float(0.62), patina.mul(0.8)).add(nodes.roughness.mul(0.1))
  m.metalnessNode = mix(float(0.92), float(0.3), patina.mul(0.6)).mul(smoothstep(0.05, 0.3, T.x))
  return m
}

/** A surface for a set that never dressed: the part still stands, plainly. */
export function plainSurface(kind: CarSurface): MeshStandardNodeMaterial {
  const colours: Record<CarSurface, string> = { rough: '#86684a', fine: '#8c6a47', iron: '#3a3a39', bronze: '#7a5a36' }
  const m = new MeshStandardNodeMaterial({ metalness: kind === 'iron' ? 0.4 : kind === 'bronze' ? 0.8 : 0, roughness: kind === 'bronze' ? 0.45 : 0.75 })
  m.name = `armoured-car:${kind}:plain`
  m.colorNode = lin(colours[kind]).mul((attribute('aTone', 'vec3') as N).x)
  return m
}

export function carSurface(stack: Stack, set: MaterialSet, kind: CarSurface): MeshStandardNodeMaterial {
  if (kind === 'rough' || kind === 'fine') return wood(stack, set, kind)
  if (kind === 'iron') return iron(stack, set)
  return bronze(stack, set)
}
