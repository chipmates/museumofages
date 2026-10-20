/* THE ISHTAR GATE AT LEVEL 1 (`/src/wings/babylon/gate/gate.html`): the double
   gate, its forecourt and the lion street's last stretch built in code at
   their measured places, set into the map's grey city about 570 BC. Dev only;
   the rig `window.__gate` takes the stills, the sketch and the facts.

     ?state=grey|flat|full   massing grey, the first pass (flat glaze, plain animals, noon sun), or full (default)
     ?switch=classes         the evidence switch: the class colours on the same scene
     ?put=<url>              where the rig hands its files (the shooter's own server) */

import {
  BackSide, Color, DirectionalLight, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera, PMREMGenerator, Scene, SphereGeometry, Vector3,
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
import { createMapLinear } from '../map/map-render'
import { makePath, type PathSample, type V3 as MV3 } from '../map/path'
import { buildGate, gateFrame, hourOf, sunAt, sunVector, type V3 } from './gate-geom'
import { animalField } from './gate-relief'
import { assemble, panelGrid } from './gate-mesh'
import { bakePanel, makeUniforms, panelMaterial, pavingMaterial, wallMaterial, C as COURSE, type Rooms } from './gate-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { abs, clamp, dot, max, mix, normalize, positionLocal, positionWorld, pow, smoothstep, step, uniform, vec3, vec4, fog, densityFogFactor } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`gate: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plans')
const [plan, cams, mapPlan]: [J, J, J] = await Promise.all([
  fetch(new URL('./gate-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('./gate-cams.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../map/map-plan.json', import.meta.url)).then((r) => r.json()),
])
const GF = gateFrame(plan)
const MF = makeFrame(mapPlan)
const L0: number = plan.frame.level0

/* ── the map's city without the bodies the gate replaces ── */
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

/* ── the gate ── */
const B = buildGate(plan)
const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
const A = assemble(B, plan, fields)
const planMs = Math.round(performance.now() - t0)

/* gate frame to the map's scene (the world here) */
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
const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 26000)
stack.setScene(scene, camera, { ...IDENTITY, name: 'babylon-gate' })

const STATE = q.get('state') === 'grey' ? 0 : q.get('state') === 'flat' ? 1 : 2
const U = makeUniforms({ M: mapPlan.classes.M.colour, R: mapPlan.classes.R.colour, G: mapPlan.classes.G.colour })
U.uState.value = STATE
U.uSwitch.value = q.get('switch') === 'classes' ? 1 : 0
;(U.uRot.value as Matrix3).copy(ROT)

/* the sky and the sun (the map's sky, one set of uniforms for every hour) */
const uSun = uniform(new Vector3(0, 1, 0))
const uDay = uniform(1)
const skyColour = (d: N): N => {
  const up = clamp(d.y, 0, 1)
  const low = smoothstep(-0.04, 0.35, uSun.y)
  const zenith = mix(vec3(0.05, 0.08, 0.16), vec3(0.16, 0.3, 0.6), low)
  const horizon = mix(vec3(0.5, 0.36, 0.26), vec3(0.72, 0.68, 0.6), low)
  const cosS = max(dot(d, uSun), 0)
  const glow = vec3(1.0, 0.72, 0.45).mul(pow(cosS, 8).mul(0.55).add(pow(cosS, 120).mul(1.6)))
  const disc = smoothstep(0.99996, 0.99999, cosS).mul(60)
  const sky = mix(horizon, zenith, pow(up, 0.45)).add(glow).add(vec3(1, 0.9, 0.75).mul(disc))
  const below = horizon.mul(0.55)
  return mix(below, sky, smoothstep(-0.02, 0.0, d.y)).mul(uDay)
}
const sky: Sky = { colour: skyColour }
const skyDome = (() => {
  const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  m.colorNode = skyColour(normalize(positionLocal))
  m.fog = false
  const mesh = new Mesh(new SphereGeometry(1, 64, 32), m)
  mesh.scale.setScalar(20000)
  mesh.frustumCulled = false
  mesh.name = 'sky'
  return mesh
})()
scene.add(skyDome)
const uHaze = uniform(new Color(0.7, 0.66, 0.58))
const uDensity = uniform(Number(q.get('haze') ?? 0.00022))
scene.fogNode = fog(uHaze, densityFogFactor(uDensity))

say('building the city and the gate')
const tones = tonesFrom(cityPlan)
const bodies = buildBodies(city, tones, sky, uSun, canalZ)
scene.add(bodies.group)
uView.value = U.uSwitch.value

/* the map's street and ground give way to the gate's paving inside its area (a mask, the map's files untouched) */
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
  if (!mesh) continue
  const mat = mesh.material as MeshStandardNodeMaterial
  mat.maskNode = paved().lessThan(0.5)
}

