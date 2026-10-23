/** THE FLYING MACHINE WITH BEATING WINGS, the museum's reconstruction from
 * Manuscript B, folio 74 verso. 74v draws the frame, the pivot M, the cords
 * and pulleys and two bare spars, and names the moves; the skin is borrowed
 * from 74r, the bound cane from 77v, the sling from 79v. Every size is ours.
 *
 * It keeps the machine contract but is not assembled from dossier
 * primitives: the parts are built from flying/plan.ts. The object's origin
 * is on the floor under the pivot; the body needs the bench's support.
 */
import {
  Bone, Box3, BufferAttribute, Float32BufferAttribute, Group, Matrix4, Mesh, Quaternion, Skeleton, SkinnedMesh, Sphere, Uint16BufferAttribute, Vector3,
  type BufferGeometry, type Material, type Object3D,
} from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MaterialSet, Stack } from '../../../stack'
import { createMutableSweep, type MutableSweep } from './geometry'
import { materialDressed, materialFailure } from './parts'
import type { ReadyMachineBuild } from './runtime'
import { showcaseCatalog } from './showcase'
import {
  AXIS, DRUM, PERIOD, PLANTAR, SHEAVE, ankleAt, bowLift, drumTop, flyingJoints, hubCentre, lowerCord, sheaveAxis, sheaveCentre,
  shinLift, springRingLocal, stirrupTravel, strokeAt, toeDirection, twistAt, twistEye, twistTipLocal, wingPoint,
} from './flying/plan'
import { CORD, bowGeometryInto, bowTip, buildBody, buildDrum, buildSheave, buildStirrup, buildWing, type Batch, type Kind } from './flying/parts'
import { Mesher, type V3 } from './flying/shapes'
import { makeFigure, type Figure } from './flying/figure'
import { gripAt, pilotJoints } from './flying/pilot'
import { flyingSurfaces } from './flying/surface'

const SLUG = 'flying-machine' as const
/** the swept envelope over a whole beat, measured from the parts (r1 check) */
const ENVELOPE = { min: [-5.9, 0, -2.0] as const, max: [5.9, 5.45, 1.25] as const }

/** A hemp wrap stands 4 mm proud of its cane, under one texel of any shadow
 * map here (7 to 14 mm), yet it is half the machine's triangles and every
 * shadowed light draws it again. It takes shadows; it casts none. */
