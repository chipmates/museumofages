/* BABYLON ABOUT 570 BC, THE MAP (`/src/wings/babylon/map/map.html`): the city
   in grey blocks at true scale from the excavation sheets, a plain sun at the
   walk's hours, and the walk as a timed camera path. Dev only; the rig
   `window.__map` takes the stills and the moving sketch.

     ?view=classes   the plan's and the height's class (M, R, G) in three tones
     ?tower=base     Etemenanki's excavated base only
     ?put=<url>      where the rig hands its files (the shooter's own server) */

import {
  BackSide, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera,
  Scene, SphereGeometry, Vector3, type Object3D,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, createLinear, toPNG } from '../../animals/cave/render'
import { printFrame } from '../../animals/cave/print'
import type { Print } from '../../animals/cave/site'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from './plan'
import { buildBodies, tonesFrom, uView, type Sky } from './mass'
import { hourOf, sunAt, sunVector } from './sun'
import { makePath, type PathSample, type V3 } from './path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { clamp, dot, float, max, mix, normalize, positionLocal, pow, smoothstep, uniform, vec3, fog, densityFogFactor } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`map: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plan')
const [plan, cams]: [J, J] = await Promise.all([
  fetch(new URL('./map-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('./map-cams.json', import.meta.url)).then((r) => r.json()),
])
if (q.get('tower') === 'base') plan.tower.stages = plan.tower.stages.slice(0, 1)
const F = makeFrame(plan)
const t0 = performance.now()
const built = buildPlan(plan)
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
const uDensity = uniform(Number(q.get('haze') ?? 0.00016))
scene.fogNode = fog(uHaze, densityFogFactor(uDensity))

say('building the city')
const tones = tonesFrom(plan)
const bodies = buildBodies(built, tones, sky, uSun, canalZ)
scene.add(bodies.group)
uView.value = q.get('view') === 'classes' ? 1 : 0

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
  scene.add(p)
  figures.push(p)
}

/* light: the sun's key with a shadow fitted round each view, and the sky's fill */
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
  sunLight.intensity = 3.2 * k
  sunLight.color.setRGB(1.0, 0.72 + 0.14 * Math.min(1, el / 20), 0.5 + 0.2 * Math.min(1, el / 20))
  const day = Math.min(1, Math.max(0.18, (el + 6) / 14))
  uDay.value = day
  fill.intensity = 1.4 * day
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
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  fitShadow(camera)
}

/* the stops' views, resolved: UTM to scene, eye heights over what the visitor stands on */
interface View { id: string; stop: number; framing: 'desktop' | 'phone'; pos: V3; look: V3; hfov: number; shift: number; hour: number; eye: boolean }
function resolve(stop: J, framing: 'desktop' | 'phone'): View {
  const v = stop[framing]
  const [x, z] = F.s(v.at[0], v.at[1])
  const eye = v.y === 'eye'
  const y = eye ? stand(x, z) + cams.eye : (v.y as number)
  const [lx, lz] = F.s(v.look[0], v.look[1])
  let look: V3 = [lx, v.look[2], lz]
  // a level eye: the look keeps the eye's height and the shift slides the frame
  if (eye && v.level !== false) look = [lx, y, lz]
  return { id: `${String(stop.n).padStart(2, '0')}-${stop.id}`, stop: stop.n, framing, pos: [x, y, z], look, hfov: v.hfov ?? cams.lens[framing], shift: v.shift ?? 0, hour: hourOf(stop.hour), eye }
}
const path = makePath(cams, F.s, stand)

/* one pipeline: the scene pass, the contact occlusion, output linear; the print on the CPU */
setHour(hourOf(cams.stops[0].hour))
const first = resolve(cams.stops[0], 'desktop')
aim(first.pos, first.look, first.hfov, 1600, 900, first.shift)
renderer.render(scene, camera)
const linear = createLinear(renderer, scene, camera, {
  ao: { on: q.get('ao') !== '0', intensity: Number(q.get('ao') ?? 0.75), radius: 1.2 },
  haze: null,
  sun: { light: sunLight, dir: uSun, rgb: uniform(new Vector3(1, 1, 1)), visibility: () => float(1) },
  steps: 1,
  reach: 1,
})
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

