/** What each part of the flying machine is made of, as the library dresses
 * it: cane bound with hemp (77v), fir laths and fustian (74r), forged iron,
 * turned oak, an ash bow, leather and chamois (79v). The tints are the
 * museum's; the grain is the library's photograph under them. */
import { Color, DoubleSide, MeshStandardNodeMaterial, PhysicalLightingModel, type Material } from 'three/webgpu'
import { attribute, cameraPosition, cos, diffuseColor, float, fwidth, mix, mx_noise_float, normalView, normalWorld, positionView, positionWorld, uv, vec3 } from 'three/tsl'
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

/** A pattern's contrast, faded as one pixel comes to hold more than a
 * stripe of it, so a stripe never shimmers in motion. */
function fadeByPixel(phase: N, strength: number): N {
  return float(1).sub(fwidth(phase).div(Math.PI)).clamp(0, 1).mul(strength)
}
/** hemp's lay: the strands run round the cord at a slant. The metric uv goes
 * round (u) and along (v); every cord and wrap in the build is sized to hold
 * a whole number of strands round, so the pattern closes on its seam. */
export const STRAND = 0.0088
const LAY_ALONG = 0.017
function lay(): N {
  const phase = uv().x.div(STRAND).add(uv().y.div(LAY_ALONG)).mul(Math.PI * 2)
  const groove = cos(phase).mul(0.5).add(0.5).pow(0.7)
  return float(1).sub(fadeByPixel(phase, 0.32).mul(float(1).sub(groove)))
}
/** the lay in the normal as well: each strand rounds up between its grooves.
 * The slant's direction comes from the screen's own derivatives of position
 * and uv (a cotangent frame), so no tangent attribute is needed. */
function layNormal(base: N): N {
  const n = base.normalize(), st = uv()
  const dp1 = positionView.dFdx(), dp2 = positionView.dFdy(), duv1 = st.dFdx(), duv2 = st.dFdy()
  const dp2perp = dp2.cross(n), dp1perp = n.cross(dp1)
  const gu = dp2perp.mul(duv1.x).add(dp1perp.mul(duv2.x)), gv = dp2perp.mul(duv1.y).add(dp1perp.mul(duv2.y))
  const across = gu.div(STRAND).add(gv.div(LAY_ALONG)).normalize()
  const phase = st.x.div(STRAND).add(st.y.div(LAY_ALONG)).mul(Math.PI * 2)
  // a groove 0.35 mm deep on strands 7.8 mm apart across their slant tilts the face up to 0.28
  return n.add(across.mul(phase.sin().mul(fadeByPixel(phase, 0.28)))).normalize()
}
/** cane's hard skin: fine fibres along the stem, faded with the pixel */
function fibre(): N {
  const at = vec3(uv().x.mul(620), uv().y.mul(14), 0)
  const n = mx_noise_float(at)
  return float(1).add(n.mul(fadeByPixel(uv().x.mul(620 * Math.PI), 0.09)))
}
/** cane's grain: the stem's skin shows darker fibre lines along it, a line
 * every 13 mm round the stem, each line's strength drifting along its length,
 * and the bands between them lighter or darker over a hand's length. Lines
 * hold full strength while one is 4 px from the next and are gone at 2 px,
 * so they never shimmer. */
const GRAIN = 0.013
function grain(): N {
  const p = uv().x.div(GRAIN), y = uv().y, at = p.round()
  const strength = mx_noise_float(vec3(at.mul(1.7), y.mul(6), 0.5)).mul(0.9).add(0.55).clamp(0, 1)
  const line = float(1).sub(p.sub(at).abs().div(0.16).clamp(0, 1))
  const band = mx_noise_float(vec3(p.floor().mul(2.3), y.mul(9), 3.1)).mul(1.4).clamp(-1, 1)
  const fade = float(1).sub(fwidth(p).sub(0.25).div(0.25)).clamp(0, 1)
  return float(1).sub(line.mul(strength).mul(fade).mul(0.34)).mul(band.mul(fade).mul(0.16).add(1))
}

/** A thin cloth's light: what falls on one face passes out of the other,
 * scattered, so the face turned from a lamp shows the cloth lit from behind
 * and the shadows of the ribs on it. Per light, with its own shadow. */