const SHADOWLESS: ReadonlySet<Kind> = new Set<Kind>(['lash', 'hem'])

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

  const strokes: Bone[] = [], rolls: Bone[] = [], sheaves: Bone[] = [], drums: Bone[] = [], stirrups: Bone[] = []
  const cords: { sweep: MutableSweep; points: () => V3[] }[] = []
  let bow: { geometry: BufferGeometry } | null = null
  let pilot: Figure | null = null

  const qStroke = new Quaternion(), qRoll = new Quaternion(), axis = new Vector3(...AXIS), xAxis = new Vector3(1, 0, 0)
  const basis = new Matrix4(), fx = new Vector3(), fy = new Vector3(), fz = new Vector3()

  /** Every moving group is a bone, and each material is one skinned mesh over
   * all of them: a draw per material per pass instead of one per part (the
   * phone tier's budget counts draws, and each shadowed light draws again). */
  const bones: Bone[] = []
  const pieces: { bone: Bone; batch: Batch }[] = []
  function bone(name: string, parent: Object3D): Bone {
    const b = new Bone(); b.name = name
    parent.add(b); bones.push(b)
    return b
  }
  function skin(mats: Record<string, Material>): void {
    object.updateWorldMatrix(true, true)
    const toObject = new Matrix4().copy(object.matrixWorld).invert(), rel = new Matrix4()
    const byKind = new Map<Kind, BufferGeometry[]>()
    for (const { bone: b, batch } of pieces) {
      const index = bones.indexOf(b)
      rel.multiplyMatrices(toObject, b.matrixWorld)
      for (const [kind, g] of Object.entries(batch) as [Kind, BufferGeometry][]) {
        g.applyMatrix4(rel)
        const n = g.getAttribute('position').count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
        for (let i = 0; i < n; i++) { si[i * 4] = index; sw[i * 4] = 1 }
        g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4))
        g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4))
        const list = byKind.get(kind) ?? []
        list.push(g); byKind.set(kind, list)
      }
    }
    const skeleton = new Skeleton(bones)
    const sphere = bounds.getBoundingSphere(new Sphere())
    for (const [kind, list] of byKind) {
      const geometry = list.length === 1 ? list[0]! : mergeGeometries(list, false)
      if (!geometry) throw new Error(`the ${kind} parts could not be merged`)
      if (geometry !== list[0]) for (const g of list) g.dispose()
      geometries.add(geometry)
      const mesh = new SkinnedMesh(geometry, mats[kind]!)
      mesh.name = `machine:${kind}`
      mesh.castShadow = !SHADOWLESS.has(kind)
      mesh.receiveShadow = true
      // the bones move the parts after the bounds are taken: the swept envelope holds them all
      mesh.frustumCulled = false
      object.add(mesh)
      mesh.bind(skeleton)
      mesh.boundingBox = bounds.clone(); mesh.boundingSphere = sphere.clone()
      parts.set(mesh.name, { node: mesh, geometry })
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
      sheaves[k]!.rotation.x = side * stirrupTravel(t, side) / SHEAVE_R
      drums[k]!.rotation.z = side * bowLift(t, side) / DRUM_R
      // the heel's strap rides on the foot: across, the instep's side, the toes
      const lift = shinLift(t, side), toe = toeDirection(lift), ankle = ankleAt(side, lift)
      const along: V3 = [0, Math.sin(lift), -Math.cos(lift)], front: V3 = [0, -Math.cos(lift), -Math.sin(lift)]
      const c = Math.cos(PLANTAR), sn = Math.sin(PLANTAR)
      fz.set(...toe); fy.set(-along[0] * c + front[0] * sn, -along[1] * c + front[1] * sn, -along[2] * c + front[2] * sn).normalize()
      fx.crossVectors(fy, fz).normalize()
      stirrups[k]!.quaternion.setFromRotationMatrix(basis.makeBasis(fx, fy, fz))
      stirrups[k]!.position.set(ankle[0], ankle[1], ankle[2])
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
    const lower = (): V3[] => lowerCord(side, time, shinLift(time, side)).points
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
    const twist = (): V3[] => [wingPoint(side, twistTipLocal(side), time), twistEye(side), gripAt(side, time)]
    return [lower, spring, twist]
  }

  async function assemble(): Promise<void> {
    const surfaces = await flyingSurfaces(stack)
    if (disposed) return
    for (const s of surfaces.sets) sets.add(s)
    for (const m of Object.values(surfaces.materials)) materials.add(m)
    const mats = surfaces.materials as unknown as Record<string, Material>

    pieces.push({ bone: bone('body', object), batch: buildBody() })

    ;([1, -1] as const).forEach(side => {
      const name = side > 0 ? 'left' : 'right'
      const stroke = bone(`wing-${name}`, object)
      stroke.position.set(...hubCentre(side))
      const roll = bone(`wing-${name}-roll`, stroke)
      const wing = buildWing(side)
      pieces.push({ bone: stroke, batch: wing.hub }, { bone: roll, batch: wing.turning })
      strokes.push(stroke); rolls.push(roll)

      // the swivel sheave under the small hoop's crown, turned to its cord's plane
      const block = bone(`sheave-block-${name}`, object)
      block.position.set(...sheaveCentre(side))
      block.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), new Vector3(...sheaveAxis(side)))
      const sheave = bone(`sheave-${name}`, block)
      pieces.push({ bone: sheave, batch: buildSheave() })
      sheaves.push(sheave)

      const drum = bone(`drum-${name}`, object)
      drum.position.set(side * DRUM.x, DRUM.y, DRUM.z)
      pieces.push({ bone: drum, batch: buildDrum() })
      drums.push(drum)

      const stirrup = bone(`stirrup-${side > 0 ? 'f' : 'd'}`, object)
      pieces.push({ bone: stirrup, batch: buildStirrup() })
      stirrups.push(stirrup)
    })
    skin(mats)

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
