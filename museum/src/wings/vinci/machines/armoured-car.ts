/** THE ARMOURED CAR, the museum's reconstruction from the sheet in the
 * British Museum (1860,0616.99). It keeps the machine contract (a dossier,
 * joints, a deterministic schedule, a section view) and is built from its
 * own numbers (`car/plan.ts`), not from dossier primitives.
 *
 * The drive is built as the sheet draws it, so it binds: one crank turn
 * turns the front and rear wheels of a side against each other, and the car
 * never rolls. `section(true)` is the sheet's own second state, an inspection
 * view: the cover and the guns are lifted off so the drive shows.
 */
import { Box3, Group, Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu'
import type { MaterialSet, Stack } from '../../../stack'
import { courtCatalog } from './catalog'
import { loadMachineMaterial, materialDressed, materialFailure } from './parts'
import type { ReadyMachineBuild } from './runtime'
import { HUB, PERIOD, SHAFT, SHAFTS, WHEELS, carJoints } from './car/plan'
import { buildBodies, shaft, wheel, type Body, type Surface } from './car/build'
import { SET_OF, carSurface, plainSurface } from './car/surface'

const SLUG = 'armoured-car' as const
const SURFACES: readonly Surface[] = ['rough', 'fine', 'iron', 'bronze']

export function build(stack: Stack): ReadyMachineBuild {
  const record = courtCatalog[SLUG]
  const object = new Group()
  object.name = `vinci/${SLUG}`
  object.userData['assetClass'] = 'GENERATED'
  object.userData['manifestId'] = `vinci/machine/${SLUG}`
  object.userData['dossier'] = record.sourcePath
  object.userData['certainty'] = 'C'
  const { x, y, z } = record.dossier.scale_m
  const bounds = new Box3(new Vector3(-x / 2, 0, -z / 2), new Vector3(x / 2, y, z / 2))

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const sets = new Set<MaterialSet>()
  const parts = new Map<string, { node: Object3D; geometry: BufferGeometry }>()
  const turning = new Map<string, Group>()
  let cover: Group | null = null, guns: Group | null = null
  let sectionEnabled = false
  let mounted = false, disposed = false, failure: string | null = null
  let time = 0

  function applyPose(t: number): void {
    const joints = carJoints(t)
    for (const w of WHEELS) { const g = turning.get(w.id); if (g) g.rotation.z = joints[w.id]! }
    for (const s of SHAFTS) { const g = turning.get(s.id); if (g) g.rotation.x = joints[s.id]! }
  }
  function applySection(): void {
    if (cover) cover.visible = !sectionEnabled
    if (guns) guns.visible = !sectionEnabled
  }

  async function assemble(): Promise<void> {
    const loaded = await Promise.all(SURFACES.map(kind => loadMachineMaterial(stack, SET_OF[kind])))
    if (disposed) return
    const surface = {} as Record<Surface, Material>
    SURFACES.forEach((kind, i) => {
      const set = loaded[i]!
      sets.add(set)
      const material = materialDressed(set) ? carSurface(stack, set, kind) : plainSurface(kind)
      materials.add(material)
      surface[kind] = material
    })
    /** One mesh per surface of a body, hung from `parent`; the body's oak mesh names it. */
    const hang = (id: string, parent: Group, made: Body): void => {
      for (const kind of SURFACES) {
        const kit = made[kind]
        if (kit.count === 0) continue
        const geometry = kit.geometry()
        geometries.add(geometry)
        const mesh = new Mesh(geometry, surface[kind])
        mesh.name = `${id}:${kind}`
        mesh.castShadow = true
        mesh.receiveShadow = true
        parent.add(mesh)
        if (!parts.has(id)) parts.set(id, { node: mesh, geometry })
      }
    }
    const bodies = buildBodies()
    const tub = new Group(); tub.name = 'tub'; object.add(tub)
    hang('tub', tub, bodies.tub)
    cover = new Group(); cover.name = 'cover'; object.add(cover)
    hang('cover', cover, bodies.cover)
    guns = new Group(); guns.name = 'guns'; object.add(guns)
    hang('guns', guns, bodies.guns)
    for (const w of WHEELS) {
      const g = new Group(); g.name = w.id
      g.position.set(w.sx * HUB.x, HUB.y, w.sz * HUB.z)
      object.add(g)
      turning.set(w.id, g)
      hang(w.id, g, wheel(w.sx, w.sz))
    }
    for (const s of SHAFTS) {
      const g = new Group(); g.name = s.id
      g.position.set(0, HUB.y, s.sz * SHAFT.z)
      object.add(g)
      turning.set(s.id, g)
      hang(s.id, g, shaft(s.sz))
    }
    mounted = true
    applySection()
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
    joints: () => carJoints(time),
    tightBounds() {
      object.updateMatrixWorld(true)
      return new Box3().setFromObject(object, true)
    },
    section(enabled) {
      if (disposed) return
      sectionEnabled = enabled
      applySection()
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
