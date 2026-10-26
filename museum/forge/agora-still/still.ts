/* THE FRONT'S STILL: the lobby's own court, fire and sky, drawn once from an
   eye and a lens of the still's own, with the six houses laid into the frame
   by the still's layout. A tool page driven by render.mjs; the museum's
   bundle never carries it.

   The eye stays level and the lens is shifted (a view offset), so the columns
   stand vertical; every house faces the lens squarely, so its shape reaches
   the picture as a pure scale of the authored one. A delivered frame is the
   average of jittered draws in linear light, the way the film's export
   resolves its frames, encoded to sRGB once. */

import { PerspectiveCamera, Quaternion, RenderTarget, Scene, Vector3 } from 'three/webgpu'
import { createStack } from '../../src/stack'
import { samplesFor } from '../../src/stack/post'
import { createEclipse } from '../../src/scenes/eclipse'
import { createAgora } from '../../src/scenes/agora'
import { createAtlas, type AtlasStill } from '../../src/scenes/atlas'
import { CONSTELLATIONS } from '../../src/content/constellations'
import { WANDERERS } from '../../src/content/wanderers'
import type { GradeName } from '../../src/stack/grade'
import LAYOUT from './layout.json'

interface House {
  key: string
  u: number
  v: number
}
interface FrameSpec {
  css: [number, number]
  tx: number
  bot: number
  eye?: [number, number, number]
  k?: number
  houses?: House[]
  time?: number
  grade?: GradeName
  alpha?: number
  air?: number
  skyBirth?: number
  depth?: number
  columnFire?: number
}

const q = new URLSearchParams(location.search)
const frameName = q.get('frame') ?? 'wide'
const mode = q.get('mode') ?? 'still'
const spec = (LAYOUT as unknown as Record<string, FrameSpec>)[frameName]
if (!spec) throw new Error(`no frame ${frameName} in layout.json`)
/* a look round may try a grade or a light without editing the layout */
const F: FrameSpec = {
  ...spec,
  ...(q.get('grade') ? { grade: q.get('grade') as GradeName } : {}),
  ...(q.get('colfire') ? { columnFire: Number(q.get('colfire')) } : {}),
}

/** the lobby's key, as the lobby's entry sets it */
const KEY_OPTIONS = {
  azimuth: 24,
  elevation: 21,
  kelvin: 4300,
  lux: 22,
  reach: 54,
  cascades: [14, 34] as [number, number],
  ambient: 0.9,
  sky: { zenith: '#04060e', horizon: '#111c40', ground: '#05060f', stars: 1 },
}

const DEPTH = F.depth ?? 46
const T_STILL = F.time ?? 12.4
const eye = new Vector3(...(F.eye ?? [0, 0, 0]))

const scene = new Scene()
const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 200)
camera.position.copy(eye)

const stack = await createStack({})
const renderer = stack.renderer
document.getElementById('stage')?.appendChild(renderer.domElement)
stack.setScene(scene, camera, 'cold-moon')
const key = stack.light(KEY_OPTIONS)

/** the frame's top as a tangent: the frame's own shape fixes it */
const TOP = F.bot + (2 * F.tx * innerHeight) / innerWidth

/** where house h stands and how large, so its stars land on the layout */
function housePlacement(): AtlasStill | undefined {
  if (mode !== 'still' || !F.houses || !F.k) return undefined
  const k = F.k
  const houses = CONSTELLATIONS.map((c, h) => {
    const at = F.houses?.find((x) => x.key === c.key) ?? F.houses?.[h]
    if (!at) throw new Error(`layout has no place for ${c.key}`)
    const xt = (2 * at.u - 1) * F.tx
    const yt = TOP - at.v * (TOP - F.bot)
    return {
      position: new Vector3(eye.x + xt * DEPTH, eye.y + yt * DEPTH, eye.z - DEPTH),
      quaternion: new Quaternion(),
      // css px per patch unit at depth D: k = S / D * W / (2 tx)
      scale: (k * DEPTH * 2 * F.tx) / innerWidth,
    }
  })
  return { houses, alpha: F.alpha ?? 1, gaze: new Vector3(0, -1, 0) }
}

const eclipse = createEclipse(scene)
const agora = createAgora(scene, { key, stack, eager: true, ...(mode === 'still' && F.columnFire ? { still: { columnFire: F.columnFire } } : {}) })
const atlas = createAtlas(scene, housePlacement())
atlas.visible(true)
if (mode === 'lobby') atlas.snap(0)
stack.setScene(scene, camera, F.grade ?? (mode === 'lobby' ? 'gold-on-ink' : 'lapis-ember'), true)

