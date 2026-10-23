/** THE SCREW'S LINEN, THIN. The sheet asks for linen whose pores are stopped
 * with starch: the light on its upper face comes through it, evenly, because
 * the starch fills the weave's holes, and a doubled seam or hem passes less
 * of it, so the sewing reads against the glow. The surface the machine was
 * built with is kept node for node; only the lighting model learns that the
 * cloth is thin. A property of the material class, not documented detail.
 */
import { Color, MeshSSSNodeMaterial, type Material, type MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import { attribute, faceDirection, float, max, mix, normalWorldGeometry, positionLocal, smoothstep, step, vec2, vec3 } from 'three/tsl'
import type { HelicoidSpec } from './sail'

const KEPT = ['colorNode', 'normalNode', 'roughnessNode', 'metalnessNode', 'aoNode', 'emissiveNode', 'opacityNode',
  'positionNode', 'map', 'normalMap', 'roughnessMap', 'aoMap'] as const

/** unbleached flax with the warmth the starch adds, as the light comes through it */
const THROUGH = new Color('#d9c29a')
/** the share of the sun one layer of the linen passes on to the turn below it */
const PASSED = .25
/** the share of the sky left to the upper face of a turn with a turn above it */
const SKY_UNDER = .3

type F = Node<'float'>

export function thinStarchedLinen(from: MeshStandardNodeMaterial, layered: boolean, spiral?: HelicoidSpec): Material {
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
  // linen, even starched, is matte: a weave's single bright pixels under a
  // grazing sun are glints the cloth cannot make, and they crawl as it turns
  m.roughnessNode = max((from.roughnessNode ?? float(from.roughness)) as F, float(.84))
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
  // Where the turn above stands between this one and the sun, the sun still
  // arrives through that turn's linen, warm and weakened, so the shade on
  // starched cloth keeps a glow and the shadow keeps its edge.
  const l = .2126 * THROUGH.r + .7152 * THROUGH.g + .0722 * THROUGH.b
  const passed = vec3(THROUGH.r / l, THROUGH.g / l, THROUGH.b / l).mul(PASSED)
  // three calls this with the shadow it computed; its declared type takes no argument
  ;(m as unknown as { receivedShadowNode: (shadow: F) => Node<'vec3'> }).receivedShadowNode = shadow => mix(passed, vec3(1, 1, 1), shadow)
  // and that turn hides most of the sky from the face looking up at it, out
  // to a little past its own rim
  if (spiral) {
    const share = positionLocal.y.sub(spiral.y0).div(spiral.y1 - spiral.y0)
    const under = float(1).sub(smoothstep(1 - 1 / spiral.turns - .08, 1 - 1 / spiral.turns + .06, share))
    const rimAbove = share.add(1 / spiral.turns).mul(spiral.r1 - spiral.r0).add(spiral.r0)
    const r = vec2(positionLocal.x, positionLocal.z).length()
    const covered = under.mul(float(1).sub(smoothstep(rimAbove.sub(.3), rimAbove.add(.6), r)))
    const up = step(0, normalWorldGeometry.y.mul(faceDirection))
    const open = mix(float(1), float(SKY_UNDER), covered.mul(up))
    m.aoNode = from.aoNode ? (from.aoNode as F).mul(open) : open
  }
  return m
}