/* the rooms: how open each chamber and passage is to the sky (the bounce and sky are modelled; the stack has no GI) */
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
const wallMesh = new Mesh(A.walls, wallMaterial(U, rooms))
wallMesh.castShadow = true
wallMesh.receiveShadow = true
wallMesh.frustumCulled = false
wallMesh.name = 'gate-walls'
gate.add(wallMesh)
const pave = new Mesh(A.paving, pavingMaterial(U, { ...plan.street.paving, sd: B.street.dir, st: [B.street.dir[1], -B.street.dir[0]], turnZ: 21.3 }, rooms))
pave.receiveShadow = true
pave.castShadow = true
pave.frustumCulled = false
pave.name = 'gate-paving'
gate.add(pave)

const schemesOf: Record<string, Array<[string, number]>> = { bull: [['yellow', 0]], dragon: [['white', 1]], lion: [['lionWhite', 2], ['lionYellow', 3]] }
const panelMeshes: InstancedMesh[] = []
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
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = `panels-${set.kind}`
  gate.add(im)
  panelMeshes.push(im)
}
for (const b of A.bronzes) {
  const m = new Mesh(b.geometry, wallMaterial(U, rooms))
  // the bronze's attributes: kind 7 everywhere, class G (named in the king's text, form guessed)
  const n = b.geometry.getAttribute('position').count
  const fill = (k: number, v: number[]): Float32BufferAttribute => { const a = new Float32Array(n * k); for (let i = 0; i < n; i++) a.set(v, i * k); return new Float32BufferAttribute(a, k) }
  b.geometry.setAttribute('gU', fill(1, [0]))
  b.geometry.setAttribute('gEdge', fill(2, [99, 99]))
  b.geometry.setAttribute('gInfo', fill(4, [0, 0, 7, 0]))
  b.geometry.setAttribute('gCls', fill(4, b.cls))
  m.castShadow = true
  m.receiveShadow = true
  m.frustumCulled = false
  m.name = 'bronze'
  gate.add(m)
}

/* the figure: the house's grey sign person, 1.70 m, in the sun by the east tower */
const personMat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
personMat.colorNode = vec3(0.16)
const figure = signPerson(PERSON_FORMS.f2, personMat)
figure.position.set(plan.figure.x, B.level(plan.figure.z), plan.figure.z)
figure.rotation.y = plan.figure.turn ?? -Math.PI / 2
figure.name = 'figure'
gate.add(figure)

/* light: the sun's key with a shadow fitted over the gate and the camera, the sky and the modelled bounce as an environment */
const sunLight = new DirectionalLight(new Color(1.0, 0.86, 0.7), 3.2)
sunLight.castShadow = true
sunLight.shadow.mapSize.set(8192, 8192)
sunLight.shadow.bias = -0.0002
sunLight.shadow.normalBias = 0.03
scene.add(sunLight, sunLight.target)
const uBounce = uniform(Number(q.get('bounce') ?? 0.32))
const envScene = new Scene()
{
  const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  const d = normalize(positionLocal)
  // below the horizon: the lit paving and walls' bounce, a warm grey (albedo times what reaches the ground)
  const ground = vec3(0.62, 0.52, 0.42).mul(uBounce).mul(uDay)
  m.colorNode = mix(ground, skyColour(d), smoothstep(-0.05, 0.02, d.y))
  const mesh = new Mesh(new SphereGeometry(100, 64, 32), m)
  envScene.add(mesh)
}
const pmrem = new PMREMGenerator(renderer)
let envTarget: N = null
function bakeEnv(): void {
  envTarget?.dispose?.()
  envTarget = pmrem.fromScene(envScene, 0.02, 1, 1000)
  scene.environment = envTarget.texture
}
const uEnv = Number(q.get('env') ?? 1)
scene.environmentIntensity = uEnv

