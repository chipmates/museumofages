/* BABYLON ABOUT 570 BC, THE MAP (`/src/wings/babylon/map/map.html`): the city
   at true scale from the excavation sheets in the arrival's mud and baked brick
   (city.ts), under the walk's one light (open/light.ts: the sun at the walk's
   hours, the sky and the far air, the contact shade, the print), and the walk as
   a timed camera path. Dev only; the rig `window.__map` takes the stills and the
   moving sketch.

     ?view=classes   each body's record classes (in place, known, guessed) in three tones: its plan row in a
                     band at its foot, its body row above (record.ts), at the stop the camera is at
     ?tower=built|dug|bruegel|bruegel-show   the tower switch: Etemenanki as the record reads it, as excavated, or
                     Bruegel's painted tower (bruegel-show: the showpiece at the painting's figure scale), at one camera
                     and one light; the rest of the scene unchanged (apart from ?view)
     ?ao=0           no contact occlusion; ?air=0 no haze; ?sigma=0.00018&scale=300 the haze's density and height
     ?garden=bare    stop 5's terraces without their planting; ?garden=dug without the guessed terraces too
     ?put=<url>      where the rig hands its files (the shooter's own server) */

import { Matrix3, Matrix4, MeshStandardNodeMaterial, PerspectiveCamera, Scene, Vector3, type Mesh, type Object3D } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, toPNG } from '../../animals/cave/render'
import { printFrame } from '../../animals/cave/print'
import { createOpenLinear } from '../open/air'
import { aloft, walkLight } from '../open/light'
import { rebuildHouses } from '../open/houses'
import { NORTH_PAVED } from '../open/north-paving'
import { cityOnCourtRooms, paintCity, setCityPixel, uCityPix } from './city'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from './plan'
import { buildBodies, tonesFrom, uView, type Sky } from './mass'
import { recordNamer, type ClassFile, type Pieces } from '../record'
import { toneMapBodies, type Painted } from '../record-tones'
import { hourOf, sunAt, sunVector } from './sun'
import { makePath, type PathSample, type V3 } from './path'
import { mountCourt } from '../court/court'
import { mountTower, towerState, type TowerState } from '../tower/tower'
import { mountGardens, type GardenState } from '../gardens/gardens'
import { PALM_MID, palmGeometry } from '../gate/gate-life'
import { mountNabu } from '../nabu/nabu'
import { mountHouse } from '../house/house'
import { mountEsagila } from '../esagila/esagila'
import { mountBruegel } from '../bruegel/bruegel'
import { mountShow } from '../bruegel-show/show'
import { keysFor } from '../bruegel-show/show-path'
import { mountBridge } from '../bridge/bridge'
import { mountTop } from '../top/top'
import { mountCrescent } from '../crescent/crescent'
import { mountGateOnMap } from './gate-on-map'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { mix, uniform, vec3 } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`map: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plan')
const [plan, cams, pieces, recordClasses, courtPlan, towerPlan, gardensPlan, nabuPlan, housePlan, esagilaPlan, gatePlan, bruegelPlan, showPlan, bridgePlan, topPlan]: [J, J, Pieces, ClassFile, J, J, J, J, J, J, J, J, J, J, J] = await Promise.all([
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
  // the walk's light is stated once, in the gate's plan (its `light`), for every page that takes open/light.ts
  fetch(new URL('../gate/gate-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../bruegel/bruegel-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../bruegel-show/show-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../bridge/bridge-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../top/top-plan.json', import.meta.url)).then((r) => r.json()),
])
const F = makeFrame(plan)
const t0 = performance.now()
const tones = tonesFrom(plan)
// stop 5's candidates, stop 6's court and throne room, stop 7's houses, stop 8's temple and stop 9's precinct wall, Gate 5's recess, the street before
// it and the tower draw themselves; the city's bodies are built without the prisms they replace (the gardens open the
// palace's rooms over the vaulted building before the court draws them)
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
// the Ishtar Gate's own model (the gate page's build) in place of the map's massings of its two gates
const ishtar = mountGateOnMap(bridge.built, plan, gatePlan)
const built = ishtar.built
// stop 15's plain round the walls, the arrival's, on the map's ground (the city from the top)
const top = mountTop(built, plan, topPlan, tones)
// the tower switch's third state, Bruegel's tower, on the real tower's centre (outside the record's classes)
const bruegel = mountBruegel(tower.dug.frame, built.ground, bruegelPlan)
// and its fourth, the showpiece, the same way
const bruegelShow = mountShow(tower.dug.frame, built.ground, showPlan)
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
// the far plane past the ground's farthest corner, as the arrival's: ground near the far plane reads as sky in the haze's depth test
const camera = new PerspectiveCamera(40, 16 / 9, 0.3, 60000)
stack.setScene(scene, camera, { ...IDENTITY, name: 'babylon-map' })

/* the walk's light (open/light.ts, the arrival's and the gate's): one sun from sun.ts, one sky and far air, the
   environment, the shadow fitted to the frame, the contact shade's reach and the print by the camera's height. The
   forecourt's sunlit east walls and its paving's bounce belong to the gate, so the map takes the plain's: the band off,
   the gate's place out of reach. The exposure's base is the map's own (the stops' `stops` in map-cams.json rest on it).
   With the band off, a street's shade takes the sunlit walls round it as more of the environment at street level (ours) */
const MAP_EXPOSURE = 0.8
const MAP_ENV = 0.8
const lq = new URLSearchParams(q)
lq.set('walls', '0')
if (!lq.has('exp')) lq.set('exp', String(MAP_EXPOSURE))
if (!lq.has('env')) lq.set('env', String(MAP_ENV))
const L = walkLight({ renderer, scene, light: gatePlan.light, rot: new Matrix3(), uW2G: uniform(new Matrix4()), uSunG: uniform(new Vector3()), gateAt: new Vector3(1e7, 0, 0), q: lq })
const sky: Sky = { colour: L.sky }
const skyDome = L.dome
// the last stop's crescent on the dome, at the minute the page's sun stands at (crescent/crescent.ts)
const crescent = await mountCrescent(L.AIR, skyDome, renderer)
// under the horizon the faces take the twilight's environment, in every frame: the walk's light stays its one writer
L.setEnvSource(crescent.env)
/** the environment the frame is drawn with, and the bakes so far (both skies) */
const envNow = () => ({ owner: L.env().by === 'source' ? 'twilight' : 'walk', dusk: +crescent.duskWeight().toFixed(3), bakes: L.env().bakes + crescent.bakes() })
/* a stop may set its own air (`air`, extinction a metre at the plain): it thickens the walk's haze there, never thins it */
const SIGMA = L.AIR.uSigma.value as number
const setAir = (a: number): void => { L.AIR.uSigma.value = Math.max(SIGMA, a) }
/* the ground's bounce in the environment by the camera's height: in a street the sunlit paving and walls round it, the
   gate's forecourt value; from the air the plain's */
const BOUNCE = { street: Number(gatePlan.light.bounce.paving.value), aloft: 0.18 }
function setBounce(y: number): void {
  const b = BOUNCE.street + (BOUNCE.aloft - BOUNCE.street) * aloft(y)
  if (Math.abs((L.uBounce.value as number) - b) < 0.005) return
  L.uBounce.value = b
  L.uWallsNear.value = 0
  L.bakeEnv()
}
tower.sky(sky, L.AIR.uSun)

say('building the city')
// the Ishtar Gate's passage through both gates, along its axis from the north face
const gateFrame = plan.frames.gate
const bodies = buildBodies(built, tones, sky, L.AIR.uSun, canalZ, { o: F.s(gateFrame.origin[0], gateFrame.origin[1]), a: F.dir(gateFrame.bearing), c: F.dir(gateFrame.bearing + 90), len: 50, half: 2.6 }, { ground: (b: N) => bridge.ground(esagila.ground(tower.ground(b))), houses: { rebuild: rebuildHouses, band: Number(plan.classes.band) } })
/* the city in the arrival's materials (city.ts), the precinct's ground painted over it; the South Palace's rooms, drawn
   by the court to cut its court into them, take the city's look outside the court's own fronts */
const lion = plan.frames.lion
paintCity(bodies.group, built, tones, {
  band: Number(plan.classes.band), ground: (b: N) => bridge.ground(esagila.ground(tower.ground(b))),
  street: { o: F.s(lion.origin[0], lion.origin[1]), a: F.dir(lion.bearing), c: F.dir(lion.bearing + 90), pavedTo: NORTH_PAVED.a1 },
})
cityOnCourtRooms(court.mesh as Mesh, court.court.F.court, uCityPix)
top.paintGround(bodies.group.getObjectByName('ground') as Mesh, L.sky, uCityPix, (b: N) => bridge.ground(esagila.ground(tower.ground(b))))
scene.add(bodies.group)
scene.add(court.mesh)
scene.add(tower.mesh, tower.towerMesh, ...tower.dugMeshes)
tower.attachGround(bodies.group.getObjectByName('ground') as Mesh)
scene.add(bruegel.mesh, bruegelShow.mesh)
/** the switch's states on this page: the tower's three and the showpiece, which hides the tower as Bruegel's does */
type MapTower = TowerState | 'bruegel-show'
const mapTower = (s: string | null | undefined): MapTower => (s === 'bruegel-show' ? s : towerState(s))
let towerNow: MapTower = 'built'
/** the tower switch: the tower as the record reads it, as dug, or Bruegel's; one camera, one light */
const setTower = (s: MapTower): void => {
  towerNow = s
  tower.state(s === 'bruegel-show' ? 'bruegel' : s)
  bruegel.show(s === 'bruegel')
  bruegelShow.on(s === 'bruegel-show')
}
setTower(mapTower(q.get('tower')))
scene.add(...gardens.meshes)
scene.add(nabu.mesh)
scene.add(house.mesh)
scene.add(esagila.mesh)
scene.add(...bridge.meshes, bridge.river(crescent.sky(L.sky), L.AIR))
scene.add(...top.meshes)
scene.add(ishtar.meshes(L.AIR.uSun))
uView.value = q.get('view') === 'classes' ? 1 : 0
/* the class view from the record at the camera's stop: some rows hold at certain stops only (the street's) */
let tonedAt = '', painted: Painted = { bodies: 0, byLetters: [] }
function toneAt(stop: number): void {
  if (String(stop) === tonedAt) return
  tonedAt = String(stop)
  const name = recordNamer(pieces, recordClasses, tonedAt)
  const city = toneMapBodies(bodies.group, built, name), gate = ishtar.tone(name), own = court.tone(name), five = gardens.tone(name), six = house.tone(name), nine = tower.tone(name), temple = nabu.tone(name), marduk = esagila.tone(name), river = bridge.tone(name)
  painted = { bodies: city.bodies + gate.bodies + own.bodies + five.bodies + six.bodies + nine.bodies + temple.bodies + marduk.bodies + river.bodies, byLetters: [...city.byLetters, ...gate.byLetters, ...own.byLetters, ...five.byLetters, ...six.byLetters, ...nine.byLetters, ...temple.byLetters, ...marduk.byLetters, ...river.byLetters] }
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
const walkOrder = [...new Set((cams.path as J[]).map((k) => k.stop as number))]
function showFigure(stop: number): void {
  // the next stop in the walk's order, not by number
  const own = figures.some((f) => f.userData['stop'] === stop) ? stop : walkOrder[walkOrder.indexOf(stop) + 1]
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

const setHour = (hour: number): void => {
  L.setHour(hour)
  crescent.setHour(hour)
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
  setCityPixel(camera.fov, h)
  bridge.setPixel(camera.fov, h)
  crescent.setPixel(camera.fov, h)
  ishtar.setPixel(camera.fov, h)
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  // the environment, the sky by height, the contact shade's fade and reach, and the shadow follow the camera (light.ts)
  const f = L.frame(camera)
  setBounce(camera.position.y)
  linear?.setRadius(f.aoRadius)
}

// the walk each tower state takes: the shared keys, or the showpiece's with its vantage beat (show-path.ts)
const paths = { shared: makePath(cams, F.s, stand), show: makePath({ ...cams, path: keysFor(cams, 'bruegel-show') }, F.s, stand) }
const walkNow = (): ReturnType<typeof makePath> => (towerNow === 'bruegel-show' ? paths.show : paths.shared)
const path = { get keys() { return walkNow().keys }, get duration() { return walkNow().duration }, sample: (t: number): PathSample => walkNow().sample(t) }

/* one pipeline, the arrival's (open/air.ts): the scene pass, the contact occlusion, the height haze; output linear; the
   print on the CPU */
setHour(hourOf(cams.stops[0].hour))
const first = path.sample(0)
const toneMs = performance.now()
toneAt(first.stop)
const recordMs = Math.round(performance.now() - toneMs)
let linear: ReturnType<typeof createOpenLinear> | null = null
aim(first.pos, first.look, first.hfov, 1600, 900, first.shift)
renderer.render(scene, camera)
linear = createOpenLinear(renderer, scene, camera, L.AIR, { ao: { on: q.get('ao') !== '0', intensity: L.uAoOn, radius: 1.2, fadeNear: L.uAoNear, fadeFar: L.uAoFar } })
/** the print for the camera where it stands: the stop's own stops and the walk's by height (light.ts) */
const printAt = (stops: number) => L.printFor(camera.position.y, stops + L.stopsAt(camera.position.y))

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
  const rgb = await accumulate(renderer, camera, linear!.post, w, h, samples)
  const bytes = printFrame(rgb, w, h, printAt(stops), 0)
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
/* the river's ripples run on the film's seconds; where a stop was put in before the bridge, `waterClock` runs them slower
   across its span, so the water at every later second is the water it was (the bridge's stills stay as landed) */
const WC = cams.waterClock as { from: number; to: number; seconds: number } | undefined
const waterAt = (t: number): number => (!WC || t <= WC.from ? t : t >= WC.to ? t - (WC.to - WC.from - WC.seconds) : WC.from + ((t - WC.from) * WC.seconds) / (WC.to - WC.from))
function aimFilm(time: number, framing: 'desktop' | 'phone', w: number, h: number): PathSample {
  const p = path.sample(time)
  toneAt(p.stop)
  setHour(p.hour)
  bridge.setTime(waterAt(time))
  const ph = framing === 'phone'
  setAir(airAt(time))
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
  state: () => ({ planMs, counts: bodies.counts, backend: stack.backend, architecture: stack.architecture, view: uView.value, tower: towerNow, duration: path.duration, record: { stop: tonedAt, ms: recordMs, ...painted } }),
  views: () => ({
    frame: plan.frame,
    stops: cams.stops.map((s: J) => ({ n: s.n, id: s.id, hour: s.hour, still: stillTime(s.n) })),
    keys: path.keys.map((k) => ({ t: k.t, stop: k.stop, kind: k.kind, cut: k.cut, hold: k.hold, still: k.still, pos: k.pos.map((v) => Math.round(v * 100) / 100), utm: F.utm(k.pos[0], k.pos[2]) })),
    duration: path.duration,
  }),
  /** what the scene holds, from the bodies the page built */
  facts: () => ({ ...built.facts, court: court.court.facts, etemenanki: tower.tower.facts, gardens: gardens.facts, nabu: nabu.nabu.facts, house: house.house.facts, esagila: esagila.esagila.facts, bruegel: bruegel.bruegel.facts, bruegelShow: bruegelShow.show.facts, bridge: bridge.bridge.facts, top: top.facts, streetLevelAtS: undefined, sunAt: Object.fromEntries(cams.stops.map((s: J) => [s.n, sunAt(hourOf(s.hour))])) }),
  stand: (E: number, N: number) => {
    const [x, z] = F.s(E, N)
    return { stand: stand(x, z), ground: built.ground(x, z), street: built.streetAt(x, z) }
  },
  /** stop 5's garden: planted, its terraces bare, or the dug plans only */
  garden: (state: GardenState) => gardens.setGarden(state),
  /** the tower switch: built, dug, bruegel or bruegel-show */
  tower: (s: MapTower) => setTower(mapTower(s)),
  /** a still of one stop: the film's own frame at the stop's still second, full size, either framing */
  async shoot(o: { stop: number; framing: 'desktop' | 'phone'; view: 'grey' | 'classes'; w: number; h: number; samples: number; out: string; name?: string; css?: [number, number]; t?: number; garden?: GardenState }) {
    const s = cams.stops.find((x: J) => x.n === o.stop)
    if (!s) throw new Error(`no stop ${o.stop}`)
    const time = o.t ?? stillTime(o.stop)
    gardens.setGarden(o.garden ?? gardenState)
    uView.value = o.view === 'classes' ? 1 : 0
    const baked = envNow().bakes
    const p = aimFilm(time, o.framing, o.w, o.h)
    const ev = expAt(time)
    const { bytes, ms } = await render(o.w, o.h, o.samples, ev)
    const base = o.name ?? `${String(s.n).padStart(2, '0')}-${s.id}-${o.framing}-${o.view}`
    const file = `${o.out}/${base}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const sun = sunAt(p.hour)
    const side = {
      file, stop: s.n, id: s.id, framing: o.framing, view: o.view, tower: towerNow, filmSecond: +time.toFixed(3), filmFrameAt8fps: Math.round(time * 8),
      cssSize: o.css ?? [o.w, o.h], devicePixels: [o.w, o.h], ratio: o.css ? o.w / o.css[0] : 1, subFrames: o.samples,
      sampleCountReadBack: 'one sample a sub-frame: the linear target is allocated without multisampling (render.ts)',
      backend: stack.backend, adapter: stack.architecture, exposureStops: +ev.toFixed(3), heightStops: +L.stopsAt(camera.position.y).toFixed(3), print: printAt(ev),
      air: { sigma: L.AIR.uSigma.value, scale: L.AIR.uScale.value, on: L.AIR.uOn.value }, env: { intensity: scene.environmentIntensity, sun: L.sunLight.intensity, ...envNow(), bakes: envNow().bakes - baked },
      hour: +p.hour.toFixed(3), sun: { azimuth: +sun.azimuth.toFixed(1), elevation: +sun.elevation.toFixed(1) }, moon: crescent.inFrame(camera, o.w, o.h),
      camera: { utm: F.utm(p.pos[0], p.pos[2]), y: +p.pos[1].toFixed(2), eyeOverStand: +(p.pos[1] - stand(p.pos[0], p.pos[2])).toFixed(3), hfov: +camera.fov.toFixed(2), kind: p.kind, near: camera.near, far: camera.far },
      figures: figuresInFrame().filter((n) => n === p.stop),
      brightness: brightness(bytes), ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    return side
  },
  /** a still from any camera: UTM place, a height (a level or 'eye'), a look point (E, N, level), an hour */
  async probe(o: { at: [number, number]; y: number | 'eye'; look: [number, number, number]; hour: string; hfov?: number; shift?: number; stops?: number; w: number; h: number; samples: number; out: string; name: string; view?: 'grey' | 'classes'; figure?: number; air?: number; garden?: GardenState; tower?: MapTower }) {
    const [x, z] = F.s(o.at[0], o.at[1])
    if (o.tower) setTower(mapTower(o.tower))
    setAir(o.air ?? (o.figure ? airOf(o.figure) : 0))
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
    let baked = envNow().bakes
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const p = aimFilm(time, framing, o.w, o.h)
      const e = envNow()
      const env = { owner: e.owner, dusk: e.dusk, bakes: e.bakes - baked }
      baked = e.bakes
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
      log.push({ i: g, t: +time.toFixed(3), stop: p.stop, kind: p.kind, utm: F.utm(p.pos[0], p.pos[2]).map((v) => +v.toFixed(2)), y: +p.pos[1].toFixed(2), eyeOverStand: +(p.pos[1] - stand(p.pos[0], p.pos[2])).toFixed(2), hour: +p.hour.toFixed(3), ev: +ev.toFixed(3), figuresInFrame: figuresInFrame(), env, ...(watch ? { watch } : {}) })
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
