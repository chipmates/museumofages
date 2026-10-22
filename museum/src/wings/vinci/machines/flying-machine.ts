/** THE FLYING MACHINE WITH BEATING WINGS, the museum's reconstruction from
 * Manuscript B, folio 74 verso. 74v draws the frame, the pivot M, the cords
 * and pulleys and two bare spars, and names the moves; the skin is borrowed
 * from 74r, the bound cane from 77v, the sling from 79v. Every size is ours.
 *
 * It keeps the machine contract but is not assembled from dossier
 * primitives: the parts are built from flying/plan.ts. The object's origin
 * is on the floor under the pivot; the body needs the bench's support.
 */
import { Box3, BufferAttribute, Group, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu'
import type { MaterialSet, Stack } from '../../../stack'
import { createMutableSweep, type MutableSweep } from './geometry'
import { materialDressed, materialFailure } from './parts'
import type { ReadyMachineBuild } from './runtime'
import { showcaseCatalog } from './showcase'
import {
  AXIS, DRUM, GUIDE, PERIOD, SHEAVE, bowLift, drumTop, flyingJoints, handAt, hubCentre, lowerEyeLocal, sheaveTop,
  springRingLocal, stirrupAt, stirrupTravel, strokeAt, twistAt, twistEye, twistTipLocal, wingPoint,
} from './flying/plan'
import { CORD, bowGeometryInto, bowTip, buildBody, buildDrum, buildSheave, buildStirrup, buildWing, type Batch, type Kind } from './flying/parts'
import { Mesher, type V3 } from './flying/shapes'
import { makeFigure, type Figure } from './flying/figure'
import { pilotJoints } from './flying/pilot'
import { flyingSurfaces } from './flying/surface'

const SLUG = 'flying-machine' as const
/** the swept envelope over a whole beat, measured from the parts (r1 check) */
const ENVELOPE = { min: [-5.9, 0, -2.0] as const, max: [5.9, 5.45, 1.25] as const }

/** the sheave's rim speed and the drum's, for their turning */
const SHEAVE_R = SHEAVE.r - 0.005, DRUM_R = DRUM.r + 0.004

export function build(stack: Stack): ReadyMachineBuild {
  const record = showcaseCatalog[SLUG]
  const object = new Group()
  object.name = `vinci/${SLUG}`
  object.userData['assetClass'] = 'GENERATED'
  object.userData['manifestId'] = `vinci/machine/${SLUG}`
  object.userData['dossier'] = record.sourcePath
  object.userData['certainty'] = 'C'
  const bounds = new Box3(new Vector3(...ENVELOPE.min), new Vector3(...ENVELOPE.max))

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const sets = new Set<MaterialSet>()
  const parts = new Map<string, { node: Object3D; geometry: BufferGeometry }>()
  let mounted = false, disposed = false, failure: string | null = null
  let time = 0

  const strokes: Group[] = [], rolls: Group[] = [], sheaves: Group[] = [], drums: Group[] = [], stirrups: Group[] = []
  const cords: { sweep: MutableSweep; points: () => V3[] }[] = []
  let bow: { geometry: BufferGeometry } | null = null
  let pilot: Figure | null = null

  const qStroke = new Quaternion(), qRoll = new Quaternion(), axis = new Vector3(...AXIS), xAxis = new Vector3(1, 0, 0)

  function addBatch(parent: Object3D, batch: Batch, mats: Record<string, Material>, id: string): void {
    for (const [kind, geometry] of Object.entries(batch) as [Kind, BufferGeometry][]) {
      geometries.add(geometry)
      const mesh = new Mesh(geometry, mats[kind]!)
      mesh.name = `${id}:${kind}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      if (!parts.has(`${id}:${kind}`)) parts.set(`${id}:${kind}`, { node: mesh, geometry })
    }
  }

  function applyPose(t: number): void {
    const stroke = strokeAt(t), twist = twistAt(t)
    ;([1, -1] as const).forEach((side, k) => {
      qStroke.setFromAxisAngle(axis, stroke * side)
      strokes[k]!.quaternion.copy(qStroke)
      qRoll.setFromAxisAngle(xAxis, -twist)
      rolls[k]!.quaternion.copy(qRoll)
      // the sheave turns with the cord that runs over it, the drum with the bow's cord
      sheaves[k]!.rotation.x = -stirrupTravel(t, side) / SHEAVE_R
      drums[k]!.rotation.z = side * bowLift(t, side) / DRUM_R
      const s = stirrupAt(side, t)
      stirrups[k]!.position.set(s[0], s[1], s[2])
    })
    for (const cord of cords) cord.sweep.update(cord.points())
    if (bow) {
      const m = new Mesher()
      bowGeometryInto(m, bowLift(t, 1), bowLift(t, -1))
      const pos = bow.geometry.getAttribute('position') as BufferAttribute, nor = bow.geometry.getAttribute('normal') as BufferAttribute
      ;(pos.array as Float32Array).set(m.p); (nor.array as Float32Array).set(m.n)
      pos.needsUpdate = true; nor.needsUpdate = true
      bow.geometry.computeBoundingSphere()
    }
    pilot?.pose(pilotJoints(t))
    object.updateMatrixWorld(true)
  }

  /** the three cords of each side, as polylines with a fixed count of nodes */
  function cordPaths(side: 1 | -1): (() => V3[])[] {
    const lower = (): V3[] => {
      const eye = wingPoint(side, lowerEyeLocal(side), time)
      const top = sheaveTop(side)
      const r = SHEAVE.r - 0.004
      const wrap: V3[] = [-30, -60, -90].map(a => {
        const rad = a * Math.PI / 180
        return [side * SHEAVE.x, SHEAVE.y + r * Math.sin(rad), SHEAVE.z + r * Math.cos(rad)]
      })
      const guide: V3 = [side * GUIDE.x, GUIDE.y + 0.002, GUIDE.z]
      return [eye, top, ...wrap, guide, stirrupAt(side, time)]
    }
    const spring = (): V3[] => {
      // the lever over this side is the other wing's
      const ring = wingPoint((-side) as 1 | -1, springRingLocal((-side) as 1 | -1), time)
      const r = DRUM.r + 0.004
      const wrap: V3[] = [70, 40, 10].map(a => {
        const rad = a * Math.PI / 180
        return [side * (DRUM.x + r * Math.cos(rad)), DRUM.y + r * Math.sin(rad), DRUM.z - 0.02]
      })
      return [ring, drumTop(side), ...wrap, bowTip(side, bowLift(time, side))]
    }
    const twist = (): V3[] => [wingPoint(side, twistTipLocal(side), time), twistEye(side), handAt(side, time)]
    return [lower, spring, twist]
  }

  async function assemble(): Promise<void> {
    const surfaces = await flyingSurfaces(stack)
    if (disposed) return
    for (const s of surfaces.sets) sets.add(s)
    for (const m of Object.values(surfaces.materials)) materials.add(m)
    const mats = surfaces.materials as unknown as Record<string, Material>

    const body = new Group(); body.name = 'body'; object.add(body)
    addBatch(body, buildBody(), mats, 'body')

    ;([1, -1] as const).forEach(side => {
      const name = side > 0 ? 'left' : 'right'
      const stroke = new Group(); stroke.name = `wing-${name}`
      stroke.position.set(...hubCentre(side))
      object.add(stroke)
      const roll = new Group(); roll.name = `wing-${name}-roll`
      stroke.add(roll)
      const wing = buildWing(side)
      addBatch(stroke, wing.hub, mats, `hub-${name}`)
      addBatch(roll, wing.turning, mats, `wing-${name}`)
      strokes.push(stroke); rolls.push(roll)

      const sheave = new Group(); sheave.name = `sheave-${name}`
      sheave.position.set(side * SHEAVE.x, SHEAVE.y, SHEAVE.z)
      object.add(sheave)
      addBatch(sheave, buildSheave(), mats, `sheave-${name}`)
      sheaves.push(sheave)

      const drum = new Group(); drum.name = `drum-${name}`
      drum.position.set(side * DRUM.x, DRUM.y, DRUM.z)
      object.add(drum)
      addBatch(drum, buildDrum(), mats, `drum-${name}`)
      drums.push(drum)

      const stirrup = new Group(); stirrup.name = `stirrup-${side > 0 ? 'f' : 'd'}`
      object.add(stirrup)
      addBatch(stirrup, buildStirrup(), mats, stirrup.name)
      stirrups.push(stirrup)
    })

    const tier = stack.tierName()
    for (const side of [1, -1] as const) {
      const [lower, spring, twist] = cordPaths(side)
      for (const [id, points, radius] of [['lower', lower!, CORD.lower], ['spring', spring!, CORD.spring], ['twist', twist!, CORD.twist]] as const) {
        const sweep = createMutableSweep(points(), radius, true, tier)
        geometries.add(sweep.geometry)
        const mesh = new Mesh(sweep.geometry, mats['cord']!)
        mesh.name = `cord-${id}-${side > 0 ? 'left' : 'right'}`
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.frustumCulled = false
        object.add(mesh)
        cords.push({ sweep, points })
        parts.set(mesh.name, { node: mesh, geometry: sweep.geometry })
      }
    }

    {
      const m = new Mesher()
      bowGeometryInto(m, bowLift(0, 1), bowLift(0, -1))
      const geometry = m.geometry()
      geometries.add(geometry)
      const mesh = new Mesh(geometry, mats['ash']!)
      mesh.name = 'bow:ash'
      mesh.castShadow = true; mesh.receiveShadow = true
      object.add(mesh)
      bow = { geometry }
      parts.set('bow', { node: mesh, geometry })
    }

    pilot = makeFigure(mats['figure']!, 'pilot')
    pilot.group.userData['marker'] = 'the museums\' reading: a man lying face down'
    object.add(pilot.group)

    mounted = true
    applyPose(time)
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
    joints: () => flyingJoints(time),
    tightBounds() {
      object.updateMatrixWorld(true)
      return new Box3().setFromObject(object, true)
    },
    section() { /* nothing to open: the frame is open already */ },
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
      pilot?.dispose()
      object.clear()
      object.removeFromParent()
    },
  }
}