let hourNow = -1
function setHour(hour: number): void {
  if (Math.abs(hour - hourNow) < 1e-4) return
  hourNow = hour
  const sG = sunVector(plan, hour)
  ;(U.uSunG.value as Vector3).set(...sG)
  const w = dirWorld(sG)
  ;(uSun.value as Vector3).copy(w)
  const el = Math.asin(sG[1]) / D2R
  const k = Math.min(1, Math.max(0, (el + 0.5) / 6))
  sunLight.intensity = 3.2 * k
  sunLight.color.setRGB(1.0, 0.72 + 0.14 * Math.min(1, el / 20), 0.5 + 0.2 * Math.min(1, el / 20))
  const day = Math.min(1, Math.max(0.18, (el + 6) / 14))
  uDay.value = day
  ;(uHaze.value as Color).setRGB(0.72 * day, 0.64 * day, 0.54 * day)
  bakeEnv()
}

function fitShadow(): void {
  const sun = (uSun.value as Vector3).clone().normalize()
  // the gate, the forecourt and the street to the desktop camera: centre 10 m out on the axis, 95 m round
  const focus = toWorld([0, 6, 12])
  const r = 95
  sunLight.position.copy(focus).addScaledVector(sun, 3000)
  sunLight.target.position.copy(focus)
  sunLight.target.updateMatrixWorld()
  sunLight.updateMatrixWorld()
  const sc = sunLight.shadow.camera
  sc.left = -r
  sc.right = r
  sc.top = r
  sc.bottom = -r
  sc.near = 2800
  sc.far = 3200
  sc.updateProjectionMatrix()
}

/* the camera: a level look with the frame slid up (a shift lens, `rail-projection.ts`'s math copied: ceiling 0.7) */
let shiftNow = 0
const ownUpdate = camera.updateProjectionMatrix.bind(camera)
camera.updateProjectionMatrix = function () {
  ownUpdate()
  if (shiftNow !== 0) {
    this.projectionMatrix.elements[9] = this.projectionMatrix.elements[9]! + shiftNow
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert()
  }
}
/** the authored horizontal field kept on wider canvases; a narrower one keeps the authored vertical field */
function fittedFov(hfov: number, authored: [number, number], w: number, h: number): number {
  const vAuth = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (authored[1] / authored[0]))
  const vKeepH = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))
  return (w / h >= authored[0] / authored[1] ? vKeepH : Math.max(vKeepH, vAuth)) / D2R
}
function aimWorld(pos: Vector3, look: Vector3, vfov: number, w: number, h: number, shift = 0): void {
  camera.position.copy(pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(look)
  camera.fov = vfov
  camera.aspect = w / h
  shiftNow = Math.min(0.7, Math.max(-0.7, shift))
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  U.uPix.value = (2 * Math.tan((vfov / 2) * D2R)) / h
  fitShadow()
}

/* the stills' views, in the gate's frame, then the world */
interface View { name: string; pos: V3; look: V3; hfov: number; shift: number; authored: [number, number] }
function stillView(name: 'desktop' | 'phone'): View {
  const v = cams.stills[name]
  const [x, z] = v.at as [number, number]
  const y = B.level(z) + cams.eye
  const look: V3 = [v.look[0], v.look[1] ?? y, v.look[2]]
  return { name, pos: [x, y, z], look, hfov: v.hfov, shift: v.shift, authored: v.authored }
}
function aimView(v: View, w: number, h: number): void {
  aimWorld(toWorld(v.pos), toWorld(v.look), fittedFov(v.hfov, v.authored, w, h), w, h, v.shift)
}

/* the sketch's path: the gate's keys as the map's path (UTM and German levels), so the map's easing serves both */
const south = GF.fromUtm(445831, 3600652)
const keyAt = (at: J): [number, number] => {
  if (typeof at === 'string' && at.startsWith('street:')) {
    const s = Number(at.slice(7))
    return [s * B.street.dir[0], s * B.street.dir[1]]
  }
  return at as [number, number]
}
const pathCams = {
  eye: cams.eye,
  lens: { desktop: cams.stills.desktop.hfov },
  stops: cams.stops.map((s: J) => ({ n: s.n, hour: s.hour[0] })),
  path: cams.stops.flatMap((s: J) => s.keys.map((k: J, i: number) => {
    const [x, z] = keyAt(k.at)
    const [E, N] = GF.utm(x, z)
    const eyeY = B.level(z) + cams.eye
    let look: V3
    if (k.look === 'gate') look = [0, eyeY, -20]
    else if (k.look === 'south') look = [south[0], 1.65, south[1]]
    else look = [k.look[0], k.look[1], k.look[2]]
    const [lE, lN] = GF.utm(look[0], look[2])
    // a stop's first key repeats the last stop's last key at the same second, so each stop starts at its own key
    return { t: k.t + (i === 0 ? 1e-4 : 0), at: [E, N], y: 'eye', look: [lE, lN, look[1] + L0], stop: s.n, hold: k.kind === 'hold' || i === 0, kind: k.kind, cut: false }
  })),
}
const standMap = (x: number, z: number): number => {
  const [gx, gz] = GF.fromUtm(x + MF.E0, MF.N0 - z)
  return B.level(gz) + L0
}
const path = makePath(pathCams, MF.s, standMap)

/* one pipeline: the scene pass, the contact occlusion, output linear; the print on the CPU */
setHour(hourOf(cams.hour))
const first = stillView('desktop')
aimView(first, 1600, 900)
renderer.render(scene, camera)
const linear = createMapLinear(renderer, scene, camera, { ao: { on: q.get('ao') !== '0', intensity: Number(q.get('ao') ?? 0.75), radius: 1.2 }, fade: [120, 600] })
const PRINT: Print = {
  exposure: Number(q.get('exp') ?? 0.9), toe: 0.01, shoulder: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], warm: [1.02, 1, 0.97], cool: [0.97, 1, 1.03],
  split: 0.3, saturation: 1, vignette: 0.1, grain: 0.003, glow: { threshold: 1.2, strength: 0.05, radii: [0.012, 0.06] },
}