const rig = {
  ready: true,
  state: () => ({ planMs, counts: bodies.counts, backend: stack.backend, architecture: stack.architecture, view: uView.value, tower: q.get('tower') ?? 'full', duration: path.duration }),
  views: () => ({
    frame: plan.frame,
    stops: cams.stops.map((s: J) => ({ n: s.n, id: s.id, hour: s.hour, desktop: resolve(s, 'desktop'), phone: resolve(s, 'phone') })),
    keys: path.keys.map((k) => ({ t: k.t, stop: k.stop, kind: k.kind, cut: k.cut, pos: k.pos.map((v) => Math.round(v * 100) / 100), utm: F.utm(k.pos[0], k.pos[2]) })),
    duration: path.duration,
  }),
  /** what the scene holds, from the bodies the page built */
  facts: () => ({ ...built.facts, streetLevelAtS: undefined, sunAt: Object.fromEntries(cams.stops.map((s: J) => [s.n, sunAt(hourOf(s.hour))])) }),
  stand: (E: number, N: number) => {
    const [x, z] = F.s(E, N)
    return { stand: stand(x, z), ground: built.ground(x, z), street: built.streetAt(x, z) }
  },
  /** a still of one stop: framing, view, size in device pixels, sub-frames */
  async shoot(o: { stop: number; framing: 'desktop' | 'phone'; view: 'grey' | 'classes'; w: number; h: number; samples: number; out: string; name?: string; css?: [number, number] }) {
    const s = cams.stops.find((x: J) => x.n === o.stop)
    if (!s) throw new Error(`no stop ${o.stop}`)
    const v = resolve(s, o.framing)
    uView.value = o.view === 'classes' ? 1 : 0
    setHour(v.hour)
    aim(v.pos, v.look, v.hfov, o.w, o.h, v.shift)
    const { bytes, ms } = await render(o.w, o.h, o.samples, s.stops ?? 0)
    const file = `${o.out}/${o.name ?? `${v.id}-${o.framing}-${o.view}`}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const sun = sunAt(v.hour)
    const side = {
      file, stop: s.n, id: s.id, framing: o.framing, view: o.view, cssSize: o.css ?? [o.w, o.h], devicePixels: [o.w, o.h],
      ratio: o.css ? o.w / o.css[0] : 1, subFrames: o.samples, sampleCountReadBack: 'one sample a sub-frame: the linear target is allocated without multisampling (render.ts)',
      backend: stack.backend, adapter: stack.architecture, print: { ...PRINT, exposure: PRINT.exposure * Math.pow(2, s.stops ?? 0) },
      hour: s.hour, sun: { azimuth: +sun.azimuth.toFixed(1), elevation: +sun.elevation.toFixed(1) },
      camera: { utm: F.utm(v.pos[0], v.pos[2]), y: +v.pos[1].toFixed(2), eyeOverStand: +(v.pos[1] - stand(v.pos[0], v.pos[2])).toFixed(3), look: F.utm(v.look[0], v.look[2]).concat([+v.look[1].toFixed(2)]), hfov: v.hfov, shift: v.shift, near: camera.near, far: camera.far },
      brightness: brightness(bytes), ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    return side
  },
  /** the moving sketch: frames of the whole path (or a span), JPEG, with a per-frame log */
  async clip(o: { out: string; fps: number; w: number; h: number; samples: number; from?: number; to?: number; framing?: 'desktop' | 'phone'; view?: 'grey' | 'classes'; every?: number }) {
    uView.value = o.view === 'classes' ? 1 : 0
    const from = o.from ?? 0, to = Math.min(o.to ?? path.duration, path.duration)
    const n = Math.floor((to - from) * o.fps) + 1
    const log: Array<Record<string, unknown>> = []
    const t = performance.now()
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const p: PathSample = path.sample(time)
      setHour(p.hour)
      const hfov = o.framing === 'phone' ? (cams.lens.phoneFilm ?? 46) : p.hfov
      aim(p.pos, p.look, hfov, o.w, o.h, 0)
      const { bytes } = await render(o.w, o.h, o.samples)
      await upload(`${o.out}/f${String(i).padStart(5, '0')}.jpg`, await jpeg(bytes, o.w, o.h, 0.86))
      log.push({ i, t: +time.toFixed(3), stop: p.stop, kind: p.kind, utm: F.utm(p.pos[0], p.pos[2]).map((v) => +v.toFixed(2)), y: +p.pos[1].toFixed(2), eyeOverStand: +(p.pos[1] - stand(p.pos[0], p.pos[2])).toFixed(2), hour: +p.hour.toFixed(3) })
    }
    await upload(`${o.out}/frames.json`, JSON.stringify({ fps: o.fps, w: o.w, h: o.h, samples: o.samples, from, to, frames: log }, null, 0))
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
say(`ready: ${bodies.counts.prisms} prisms, ${bodies.counts.boxes} boxes, ${bodies.counts.houses} houses, ${bodies.counts.triangles} triangles, plan ${planMs} ms`)

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
