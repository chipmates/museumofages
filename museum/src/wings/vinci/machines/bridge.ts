/** THE BRIDGE OF POLES, the museum's reconstruction from the sketch on Codex
 * Atlanticus f. 71 recto (Biblioteca Ambrosiana). It keeps the machine
 * contract (a dossier, joints, a deterministic schedule, a second state) and
 * is built from its own numbers (`bridge/plan.ts`).
 *
 * What moves is the building of it: the poles are set one by one from the
 * pile on the near bank, the lashings wind on as each crossing closes, the
 * bridge holds whole, then goes back to the pile in the reverse order so the
 * cycle ends where it began. `section(true)` takes the lashings off: the
 * same poles held by the weave alone, as most builds of it today stand.
 */
import { Box3, Group, Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu'
import type { MaterialSet, Stack } from '../../../stack'
import { showcaseCatalog } from './showcase'
import { materialDressed, materialFailure } from './parts'
import type { ReadyMachineBuild } from './runtime'
import { BANK, ORDER, PERIOD, PILE, POLES, SEAT_HALF, SEAT_R, SEAT_XY, STAKES, buildClock, hash, type V3 } from './bridge/plan'
import { bridgePoses } from './bridge/motion'
import { bankGeometry, groundworkGeometry, lashingGeometry, poleGeometry, waterGeometry } from './bridge/build'
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
  const bounds = new Box3(new Vector3(-BANK.halfX, BANK.bottom, -BANK.halfZ), new Vector3(BANK.halfX, 4.6, 5.05))

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const sets = new Set<MaterialSet>()
  const poles = new Map<string, Mesh>()
  const parts = new Map<string, { node: Object3D; geometry: BufferGeometry }>()
  let lashings: Mesh | null = null
  let surfaces: Awaited<ReturnType<typeof bridgeSurfaces>> | null = null
  let lashed = true
  let mounted = false, disposed = false, failure: string | null = null
  let time = 0

  function applyPose(t: number): void {
    const poses = bridgePoses(t)
    for (const [id, pose] of Object.entries(poses)) {
      const mesh = poles.get(id)
      if (!mesh) continue
      mesh.position.set(...pose.at)
      mesh.quaternion.set(...pose.q)
    }
    if (surfaces) { surfaces.lashClock.value = buildClock(t); surfaces.streamClock.value = t }
  }

  async function assemble(): Promise<void> {
    surfaces = await bridgeSurfaces(stack)
    if (disposed) return
    for (const set of surfaces.sets) sets.add(set)
    for (const m of [surfaces.pole, surfaces.hemp, surfaces.earth, surfaces.water]) materials.add(m)
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
    for (const p of POLES) {
      const mesh = hang(p.id, poleGeometry(p), surfaces.pole)
      // a pole on its way stands outside its geometry's resting sphere
      mesh.frustumCulled = false
      poles.set(p.id, mesh)
    }
    const groundwork: { a: V3; b: V3; r: number; taper: number; seed: number; tone: number }[] = []
    SEAT_XY.forEach(([x, y], i) => groundwork.push({ a: [x, y, -SEAT_HALF], b: [x, y, SEAT_HALF], r: SEAT_R, taper: 0.012 * (i ? 1 : -1), seed: hash(i, 61), tone: 0.95 + 0.1 * hash(i, 62) }))
    STAKES.forEach(([x, , z], i) => groundwork.push({ a: [x, -0.4, z], b: [x, 0.19 + 0.04 * hash(i, 63), z], r: 0.042, taper: 0.004, seed: hash(i, 64), tone: 0.9 + 0.15 * hash(i, 65) }))
    for (const side of [-1, 1]) groundwork.push({ a: [PILE.x - 0.85, PILE.sleeperR - 0.02, side * PILE.sleeperZ], b: [PILE.x + 0.85, PILE.sleeperR - 0.02, side * PILE.sleeperZ], r: PILE.sleeperR, taper: 0.006, seed: hash(side, 66), tone: 0.92 })
    hang('groundwork', groundworkGeometry(groundwork), surfaces.pole)
    lashings = hang('lashings', lashingGeometry(), surfaces.hemp)
    lashings.frustumCulled = false
    lashings.visible = lashed
    hang('bank', bankGeometry(), surfaces.earth)
    hang('stream', waterGeometry(), surfaces.water, false)
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
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      object.clear()
      object.removeFromParent()
    },
  }
}
