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
  BackSide, Color, DirectionalLight, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, Object3D, OrthographicCamera, PerspectiveCamera, PMREMGenerator, Scene, SphereGeometry, Vector3,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, toPNG } from '../../animals/cave/render'
import { printFrame } from '../../animals/cave/print'
import type { Print } from '../../animals/cave/site'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from '../map/plan'
import { buildBodies, tonesFrom, uView, type Sky } from '../map/mass'
import { buildGate, gateFrame, hourOf, sunAt, sunVector, type V3 } from '../gate/gate-geom'
import { animalField } from '../gate/gate-relief'
import { assemble, panelGrid } from '../gate/gate-mesh'
import { birdsGeometry, palmsGeometry } from '../gate/gate-life'
import { bakePanel, lifeMaterial, makeUniforms, panelMaterial, pavingMaterial, wallMaterial, C as COURSE, type Rooms } from '../gate/gate-mat'
import { airColour, createOpenLinear, makeAirUniforms, skyColour } from './air'
import { blockMaterial, boxMaterial, groundMaterial, houseMaterial, streetMaterial, toneTexture, uTracts, waterMaterial } from './earth'
import { makeFlight, resolveFlight, type FlightSample } from './flight'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { abs, asin, atan, clamp, max, mix, normalize, positionLocal, positionWorld, smoothstep, step, uniform, vec3, vec4 } = TSL as unknown as Record<string, N>

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
const camera = new PerspectiveCamera(40, 16 / 9, 0.3, 30000)
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

/* the air and the sky: one set of uniforms */
const AIR = makeAirUniforms({ sigma: Number(q.get('sigma') ?? 0.00018), scale: Number(q.get('scale') ?? 300), floor: 3 })
AIR.uOn.value = Number(q.get('air') ?? 1)
const sky: Sky = { colour: (d: N) => skyColour(AIR, d) }
const skyDome = (() => {
  const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  m.colorNode = skyColour(AIR, normalize(positionLocal))
  m.fog = false
  const mesh = new Mesh(new SphereGeometry(1, 96, 48), m)
  mesh.scale.setScalar(20000)
  mesh.frustumCulled = false
  mesh.name = 'sky'
  return mesh
})()
scene.add(skyDome)

say('building the city and the gate')
const tones = tonesFrom(cityPlan)
const bodies = buildBodies(city, tones, sky, AIR.uSun, canalZ)
scene.add(bodies.group)

/* the city's own materials (earth.ts), and per-instance tones for the boxes */
const uTime = uniform(0)
{
  const blocks = bodies.group.getObjectByName('blocks') as Mesh
  blocks.material = blockMaterial(tones, toneTexture(city.prisms.map((p) => p.id)), Math.max(1, city.prisms.length), U.uPix)
  const houses = bodies.group.getObjectByName('houses') as InstancedMesh | undefined
  if (houses) {
    const list = city.boxes.filter((b) => b.group === 'house')
    const nums = new Float32Array(list.length)
    list.forEach((b, i) => { nums[i] = Number(/^house-(\d+)/.exec(b.id)?.[1] ?? i) })
    houses.geometry.setAttribute('house', new InstancedBufferAttribute(nums, 1))
    houses.material = houseMaterial(tones)
  }
  const rest = bodies.group.getObjectByName('towers-and-piers') as InstancedMesh | undefined
  if (rest) {
    const list = city.boxes.filter((b) => b.group !== 'house')
    const k = new Float32Array(list.length)
    list.forEach((b, i) => { k[i] = b.group === 'tower' ? 0 : 1 })
    rest.geometry.setAttribute('tone', new InstancedBufferAttribute(k, 1))
    rest.material = boxMaterial(tones)
  }
  ;(bodies.group.getObjectByName('street') as Mesh).material = streetMaterial(tones)
  ;(bodies.group.getObjectByName('ground') as Mesh).material = groundMaterial(-1)
  const wm = waterMaterial(AIR, sky.colour, uTime)
  bodies.group.traverse((o) => { if (o.name.startsWith('water-')) (o as Mesh).material = wm })
}