// the grain switch rides on whatever object stands at window.__forge
;(window as unknown as { __forge: Record<string, unknown> }).__forge = {}
;((window as unknown as { __forge: { grain: (on: boolean) => boolean } }).__forge.grain)(false)

/* ---- the lens ---- */
const W = renderer.domElement.width
const H = renderer.domElement.height
let zoom: { x0: number; y0: number; z: number } | null = null

function setLens(jx: number, jy: number): void {
  if (mode === 'lobby') {
    camera.position.set(0, 0, 0)
    camera.rotation.set(atlas.currentElevation(), 0, 0)
    camera.fov = 46
    camera.aspect = innerWidth / innerHeight
    if (jx || jy) camera.setViewOffset(W, H, jx, jy, W, H)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    return
  }
  const T = Math.max(Math.abs(F.bot), Math.abs(TOP))
  const fullH = (W * T) / F.tx
  camera.position.copy(eye)
  camera.rotation.set(0, 0, 0)
  camera.fov = (2 * Math.atan(T) * 180) / Math.PI
  camera.aspect = W / fullH
  const offY = ((T - TOP) / (2 * T)) * fullH
  const z = zoom?.z ?? 1
  camera.setViewOffset(W * z, fullH * z, (zoom?.x0 ?? 0) * z + jx, (offY + (zoom?.y0 ?? 0)) * z + jy, W, H)
  camera.updateProjectionMatrix()
}

/* ---- the moment ---- */
function pose(): void {
  const lobby = mode === 'lobby'
  eclipse.update({ transit: 1, door: 1, skyBirth: lobby ? 0 : (F.skyBirth ?? 1), lanterns: 0, sinceFlash: 999, elapsed: T_STILL })
  agora.update({ reveal: lobby ? 0.72 : 1, elapsed: T_STILL, air: lobby ? 0 : (F.air ?? 1), landed: 1 })
  atlas.update(0.05, T_STILL, innerWidth / innerHeight, 1)
}

/* ---- the resolve ---- */
const LIN = new Float32Array(256)
for (let c = 0; c < 256; c++) {
  const v = c / 255
  LIN[c] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const ENC_STEPS = 1 << 16
const ENC = new Float32Array(ENC_STEPS)
for (let j = 0; j < ENC_STEPS; j++) {
  const l = j / (ENC_STEPS - 1)
  ENC[j] = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055
}
/** the radical inverse: an even spread of sub-pixel offsets */
function halton(i: number, b: number): number {
  let f = 1
  let r = 0
  for (let n = i + 1; n > 0; n = Math.floor(n / b)) {
    f /= b
    r += f * (n % b)
  }
  return r
}

const ink = document.createElement('canvas')
ink.width = W
ink.height = H
const ctx = ink.getContext('2d', { willReadFrequently: true })
if (!ctx) throw new Error('no 2d context')
let resolved: Uint8Array | null = null

function draw(n: number, warm: number): { draws: number; ms: number } {
  const started = performance.now()
  pose()
  for (let i = 0; i < warm; i++) {
    setLens(0, 0)
    stack.render(1 / 60)
  }
  const acc = new Float32Array(W * H * 3)
  for (let i = 0; i < n; i++) {
    const jx = n > 1 ? halton(i, 2) - 0.5 : 0
    const jy = n > 1 ? halton(i, 3) - 0.5 : 0
    setLens(jx, jy)
    pose()
    stack.render(1 / 60)
    // read inside the task that drew it: a later task finds the canvas spent
    ctx?.drawImage(renderer.domElement, 0, 0)
    const px = ctx?.getImageData(0, 0, W, H).data
    if (!px) throw new Error('no pixels')
    for (let p = 0, a = 0; p < px.length; p += 4, a += 3) {
      acc[a] = (acc[a] ?? 0) + (LIN[px[p] ?? 0] ?? 0)
      acc[a + 1] = (acc[a + 1] ?? 0) + (LIN[px[p + 1] ?? 0] ?? 0)
      acc[a + 2] = (acc[a + 2] ?? 0) + (LIN[px[p + 2] ?? 0] ?? 0)
    }
  }
  setLens(0, 0)
  const out = new Uint8Array(W * H * 3)
  const top = ENC_STEPS - 1
  for (let a = 0; a < out.length; a++) {
    const l = Math.min(1, Math.max(0, (acc[a] ?? 0) / n))
    out[a] = Math.round((ENC[Math.round(l * top)] ?? 0) * 255)
  }
  resolved = out
  return { draws: n, ms: Math.round(performance.now() - started) }
}

/* ---- what the frame shows, through the frame's own camera ---- */
const tmp = new Vector3()
function toPx(v: Vector3): [number, number, number] {
  tmp.copy(v).project(camera)
  return [((tmp.x + 1) / 2) * W, ((1 - tmp.y) / 2) * H, tmp.z]
}
function projectStars() {
  setLens(0, 0)
  camera.updateMatrixWorld(true)
  const out = []
  for (const s of atlas.stars) {
    const world = atlas.starWorld(s.slug, new Vector3())
    if (!world) continue
    const c = CONSTELLATIONS[s.chapter]
    const st = c?.stars.find((x) => x.slug === s.slug)
    const [x, y, depth] = toPx(world)
    out.push({ slug: s.slug, group: c?.key ?? '', alpha: Boolean(st?.alpha), x, y, depth, disc: s.sprite.scale.x })
  }
  return out
}
function projectBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  let a = Infinity
  let b = Infinity
  let c = -Infinity
  let d = -Infinity
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    const [px, py] = toPx(new Vector3(x, y, z))
    a = Math.min(a, px)
    b = Math.min(b, py)
    c = Math.max(c, px)
    d = Math.max(d, py)
  }
  return { x0: a, y0: b, x1: c, y1: d }
}

