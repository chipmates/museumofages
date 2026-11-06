/* BABYLON ABOUT 570 BC, THE OPENING (`/src/wings/babylon/open/open.html`):
   the whole city from the air in the evening, the first screen, then the
   flight down to the lion street in front of the Ishtar Gate, ending on the
   walk's first step. The map's city (without the bodies the gate replaces) in
   brick and earth, the gate's own build in colour, the far air, the water.
   Dev only; the rig `window.__open` takes the stills and the flight's frames.

     ?view=classes   the evidence switch: the class colours on the same scene
     ?hour=17:30     another hour for a test (the camera file's hour by default)
     ?air=0          no haze; ?sigma=0.0003&scale=700 the haze's density and height
     ?put=<url>      where the rig hands its files (the shooter's own server) */

import {
  BoxGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh,
  MeshStandardNodeMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, Vector3,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, toPNG } from '../../animals/cave/render'
import { printFrame } from '../../animals/cave/print'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from '../map/plan'
import { buildBodies, tonesFrom, uView, type Sky } from '../map/mass'
import { buildGate, gateFrame, hourOf, type V3 } from '../gate/gate-geom'
import { sunAt as mapSunAt } from '../map/sun'
import { animalField } from '../gate/gate-relief'
import { assemble, panelGrid } from '../gate/gate-mesh'
import { birdsGeometry, palmsGeometry } from '../gate/gate-life'
import { bakePanel, lifeMaterial, makeUniforms, panelMaterial, pavingMaterial, wallMaterial, C as COURSE, type Rooms } from '../gate/gate-mat'
import { airColour, createOpenLinear } from './air'
import { walkLight } from './light'
import { blockMaterial, boxMaterial, groundMaterial, houseMaterial, northMaterial, palmMaterial, streetMaterial, toneTexture, uTracts, waterMaterial } from './earth'
import { northEntry } from './north'
import { westOutwork } from './outwork'
import { editCity, groundRows, OUTER_TRACK } from './city'
import { refineBanks } from './bank'
import { merlonMesh, northMeshes } from './north-mesh'
import { rebuildHouses } from './houses'
import { buildPlain } from './plain'
import { paintPlain, palmMesh } from './green'
import { makeFlight, resolveFlight, type FlightSample } from './flight'
import { NORTH_PAVED, northPaving } from './north-paving'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { abs, max, positionWorld, step, uniform, vec3, vec4 } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`open: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plans')
const [plan, gateCams, mapPlan, cams]: [J, J, J, J] = await Promise.all([
  fetch(new URL('../gate/gate-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../gate/gate-cams.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../map/map-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('./open-cams.json', import.meta.url)).then((r) => r.json()),
])
const GF = gateFrame(plan)
const MF = makeFrame(mapPlan)
const L0: number = plan.frame.level0
let HOUR = hourOf(q.get('hour') ?? cams.hour)

/* ── the map's city without the bodies the gate replaces (as the gate page) ── */
const t0 = performance.now()
const dropB = new Set<string>(plan.frame.mapBlocksReplaced), dropW = new Set<string>(plan.frame.mapWallsReplaced)
const cityPlan = structuredClone(mapPlan)
cityPlan.blocks = cityPlan.blocks.filter((b: J) => !dropB.has(b.id))
cityPlan.walls = cityPlan.walls.filter((w: J) => !dropW.has(w.id))
/* the arrival's edits of the plan (city.ts): the north entry, the North Palace's courts, the West Fortification, the quay
   south of the bridge, the way north of the dam */
const NORTH = editCity(cityPlan, { buildPlan, northEntry, westOutwork }).north
const city = buildPlan(cityPlan)
const canalZ: number[] = []
{
  const cz = MF.s(cityPlan.canal.line[0][0], cityPlan.canal.line[0][1])[1]
  for (const d of [-2.4, -cityPlan.canal.w / 2, cityPlan.canal.w / 2, 2.4]) canalZ.push(Math.round((cz + d) * 100) / 100)
}
const B = buildGate(plan)
const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
const A = assemble(B, plan, fields)
const planMs = Math.round(performance.now() - t0)

const G2W = new Matrix4().fromArray(GF.toMap(MF.E0, MF.N0))
const W2G = G2W.clone().invert()
const ROT = new Matrix3().setFromMatrix4(G2W)
const toWorld = (p: V3): Vector3 => new Vector3(...p).applyMatrix4(G2W)
const dirWorld = (d: V3): Vector3 => new Vector3(...d).applyMatrix3(ROT).normalize()

/* ── the page ── */
const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const renderer = stack.renderer
const scene = new Scene()
// the far plane past the ground's farthest corner (its grid reaches 30 km each way): ground within about 40 m of a 30 km far
// plane read as sky in the haze's depth test and stayed unhazed, a row of dark dashes on the horizon
const camera = new PerspectiveCamera(40, 16 / 9, 0.3, Number(q.get('far') ?? 60000))
stack.setScene(scene, camera, { ...IDENTITY, name: 'babylon-open' })

const U = makeUniforms({ M: mapPlan.classes.M.colour, R: mapPlan.classes.R.colour, G: mapPlan.classes.G.colour })
U.uState.value = 2
U.uSelf.value = Number(plan.switch.selfLit?.value ?? 0)
;(U.uRot.value as Matrix3).copy(ROT)
function setView(view: 'grey' | 'classes'): void {
  const on = view === 'classes' ? 1 : 0
  U.uSwitch.value = on
  uView.value = on
}
setView(q.get('view') === 'classes' ? 'classes' : 'grey')

/* the walk's light (light.ts, the gate page's too): the sun, the air and the sky, the environment, the shadow and the print */
const uW2G = uniform(new Matrix4().copy(W2G))
const L = walkLight({ renderer, scene, light: plan.light, rot: ROT, uW2G, uSunG: U.uSunG, gateAt: toWorld([0, 10, 0]), q })
const AIR = L.AIR
const sky: Sky = { colour: L.sky }
const skyDome = L.dome

say('building the city and the gate')
const PLAIN = buildPlain(cityPlan, { reach: Number(q.get('palmReach') ?? 3600) })
const PLAIN_MAP = paintPlain(PLAIN)
const tones = tonesFrom(cityPlan)
const bodies = buildBodies(city, tones, sky, AIR.uSun, groundRows(canalZ))
scene.add(bodies.group)

/* the city's own materials (earth.ts), and per-instance tones for the boxes */
const uTime = uniform(0)
const HOUSES = { count: 0, open: 0 }
{
  const blocks = bodies.group.getObjectByName('blocks') as Mesh
  blocks.material = blockMaterial(tones, toneTexture(city.prisms.map((p) => p.id)), Math.max(1, city.prisms.length), U.uPix)
  // the map's houses give way to the arrival's own (houses.ts): the same lots, each house its own court, heights and turn
  const mapHouses = bodies.group.getObjectByName('houses') as InstancedMesh | undefined
  if (mapHouses) {
    bodies.group.remove(mapHouses)
    const H = rebuildHouses(city.boxes.filter((b) => b.group === 'house'), city.ground)
    const geo = new BoxGeometry(1, 1, 1)
    geo.deleteAttribute('uv')
    const im = new InstancedMesh(geo, houseMaterial(tones, Number(cityPlan.classes.band)), H.boxes.length)
    const n = H.boxes.length
    // packed so the instanced mesh stays inside eight vertex buffers: (house, range + 8 x butted sides, ground, block), size, class letters
    const info = new Float32Array(n * 4), size = new Float32Array(n * 3), cls = new Float32Array(n * 2)
    const m4 = new Matrix4(), qq = new Quaternion(), upY = new Vector3(0, 1, 0)
    H.boxes.forEach((b, i) => {
      qq.setFromAxisAngle(upY, b.yaw)
      m4.compose(new Vector3(b.x, (b.y0 + b.y1) / 2, b.z), qq, new Vector3(b.sx, b.y1 - b.y0, b.sz))
      im.setMatrixAt(i, m4)
      info.set([b.house, b.part + 8 * b.butt, b.gy, b.block], i * 4)
      size.set([b.sx, b.y1 - b.y0, b.sz], i * 3)
      cls.set([2, 2], i * 2)
    })
    for (const [k, v, w] of [['hinfo', info, 4], ['size', size, 3], ['cls', cls, 2]] as Array<[string, Float32Array, number]>) geo.setAttribute(k, new InstancedBufferAttribute(v, w))
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.frustumCulled = false
    im.name = 'houses'
    bodies.group.add(im)
    HOUSES.count = H.houses
    HOUSES.open = H.open
  }
  const rest = bodies.group.getObjectByName('towers-and-piers') as InstancedMesh | undefined
  if (rest) {
    const list = city.boxes.filter((b) => b.group !== 'house')
    const k = new Float32Array(list.length)
    list.forEach((b, i) => { k[i] = b.group === 'tower' ? 0 : 1 })
    rest.geometry.setAttribute('tone', new InstancedBufferAttribute(k, 1))
    rest.material = boxMaterial(tones)
  }
  // the paving ends where the record's street surface ends: the walled stretch north of the North Gate (REC
  // bab.street.north.surface, +7.5 north of the gate; bab.street.north-stretch to a = 233); the dam's crest and the way on are earth
  ;(bodies.group.getObjectByName('street') as Mesh).material = streetMaterial(tones, { o: NORTH.frame.o, a: NORTH.frame.a, c: NORTH.frame.c, pavedTo: NORTH_PAVED.a1 }, U.uPix)
  const ground = bodies.group.getObjectByName('ground') as Mesh
  // the banks the first frame and the flight see, from the moat's north bank to just south of the bridge, refined to about a
  // metre (?banks=0 keeps the coarse grid); about 1.2 s more at load on the laptop
  if (q.get('banks') !== '0') {
    const fine = refineBanks(ground.geometry, city.ground, { x0: -450, x1: 450, z0: -1700, z1: 1000 }, { soft: Number(q.get('bankSoft') ?? 1.5) })
    ground.geometry.dispose()
    ground.geometry = fine.geometry
    say(`banks: ${fine.cells} cells refined, ${fine.triangles} triangles`)
  }
  ground.material = groundMaterial(-1, { ...PLAIN_MAP, x0: PLAIN.domain.x0, z0: PLAIN.domain.z0, size: PLAIN.domain.size, uPix: U.uPix }, sky.colour, OUTER_TRACK.map(([E, N]) => MF.s(E, N)))
  // the banks fall across one cell of the 20 m grid: cast by the ground itself, their shadow drew the cells' teeth along the
  // shore under the low sun; the bank's own shading (its leaned normal) stays
  ground.castShadow = q.get('groundShadow') === '1'
  // the river and the moats mirror the scene at their level (-1.0), the canal behind the palace the sky only
  const plane = new Mesh(new PlaneGeometry(1, 1))
  plane.rotation.x = -Math.PI / 2
  plane.position.y = -1.0
  plane.updateMatrixWorld(true)
  const mirror = q.get('mirror') === '0' ? null : stack.reflector(plane, { resolutionScale: Number(q.get('mirrorScale') ?? 0.5) })
  const wm = waterMaterial(AIR, sky.colour, uTime, mirror?.node)
  const wSky = waterMaterial(AIR, sky.colour, uTime)
  bodies.group.traverse((o) => { if (o.name.startsWith('water-')) (o as Mesh).material = o.name === 'water-canal-north' ? wSky : wm })
}

/* the north entry's bodies and battlements (north.ts), in one material keyed by kind */
{
  const NM = northMeshes(NORTH)
  const mat = northMaterial(tones, { o: NORTH.frame.o, a: NORTH.frame.a, culvert: NORTH.culvert, split: 8.6, stoneTop: 0.5 }, U.uPix)
  const mesh = new Mesh(NM.geometry, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.name = 'north-entry'
  scene.add(mesh, merlonMesh(NM.merlons, mat))
}

/* the plain's palms (plain.ts, green.ts) */
scene.add(palmMesh(PLAIN.palms, city.ground, palmMaterial(tones)))

/* the map's street and ground give way to the gate's paving inside its area (the gate page's mask), and north of the
   North Gate's south door to the street's paving laid on the lion axis (north-paving.ts) */
const sdx = B.street.dir[0], sdz = B.street.dir[1]
const { a0: NPa0, a1: NPa1, half: NPhalf } = NORTH_PAVED
const paved = (): N => {
  const p = uW2G.mul(vec4(positionWorld, 1)).xyz
  const inRect = step(-34, p.x).mul(step(p.x, 30)).mul(step(-60, p.z)).mul(step(p.z, 50))
  const s = p.x.mul(sdx).add(p.z.mul(sdz)), t = p.x.mul(sdz).sub(p.z.mul(sdx))
  const inStreet = step(20, s).mul(step(s, Number(plan.lionWalls.to) + 1)).mul(step(abs(t), B.street.halfWidth + 0.6))
  const { o: lo, a: la, c: lc } = NORTH.frame
  const ls = positionWorld.x.sub(lo[0]).mul(la[0]).add(positionWorld.z.sub(lo[1]).mul(la[1]))
  const lt = positionWorld.x.sub(lo[0]).mul(lc[0]).add(positionWorld.z.sub(lo[1]).mul(lc[1]))
  const inNorth = step(NPa0, ls).mul(step(ls, NPa1)).mul(step(abs(lt), NPhalf))
  return max(max(inRect, inStreet), inNorth)
}
for (const name of ['street', 'ground']) {
  const mesh = bodies.group.getObjectByName(name) as Mesh | undefined
  if (mesh) (mesh.material as MeshStandardNodeMaterial).maskNode = paved().lessThan(0.5)
}

/* the gate's rooms and meshes, as the gate page builds them */
const FG = plan.front, MG = plan.main
const fw: number = FG.frontWall, chD: number = FG.chamber[1], ow: number = FG.walls
const zCh0 = -fw, zCh1 = -(fw + chD), zBack = -(fw + chD + ow), zMT = zBack - plan.court.depth, zM0 = zMT - MG.towers.proj
const zMch0 = zM0 - MG.walls, zMch1 = zMch0 - MG.chamber[0], zMS = zMch1 - MG.walls
const hd = FG.door / 2
const rooms: Rooms = {
  boxes: [
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zCh0 + 0.6, z1: -0.65, y1: FG.arch.crown + 0.05, open: 0.62 },
    { x0: -FG.chamber[0] / 2 - 0.05, x1: FG.chamber[0] / 2 + 0.05, z0: zCh1 - 0.05, z1: zCh0 + 0.05, y1: FG.wallTop.value - 0.6, open: 0.28 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zBack + 0.65, z1: zCh1, y1: FG.arch.crown + 0.05, open: 0.42 },
    { x0: -FG.across / 2, x1: FG.across / 2, z0: zMT - 0.05, z1: zBack, y1: 30, open: 0.55 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zMch0, z1: zM0 - 0.65, y1: MG.arch.crown + 0.05, open: 0.42 },
    { x0: -MG.chamber[1] / 2 - 0.05, x1: MG.chamber[1] / 2 + 0.05, z0: zMch1 - 0.05, z1: zMch0 + 0.05, y1: MG.wallTop.value - 0.6, open: 0.22 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zMS + 0.65, z1: zMch1, y1: MG.arch.crown + 0.05, open: 0.5 },
  ],
}
const gate = new Group()
gate.name = 'gate'
gate.matrixAutoUpdate = false
gate.matrix.copy(G2W)
scene.add(gate)
const addGate = <T extends Mesh>(m: T, name: string, cast = true): T => {
  m.castShadow = cast
  m.receiveShadow = true
  m.frustumCulled = false
  m.name = name
  gate.add(m)
  return m
}
addGate(new Mesh(A.walls, wallMaterial(U, rooms)), 'gate-walls')
// the plan's paving letters ('R', 'G') stay out of the spec: pavingMaterial reads a spec `cls` as three class tones
const { cls: _paveCls, restCls: _paveRest, ...paveSpec } = plan.street.paving
addGate(new Mesh(A.paving, pavingMaterial(U, { ...paveSpec, sd: B.street.dir, st: [B.street.dir[1], -B.street.dir[0]], turnZ: 21.3 }, rooms)), 'gate-paving')
{
  // the same paving on from the North Gate's court to the dam's south end, on the lion axis (its local frame's own)
  const NP = northPaving({ frame: NORTH.frame, a0: NPa0, a1: NPa1, half: NPhalf, level: (x, z) => city.streetAt(x, z).level })
  const m = new Mesh(NP.geometry, pavingMaterial(U, { ...paveSpec, sd: [0, 1], st: [1, 0], turnZ: -1e6 }, rooms))
  m.matrixAutoUpdate = false
  m.matrix.copy(NP.matrix)
  m.receiveShadow = true
  m.frustumCulled = false
  m.name = 'paving-north'
  scene.add(m)
}
const schemesOf: Record<string, Array<[string, number]>> = { bull: [['yellow', 0]], dragon: [['white', 1]], lion: [['lionWhite', 2], ['lionYellow', 3]] }
for (const set of A.panels) {
  if (!set.count) continue
  const f = fields[set.kind]
  const maps = bakePanel(f, schemesOf[set.kind]!.map((x) => x[0]))
  const geo = panelGrid(f.L, 0.02, COURSE, 0.01)
  geo.setAttribute('iU', new InstancedBufferAttribute(set.iU, 3))
  geo.setAttribute('iN', new InstancedBufferAttribute(set.iN, 3))
  geo.setAttribute('iA', new InstancedBufferAttribute(set.iA, 4))
  geo.setAttribute('iB', new InstancedBufferAttribute(set.iB, 4))
  const origins = new Float32Array(set.count * 3)
  for (let i = 0; i < set.count; i++) origins.set(set.matrices.subarray(i * 16 + 12, i * 16 + 15), i * 3)
  geo.setAttribute('iO', new InstancedBufferAttribute(origins, 3))
  const im = new InstancedMesh(geo, panelMaterial(U, maps, schemesOf[set.kind]!, rooms), set.count)
  for (let i = 0; i < set.count; i++) im.setMatrixAt(i, new Matrix4().fromArray(set.matrices, i * 16))
  im.instanceMatrix.needsUpdate = true
  addGate(im, `panels-${set.kind}`)
}
for (const b of A.bronzes) {
  const n = b.geometry.getAttribute('position').count
  const fill = (k: number, v: number[]): Float32BufferAttribute => { const a = new Float32Array(n * k); for (let i = 0; i < n; i++) a.set(v, i * k); return new Float32BufferAttribute(a, k) }
  b.geometry.setAttribute('gU', fill(1, [0]))
  b.geometry.setAttribute('gEdge', fill(2, [99, 99]))
  b.geometry.setAttribute('gInfo', fill(4, [0, 0, 7, 0]))
  b.geometry.setAttribute('gCls', fill(4, b.cls))
  addGate(new Mesh(b.geometry, wallMaterial(U, rooms)), 'bronze')
}
const lifeMat = lifeMaterial(U)
addGate(new Mesh(palmsGeometry(plan.life.palms, B.level), lifeMat), 'palms')
addGate(new Mesh(birdsGeometry(plan.life.birds), lifeMat), 'birds', false)
const personMat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
personMat.colorNode = vec3(0.16)
const figure = signPerson(PERSON_FORMS.f2, personMat)
figure.position.set(plan.figure.x, B.level(plan.figure.z), plan.figure.z)
figure.rotation.y = plan.figure.turn ?? -Math.PI / 2
figure.name = 'figure'
gate.add(figure)
// the figure keeps the stack's contact shade: the sky field's maps leave it out
L.field?.setHidden(() => [figure])
// a probe only, never in the film (?figure=s,t): the figure on the street s metres out on its line, t across (+ west)
if (q.get('figure')) {
  const [fs, ft] = q.get('figure')!.split(',').map(Number) as [number, number]
  const fx = fs * B.street.dir[0] + (ft ?? 0) * B.street.dir[1], fz = fs * B.street.dir[1] - (ft ?? 0) * B.street.dir[0]
  figure.position.set(fx, B.level(fz), fz)
}

/* the camera: a level horizon, the frame slid up or down (a shift lens) where a view asks */
let shiftNow = 0
const ownUpdate = camera.updateProjectionMatrix.bind(camera)
camera.updateProjectionMatrix = function () {
  ownUpdate()
  if (shiftNow !== 0) {
    this.projectionMatrix.elements[9] = this.projectionMatrix.elements[9]! + shiftNow
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert()
  }
}
function aim(pos: Vector3, look: Vector3, hfov: number, w: number, h: number, shift = 0): number {
  camera.position.copy(pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(look)
  const vfov = (2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))) / D2R
  camera.fov = vfov
  camera.aspect = w / h
  const over = Math.max(1.5, pos.y - 5)
  camera.near = Math.min(4, Math.max(0.2, over * 0.006))
  shiftNow = shift
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  U.uPix.value = (2 * Math.tan((vfov / 2) * D2R)) / h
  // the environment, the occlusion's fade and reach, the band near the gate and the shadow follow the camera (light.ts)
  const f = L.frame(camera)
  linear?.setRadius(f.aoRadius)
  return f.texel
}

/* the flight, from the camera file into the scene's frame */
const sFirst = Number(String(gateCams.stops[0].keys[0].at).slice(7))
const g2s = (x: number, z: number): [number, number] => {
  const [E, N] = GF.utm(x, z)
  return MF.s(E, N)
}
const streetAt = (s: number, t = 0): { x: number; z: number; level: number } => {
  // s along the street's line, t across it (+ toward the gate frame's +x, west)
  const x = s * B.street.dir[0] + t * B.street.dir[1], z = s * B.street.dir[1] - t * B.street.dir[0]
  const [sx, sz] = g2s(x, z)
  return { x: sx, z: sz, level: B.level(z) + L0 }
}
// the landing: the camera file's `land` (street s), else the gate sketch's first key
const sLand = Number(cams.land?.street ?? sFirst), tLand = Number(cams.land?.across ?? 0)
const endEye = streetAt(sLand, tLand).level - L0 + cams.eye
const [wlx, wlz] = g2s(0, -20)
const walkLook: [number, number, number] = [wlx, endEye + L0, wlz]
const flight = makeFlight(resolveFlight(cams.flight, { scene: MF.s, street: streetAt, eye: cams.eye, walkLook }))

/* one pipeline: the scene pass, the occlusion, the air; output linear; the print on the CPU */
L.setHour(HOUR)
let linear: ReturnType<typeof createOpenLinear> | null = null
const first = flight.sample(0)
aim(new Vector3(...first.pos), new Vector3(...first.look), first.hfov, 1600, 900)
renderer.render(scene, camera)
linear = createOpenLinear(renderer, scene, camera, AIR, { ao: { on: q.get('ao') !== '0', intensity: L.uAoOn, radius: 1.2, fadeNear: L.uAoNear, fadeFar: L.uAoFar } })
const { PRINT, SAT, TOE, ENV, SUN } = L
const stopsAt = L.stopsAt
/** the landing hour's exposure per framing, over the flight's stops by height */
const hourStops = (framing: 'desktop' | 'phone'): number => cams.hourStops?.[framing] ?? 0

const putBase = q.get('put') ?? ''
async function upload(file: string, bytes: Uint8Array | string): Promise<void> {
  const res = await fetch(`${putBase}?path=${encodeURIComponent(file)}`, { method: 'POST', body: bytes as BodyInit })
  if (!res.ok) throw new Error(`upload ${file}: ${res.status}`)
}
async function jpeg(bytes: Uint8ClampedArray, w: number, h: number, quality = 0.9): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality))
  return new Uint8Array(await blob.arrayBuffer())
}
function brightness(bytes: Uint8ClampedArray): { median: number; p1: number; p99: number } {
  const hist = new Uint32Array(256)
  for (let i = 0; i < bytes.length; i += 4) hist[Math.round(0.2126 * bytes[i]! + 0.7152 * bytes[i + 1]! + 0.0722 * bytes[i + 2]!)]!++
  const n = bytes.length / 4
  const at = (f: number): number => {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= f * n) return v }
    return 255
  }
  return { median: at(0.5), p1: at(0.01), p99: at(0.99) }
}
async function render(w: number, h: number, samples: number, stops: number): Promise<{ bytes: Uint8ClampedArray; ms: number }> {
  const t = performance.now()
  // the sky field (`?sky=set`, open/sky-set.ts): its maps for this camera, a quarter of its directions a sub-frame
  L.field?.prepare(camera)
  const rgb = await L.still(L.field ? (i: number) => L.field!.each(i) : undefined, (each) => accumulate(renderer, camera, linear!.post, w, h, samples, each))
  const bytes = printFrame(rgb, w, h, L.printFor(camera.position.y, stops), 0)
  return { bytes, ms: Math.round(performance.now() - t) }
}

/** the flight at a second in a framing: its camera, the clock for the water, the occlusion's reach */
function aimFlight(t: number, framing: 'desktop' | 'phone', w: number, h: number): { p: FlightSample; texel: number } {
  const p = flight.sample(t)
  const ph = framing === 'phone'
  uTime.value = t
  const texel = aim(new Vector3(...p.pos), new Vector3(...(ph ? p.phoneLook : p.look)), ph ? p.phoneHfov : p.hfov, w, h, ph ? p.phoneShift : p.shift)
  return { p, texel }
}
const camFacts = (p: FlightSample, framing: string) => {
  const [E, N] = [p.pos[0] + MF.E0, MF.N0 - p.pos[2]]
  const look = framing === 'phone' ? p.phoneLook : p.look
  return {
    utm: [+E.toFixed(2), +N.toFixed(2)], level: +p.pos[1].toFixed(2), lookUtm: [+(look[0] + MF.E0).toFixed(2), +(MF.N0 - look[2]).toFixed(2), +look[1].toFixed(2)],
    hfov: +(framing === 'phone' ? p.phoneHfov : p.hfov).toFixed(2), vfov: +camera.fov.toFixed(2), metres: +p.s.toFixed(1), speed: +p.speed.toFixed(2),
  }
}

const rig = {
  ready: true,
  state: () => ({ planMs, cityTriangles: bodies.counts.triangles, houses: HOUSES, palms: PLAIN.palms.length, fields: PLAIN.fields.length, gate: A.counts, backend: stack.backend, architecture: stack.architecture, hour: HOUR, flight: { duration: flight.duration, length: +flight.length.toFixed(1) } }),
  views: () => ({ hour: HOUR, sun: mapSunAt(HOUR), duration: flight.duration, end: flight.end, walkLook }),
  /** a still of the flight's frame at a second (0: the first frame), full size, grey or the class view */
  async still(o: { framing: 'desktop' | 'phone'; view: 'grey' | 'classes'; w: number; h: number; css: [number, number]; samples: number; out: string; name: string; t?: number }) {
    setView(o.view)
    const t = o.t ?? 0
    const { p, texel } = aimFlight(t, o.framing, o.w, o.h)
    const stops = stopsAt(p.pos[1]) + hourStops(o.framing)
    const { bytes, ms } = await render(o.w, o.h, o.samples, stops)
    const file = `${o.out}/${o.name}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const s = mapSunAt(HOUR)
    const side = {
      file, framing: o.framing, view: o.view, flightSecond: t, cssSize: o.css, devicePixels: [o.w, o.h], subFrames: o.samples, backend: stack.backend, adapter: stack.architecture,
      hour: `${Math.floor(HOUR)}:${String(Math.round((HOUR % 1) * 60)).padStart(2, '0')}`, sun: { azimuth: +s.azimuth.toFixed(1), elevation: +s.elevation.toFixed(1) }, camera: camFacts(p, o.framing), shadowTexel: +texel.toFixed(3),
      air: { sigma: AIR.uSigma.value, scale: AIR.uScale.value, on: AIR.uOn.value }, print: L.printFor(p.pos[1], stops), brightness: brightness(bytes), ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    setView(q.get('view') === 'classes' ? 'classes' : 'grey')
    return side
  },
  /** the flight's frames (or a span), JPEG, with a per-frame log */
  async clip(o: { out: string; fps: number; w: number; h: number; samples: number; from?: number; to?: number; framing?: 'desktop' | 'phone'; view?: 'grey' | 'classes' }) {
    setView(o.view ?? 'grey')
    const framing = o.framing ?? 'desktop'
    const from = o.from ?? 0, to = Math.min(o.to ?? flight.duration, flight.duration)
    const n = Math.floor((to - from) * o.fps + 1e-6) + 1
    const log: Array<Record<string, unknown>> = []
    const t = performance.now()
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const { p, texel } = aimFlight(time, framing, o.w, o.h)
      const stops = stopsAt(p.pos[1]) + hourStops(framing)
      const { bytes } = await render(o.w, o.h, o.samples, stops)
      const g = Math.round(time * o.fps)
      await upload(`${o.out}/f${String(g).padStart(5, '0')}.jpg`, await jpeg(bytes, o.w, o.h, 0.88))
      log.push({ i: g, t: +time.toFixed(3), ...camFacts(p, framing), stops: +stops.toFixed(3), shadowTexel: +texel.toFixed(3), median: brightness(bytes).median })
    }
    await upload(`${o.out}/frames-${framing}-${String(Math.round(from * o.fps)).padStart(5, '0')}.json`, JSON.stringify({ fps: o.fps, w: o.w, h: o.h, samples: o.samples, from, to, framing, frames: log }))
    return { frames: n, ms: Math.round(performance.now() - t) }
  },
  /** a still from any camera (scene metres or UTM), for probes */
  async probe(o: { at: [number, number]; y: number; look: [number, number, number]; hour?: string; hfov?: number; shift?: number; stops?: number; w: number; h: number; samples: number; out: string; name: string; view?: 'grey' | 'classes'; t?: number }) {
    setView(o.view ?? 'grey')
    if (o.hour) L.setHour(hourOf(o.hour))
    uTime.value = o.t ?? 0
    const [x, z] = MF.s(o.at[0], o.at[1])
    const [lx, lz] = MF.s(o.look[0], o.look[1])
    aim(new Vector3(x, o.y, z), new Vector3(lx, o.look[2], lz), o.hfov ?? 58, o.w, o.h, o.shift ?? 0)
    const { bytes, ms } = await render(o.w, o.h, o.samples, o.stops ?? stopsAt(o.y))
    const file = `${o.out}/${o.name}.${o.w > 1000 ? 'png' : 'jpg'}`
    await upload(file, o.w > 1000 ? await toPNG(bytes, o.w, o.h) : await jpeg(bytes, o.w, o.h, 0.9))
    L.setHour(HOUR)
    return { file, ms, brightness: brightness(bytes) }
  },
  /** test values without a reload: the haze, the exposure's base, the print's saturation, the environment, the sun */
  tune(o: { sigma?: number; scale?: number; exposure?: number; saturation?: number; env?: number; sun?: number; hour?: string; away?: [number, number, number]; near?: [number, number, number]; reach?: number; toe?: number; split?: number; cool?: [number, number, number]; warm?: [number, number, number]; tracts?: number }) {
    if (o.tracts !== undefined) uTracts.value = o.tracts
    if (o.split !== undefined) PRINT.split = o.split
    if (o.cool) PRINT.cool = o.cool
    if (o.warm) PRINT.warm = o.warm
    if (o.away) (AIR.uAway.value as Vector3).set(...o.away)
    if (o.near) (AIR.uNear.value as Vector3).set(...o.near)
    if (o.reach !== undefined) AIR.uReach.value = o.reach
    if (o.toe !== undefined) TOE.aloft = o.toe
    if (o.sigma !== undefined) AIR.uSigma.value = o.sigma
    if (o.scale !== undefined) AIR.uScale.value = o.scale
    if (o.exposure !== undefined) PRINT.exposure = o.exposure
    if (o.saturation !== undefined) SAT.aloft = o.saturation
    if (o.env !== undefined) ENV.aloft = o.env
    if (o.sun !== undefined) { SUN.i = o.sun; L.setHour(HOUR, true) }
    if (o.hour !== undefined) { HOUR = hourOf(o.hour); L.setHour(HOUR) }
    return { tracts: uTracts.value, split: PRINT.split, cool: PRINT.cool, warm: PRINT.warm, away: (AIR.uAway.value as Vector3).toArray(), near: (AIR.uNear.value as Vector3).toArray(), reach: AIR.uReach.value, toe: TOE.aloft, sigma: AIR.uSigma.value, scale: AIR.uScale.value, exposure: PRINT.exposure, saturation: SAT.aloft, env: ENV.aloft, sun: SUN.i, hour: HOUR }
  },
  /** the flight sampled, no rendering */
  pathSamples(dt = 1 / 30) {
    const out: Array<Record<string, unknown>> = []
    for (let time = 0; time <= flight.duration + 1e-9; time += dt) {
      const p = flight.sample(time)
      out.push({ t: +time.toFixed(3), pos: p.pos, look: p.look, phoneLook: p.phoneLook, speed: p.speed })
    }
    return out
  },
}
;(window as unknown as { __open: typeof rig }).__open = rig
void Object3D
void airColour
say(`ready: ${bodies.counts.triangles} city triangles, ${A.counts.panels} panels, flight ${flight.length.toFixed(0)} m in ${flight.duration} s, plan ${planMs} ms`)

/* a live look for a person at the page: the first frame, redrawn on resize */
if (!putBase) {
  const draw = (): void => {
    aimFlight(0, innerWidth < innerHeight ? 'phone' : 'desktop', innerWidth, innerHeight)
    renderer.setSize(innerWidth, innerHeight)
    renderer.render(scene, camera)
  }
  addEventListener('resize', draw)
  draw()
}