/* the map's street and ground give way to the gate's paving inside its area (the gate page's mask) */
const uW2G = uniform(new Matrix4().copy(W2G))
const sdx = B.street.dir[0], sdz = B.street.dir[1]
const paved = (): N => {
  const p = uW2G.mul(vec4(positionWorld, 1)).xyz
  const inRect = step(-34, p.x).mul(step(p.x, 30)).mul(step(-60, p.z)).mul(step(p.z, 50))
  const s = p.x.mul(sdx).add(p.z.mul(sdz)), t = p.x.mul(sdz).sub(p.z.mul(sdx))
  const inStreet = step(20, s).mul(step(s, Number(plan.lionWalls.to) + 1)).mul(step(abs(t), B.street.halfWidth + 0.6))
  return max(inRect, inStreet)
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
addGate(new Mesh(A.paving, pavingMaterial(U, { ...plan.street.paving, sd: B.street.dir, st: [B.street.dir[1], -B.street.dir[0]], turnZ: 21.3 }, rooms)), 'gate-paving')
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

/* light: the gate's stated sun and environment (gate-plan.json `light`), the shadow fitted to what the frame sees */
const LIGHT = plan.light
const SUN = { i: Number(q.get('sun') ?? LIGHT.sun.intensity) }
const sunLight = new DirectionalLight(new Color(1.0, 0.86, 0.7), SUN.i)
sunLight.castShadow = true
sunLight.shadow.mapSize.set(8192, 8192)
sunLight.shadow.bias = -0.0002
sunLight.shadow.normalBias = 0.03
scene.add(sunLight, sunLight.target)
/* the environment: the sky above, the plain's warm bounce below, and near the gate the sunlit east walls' band (the gate page's) */
const uBounce = uniform(Number(LIGHT.bounce.paving.value))
const WALLS = LIGHT.bounce.eastWalls
const uWalls = uniform(new Color(0, 0, 0))
const uWallsNear = uniform(0)
const envScene = new Scene()
{
  const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  const d = normalize(positionLocal)
  const ground = vec3(...(LIGHT.bounce.paving.colour as [number, number, number])).mul(uBounce).mul(AIR.uDay)
  const dg = uW2G.mul(vec4(d, 0)).xyz
  const az = atan(dg.x.negate(), dg.z).mul(180 / Math.PI)
  const el = asin(clamp(dg.y, -1, 1)).mul(180 / Math.PI)
  const [a0, a1] = WALLS.azimuth as [number, number], [e0, e1] = WALLS.elevation as [number, number]
  const band = smoothstep(a0 - 6, a0, az).mul(smoothstep(a1 + 6, a1, az)).mul(smoothstep(e0 - 3, e0, el)).mul(smoothstep(e1 + 3, e1, el)).mul(uWallsNear)
  m.colorNode = mix(ground, skyColour(AIR, d), smoothstep(-0.05, 0.02, d.y)).mul(band.oneMinus()).add(vec3(uWalls).mul(band))
  envScene.add(new Mesh(new SphereGeometry(100, 64, 32), m))
}
const pmrem = new PMREMGenerator(renderer)
let envTarget: N = null
function bakeEnv(): void {
  envTarget?.dispose?.()
  envTarget = pmrem.fromScene(envScene, 0.02, 1, 1000)
  scene.environment = envTarget.texture
}
/* the environment's strength: the gate's stated value at the street; over the open plain from the air a weaker fill, so the
   shade under the low sun keeps its depth (ours, G for the method) */
const ENV = { street: Number(LIGHT.env), aloft: Number(q.get('envAloft') ?? 0.42) }
scene.environmentIntensity = ENV.street

let hourNow = -1
function setHour(hour: number): void {
  if (Math.abs(hour - hourNow) < 1e-4) return
  hourNow = hour
  const sG = sunVector(plan, hour)
  ;(U.uSunG.value as Vector3).set(...sG)
  ;(AIR.uSun.value as Vector3).copy(dirWorld(sG))
  const el = Math.asin(sG[1]) / D2R
  const k = Math.min(1, Math.max(0, (el + 0.5) / 6))
  sunLight.intensity = SUN.i * k
  sunLight.color.setRGB(1.0, 0.72 + 0.14 * Math.min(1, el / 20), 0.5 + 0.2 * Math.min(1, el / 20))
  const onWest = Math.max(0, sG[0]) * sunLight.intensity * WALLS.albedo / Math.PI
  ;(uWalls.value as Color).setRGB(sunLight.color.r * WALLS.colour[0] * onWest, sunLight.color.g * WALLS.colour[1] * onWest, sunLight.color.b * WALLS.colour[2] * onWest)
  AIR.uDay.value = Math.min(1, Math.max(0.18, (el + 6) / 14))
  bakeEnv()
}
/** the east walls' band belongs to the forecourt: it fades in over the last 400 m to the gate */
let wallsNow = -1
function setNear(distance: number): void {
  const w = Math.min(1, Math.max(0, (400 - distance) / 250))
  if (Math.abs(w - wallsNow) < 0.02) return
  wallsNow = w
  uWallsNear.value = w
  // the forecourt's paving bounce near the gate; aloft the plain's, weaker and greyer
  uBounce.value = 0.18 + (Number(LIGHT.bounce.paving.value) - 0.18) * w
  bakeEnv()
}

/* the shadow: an orthographic box in the sun's frame round the ground the frame sees, out to a reach that grows with height */
const lightCam = new OrthographicCamera()
const tmp = new Vector3()
function fitShadow(cam: PerspectiveCamera): number {
  const sun = (AIR.uSun.value as Vector3).clone().normalize()
  const h = Math.max(2, cam.position.y - 5)
  const reach = Math.min(4200, 260 + h * 9)
  cam.updateMatrixWorld(true)
  const inv = cam.projectionMatrixInverse, world = cam.matrixWorld
  const pts: Vector3[] = []
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]
  const origin = cam.position.clone()
  for (const [x, y] of corners) {
    const dir = tmp.set(x!, y!, 0.5).applyMatrix4(inv).applyMatrix4(world).sub(origin).normalize().clone()
    // the ray to the plain (or to the reach, for a ray above the horizon)
    let t = dir.y < -1e-3 ? (5 - origin.y) / dir.y : reach
    const flat = Math.hypot(dir.x, dir.z) * t
    if (flat > reach) t *= reach / flat
    const p = origin.clone().addScaledVector(dir, t)
    for (const y0 of [0, 40, 95]) pts.push(new Vector3(p.x, y0, p.z))
  }
  for (const y0 of [0, 40]) pts.push(new Vector3(origin.x, y0, origin.z))
  const centre = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
  lightCam.position.copy(centre).addScaledVector(sun, 6000)
  lightCam.lookAt(centre)
  lightCam.updateMatrixWorld(true)
  const view = lightCam.matrixWorldInverse
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    const v = p.clone().applyMatrix4(view)
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
  }
  const mx = (x1 - x0) * 0.03 + 2, my = (y1 - y0) * 0.03 + 2
  sunLight.position.copy(lightCam.position)
  sunLight.target.position.copy(centre)
  sunLight.target.updateMatrixWorld()
  sunLight.updateMatrixWorld()
  const sc = sunLight.shadow.camera
  sc.left = x0 - mx
  sc.right = x1 + mx
  sc.bottom = y0 - my
  sc.top = y1 + my
  sc.near = 1000
  sc.far = 12000
  sc.updateProjectionMatrix()
  const texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / 8192
  sunLight.shadow.normalBias = Math.max(0.03, texel * 0.9)
  return texel
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
const uAoNear = uniform(250), uAoFar = uniform(900), uAoOn = uniform(Number(q.get('ao') ?? 0.75))
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
  // the contact occlusion reaches and fades further out as the camera climbs
  scene.environmentIntensity = ENV.street + (ENV.aloft - ENV.street) * Math.min(1, Math.max(0, pos.y - 15) / 120)
  uAoNear.value = 250 + over * 1.2
  uAoFar.value = 900 + over * 3.5
  setNear(pos.distanceTo(toWorld([0, 10, 0])))
  return fitShadow(camera)
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
const endEye = B.level(sFirst * B.street.dir[1]) + cams.eye
const [wlx, wlz] = g2s(0, -20)
const walkLook: [number, number, number] = [wlx, endEye + L0, wlz]
const flight = makeFlight(resolveFlight(cams.flight, { scene: MF.s, street: streetAt, eye: cams.eye, walkLook }))