class ClothLighting extends PhysicalLightingModel {
  constructor(private readonly through: number) { super() }
  override direct(input: N, builder: N): void {
    const { lightDirection, lightColor, reflectedLight } = input
    const behind = normalView.dot(lightDirection).negate().clamp(0, 1)
    reflectedLight.directDiffuse.addAssign(behind.mul(lightColor).mul(diffuseColor.rgb).mul(this.through / Math.PI))
    super.direct(input, builder)
  }
}
class ClothMaterial extends MeshStandardNodeMaterial {
  through = 0
  override setupLightingModel(): N { return new ClothLighting(this.through) }
}
/** heavy unbleached cotton twill passes roughly a tenth to a quarter of the
 * light through its weave; the middle of that */
const FUSTIAN_THROUGH = 0.18

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

  // CANE: a hard skin of long fibres, its nodes, its age and its wear in the
  // vertex tone. Years in use take its yellow toward a greyed straw and its
  // gloss toward a dull sheen.
  const cane = surface('cane', set['oak-veneer-light'])
  {
    const s = set['oak-veneer-light']
    const d = stack.detail(cane, { ...s, normalStrength: 0.12, scales: [0.3, 0.03, 0.0008], grain: s.grain ? { ...s.grain, relief: 0.06, shade: 0.1, sheen: 0.3 } : null }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 40] })
    cane.colorNode = lin('#a69a80').mul(luma(d.albedo).mul(0.35).add(0.72)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(fibre()).mul(grain()).mul(keyRim(0.7).add(1))
    cane.roughnessNode = d.roughness.mul(0.6).clamp(0.36, 0.55)
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
  const skin = new ClothMaterial({ metalness: 0, roughness: set['linen'].roughness })
  skin.name = `flying-machine:skin:${set['linen'].name}`
  skin.through = FUSTIAN_THROUGH
  {
    const s = set['linen']
    const d = stack.detail(skin, { ...s, normalStrength: 0.3, grain: s.grain ? { ...s.grain, pitch: 0.16, relief: 0.28, shade: 0.36, sheen: 0.025, fold: 0.9, tooth: 0.008 } : null }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [12, 100] })
    skin.side = DoubleSide
    const cloth = lin('#d8cba9').mul(luma(d.albedo)).mul(d.occlusion).mul(attribute('color', 'vec3'))
    skin.colorNode = cloth
  }
  // HEMP: the lashings, the hems and the running cords
  const hemp = (name: string, tint: string, toned = true): MeshStandardNodeMaterial => {
    const s = set['rope']
    const m = surface(name, s)
    const d = stack.detail(m, s, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [6, 35] })
    const base = lin(tint).mul(luma(d.albedo).mul(0.6).add(0.5)).mul(d.occlusion).mul(lay()).mul(keyRim(0.6).add(1))
    m.colorNode = toned ? base.mul(attribute('color', 'vec3')) : base
    m.roughnessNode = d.roughness.max(0.62)
    m.normalNode = layNormal(m.normalNode ?? normalView)
    return m
  }
  const lash = hemp('lash', '#8e7a55'), hem = hemp('hem', '#9a8762'), cord = hemp('cord', '#978360', false)
  // IRON off the smith's hammer: dark, a soft skin, the key on its edges
  const iron = surface('iron', set['iron-forged'], 0.3)
  {
    const s = set['iron-forged']
    const d = stack.detail(iron, { ...s, normalStrength: 0.3, scale: [0.3, 0.3], scales: [0.25, 0.045, 0.0012], detail: { ...s.detail, macro: 0.25, macroContrast: 0.2, mid: 0.45, micro: 0.2 } }, { uv: uv(), count: 3, maps: dressed(s) ? 1 : 0, fade: [12, 100] })
    const edge = keyRim(0.5)
    iron.colorNode = lin('#6f7272').mul(luma(d.albedo).mul(0.6).add(0.34)).mul(d.occlusion).mul(attribute('color', 'vec3')).mul(edge.add(1))
    iron.roughnessNode = d.roughness.mul(0.8).clamp(0.52, 0.78)
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
  // the grey figure: a marker, plain, no maps; a step under the cane, so the
  // man reads as the body in the cradle, not the brightest thing in it, yet
  // apart from the cane's own dark on a small screen
  const figure = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.86 })
  figure.name = 'flying-machine:figure:plain'
  figure.colorNode = lin('#605e59')
  return {
    materials: { cane, fir, wood, ash, skin, lash, hem, cord, iron, leather, chamois, figure },
    sets,
  }
}