const putBase = q.get('put') ?? ''
async function upload(file: string, bytes: Uint8Array | string): Promise<void> {
  const res = await fetch(`${putBase}?path=${encodeURIComponent(file)}`, { method: 'POST', body: bytes as BodyInit })
  if (!res.ok) throw new Error(`upload ${file}: ${res.status}`)
}
async function jpeg(bytes: Uint8ClampedArray, w: number, h: number, quality = 0.88): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality))
  return new Uint8Array(await blob.arrayBuffer())
}
function brightness(bytes: Uint8ClampedArray, box?: [number, number, number, number], w = 0): { median: number; p1: number; p99: number } {
  const hist = new Uint32Array(256)
  let n = 0
  const add = (i: number): void => {
    hist[Math.round(0.2126 * bytes[i]! + 0.7152 * bytes[i + 1]! + 0.0722 * bytes[i + 2]!)]!++
    n++
  }
  if (box) { for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) add((y * w + x) * 4) }
  else for (let i = 0; i < bytes.length; i += 4) add(i)
  const at = (f: number): number => {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= f * n) return v }
    return 255
  }
  return { median: at(0.5), p1: at(0.01), p99: at(0.99) }
}

async function render(w: number, h: number, samples: number, stops = 0): Promise<{ bytes: Uint8ClampedArray; rgb: Float32Array; ms: number }> {
  const t = performance.now()
  const rgb = await accumulate(renderer, camera, linear.post, w, h, samples)
  const bytes = printFrame(rgb, w, h, { ...PRINT, exposure: PRINT.exposure * Math.pow(2, stops) }, 0)
  return { bytes, rgb, ms: Math.round(performance.now() - t) }
}

/** a world point (gate frame) to device pixels for the current camera */
function project(p: V3, w: number, h: number): [number, number, number] {
  const v = toWorld(p).project(camera)
  return [Math.round(((v.x + 1) / 2) * w), Math.round(((1 - v.y) / 2) * h), v.z]
}

function setStates(o: { state?: 'grey' | 'flat' | 'full'; switch?: boolean }): void {
  if (o.state) U.uState.value = o.state === 'grey' ? 0 : o.state === 'flat' ? 1 : 2
  if (o.switch !== undefined) {
    U.uSwitch.value = o.switch ? 1 : 0
    uView.value = o.switch ? 1 : 0
  }
}