/* one pipeline: the scene pass, the occlusion, the air; output linear; the print on the CPU */
setHour(HOUR)
const first = flight.sample(0)
aim(new Vector3(...first.pos), new Vector3(...first.look), first.hfov, 1600, 900)
renderer.render(scene, camera)
const linear = createOpenLinear(renderer, scene, camera, AIR, { ao: { on: q.get('ao') !== '0', intensity: uAoOn, radius: 1.2, fadeNear: uAoNear, fadeFar: uAoFar } })
const P0 = LIGHT.print
const PRINT: Print = {
  exposure: Number(q.get('exp') ?? LIGHT.exposure), toe: P0.toe, shoulder: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: P0.gain, warm: [1.02, 1, 0.97], cool: [0.97, 1, 1.03],
  split: 0.3, saturation: Number(q.get('sat') ?? P0.saturation), vignette: 0.12, grain: 0.003, glow: { threshold: 1.2, strength: P0.glow, radii: [0.012, 0.06] },
}
/** the exposure's stops over the gate's own, by the camera's height: the air from above is brighter than the street */
const aloft = (y: number): number => Math.min(1, Math.max(0, y - 15) / 120)
const stopsAt = (y: number): number => Number(q.get('stops') ?? 0) + -0.35 * aloft(y)
/** the print's saturation: the gate's own at the street, a little less over the city */
const SAT = { street: PRINT.saturation, aloft: Number(q.get('satAloft') ?? 1.0) }
const satAt = (y: number): number => SAT.street + (SAT.aloft - SAT.street) * aloft(y)
/** the print's toe: the gate's own at the street; over the city a little deeper, so the hazed shade keeps its weight */
const TOE = { street: Number(P0.toe), aloft: Number(q.get('toeAloft') ?? 0.035) }
const toeAt = (y: number): number => TOE.street + (TOE.aloft - TOE.street) * aloft(y)

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
  const rgb = await accumulate(renderer, camera, linear.post, w, h, samples)
  const bytes = printFrame(rgb, w, h, { ...PRINT, exposure: PRINT.exposure * Math.pow(2, stops), saturation: satAt(camera.position.y), toe: toeAt(camera.position.y) }, 0)
  return { bytes, ms: Math.round(performance.now() - t) }
}