/** what the scene pass is really multisampled with, read off the backend */
async function samples() {
  const asked = samplesFor(stack.tierConfig(), renderer.getPixelRatio())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backend = (renderer as any).backend
  const probe = new RenderTarget(64, 64, { samples: asked })
  const was = renderer.getRenderTarget()
  renderer.setRenderTarget(probe)
  renderer.render(scene, camera)
  renderer.setRenderTarget(was)
  const held = backend?.get?.(probe.texture)
  const allocated = held?.msaaTexture?.sampleCount ?? held?.texture?.sampleCount ?? null
  probe.dispose()
  return { asked, allocated, pixelRatio: renderer.getPixelRatio(), backend: backend?.constructor?.name ?? '' }
}

/* ---- ready: the room compiled and every library set on the GPU ---- */
setLens(0, 0)
pose()
agora.warm(true)
await renderer.compileAsync(scene, camera)
agora.warm(false)
for (let i = 0; i < 400 && stack.materials.pending() > 0; i++) await new Promise((r) => setTimeout(r, 50))
for (let i = 0; i < 4; i++) stack.render(1 / 60)

const api = {
  ready: true,
  info: () => ({
    frame: frameName,
    mode,
    width: W,
    height: H,
    css: [innerWidth, innerHeight],
    tier: document.body.dataset['tier'],
    tierConfig: { samples: stack.tierConfig().samples, ao: stack.tierConfig().ao.on, pixelRatio: stack.tierConfig().pixelRatio },
    pending: stack.materials.pending(),
    camera: { fov: camera.fov, aspect: camera.aspect, position: camera.position.toArray(), view: camera.view },
  }),
  samples,
  /** crop the lens to a part of the frame, zoomed so it fills the frame */
  zoom(x0: number, y0: number, z: number) {
    zoom = z > 1 ? { x0, y0, z } : null
    setLens(0, 0)
  },
  draw,
  chunk(i: number, size: number): string {
    if (!resolved) return ''
    const part = resolved.subarray(i * size, Math.min(resolved.length, (i + 1) * size))
    let s = ''
    for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode(...part.subarray(j, j + 0x8000))
    return btoa(s)
  },
  bytes: () => resolved?.length ?? 0,
  /** keep the field's stars, the houses' companions and the embers off these
      name boxes (CSS px of the frame), the way the lobby keeps them off its
      own type: eight rectangles at most */
  reserve(boxes: Array<{ x0: number; y0: number; x1: number; y1: number }>) {
    const rects = boxes.slice(0, 8).map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, half: (b.x1 - b.x0) / 2, vhalf: (b.y1 - b.y0) / 2 }))
    eclipse.reservePage(rects, innerWidth, innerHeight)
    atlas.reservePage(rects.map((r) => ({ x: r.x, y: r.y, half: r.half })), rects.map((r) => r.vhalf), innerWidth, innerHeight)
    agora.reservePage(rects, innerWidth, innerHeight)
    return rects.length
  },
  stars: projectStars,
  names: () => WANDERERS.map((w) => ({ slug: w.slug, name: w.name, short: w.short ?? w.name })),
  houses: () => CONSTELLATIONS.map((c) => ({ key: c.key, stars: c.stars.map((x) => x.slug), lines: c.lines })),
  /** the fire, bowl to flame tip, and the air its embers climb through */
  fire: (plume: number) => ({
    flame: projectBox(-0.7, 0.7, -0.9, 0.75, -6.15, -5.05),
    plume: projectBox(-0.75, 0.75, -0.9, plume, -6.2, -5.0),
  }),
}
;(window as unknown as { __still: typeof api }).__still = api
document.body.dataset['still'] = 'ready'
