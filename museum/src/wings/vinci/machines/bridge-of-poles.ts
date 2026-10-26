/** THE BRIDGE OF POLES, the museum's reconstruction from the sketch on Codex
 * Atlanticus f. 71 recto (Biblioteca Ambrosiana). It keeps the machine
 * contract (a dossier, joints, a deterministic schedule, a second state) and
 * is built from its own numbers (`bridge/plan.ts`).
 *
 * What moves is the building of it, from both banks at once, with no pole
 * ever in the air on its own: each bank's first bay goes out over its seat as
 * one kit lashed on the bank and is raised on its props; every other rod is
 * pushed off the bank over the seat, slides into the stream and floats;
 * joists roll off the bank and float, the crown joist waits on logs on the
 * bank; forked props slide in along the stream bed, rise under each load and
 * walk in as it is raised, and go out in two moves: the first once the
 * second joists under the kits and the crown rods are lashed, the last once
 * the last lashing is wound. The lashings wind on as each crossing closes,
 * the bridge holds whole, then goes back in the reverse order so the cycle
 * ends where it began. `section(true)` takes the lashings off: the same
 * poles held by the weave alone, as most builds of it today stand.
 */
import { Bone, Box3, Float32BufferAttribute, Group, Mesh, PlaneGeometry, Skeleton, SkinnedMesh, Sphere, Uint16BufferAttribute, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Reflection } from '../../../stack/reflector'
import type { MaterialSet, Stack } from '../../../stack'
import { showcaseCatalog } from './showcase'
import { materialDressed, materialFailure } from './parts'
import type { ReadyMachineBuild } from './runtime'
import { BANK, ORDER, PERIOD, POLES, buildClock } from './bridge/plan'
import { bridgePoses } from './bridge/motion'
import { LASH_COARSE, LASH_FINE, POLE_COARSE, POLE_FINE, STREAM_HALF, bankGeometry, groundworkGeometry, lashingGeometry, poleGeometry, waterGeometry } from './bridge/build'
import { bridgeSurfaces } from './bridge/surface'

const SLUG = 'bridge-of-poles' as const

