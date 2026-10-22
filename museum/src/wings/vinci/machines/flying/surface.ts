/** What each part of the flying machine is made of, as the library dresses
 * it: cane bound with hemp (77v), fir laths and fustian (74r), forged iron,
 * turned oak, an ash bow, leather and chamois (79v). The tints are the
 * museum's; the grain is the library's photograph under them. */
import { Color, DoubleSide, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { attribute, cameraPosition, float, normalWorld, positionWorld, uv, vec3 } from 'three/tsl'
import type { MaterialSet, Stack } from '../../../../stack'
import { loadMachineMaterial, materialDressed } from '../parts'
import { benchKeyDirection } from '../key'
import type { Kind } from './parts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const lin = (hex: string): N => { const c = new Color(hex); return vec3(c.r, c.g, c.b) }
const luma = (n: N): N => n.dot(vec3(0.2126, 0.7152, 0.0722))

/** the bench's key finds a thin member's edge: a rod a few centimetres
 * across is a line at a visitor's distance, and a line with no edge is a
 * scratch */
function keyRim(strength: number): N {
  const key = benchKeyDirection()
  if (!key) return float(0)
  const toEye = cameraPosition.sub(positionWorld).normalize()
  const grazing = float(1).sub(normalWorld.dot(toEye).abs()).clamp(0, 1).pow(2.6)
  const lit = normalWorld.dot(vec3(key.x, key.y, key.z)).mul(0.5).add(0.5).pow(1.5)
  return grazing.mul(lit).mul(strength)
}

export interface FlyingSurfaces {
  materials: Record<Kind | 'figure' | 'cord', Material>
  sets: Set<MaterialSet>
}

export async function flyingSurfaces(stack: Stack): Promise<FlyingSurfaces> {
  const names = ['oak-veneer-light', 'linen', 'rope', 'iron-forged', 'leather-worn'] as const
  const loaded = await Promise.all(names.map(n => loadMachineMaterial(stack, n)))
  const set = Object.fromEntries(names.map((n, i) => [n, loaded[i]!])) as Record<(typeof names)[number], MaterialSet>
  const sets = new Set<MaterialSet>(loaded)
  const surface = (name: string, s: MaterialSet, metal = 0): MeshStandardNodeMaterial => {
    const m = new MeshStandardNodeMaterial({ metalness: metal, roughness: s.roughness })
    m.name = `flying-machine:${name}:${s.name}`
    return m
  }
  const dressed = (s: MaterialSet): boolean => materialDressed(s)

  // CANE: a hard glassy skin of long fibres, its nodes in the vertex tone
  const cane = surface('cane', set['oak-veneer-light'])
  {
    const s = set['oak-veneer-light']
    const d = stack.detail(cane, { ...s, normalStrength: 0.12, scales: [0.3, 0.03, 0.0008], grain: s.grain ? { ...s.grain, relief: 0.06, shade: 0.1, sheen: 0.3 } : null }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 40] })
    cane.colorNode = lin('#b39a66').mul(luma(d.albedo).mul(0.35).add(0.72)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(keyRim(0.7).add(1))
    cane.roughnessNode = d.roughness.mul(0.45).clamp(0.26, 0.42)
  }
  // FIR (74r's frame): pale, straight grained, planed
  const fir = surface('fir', set['oak-veneer-light'])
  {
    const s = set['oak-veneer-light']
    const d = stack.detail(fir, { ...s, normalStrength: 0.14, grain: s.grain ? { ...s.grain, relief: 0.08, shade: 0.14, sheen: 0.05 } : null }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 40] })
    fir.colorNode = lin('#c2a878').mul(luma(d.albedo).mul(0.7).add(0.42)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(keyRim(0.5).add(1))
    fir.roughnessNode = d.roughness.max(0.55)
  }
  // OAK, turned: the hubs, sheaves and drums
  const wood = surface('wood', set['oak-veneer-light'])
  {
    const s = set['oak-veneer-light']
    const d = stack.detail(wood, { ...s, normalStrength: 0.18 }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    wood.colorNode = lin('#7a5d3e').mul(luma(d.albedo).mul(0.7).add(0.35)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(keyRim(0.4).add(1))
    wood.roughnessNode = d.roughness.max(0.5)
  }
  // ASH, the bow: pale and close grained
  const ash = surface('ash', set['oak-veneer-light'])
  {
    const s = set['oak-veneer-light']
    const d = stack.detail(ash, { ...s, normalStrength: 0.12 }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    ash.colorNode = lin('#b7a07a').mul(luma(d.albedo).mul(0.6).add(0.45)).mul(d.occlusion).mul(keyRim(0.5).add(1))
    ash.roughnessNode = d.roughness.max(0.48)
  }
  // FUSTIAN (74r B), unbleached: a heavy cloth whose folds sit in the
  // albedo as well as the normal, so the shaded face is not one value
  const skin = surface('skin', set['linen'])
  {
    const s = set['linen']
    const d = stack.detail(skin, { ...s, normalStrength: 0.3, grain: s.grain ? { ...s.grain, pitch: 0.16, relief: 0.28, shade: 0.36, sheen: 0.025, fold: 0.9, tooth: 0.008 } : null }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [12, 100] })
    skin.side = DoubleSide
    skin.colorNode = lin('#d8cba9').mul(luma(d.albedo)).mul(d.occlusion).mul(attribute('color', 'vec3'))
  }
  // HEMP: the lashings, the hems and the running cords
  const hemp = (name: string, tint: string, toned = true): MeshStandardNodeMaterial => {
    const s = set['rope']
    const m = surface(name, s)
    const d = stack.detail(m, s, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    const base = lin(tint).mul(luma(d.albedo).mul(0.6).add(0.5)).mul(d.occlusion).mul(keyRim(0.6).add(1))
    m.colorNode = toned ? base.mul(attribute('color', 'vec3')) : base
    m.roughnessNode = d.roughness.max(0.62)
    return m
  }
  const lash = hemp('lash', '#8e7a55'), hem = hemp('hem', '#9a8762'), cord = hemp('cord', '#978360', false)
  // IRON off the smith's hammer: dark, a soft skin, the key on its edges
  const iron = surface('iron', set['iron-forged'], 0.45)
  {
    const s = set['iron-forged']
    const d = stack.detail(iron, { ...s, normalStrength: 0.3, scale: [0.3, 0.3], scales: [0.25, 0.045, 0.0012], detail: { ...s.detail, macro: 0.25, macroContrast: 0.2, mid: 0.45, micro: 0.2 } }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [12, 100] })
    const edge = keyRim(0.8)
    iron.colorNode = lin('#6f7272').mul(luma(d.albedo).mul(0.6).add(0.34)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(edge.add(1))
    iron.roughnessNode = d.roughness.mul(0.8).clamp(0.38, 0.7)
  }
  // LEATHER, the stirrups: tanned, creased where the foot bends it
  const leather = surface('leather', set['leather-worn'])
  {
    const s = set['leather-worn']
    const d = stack.detail(leather, { ...s, normalStrength: 0.45 }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    leather.colorNode = lin('#5e4431').mul(luma(d.albedo).mul(0.8).add(0.3)).mul(d.occlusion)
    leather.roughnessNode = d.roughness.clamp(0.58, 0.92)
  }
  // CHAMOIS (79v): the sling, soft and pale
  const chamois = surface('chamois', set['leather-worn'])
  {
    const s = set['leather-worn']
    const d = stack.detail(chamois, { ...s, normalStrength: 0.25 }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    chamois.side = DoubleSide
    chamois.colorNode = lin('#a98a64').mul(luma(d.albedo).mul(0.5).add(0.6)).mul(d.occlusion).mul(attribute('color', 'vec3'))
    chamois.roughnessNode = d.roughness.clamp(0.75, 0.95)
  }
  // the grey figure: a marker, plain, no maps
  const figure = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.82 })
  figure.name = 'flying-machine:figure:plain'
  figure.colorNode = lin('#7f7f7c')
  return {
    materials: { cane, fir, wood, ash, skin, lash, hem, cord, iron, leather, chamois, figure },
    sets,
  }
}
