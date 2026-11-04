/* BABYLON ABOUT 570 BC, THE MAP (`/src/wings/babylon/map/map.html`): the city
   in grey blocks at true scale from the excavation sheets, a plain sun at the
   walk's hours, and the walk as a timed camera path. Dev only; the rig
   `window.__map` takes the stills and the moving sketch.

     ?view=classes   each body's record classes (in place, known, guessed) in three tones: its plan row in a
                     band at its foot, its body row above (record.ts), at the stop the camera is at
     ?tower=base     Etemenanki's excavated base only
     ?ao=0           no contact occlusion; ?aofade=250,900 where it fades out (m)
     ?garden=bare    stop 5's terraces without their planting; ?garden=dug without the guessed terraces too
     ?put=<url>      where the rig hands its files (the shooter's own server) */

import {
  BackSide, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera,
  Scene, SphereGeometry, Vector3, type Object3D,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, toPNG } from '../../animals/cave/render'
import { createMapLinear } from './map-render'
import { printFrame } from '../../animals/cave/print'
import type { Print } from '../../animals/cave/site'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from './plan'
import { buildBodies, tonesFrom, uView, type Sky } from './mass'
import { recordNamer, type ClassFile, type Pieces } from '../record'
import { toneMapBodies, type Painted } from '../record-tones'
import { hourOf, sunAt, sunVector } from './sun'
import { makePath, type PathSample, type V3 } from './path'
import { mountCourt } from '../court/court'
import { mountTower } from '../tower/tower'
import { mountGardens, type GardenState } from '../gardens/gardens'
import { palmGeometry } from '../gate/gate-life'
import { mountNabu } from '../nabu/nabu'
import { mountHouse } from '../house/house'
import { mountEsagila } from '../esagila/esagila'
import { mountBridge } from '../bridge/bridge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { cameraPosition, clamp, dot, exp, float, max, mix, normalize, positionLocal, positionWorld, pow, smoothstep, step, uniform, vec3, fog, densityFogFactor } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`map: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plan')
const [plan, cams, pieces, recordClasses, courtPlan, towerPlan, gardensPlan, nabuPlan, housePlan, esagilaPlan, bridgePlan]: [J, J, Pieces, ClassFile, J, J, J, J, J, J, J] = await Promise.all([
  fetch(new URL('./map-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('./map-cams.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../pieces.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../record-classes.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../court/court-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../tower/tower-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../gardens/gardens-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../nabu/nabu-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../house/house-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../esagila/esagila-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../bridge/bridge-plan.json', import.meta.url)).then((r) => r.json()),
])
if (q.get('tower') === 'base') plan.tower.stages = plan.tower.stages.slice(0, 1)
const F = makeFrame(plan)
const t0 = performance.now()
const tones = tonesFrom(plan)
// stop 5's candidates, stop 6's court and throne room, stop 7's houses, stop 8's temple and stop 9's precinct wall, Gate 5's recess, the street before
// it and the tower draw themselves; the city's bodies are built without the prisms they replace (the gardens open the
// palace's rooms over the vaulted building before the court draws them)
/** the palms of the garden: between the gate's near palm and the plain's far one, for 150 to 400 m */
const PALM_MID = { seg: 4, sides: 5, fronds: 16, steps: 4 }
const gardens = mountGardens(buildPlan(plan), plan, gardensPlan, tones, palmGeometry, PALM_MID)
const court = mountCourt(gardens.built, plan, courtPlan, tones)
const tower = mountTower(court.built, plan, towerPlan, tones)
// stop 8's Nabu temple the same way, and a visitor stands on its floor
const nabu = mountNabu(tower.built, plan, nabuPlan, tones)
// stop 7's houses likewise
const house = mountHouse(nabu.built, plan, housePlan, tones)
// stop 9's Esagila, its ground, the wall before Gate 8 and the street round the precinct's corner (the old stops 10, 11)
const esagila = mountEsagila(house.built, plan, esagilaPlan, tones)
// stop 12's bridge, its quay, the river and the west bank's green (the old stop 13)
const bridge = mountBridge(esagila.built, plan, bridgePlan, tones)
const built = bridge.built
const gardenState = (q.get('garden') ?? 'planted') as GardenState
gardens.setGarden(gardenState)
const planMs = Math.round(performance.now() - t0)

/* the canal's banks get their own ground lines, so its cut stays 2.8 m wide on a 6 m grid */
const canalZ: number[] = []
{
  const cz = F.s(plan.canal.line[0][0], plan.canal.line[0][1])[1]
  for (const d of [-2.4, -plan.canal.w / 2, plan.canal.w / 2, 2.4]) canalZ.push(Math.round((cz + d) * 100) / 100)
}

const stand = (x: number, z: number): number => built.stand(x, z)

/* ── the page ── */
const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const renderer = stack.renderer
const scene = new Scene()
const camera = new PerspectiveCamera(40, 16 / 9, 0.3, 26000)
stack.setScene(scene, camera, { ...IDENTITY, name: 'babylon-map' })

/* the sky and the sun, one set of uniforms for every hour */
const uSun = uniform(new Vector3(0, 1, 0))
const uDay = uniform(1)
const uHaze = uniform(new Color(0.7, 0.66, 0.58))
/* at and below the horizon the sky is the haze the far ground fades into, blended upward over about
   seven degrees: a darker dome under a lit haze printed a hard band from every height above the roofs */
const skyColour = (d: N): N => {
  const up = clamp(d.y, 0, 1)
  const low = smoothstep(-0.04, 0.35, uSun.y)
  const zenith = mix(vec3(0.05, 0.08, 0.16), vec3(0.16, 0.3, 0.6), low)
  const horizon = mix(vec3(0.5, 0.36, 0.26), vec3(0.72, 0.68, 0.6), low)
  const cosS = max(dot(d, uSun), 0)
  const glow = vec3(1.0, 0.72, 0.45).mul(pow(cosS, 8).mul(0.55).add(pow(cosS, 120).mul(1.6)))
  const disc = smoothstep(0.99996, 0.99999, cosS).mul(60)
  const above = mix(horizon, zenith, pow(up, 0.45)).mul(uDay)
  const sun = glow.add(vec3(1, 0.9, 0.75).mul(disc)).mul(smoothstep(-0.03, 0.0, d.y)).mul(uDay)
  return mix(uHaze, above, smoothstep(0.0, 0.12, d.y)).add(sun)
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
const uDensity = uniform(Number(q.get('haze') ?? 0.0002))
/* a stop may set its own air (`air`, extinction a metre): the light between the eye and a far face is then partly the
   sunlit haze's, in the horizon sky's colour toward the view, the sun's glow included; 0 leaves the page's fog */
const uAir = uniform(0)
const airFog = (() => {
  const v = positionWorld.sub(cameraPosition)
  const dist = v.length()
  const toward = skyColour(normalize(vec3(v.x, dist.mul(0.03), v.z)))
  const airF = float(1).sub(exp(dist.mul(uAir).negate()))
  return fog(mix(uHaze, toward, step(1e-7, uAir)), max(densityFogFactor(uDensity), airF))
})()
scene.fogNode = airFog

say('building the city')
// the Ishtar Gate's passage through both gates, along its axis from the north face
const gateFrame = plan.frames.gate
const bodies = buildBodies(built, tones, sky, uSun, canalZ, { o: F.s(gateFrame.origin[0], gateFrame.origin[1]), a: F.dir(gateFrame.bearing), c: F.dir(gateFrame.bearing + 90), len: 50, half: 2.6 }, { ground: (b: N) => bridge.ground(esagila.ground(tower.ground(b))) })
scene.add(bodies.group)
scene.add(court.mesh)
scene.add(tower.mesh)
scene.add(...gardens.meshes)
scene.add(nabu.mesh)
scene.add(house.mesh)
scene.add(esagila.mesh)
scene.add(...bridge.meshes, bridge.river(skyColour, uSun, uDay))
uView.value = q.get('view') === 'classes' ? 1 : 0
/* the class view from the record at the camera's stop: some rows hold at certain stops only (the street's) */
let tonedAt = '', painted: Painted = { bodies: 0, byLetters: [] }
function toneAt(stop: number): void {
  if (String(stop) === tonedAt) return
  tonedAt = String(stop)
  const name = recordNamer(pieces, recordClasses, tonedAt)
  const city = toneMapBodies(bodies.group, built, name), own = court.tone(name), five = gardens.tone(name), six = house.tone(name), nine = tower.tone(name), temple = nabu.tone(name), marduk = esagila.tone(name), river = bridge.tone(name)
  painted = { bodies: city.bodies + own.bodies + five.bodies + six.bodies + nine.bodies + temple.bodies + marduk.bodies + river.bodies, byLetters: [...city.byLetters, ...own.byLetters, ...five.byLetters, ...six.byLetters, ...nine.byLetters, ...temple.byLetters, ...marduk.byLetters, ...river.byLetters] }
}

/* the person for size, at each stop's place for one */
const personMat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
personMat.colorNode = mix(vec3(0.16), vec3(0.62, 0.3, 0.26), uView.mul(0))
const figures: Object3D[] = []
for (const s of cams.stops) {
  if (!s.figure) continue
  const p = signPerson(PERSON_FORMS.f2, personMat)
  const [x, z] = F.s(s.figure[0], s.figure[1])
  p.position.set(x, stand(x, z), z)
  // its front (+x) toward the bearing it faces
  p.rotation.y = (90 - s.figure[2]) * D2R
  p.name = `figure-${s.n}`
  p.userData['stop'] = s.n
  scene.add(p)
  figures.push(p)
}
/* one figure in a frame: the running stop's own, or the next stop's where the stop has none, so a figure
   changes only at a cut or far out of sight */
function showFigure(stop: number): void {
  const own = figures.some((f) => f.userData['stop'] === stop) ? stop : stop + 1
  for (const f of figures) f.visible = f.userData['stop'] === own
}
const ndc = new Vector3()
/** the figures whose body falls inside the frame, visible or not, for the pop check */
function figuresInFrame(): number[] {
  const seen: number[] = []
  for (const f of figures) {
    let inside = false
    for (const h of [0.1, 0.9, 1.7]) {
      ndc.set(f.position.x, f.position.y + h, f.position.z).project(camera)
      if (ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) inside = true
    }
    if (inside) seen.push(f.userData['stop'] as number)
  }
  return seen
}

/* light: the sun's key with a shadow fitted round each view, and the sky's fill */
/** From three r187 a dielectric's diffuse light loses its Fresnel share: the
 * grey blocks keep the level they were approved at by this gain on both lights. */
const LIGHT_HOLD = 1.04
const sunLight = new DirectionalLight(new Color(1.0, 0.86, 0.7), 3.2)
sunLight.castShadow = true
sunLight.shadow.mapSize.set(8192, 8192)
sunLight.shadow.bias = -0.0003
sunLight.shadow.normalBias = 0.06
const fill = new HemisphereLight(new Color(0.55, 0.64, 0.82), new Color(0.4, 0.39, 0.37), 1.4)
scene.add(sunLight, sunLight.target, fill)

let hourNow = -1
function setHour(hour: number): void {
  if (Math.abs(hour - hourNow) < 1e-4) return
  hourNow = hour
  const v = sunVector(hour)
  ;(uSun.value as Vector3).set(...v)
  const el = Math.asin(v[1]) / D2R
  // the key fades into the haze below a few degrees; the sky dims after sunset
  const k = Math.min(1, Math.max(0, (el + 0.5) / 6))
  sunLight.intensity = 3.2 * k * LIGHT_HOLD
  sunLight.color.setRGB(1.0, 0.72 + 0.14 * Math.min(1, el / 20), 0.5 + 0.2 * Math.min(1, el / 20))
  const day = Math.min(1, Math.max(0.18, (el + 6) / 14))
  uDay.value = day
  fill.intensity = 1.4 * day * LIGHT_HOLD
  ;(uHaze.value as Color).setRGB(0.72 * day, 0.64 * day, 0.54 * day)
}

function fitShadow(cam: PerspectiveCamera): void {
  const sun = new Vector3(...(uSun.value as Vector3).toArray()).normalize()
  const fwd = new Vector3()
  cam.getWorldDirection(fwd)
  fwd.y = 0
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
  fwd.normalize()
  const h = Math.max(0, cam.position.y - stand(cam.position.x, cam.position.z))
  const r = Math.min(2400, 420 + h * 6)
  const focus = cam.position.clone().addScaledVector(fwd, r * 0.75)
  focus.y = 20
  sunLight.position.copy(focus).addScaledVector(sun, 6000)
  sunLight.target.position.copy(focus)
  sunLight.target.updateMatrixWorld()
  sunLight.updateMatrixWorld()
  const sc = sunLight.shadow.camera
  sc.left = -r
  sc.right = r
  sc.top = r
  sc.bottom = -r
  sc.near = 4000
  sc.far = 8000
  sc.updateProjectionMatrix()
}

/* the camera: a level look with the frame slid up or down (a shift lens) where a view asks */
let shiftNow = 0
const ownUpdate = camera.updateProjectionMatrix.bind(camera)
camera.updateProjectionMatrix = function () {
  ownUpdate()
  if (shiftNow !== 0) {
    this.projectionMatrix.elements[9] = this.projectionMatrix.elements[9]! + shiftNow
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert()
  }
}
function aim(pos: V3, look: V3, hfov: number, w: number, h: number, shift = 0): void {
  camera.position.set(...pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(new Vector3(...look))
  camera.fov = (2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))) / D2R
  camera.aspect = w / h
  shiftNow = shift
  camera.updateProjectionMatrix()
  court.setPixel(camera.fov, h)
  tower.setPixel(camera.fov, h)
  gardens.setPixel(camera.fov, h)
  nabu.setPixel(camera.fov, h)
  house.setPixel(camera.fov, h)
  esagila.setPixel(camera.fov, h)
  bridge.setPixel(camera.fov, h)
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  fitShadow(camera)
}

const path = makePath(cams, F.s, stand)

/* one pipeline: the scene pass, the contact occlusion, output linear; the print on the CPU */
setHour(hourOf(cams.stops[0].hour))
const first = path.sample(0)
const toneMs = performance.now()
toneAt(first.stop)
const recordMs = Math.round(performance.now() - toneMs)
aim(first.pos, first.look, first.hfov, 1600, 900, first.shift)
renderer.render(scene, camera)
const fade = (q.get('aofade') ?? '250,900').split(',').map(Number) as [number, number]
const linear = createMapLinear(renderer, scene, camera, { ao: { on: q.get('ao') !== '0', intensity: Number(q.get('ao') ?? 0.75), radius: 1.2 }, fade })
const PRINT: Print = {
  exposure: Number(q.get('exp') ?? 0.62), toe: 0.01, shoulder: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], warm: [1.02, 1, 0.97], cool: [0.97, 1, 1.03],
  split: 0.3, saturation: 0.9, vignette: 0.12, grain: 0.004, glow: { threshold: 1.2, strength: 0.05, radii: [0.012, 0.06] },
}

const putBase = q.get('put') ?? ''
async function upload(path: string, bytes: Uint8Array | string): Promise<void> {
  const res = await fetch(`${putBase}?path=${encodeURIComponent(path)}`, { method: 'POST', body: bytes as BodyInit })
  if (!res.ok) throw new Error(`upload ${path}: ${res.status}`)
}
async function jpeg(bytes: Uint8ClampedArray, w: number, h: number, quality = 0.9): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality))
  return new Uint8Array(await blob.arrayBuffer())
}