export function build(stack: Stack): ReadyMachineBuild {
  const record = showcaseCatalog[SLUG]
  const object = new Group()
  object.name = `vinci/${SLUG}`
  object.userData['assetClass'] = 'GENERATED'
  object.userData['manifestId'] = `vinci/machine/${SLUG}`
  object.userData['dossier'] = record.sourcePath
  object.userData['certainty'] = 'C'
  // the swept envelope: the cut bank, the bridge, and every path a pole takes to it
  const bounds = new Box3(new Vector3(-BANK.halfX, BANK.bottom, BANK.zMin), new Vector3(BANK.halfX, 3.4, BANK.zMax))

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const sets = new Set<MaterialSet>()
  const bones = new Map<string, Bone>()
  const parts = new Map<string, { node: Object3D; geometry: BufferGeometry }>()
  let lashings: Mesh | null = null, kitLashings: SkinnedMesh | null = null
  let surfaces: Awaited<ReturnType<typeof bridgeSurfaces>> | null = null
  let lashed = true
  let reflection: Reflection | null = null
  let mounted = false, disposed = false, failure: string | null = null
  let time = 0

  function applyPose(t: number): void {
    const poses = bridgePoses(t)
    for (const [id, pose] of Object.entries(poses)) {
      const bone = bones.get(id)
      if (!bone) continue
      bone.position.set(...pose.at)
      bone.quaternion.set(...pose.q)
    }
    if (surfaces) { surfaces.lashClock.value = buildClock(t); surfaces.streamClock.value = t }
  }

  async function assemble(): Promise<void> {
    surfaces = await bridgeSurfaces(stack)
    if (disposed) return
    for (const set of surfaces.sets) sets.add(set)
    for (const m of [surfaces.pole, surfaces.hemp, surfaces.earth, surfaces.water, surfaces.waterTop]) materials.add(m)
    const hero = stack.tierName() === 'hero'
    const hang = (id: string, geometry: BufferGeometry, material: Material, cast = true): Mesh => {
      geometries.add(geometry)
      const mesh = new Mesh(geometry, material)
      mesh.name = id
      mesh.castShadow = cast
      mesh.receiveShadow = true
      object.add(mesh)
      parts.set(id, { node: mesh, geometry })
      return mesh
    }
    // every pole one bone of one skinned surface: one draw a pass for all of them, each moving on its own
    object.updateWorldMatrix(true, false)
    const pieces: BufferGeometry[] = []
    POLES.forEach((p, index) => {
      const bone = new Bone()
      bone.name = p.id
      object.add(bone)
      bones.set(p.id, bone)
      const g = poleGeometry(p, hero ? POLE_FINE : POLE_COARSE)
      const n = g.getAttribute('position').count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) { si[i * 4] = index; sw[i * 4] = 1 }
      g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4))
      g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4))
      pieces.push(g)
      geometries.add(g)
      parts.set(p.id, { node: bone, geometry: g })
    })
    object.updateWorldMatrix(false, true)
    const merged = mergeGeometries(pieces, false)
    if (!merged) throw new Error('the poles could not be merged')
    geometries.add(merged)
    const poles = new SkinnedMesh(merged, surfaces.pole)
    poles.name = 'poles'
    poles.castShadow = true
    poles.receiveShadow = true
    // the bones carry the poles far from where their geometry was made: the swept envelope holds them all
    poles.frustumCulled = false
    object.add(poles)
    const skeleton = new Skeleton([...bones.values()])
    poles.bind(skeleton)
    poles.boundingBox = bounds.clone(); poles.boundingSphere = bounds.getBoundingSphere(new Sphere())
    hang('groundwork', groundworkGeometry(hero ? POLE_FINE : POLE_COARSE), surfaces.pole)
    lashings = hang('lashings', lashingGeometry(hero ? LASH_FINE : LASH_COARSE), surfaces.hemp)
    lashings.frustumCulled = false
    lashings.visible = lashed
    // the kits' own lashings, wound on the bank, ride on their joists' bones
    const kitGeometry = lashingGeometry(hero ? LASH_FINE : LASH_COARSE, true)
    geometries.add(kitGeometry)
    kitLashings = new SkinnedMesh(kitGeometry, surfaces.hemp)
    kitLashings.name = 'kit-lashings'
    kitLashings.castShadow = true
    kitLashings.receiveShadow = true
    kitLashings.frustumCulled = false
    object.add(kitLashings)
    kitLashings.bind(skeleton)
    kitLashings.boundingBox = bounds.clone(); kitLashings.boundingSphere = bounds.getBoundingSphere(new Sphere())
    kitLashings.visible = lashed
    parts.set('kit-lashings', { node: kitLashings, geometry: kitGeometry })
    hang('bank', bankGeometry(), surfaces.earth)
    hang('stream', waterGeometry(), surfaces.water, false)
    // the stream's level face: one planar pass at half resolution, as the wing's own stream; calm keeps the sky alone
    const level = hang('stream-level', new PlaneGeometry(2 * STREAM_HALF, BANK.zMax - BANK.zMin, 1, 1), surfaces.waterTop, false)
    level.rotation.x = -Math.PI / 2
    level.position.set(0, BANK.water, (BANK.zMin + BANK.zMax) / 2)
    level.updateMatrixWorld(true)
    if (stack.tierName() !== 'calm') {
      reflection = stack.reflector(level, { resolutionScale: 0.5, bounces: false, generateMipmaps: false })
      surfaces.mirror(reflection.node)
    }
    mounted = true
    applyPose(time)
    object.updateMatrixWorld(true)
  }

  const ready = assemble().catch((error: unknown) => {
    failure = error instanceof Error ? error.message : String(error)
    console.error(`The machine ${SLUG} was not built: ${failure}`)
    throw error
  })

  return {
    object,
    slug: SLUG,
    period: PERIOD,
    bounds,
    label: { ...record.label },
    ready,
    animate(t) {
      if (disposed) return
      time = Math.max(0, Number.isFinite(t) ? t : 0)
      if (mounted) applyPose(time)
    },
    joints: () => {
      const poses = bridgePoses(time)
      return { clock: buildClock(time), ...Object.fromEntries(ORDER.map(id => [`place-${id}`, poses[id]!.off])) }
    },
    tightBounds() {
      object.updateMatrixWorld(true)
      return new Box3().setFromObject(object, true)
    },
    section(enabled) {
      if (disposed) return
      lashed = !enabled
      if (lashings) lashings.visible = lashed
      if (kitLashings) kitLashings.visible = lashed
    },
    part(id) {
      return parts.get(id) ?? null
    },
    standing() {
      if (!mounted || disposed) return { mounted: false, dressed: false, error: failure }
      const bare = [...sets].filter(set => !materialDressed(set))
      const reasons = bare.flatMap(set => { const why = materialFailure(set); return why ? [`${set.name} undressed (${why})`] : [] })
      return { mounted: true, dressed: bare.length === 0, error: reasons.length ? reasons.join('; ') : null }
    },
    dispose() {
      if (disposed) return
      disposed = true
      reflection?.dispose()
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      object.clear()
      object.removeFromParent()
    },
  }
}