const rig = {
  ready: true,
  state: () => ({ planMs, counts: { ...A.counts, cityTriangles: bodies.counts.triangles }, backend: stack.backend, architecture: stack.architecture, state: U.uState.value, switch: U.uSwitch.value, duration: path.duration }),
  facts: () => ({ ...B.facts, figure: { x: figure.position.x, y: figure.position.y, z: figure.position.z, height: plan.figure.height }, panels: B.panels.length, sun: Object.fromEntries(['16:45', '17:00', '12:00'].map((h) => [h, { ...sunAt(plan, hourOf(h)), toward: sunVector(plan, hourOf(h)) }])), views: { desktop: stillView('desktop'), phone: stillView('phone') }, level: (z: number) => B.level(z) }),
  views: () => ({ desktop: stillView('desktop'), phone: stillView('phone'), keys: path.keys.map((k) => ({ t: k.t, stop: k.stop, kind: k.kind, pos: k.pos })), duration: path.duration }),
  /** device-pixel boxes of the crop anchors for a framing at a size */
  crops(o: { framing: 'desktop' | 'phone'; w: number; h: number }) {
    aimView(stillView(o.framing), o.w, o.h)
    const out: Record<string, unknown> = {}
    for (const [name, c] of Object.entries(cams.crops as Record<string, J>)) {
      if (c.framing !== o.framing) continue
      let at: V3
      if (c.at === 'figure') at = [figure.position.x, figure.position.y + 0.85, figure.position.z]
      else at = [c.at[0], c.at[1] ?? B.level(c.at[2]), c.at[2]]
      const [px, py] = project(at, o.w, o.h)
      const [cw, ch] = c.size as [number, number]
      const x0 = Math.max(0, Math.min(o.w - cw, px - cw / 2)), y0 = Math.max(0, Math.min(o.h - ch, py - ch / 2))
      out[name] = { anchor: at, centre: [px, py], box: [Math.round(x0), Math.round(y0), Math.round(x0) + cw, Math.round(y0) + ch] }
    }
    return out
  },
  /** a still: a framing, the scene state and the switch, device pixels and CSS size, sub-frames */
  async shoot(o: { framing: 'desktop' | 'phone'; state?: 'grey' | 'flat' | 'full'; switch?: boolean; w: number; h: number; css: [number, number]; samples: number; out: string; name: string; hour?: string; stops?: number; box?: [number, number, number, number]; look?: { pos: V3; look: V3; hfov: number; shift?: number } }) {
    setStates(o)
    const hour = o.hour ?? (U.uState.value === 1 ? '12:00' : cams.hour)
    setHour(hourOf(hour))
    const v = stillView(o.framing)
    if (o.look) aimWorld(toWorld(o.look.pos), toWorld(o.look.look), fittedFov(o.look.hfov, [16, 9], o.w, o.h), o.w, o.h, o.look.shift ?? 0)
    else aimView(v, o.w, o.h)
    const { bytes, ms } = await render(o.w, o.h, o.samples, o.stops ?? 0)
    const file = `${o.out}/${o.name}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const s = sunAt(plan, hourOf(hour))
    const target = { type: 'FloatType', format: 'RGBAFormat', samples: 0, depthBuffer: false }
    const side = {
      file, framing: o.framing, state: ['grey', 'flat', 'full'][U.uState.value as number], switch: !!U.uSwitch.value,
      cssSize: o.css, devicePixels: [o.w, o.h], ratio: +(o.w / o.css[0]).toFixed(3), subFrames: o.samples,
      renderTarget: target, sampleCountReadBack: (linear.post as N).renderer?.samples ?? 'the accumulation target is created by the kit with samples 0 (render.ts: RenderTarget(width, height, { type: FloatType, format: RGBAFormat, depthBuffer: false }))',
      backend: stack.backend, adapter: stack.architecture, print: { ...PRINT, exposure: PRINT.exposure * Math.pow(2, o.stops ?? 0) },
      hour, sun: { azimuth: +s.azimuth.toFixed(1), elevation: +s.elevation.toFixed(1), toward: sunVector(plan, hourOf(hour)).map((x) => +x.toFixed(3)) },
      env: { intensity: scene.environmentIntensity, bounce: uBounce.value },
      camera: o.look ? { gate: o.look } : { gate: { pos: v.pos.map((x) => +x.toFixed(3)), look: v.look }, utm: GF.utm(v.pos[0], v.pos[2]).map((x) => +x.toFixed(2)), eyeOverStreet: +(v.pos[1] - B.level(v.pos[2])).toFixed(3), hfov: v.hfov, vfov: +camera.fov.toFixed(3), shift: shiftNow, near: camera.near, far: camera.far },
      brightness: brightness(bytes), box: o.box ? { box: o.box, ...brightness(bytes, o.box, o.w) } : undefined, ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    return side
  },
  /** the sketch: frames of the timed path (or a span), JPEG, with a per-frame log */
  async clip(o: { out: string; fps: number; w: number; h: number; samples: number; from?: number; to?: number; framing?: 'desktop' | 'phone'; state?: 'grey' | 'flat' | 'full'; every?: number }) {
    setStates({ state: o.state ?? 'grey', switch: false })
    const from = o.from ?? 0, to = Math.min(o.to ?? path.duration, path.duration)
    const n = Math.floor((to - from) * o.fps + 1e-6) + 1
    const log: Array<Record<string, unknown>> = []
    const t = performance.now()
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const p: PathSample = path.sample(time)
      setHour(p.hour)
      const hfov = o.framing === 'phone' ? 46 : p.hfov
      const vfov = fittedFov(hfov, o.framing === 'phone' ? [390, 844] : [16, 9], o.w, o.h)
      aimWorld(new Vector3(...(p.pos as MV3)), new Vector3(...(p.look as MV3)), vfov, o.w, o.h, 0)
      const { bytes } = await render(o.w, o.h, o.samples, 0)
      const g = Math.round(time * o.fps)
      await upload(`${o.out}/${o.framing ?? 'desktop'}-f${String(g).padStart(5, '0')}.jpg`, await jpeg(bytes, o.w, o.h))
      const pg = new Vector3(...(p.pos as MV3)).applyMatrix4(W2G), lg = new Vector3(...(p.look as MV3)).applyMatrix4(W2G)
      log.push({ i: g, t: +time.toFixed(3), stop: p.stop, kind: p.kind, gate: [+pg.x.toFixed(2), +pg.y.toFixed(2), +pg.z.toFixed(2)], look: [+lg.x.toFixed(2), +lg.y.toFixed(2), +lg.z.toFixed(2)], eyeOverStreet: +(pg.y - B.level(pg.z)).toFixed(3), hour: +p.hour.toFixed(3) })
    }
    await upload(`${o.out}/${o.framing ?? 'desktop'}-frames-${String(Math.round(from * o.fps)).padStart(5, '0')}.json`, JSON.stringify({ fps: o.fps, w: o.w, h: o.h, samples: o.samples, from, to, frames: log }))
    return { frames: n, ms: Math.round(performance.now() - t) }
  },
  /** the path in the gate's frame, no rendering (the leg numbers) */
  pathSamples(dt = 0.1) {
    const out: Array<Record<string, unknown>> = []
    for (let time = 0; time <= path.duration + 1e-9; time += dt) {
      const p = path.sample(time)
      const pg = new Vector3(...(p.pos as MV3)).applyMatrix4(W2G), lg = new Vector3(...(p.look as MV3)).applyMatrix4(W2G)
      out.push({ t: +time.toFixed(3), x: pg.x, y: pg.y, z: pg.z, lx: lg.x, ly: lg.y, lz: lg.z, stop: p.stop, kind: p.kind, street: B.level(pg.z) })
    }
    return out
  },
}
;(window as unknown as { __gate: typeof rig }).__gate = rig
say(`ready: ${A.counts.wallTriangles} wall triangles, ${A.counts.panels} panels, ${A.counts.pavingTriangles} paving triangles, plan ${planMs} ms`)

if (!putBase) {
  const draw = (): void => {
    aimView(first, innerWidth, innerHeight)
    renderer.setSize(innerWidth, innerHeight)
    renderer.render(scene, camera)
  }
  addEventListener('resize', draw)
  draw()
}