/** brightness of a printed frame: median and 1st and 99th percentile of luma, 0 to 255 */
function brightness(bytes: Uint8ClampedArray): { median: number; p1: number; p99: number } {
  const hist = new Uint32Array(256)
  for (let i = 0; i < bytes.length; i += 4) hist[Math.round(0.2126 * bytes[i]! + 0.7152 * bytes[i + 1]! + 0.0722 * bytes[i + 2]!)]!++
  const n = bytes.length / 4
  const at = (f: number): number => {
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!
      if (acc >= f * n) return v
    }
    return 255
  }
  return { median: at(0.5), p1: at(0.01), p99: at(0.99) }
}

async function render(w: number, h: number, samples: number, stops = 0): Promise<{ bytes: Uint8ClampedArray; ms: number }> {
  const t = performance.now()
  const rgb = await accumulate(renderer, camera, linear.post, w, h, samples)
  const bytes = printFrame(rgb, w, h, { ...PRINT, exposure: PRINT.exposure * Math.pow(2, stops) }, 0)
  return { bytes, ms: Math.round(performance.now() - t) }
}

/* the film at a second, in either framing: the path's camera, the phone's own composition, the eased exposure */
const stopsOf = (n: number): number => cams.stops.find((x: J) => x.n === n)?.stops ?? 0
const expAt = (time: number): number => {
  let acc = 0
  for (let k = -6; k <= 6; k++) acc += stopsOf(path.sample(time + k * 0.5).stop)
  return acc / 13
}
/** a stop's own air, eased over the same six seconds as its exposure */
const airOf = (n: number): number => cams.stops.find((x: J) => x.n === n)?.air ?? 0
const airAt = (time: number): number => {
  let acc = 0
  for (let k = -6; k <= 6; k++) acc += airOf(path.sample(time + k * 0.5).stop)
  return acc / 13
}
function aimFilm(time: number, framing: 'desktop' | 'phone', w: number, h: number): PathSample {
  const p = path.sample(time)
  toneAt(p.stop)
  setHour(p.hour)
  bridge.setTime(time)
  const ph = framing === 'phone'
  uAir.value = airAt(time)
  aim(p.pos, ph ? p.phone.look : p.look, ph ? p.phone.hfov : p.hfov, w, h, ph ? p.phone.shift : p.shift)
  showFigure(p.stop)
  return p
}
/** the second a stop's still is taken: the film frame (8 a second) at its key marked still, else at its last
    key; on a cut key the first frame after the cut */
