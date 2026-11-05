/* THE ISHTAR GATE ON THE MAP PAGE: the gate page's own build (gate-geom.ts, gate-mesh.ts, gate-mat.ts) at its
   registered place (gateFrame: the north face's UTM and grid bearing), in place of the map's six massings of the two
   gates, which this page's build leaves out (map-plan.json keeps them for its other readers). Only the two gates and
   the court between them: the forecourt, the lion walls and the inner walls' ends stay the map's own bodies here. The
   light is the map's: its sun reaches the panels' relief through the mount, its sky and air through the renderer. */
import { Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh, type BufferGeometry, type Object3D } from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Built as MapBuilt } from './plan'
import { makeFrame } from './plan'
import { uView } from './mass'
import { buildGate, gateFrame, gateOwnParts, gateRooms, isGateMassing, type Kind } from '../gate/gate-geom'
import { animalField } from '../gate/gate-relief'
import { assemble, panelGrid } from '../gate/gate-mesh'
import { bakePanel, makeUniforms, panelMaterial, wallMaterial, C as COURSE } from '../gate/gate-mat'
import type { Namer } from '../record'
import { panelTones, toneGateWalls, type Painted } from '../record-tones'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { uniform } = TSL as unknown as Record<string, N>

/** the map's build without the massings, and the gate's own parts assembled as the gate page assembles them */
export function buildGateOnMap(built: MapBuilt, gatePlan: J) {
  const B = gateOwnParts(buildGate(gatePlan))
  const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
  const A = assemble(B, gatePlan, fields)
  return { B, A, fields, built: { ...built, prisms: built.prisms.filter((p) => !isGateMassing(p.id)) } as MapBuilt }
}

/** the panels' vertex grid here: the map comes no nearer than about 86 m with the gate in frame (stop 5's walk), where a
    device pixel is about 1.7 cm, so the relief's outline needs no finer grid than 2 cm; its shading is the material's,
    box-filtered from the height map at every distance (the gate page's own grid is 1 cm) */
const PANEL_STEP = 0.02

export interface GateOnMap {
  /** the map's build without the gate's massings: build the city's bodies from this one */
  built: MapBuilt
  /** the gate's meshes under one group at the gate's frame; `sunW` the map's sun uniform (world, toward the sun) */
  meshes: (sunW: N) => Object3D
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
  counts: Record<string, number>
}

export function mountGateOnMap(built: MapBuilt, mapPlan: J, gatePlan: J): GateOnMap {
  const { B, A, fields, built: rest } = buildGateOnMap(built, gatePlan)
  const MF = makeFrame(mapPlan), GF = gateFrame(gatePlan)
  const G2W = new Matrix4().fromArray(GF.toMap(MF.E0, MF.N0))
  const ROT = new Matrix3().setFromMatrix4(G2W)
  const U = makeUniforms({ M: mapPlan.classes.M.colour, R: mapPlan.classes.R.colour, G: mapPlan.classes.G.colour })
  U.uState.value = 2
  U.uSelf.value = Number(gatePlan.switch.selfLit?.value ?? 0)
  ;(U.uRot.value as Matrix3).copy(ROT)
  // the evidence view is the map's own switch
  U.uSwitch = uView
  const rooms = gateRooms(gatePlan)
  const schemesOf: Record<Kind, string[]> = { bull: ['yellow'], dragon: ['white'], lion: ['lionWhite', 'lionYellow'] }
  const schemeIx: Record<Kind, Array<[string, number]>> = { bull: [['yellow', 0]], dragon: [['white', 1]], lion: [['lionWhite', 2], ['lionYellow', 3]] }

  const iBs: InstancedBufferAttribute[] = []
  const meshes = (sunW: N): Object3D => {
    // the panels' relief takes the map's one sun, turned into the gate's frame
    U.uSunG = uniform(ROT.clone().transpose()).mul(sunW)
    const gate = new Group()
    gate.name = 'ishtar-gate'
    gate.matrixAutoUpdate = false
    gate.matrix.copy(G2W)
    const walls = new Mesh(A.walls, wallMaterial(U, rooms))
    walls.name = 'gate-walls'
    walls.castShadow = true
    walls.receiveShadow = true
    gate.add(walls)
    for (const set of A.panels) {
      if (!set.count) continue
      const f = fields[set.kind]
      const geo: BufferGeometry = panelGrid(f.L, 0.02, COURSE, PANEL_STEP)
      geo.setAttribute('iU', new InstancedBufferAttribute(set.iU, 3))
      geo.setAttribute('iN', new InstancedBufferAttribute(set.iN, 3))
      geo.setAttribute('iA', new InstancedBufferAttribute(set.iA, 4))
      const iB = new InstancedBufferAttribute(set.iB, 4)
      iBs.push(iB)
      geo.setAttribute('iB', iB)
      const origins = new Float32Array(set.count * 3)
      for (let i = 0; i < set.count; i++) origins.set(set.matrices.subarray(i * 16 + 12, i * 16 + 15), i * 3)
      geo.setAttribute('iO', new InstancedBufferAttribute(origins, 3))
      const im = new InstancedMesh(geo, panelMaterial(U, bakePanel(f, schemesOf[set.kind]), schemeIx[set.kind], rooms), set.count)
      for (let i = 0; i < set.count; i++) im.setMatrixAt(i, new Matrix4().fromArray(set.matrices, i * 16))
      im.instanceMatrix.needsUpdate = true
      im.castShadow = true
      im.receiveShadow = true
      im.name = `gate-panels-${set.kind}`
      gate.add(im)
    }
    gate.updateMatrixWorld(true)
    return gate
  }

  const tone = (name: Namer): Painted => {
    const walls = toneGateWalls(A.walls, A.marks, name)
    for (const set of A.panels) {
      const iB = set.iB
      panelTones(B.panels.filter((p) => p.kind === set.kind), name).forEach((t, i) => { iB[i * 4 + 2] = t })
    }
    for (const a of iBs) a.needsUpdate = true
    return walls
  }

  const setPixel = (vfovDeg: number, heightPx: number): void => {
    U.uPix.value = (2 * Math.tan((vfovDeg / 2) * (Math.PI / 180))) / heightPx
  }

  return { built: rest, meshes, tone, setPixel, counts: { ...A.counts, panels: B.panels.length } }
}
