/** THE PARACHUTE'S HEM, one part along each base pole: the cloth's edge folded
 * round a bolt rope of laid hemp, and the lacing that holds the hem to the pole,
 * a 4 mm cord through the hem's eyelets and round the pole (`lacing-0..3` in the
 * dossier). No source shows the hem's making: it is the simplest honest cord,
 * ours (certainty C). The lacing's helix, lit where each turn crosses the pole,
 * read far off as a row of beads; so the bolt rope carries the hem's line at every
 * distance, a cord never under a pixel and a half across, its lay drawn only where
 * a pixel holds it, and the lacing shows its turns only where it is two pixels
 * across, drawing back into the pole and the rope as it thins.
 */
import { BufferGeometry, Float32BufferAttribute, type MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, cameraPosition, cameraProjectionMatrix, cos, float, fwidth, mix, modelWorldMatrix, normalLocal, normalView, positionLocal, positionView, screenSize, smoothstep, uv, vec4 } from 'three/tsl'
import type { TierName } from '../../../stack'
import type { Dossier, PartSpec } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
type V3 = [number, number, number]

/** the hem's numbers, metres: the bolt rope's radius and its lay's length, the lacing's own radius, its round over the
 * pole and over the bolt rope where it passes the cloth, and how far either side of the cloth its round swells */
export const HEM = { bolt: .006, lay: .084, cord: .002, round: .0265, over: .040, swell: 40 } as const
const DEG = Math.PI / 180
const count = (tier: TierName, hero: number, standard: number, calm: number): number =>
  tier === 'hero' ? hero : tier === 'calm' ? calm : standard

/** a part of the hem: the parachute's lacing records */
export const isHem = (slug: string, part: PartSpec): boolean => slug === 'parachute' && /lacing/.test(part.material.class)

interface Pole { a: V3; u: V3; length: number; r: number; inward: V3; cloth: V3; along: [number, number] }
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(...a))

/** the pole a lacing runs along (`frame-<n>` for `lacing-<n>`), the cloth's way off it (toward the canopy's apex, square
 * to the pole) and the stretch of the pole the lacing covers */
export function hemPole(dossier: Dossier, part: PartSpec): Pole {
  const n = part.id.split('-').pop()
  const frame = dossier.parts.find(p => p.id === `frame-${n}`)
  const canopy = dossier.parts.find(p => p.id === 'canopy')
  const fs = frame && typeof frame.shape !== 'string' ? frame.shape : undefined
  const cs = canopy && typeof canopy.shape !== 'string' ? canopy.shape : undefined
  const ends = fs?.centreline_m as readonly (readonly number[])[] | undefined
  const corners = cs?.vertices_m as readonly (readonly number[])[] | undefined
  const line = (typeof part.shape !== 'string' ? part.shape.centreline_m : undefined) as readonly (readonly number[])[] | undefined
  if (!ends || !corners || !line || fs?.radius_m === undefined) throw new Error(`The hem ${part.id} has no pole or cloth to lie on`)
  const a = ends[0]!.slice(0, 3) as V3, b = ends[ends.length - 1]!.slice(0, 3) as V3
  const u = unit(sub(b, a)), length = Math.hypot(...sub(b, a))
  const apex = corners.map(c => [c[0]!, c[1]!, c[2]!] as V3).reduce((top, c) => (c[1] > top[1] ? c : top))
  const off = sub(apex, a), square = sub(off, scale(u, dot(off, u)))
  const level: V3 = [square[0], 0, square[2]]
  const s0 = dot(sub(line[0]!.slice(0, 3) as V3, a), u), s1 = dot(sub(line[line.length - 1]!.slice(0, 3) as V3, a), u)
  return { a, u, length, r: fs.radius_m, inward: unit(level), cloth: unit(square), along: [Math.min(s0, s1), Math.max(s0, s1)] }
}

/** the lacing's round at angle `phi` from the level inward way (radians, up positive): over the pole, swelling smoothly
 * over the bolt rope where it passes the cloth at `cloth` */
export function lacingRound(phi: number, cloth: number): number {
  let d = (phi - cloth) / DEG
  d = ((d + 180) % 360 + 360) % 360 - 180
  const k = Math.abs(d) < HEM.swell ? Math.cos(Math.PI / 2 * d / HEM.swell) ** 2 : 0
  return HEM.round + (HEM.over - HEM.round) * k
}

/** THE HEM'S GEOMETRY: the lacing as the dossier lays it (`lacing`, its own swept cord) and the bolt rope along the pole
 * at the cloth's edge, one surface. `aHem`: 1 on the lacing and 0 on the rope, then each point's offset from the pole's
 * axis (the lacing draws back along it) */
