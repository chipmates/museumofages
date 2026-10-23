/** THE SCREW'S LINEN, THIN. The sheet asks for linen whose pores are stopped
 * with starch: the light on its upper face comes through it, evenly, because
 * the starch fills the weave's holes, and a doubled seam or hem passes less
 * of it, so the sewing reads against the glow. The surface the machine was
 * built with is kept node for node; only the lighting model learns that the
 * cloth is thin. A property of the material class, not documented detail.
 */
import { Color, MeshSSSNodeMaterial, type Material, type MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import { attribute, dFdx, dFdy, faceDirection, float, max, mix, mx_noise_float, normalWorldGeometry, positionLocal, smoothstep, step, uv, vec2, vec3 } from 'three/tsl'
import { benchKeyDirection } from './key'

const KEPT = ['colorNode', 'normalNode', 'roughnessNode', 'metalnessNode', 'aoNode', 'emissiveNode', 'opacityNode',
  'positionNode', 'map', 'normalMap', 'roughnessMap', 'aoMap'] as const

/** unbleached flax with the warmth the starch adds, as the light comes through it */
const THROUGH = new Color('#d9c29a')

const WARP: readonly (readonly [number, number, number])[] = [[.008, 2.5, .45], [.018, 4, .35], [.04, 6, .2]]
const WEFT: readonly (readonly [number, number, number])[] = [[.007, 2.5, .45], [.016, 4, .35], [.035, 6, .2]]

type F = Node<'float'>
function family(across: F, along: F, cells: typeof WARP, seed: number, near = .25, far = .5): F {
  const runAcross = vec2(dFdx(across), dFdy(across)).length()
  const runAlong = vec2(dFdx(along), dFdy(along)).length()
  let sum: F = float(0)
  cells.forEach(([wide, long, weight], k) => {
    const n = mx_noise_float(vec2(across.div(wide), along.div(long).add(seed + k * 17.3))) as F
    const keep = float(1).sub(smoothstep(near, far, runAcross.div(wide))).mul(float(1).sub(smoothstep(near, far, runAlong.div(long))))
    sum = sum.add(n.mul(keep).mul(weight))
  })
  return sum
}

type Probe = Record<string, unknown>
const probe = (): Probe => (globalThis as { __screwProbe?: Probe }).__screwProbe || {}

export function thinStarchedLinen(from: MeshStandardNodeMaterial, layered: boolean): Material {
  const p = probe()
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
  const coordinates = uv()
  let weave: F = float(0)
  if (p['weave'] === 'r3') weave = family(coordinates.x, coordinates.y, WARP, 3.1).add(family(coordinates.y, coordinates.x, WEFT, 41.7))
  if (Array.isArray(p['slub'])) {
    const [wide, long, amp] = p['slub'] as [number, number, number]
    const cells: typeof WARP = [[wide, long, 1], [wide * 1.7, long * 1.6, .6]]
    weave = family(coordinates.x, coordinates.y, cells, 3.1).add(family(coordinates.y, coordinates.x, cells, 41.7)).mul(amp)
  }
  if (from.colorNode && p['weave']) m.colorNode = (from.colorNode as Node<'vec3'>).mul(weave.mul(.45).add(1))
  if (from.colorNode && p['slub']) m.colorNode = (from.colorNode as Node<'vec3'>).mul(weave.add(1))
  m.roughnessNode = max((from.roughnessNode ?? float(from.roughness)) as Node<'float'>, float(.84))
  if (p['weave']) m.roughnessNode = (m.roughnessNode as F).add(weave.mul(.06)).clamp(.8, .97)
  let through = vec3(THROUGH.r, THROUGH.g, THROUGH.b).mul(attribute('color', 'vec3'))
  if (p['weave'] === 'r3') through = through.mul(weave.mul(-.8).add(1).max(.2))
  if (p['slub']) through = through.mul(weave.mul(-1).add(1))
  if (layered) through = through.mul(attribute('layers', 'float'))
  const key = benchKeyDirection()
  if (key && p['incidence']) {
    const upper = normalWorldGeometry.mul(normalWorldGeometry.y.sign()).normalize()
    const flat = Math.max(.05, key.y / Math.hypot(key.x, key.y, key.z))
    const taken = upper.dot(vec3(key.x, key.y, key.z).normalize()).max(0).div(flat)
    through = through.mul(taken)
  }
  const lobe = (p['lobe'] as number[] | undefined) ?? (p['incidence'] ? [3, 1, .08] : [1, 2, .12])
  Object.assign(m, {
    thicknessColorNode: through,
    thicknessDistortionNode: float(.3),
    thicknessPowerNode: float(lobe[0]!),
    thicknessScaleNode: float(lobe[1]!),
    thicknessAttenuationNode: float(.7),
    thicknessAmbientNode: float(lobe[2]!),
  })
  // the sun that the turn above shades still reaches this one through that
  // turn's linen, as a warm share of itself
  if (typeof p['warm'] === 'number') {
    const share = p['warm'] as number
    const l = .2126 * THROUGH.r + .7152 * THROUGH.g + .0722 * THROUGH.b
    const tint = vec3(THROUGH.r / l, THROUGH.g / l, THROUGH.b / l).mul(share)
    // three calls this with the shadow it computed; its declared type takes no argument
    ;(m as unknown as { receivedShadowNode: (shadow: Node<'float'>) => Node<'vec3'> }).receivedShadowNode = shadow => mix(tint, vec3(1, 1, 1), shadow)
  }
  // the turn above hides part of the sky from the upper face of the turn below
  if (typeof p['sky'] === 'number') {
    const k = p['sky'] as number
    const y0 = -.625, y1 = 1.875, r0 = 4.6688, r1 = 2.6
    const share = positionLocal.y.sub(y0).div(y1 - y0)
    const under = float(1).sub(smoothstep(.42, .56, share))
    const above = share.add(.5).mul(r1 - r0).add(r0)
    const r = vec2(positionLocal.x, positionLocal.z).length()
    const covered = under.mul(float(1).sub(smoothstep(above.sub(.3), above.add(.6), r)))
    const up = step(0, normalWorldGeometry.y.mul(faceDirection))
    const open = mix(float(1), float(k), covered.mul(up))
    m.aoNode = from.aoNode ? (from.aoNode as F).mul(open) : open
  }
  if (typeof p['sheen'] === 'number') {
    m.sheen = p['sheen'] as number
    m.sheenRoughness = (p['sheenRough'] as number | undefined) ?? .7
    m.sheenColor = new Color(THROUGH)
  }
  return m
}