/** the flight at a second in a framing: its camera, the clock for the water, the occlusion's reach */
function aimFlight(t: number, framing: 'desktop' | 'phone', w: number, h: number): { p: FlightSample; texel: number } {
  const p = flight.sample(t)
  const ph = framing === 'phone'
  uTime.value = t
  linear.setRadius(Math.min(6, 1.2 + Math.max(0, p.pos[1] - 15) * 0.012))
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
  state: () => ({ planMs, cityTriangles: bodies.counts.triangles, gate: A.counts, backend: stack.backend, architecture: stack.architecture, hour: HOUR, flight: { duration: flight.duration, length: +flight.length.toFixed(1) } }),
  views: () => ({ hour: HOUR, sun: sunAt(plan, HOUR), duration: flight.duration, end: flight.end, walkLook }),
  /** a still of the flight's frame at a second (0: the first frame), full size, grey or the class view */
  async still(o: { framing: 'desktop' | 'phone'; view: 'grey' | 'classes'; w: number; h: number; css: [number, number]; samples: number; out: string; name: string; t?: number }) {
    setView(o.view)
    const t = o.t ?? 0
    const { p, texel } = aimFlight(t, o.framing, o.w, o.h)
    const stops = stopsAt(p.pos[1])
    const { bytes, ms } = await render(o.w, o.h, o.samples, stops)
    const file = `${o.out}/${o.name}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const s = sunAt(plan, HOUR)
    const side = {
      file, framing: o.framing, view: o.view, flightSecond: t, cssSize: o.css, devicePixels: [o.w, o.h], subFrames: o.samples, backend: stack.backend, adapter: stack.architecture,
      hour: `${Math.floor(HOUR)}:${String(Math.round((HOUR % 1) * 60)).padStart(2, '0')}`, sun: { azimuth: +s.azimuth.toFixed(1), elevation: +s.elevation.toFixed(1) }, camera: camFacts(p, o.framing), shadowTexel: +texel.toFixed(3),
      air: { sigma: AIR.uSigma.value, scale: AIR.uScale.value, on: AIR.uOn.value }, print: { ...PRINT, exposure: PRINT.exposure * Math.pow(2, stops), saturation: satAt(p.pos[1]), toe: toeAt(p.pos[1]) }, brightness: brightness(bytes), ms,
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
      const stops = stopsAt(p.pos[1])
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
    if (o.hour) setHour(hourOf(o.hour))
    uTime.value = o.t ?? 0
    const [x, z] = MF.s(o.at[0], o.at[1])
    const [lx, lz] = MF.s(o.look[0], o.look[1])
    aim(new Vector3(x, o.y, z), new Vector3(lx, o.look[2], lz), o.hfov ?? 58, o.w, o.h, o.shift ?? 0)
    const { bytes, ms } = await render(o.w, o.h, o.samples, o.stops ?? stopsAt(o.y))
    const file = `${o.out}/${o.name}.${o.w > 1000 ? 'png' : 'jpg'}`
    await upload(file, o.w > 1000 ? await toPNG(bytes, o.w, o.h) : await jpeg(bytes, o.w, o.h, 0.9))
    setHour(HOUR)
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
    if (o.sun !== undefined) { SUN.i = o.sun; hourNow = -1; setHour(HOUR) }
    if (o.hour !== undefined) { HOUR = hourOf(o.hour); setHour(HOUR) }
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