export function hemGeometry(dossier: Dossier, part: PartSpec, lacing: BufferGeometry, tier: TierName): BufferGeometry {
  const pole = hemPole(dossier, part)
  const lace = lacing.index ? lacing.toNonIndexed() : lacing.clone()
  const lp = lace.getAttribute('position')
  const laceHem = new Float32Array(lp.count * 4)
  for (let i = 0; i < lp.count; i++) {
    const p: V3 = [lp.getX(i), lp.getY(i), lp.getZ(i)], rel = sub(p, pole.a), off = sub(rel, scale(pole.u, dot(rel, pole.u)))
    laceHem.set([1, ...off], i * 4)
  }
  lace.setAttribute('aHem', new Float32BufferAttribute(laceHem, 4))
  // the bolt rope: straight along the pole, its centre where the cloth leaves the pole's round; its lay is shading
  const sides = count(tier, 9, 7, 6), step = count(tier, .05, .07, .1)
  const [s0, s1] = [pole.along[0] - .06, pole.along[1] + .06]
  const rings = Math.max(2, Math.ceil((s1 - s0) / step) + 1)
  const centre = scale(pole.cloth, pole.r + HEM.bolt)
  const side = unit([pole.u[1] * pole.cloth[2] - pole.u[2] * pole.cloth[1], pole.u[2] * pole.cloth[0] - pole.u[0] * pole.cloth[2], pole.u[0] * pole.cloth[1] - pole.u[1] * pole.cloth[0]])
  const position: number[] = [], normal: number[] = [], uvs: number[] = [], hem: number[] = [], index: number[] = []
  for (let i = 0; i < rings; i++) {
    const s = s0 + (s1 - s0) * i / (rings - 1), on = add(add(pole.a, scale(pole.u, s)), centre)
    for (let j = 0; j <= sides; j++) {
      const t = 2 * Math.PI * j / sides, n = add(scale(pole.cloth, Math.cos(t)), scale(side, Math.sin(t)))
      const p = add(on, scale(n, HEM.bolt))
      position.push(...p); normal.push(...n); uvs.push(t * HEM.bolt, s - s0)
      hem.push(0, ...sub(p, add(pole.a, scale(pole.u, s))))
    }
  }
  for (let i = 0; i + 1 < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, c = a + sides + 1
    index.push(a, a + 1, c, a + 1, c + 1, c)
  }
  // its ends turned in under the cloth: a cap of the rope's own round
  for (const end of [0, rings - 1]) {
    const s = s0 + (s1 - s0) * end / (rings - 1), on = add(add(pole.a, scale(pole.u, s)), centre), k = position.length / 3
    const out = scale(pole.u, end === 0 ? -1 : 1)
    position.push(...on); normal.push(...out); uvs.push(0, s - s0); hem.push(0, ...sub(on, add(pole.a, scale(pole.u, s))))
    for (let j = 0; j < sides; j++) {
      const a = end * (sides + 1) + j
      if (end === 0) index.push(k, a + 1, a); else index.push(k, a, a + 1)
    }
  }
  const rope = new BufferGeometry()
  rope.setAttribute('position', new Float32BufferAttribute(position, 3))
  rope.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  rope.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  rope.setAttribute('aHem', new Float32BufferAttribute(hem, 4))
  rope.setIndex(index)
  const flat = rope.toNonIndexed()
  rope.dispose()
  // one layout for both pieces, as the weld wants: position, normal, uv and the hem's own attribute
  for (const name of Object.keys(lace.attributes)) if (!['position', 'normal', 'uv', 'aHem'].includes(name)) lace.deleteAttribute(name)
  const merged = mergeTwo(lace, flat)
  lace.dispose(); flat.dispose()
  merged.name = `parachute:hem:${part.id}`
  return merged
}
function mergeTwo(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'aHem']) {
    const x = a.getAttribute(name), y = b.getAttribute(name)
    const data = new Float32Array((x.count + y.count) * x.itemSize)
    data.set(x.array as Float32Array, 0); data.set(y.array as Float32Array, x.count * x.itemSize)
    out.setAttribute(name, new Float32BufferAttribute(data, x.itemSize))
  }
  out.computeBoundingBox(); out.computeBoundingSphere()
  return out
}

/** THE HEM'S SURFACE, on its own copy of the parachute's rope: the bolt rope pushed out to a pixel and a half where it is
 * thinner, its lay a groove that fades before a pixel holds less than a whole turn of it, and shaded as a line facing
 * the eye until it is a few pixels across; the lacing drawn back into the pole and the rope where it is under two
 * pixels across, whole from there. The stage leaves a surface that sets its own width as it is (`ownWidth`) */
export function hemSurface(material: MeshStandardNodeMaterial): MeshStandardNodeMaterial {
  const H: N = attribute('aHem', 'vec4')
  const lacing = H.x, off = H.yzw
  // one pixel's angle at the eye: the lens's height over the drawing's
  const pixel = float(2).div(cameraProjectionMatrix.mul(vec4(0, 1, 0, 0)).y.mul(screenSize.y))
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz
  const across = world.sub(cameraPosition).length().mul(pixel)
  const shown = smoothstep(1.0, 2.2, float(2 * HEM.cord).div(across))
  const drawn = positionLocal.sub(off.mul(float(1).sub(shown).mul(.2)))
  const widened = positionLocal.add(normalLocal.mul(across.mul(.75).sub(HEM.bolt).max(0)))
  material.positionNode = mix(widened, drawn, lacing)
  // a line a few pixels wide is shaded as one: toward the eye where it is narrow, its own round where it is wide
  const seen = positionView.length().mul(pixel)
  const wide = mix(float(2 * HEM.bolt), float(2 * HEM.cord), lacing).div(seen.max(1e-9))
  const facing = float(1).sub(smoothstep(3, 6, wide))
  const own: N = (material.normalNode as N | null) ?? normalView
  material.normalNode = mix(own, positionView.normalize().negate(), facing).normalize()
  // the bolt rope's lay: three strands, each groove a little darker, gone where a pixel holds a strand
  const turn: N = uv().x.div(HEM.bolt).mul(3).sub(uv().y.mul(3 * 2 * Math.PI / HEM.lay))
  const held = float(1).sub(smoothstep(.8, 2.2, fwidth(turn)))
  const groove = cos(turn).mul(.5).add(.5).mul(held).mul(float(1).sub(lacing))
  material.colorNode = (material.colorNode as N).mul(float(1).sub(groove.mul(.22)))
  material.name = material.name.split(':').slice(0, -1).concat('hem').join(':')
  material.userData['ownWidth'] = true
  material.needsUpdate = true
  return material
}
