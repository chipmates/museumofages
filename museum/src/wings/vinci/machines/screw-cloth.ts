/** THE SCREW'S LINEN, THIN. The sheet asks for linen whose pores are stopped
 * with starch: the light on its upper face comes through it, evenly, because
 * the starch fills the weave's holes, and a doubled seam or hem passes less
 * of it, so the sewing reads against the glow. The surface the machine was
 * built with is kept node for node; only the lighting model learns that the
 * cloth is thin. A property of the material class, not documented detail.
 */
import { Color, MeshSSSNodeMaterial, type Material, type MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, float, vec3 } from 'three/tsl'

const KEPT = ['colorNode', 'normalNode', 'roughnessNode', 'metalnessNode', 'aoNode', 'emissiveNode', 'opacityNode',
  'positionNode', 'map', 'normalMap', 'roughnessMap', 'aoMap'] as const

/** unbleached flax with the warmth the starch adds, as the light comes through it */
const THROUGH = new Color('#d9c29a')

export function thinStarchedLinen(from: MeshStandardNodeMaterial, layered: boolean): Material {
  const m = new MeshSSSNodeMaterial()
  const source = from as unknown as Record<string, unknown>, target = m as unknown as Record<string, unknown>
  for (const key of KEPT) if (source[key] != null) target[key] = source[key]
  m.color.copy(from.color)
  m.roughness = from.roughness
  m.metalness = from.metalness
  m.side = from.side
  m.shadowSide = from.shadowSide
  m.name = `${from.name}:thin`
  m.userData = { ...from.userData }
  // the stitch rows ride in the vertex colour, the doubled layers in `layers`
  let through = vec3(THROUGH.r, THROUGH.g, THROUGH.b).mul(attribute('color', 'vec3'))
  if (layered) through = through.mul(attribute('layers', 'float'))
  Object.assign(m, {
    thicknessColorNode: through,
    thicknessDistortionNode: float(.3),
    thicknessPowerNode: float(1),
    thicknessScaleNode: float(2),
    thicknessAttenuationNode: float(.7),
    thicknessAmbientNode: float(.12),
  })
  return m
}