function stillTime(stop: number): number {
  const ks = path.keys.filter((k) => k.stop === stop)
  if (!ks.length) throw new Error(`no keys for stop ${stop}`)
  const k = ks.find((x) => x.still) ?? ks[ks.length - 1]!
  return (k.cut ? Math.ceil(k.t * 8) : Math.floor(k.t * 8 + 1e-6)) / 8
}

const rig = {
  ready: true,
  state: () => ({ planMs, counts: bodies.counts, backend: stack.backend, architecture: stack.architecture, view: uView.value, tower: q.get('tower') ?? 'full', duration: path.duration, record: { stop: tonedAt, ms: recordMs, ...painted } }),
  views: () => ({
    frame: plan.frame,
    stops: cams.stops.map((s: J) => ({ n: s.n, id: s.id, hour: s.hour, still: stillTime(s.n) })),
    keys: path.keys.map((k) => ({ t: k.t, stop: k.stop, kind: k.kind, cut: k.cut, hold: k.hold, still: k.still, pos: k.pos.map((v) => Math.round(v * 100) / 100), utm: F.utm(k.pos[0], k.pos[2]) })),
    duration: path.duration,
  }),
  /** what the scene holds, from the bodies the page built */
  facts: () => ({ ...built.facts, court: court.court.facts, etemenanki: tower.tower.facts, gardens: gardens.facts, nabu: nabu.nabu.facts, house: house.house.facts, esagila: esagila.esagila.facts, bridge: bridge.bridge.facts, streetLevelAtS: undefined, sunAt: Object.fromEntries(cams.stops.map((s: J) => [s.n, sunAt(hourOf(s.hour))])) }),
  stand: (E: number, N: number) => {
    const [x, z] = F.s(E, N)
    return { stand: stand(x, z), ground: built.ground(x, z), street: built.streetAt(x, z) }
  },
  /** stop 5's garden: planted, its terraces bare, or the dug plans only */
  garden: (state: GardenState) => gardens.setGarden(state),
  /** a still of one stop: the film's own frame at the stop's still second, full size, either framing */
  async shoot(o: { stop: number; framing: 'desktop' | 'phone'; view: 'grey' | 'classes'; w: number; h: number; samples: number; out: string; name?: string; css?: [number, number]; t?: number; garden?: GardenState }) {
    const s = cams.stops.find((x: J) => x.n === o.stop)
    if (!s) throw new Error(`no stop ${o.stop}`)
    const time = o.t ?? stillTime(o.stop)
    gardens.setGarden(o.garden ?? gardenState)
    uView.value = o.view === 'classes' ? 1 : 0
    const p = aimFilm(time, o.framing, o.w, o.h)
    const ev = expAt(time)
    const { bytes, ms } = await render(o.w, o.h, o.samples, ev)
    const base = o.name ?? `${String(s.n).padStart(2, '0')}-${s.id}-${o.framing}-${o.view}`
    const file = `${o.out}/${base}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const sun = sunAt(p.hour)
    const side = {
      file, stop: s.n, id: s.id, framing: o.framing, view: o.view, filmSecond: +time.toFixed(3), filmFrameAt8fps: Math.round(time * 8),
      cssSize: o.css ?? [o.w, o.h], devicePixels: [o.w, o.h], ratio: o.css ? o.w / o.css[0] : 1, subFrames: o.samples,
      sampleCountReadBack: 'one sample a sub-frame: the linear target is allocated without multisampling (render.ts)',
      backend: stack.backend, adapter: stack.architecture, exposureStops: +ev.toFixed(3), print: { ...PRINT, exposure: PRINT.exposure * Math.pow(2, ev) },
      hour: +p.hour.toFixed(3), sun: { azimuth: +sun.azimuth.toFixed(1), elevation: +sun.elevation.toFixed(1) },
      camera: { utm: F.utm(p.pos[0], p.pos[2]), y: +p.pos[1].toFixed(2), eyeOverStand: +(p.pos[1] - stand(p.pos[0], p.pos[2])).toFixed(3), hfov: +camera.fov.toFixed(2), kind: p.kind, near: camera.near, far: camera.far },
      figures: figuresInFrame().filter((n) => n === p.stop),
      brightness: brightness(bytes), ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    return side
  },
  /** a still from any camera: UTM place, a height (a level or 'eye'), a look point (E, N, level), an hour */
  async probe(o: { at: [number, number]; y: number | 'eye'; look: [number, number, number]; hour: string; hfov?: number; shift?: number; stops?: number; w: number; h: number; samples: number; out: string; name: string; view?: 'grey' | 'classes'; figure?: number; air?: number; garden?: GardenState }) {
    const [x, z] = F.s(o.at[0], o.at[1])
    uAir.value = o.air ?? (o.figure ? airOf(o.figure) : 0)
    gardens.setGarden(o.garden ?? gardenState)
    if (o.figure) {
      toneAt(o.figure)
      showFigure(o.figure)
    }
    const y = o.y === 'eye' ? stand(x, z) + cams.eye : o.y
    const [lx, lz] = F.s(o.look[0], o.look[1])
    uView.value = o.view === 'classes' ? 1 : 0
    setHour(hourOf(o.hour))
    aim([x, y, z], [lx, o.look[2], lz], o.hfov ?? cams.lens.desktop, o.w, o.h, o.shift ?? 0)
    const { bytes, ms } = await render(o.w, o.h, o.samples, o.stops ?? 0)
    const file = `${o.out}/${o.name}.${o.w > 1000 ? 'png' : 'jpg'}`
    await upload(file, o.w > 1000 ? await toPNG(bytes, o.w, o.h) : await jpeg(bytes, o.w, o.h, 0.9))
    return { file, ms, y: +y.toFixed(2), brightness: brightness(bytes) }
  },
  /** the moving sketch: frames of the whole path (or a span), JPEG, with a per-frame log */
  async clip(o: { out: string; fps: number; w: number; h: number; samples: number; from?: number; to?: number; framing?: 'desktop' | 'phone'; view?: 'grey' | 'classes'; every?: number; watch?: [number, number] }) {
    uView.value = o.view === 'classes' ? 1 : 0
    const from = o.from ?? 0, to = Math.min(o.to ?? path.duration, path.duration)
    const n = Math.floor((to - from) * o.fps) + 1
    const log: Array<Record<string, unknown>> = []
    const t = performance.now()
    const framing = o.framing ?? 'desktop'
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const p = aimFilm(time, framing, o.w, o.h)
      const ev = expAt(time)
      const { bytes } = await render(o.w, o.h, o.samples, ev)
      const g = Math.round(time * o.fps)
      await upload(`${o.out}/f${String(g).padStart(5, '0')}.jpg`, await jpeg(bytes, o.w, o.h, 0.86))
      // a watched ground point (E, N, on what a visitor stands there) in this frame's pixels, for a local flicker measure
      let watch: number[] | undefined
      if (o.watch) {
        const [wx, wz] = F.s(o.watch[0], o.watch[1])
        ndc.set(wx, stand(wx, wz), wz).project(camera)
        watch = [+(((ndc.x + 1) / 2) * o.w).toFixed(1), +(((1 - ndc.y) / 2) * o.h).toFixed(1), ndc.z < 1 ? 1 : 0]
      }
      log.push({ i: g, t: +time.toFixed(3), stop: p.stop, kind: p.kind, utm: F.utm(p.pos[0], p.pos[2]).map((v) => +v.toFixed(2)), y: +p.pos[1].toFixed(2), eyeOverStand: +(p.pos[1] - stand(p.pos[0], p.pos[2])).toFixed(2), hour: +p.hour.toFixed(3), ev: +ev.toFixed(3), figuresInFrame: figuresInFrame(), ...(watch ? { watch } : {}) })
    }
    await upload(`${o.out}/frames-${String(Math.round(from * o.fps)).padStart(5, '0')}.json`, JSON.stringify({ fps: o.fps, w: o.w, h: o.h, samples: o.samples, from, to, frames: log }, null, 0))
    return { frames: n, ms: Math.round(performance.now() - t) }
  },
  /** the path sampled for the motion check, no rendering */
  pathSamples(dt = 0.1) {
    const out: Array<Record<string, unknown>> = []
    for (let time = 0; time <= path.duration + 1e-9; time += dt) {
      const p = path.sample(time)
      out.push({ t: +time.toFixed(3), x: p.pos[0], y: p.pos[1], z: p.pos[2], lx: p.look[0], ly: p.look[1], lz: p.look[2], stop: p.stop, kind: p.kind, eye: p.eye, stand: stand(p.pos[0], p.pos[2]), hour: p.hour })
    }
    return out
  },
}
;(window as unknown as { __map: typeof rig }).__map = rig
say(`ready: ${bodies.counts.prisms} prisms, ${bodies.counts.boxes} boxes, ${bodies.counts.houses} houses, ${bodies.counts.triangles} triangles, plan ${planMs} ms; record classes at stop ${tonedAt} in ${recordMs} ms, ${painted.byLetters.length ? `${painted.byLetters.length} bodies on their letters (no row): ${painted.byLetters.slice(0, 6).join(', ')}` : 'every body on its row'}`)

/* a live look for a person at the page: the first stop, redrawn on resize */
if (!putBase) {
  const draw = (): void => {
    aim(first.pos, first.look, first.hfov, innerWidth, innerHeight, first.shift)
    renderer.setSize(innerWidth, innerHeight)
    renderer.render(scene, camera)
  }
  addEventListener('resize', draw)
  draw()
}
