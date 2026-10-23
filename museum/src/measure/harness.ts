/* THE MEASURE ALONE: a dev page (not in the build) that stands baked bodies
   side by side on a flat ground of a given lightness, for proof sheets.

     /measure.html?figs=<url>:front,<url>:tq&ground=56&tall=0.8&aim=0.85&mode=lit|sil

   ground is the page's CIE L*; tall the figures' share of the frame height;
   sil draws plain black silhouettes on white for the outline tests. */

import { Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicNodeMaterial, NoToneMapping, PerspectiveCamera, PlaneGeometry, Scene, ShadowNodeMaterial, SRGBColorSpace, WebGPURenderer } from 'three/webgpu'
import { MEASURE_HEIGHT, loadMeasureGeometry, measure, measureMaterial } from '.'

const q = new URLSearchParams(location.search)
const figs = (q.get('figs') ?? '').split(',').filter(Boolean).map((s) => {
  const at = s.lastIndexOf(':')
  return { url: s.slice(0, at), view: s.slice(at + 1) }
})
const groundL = Number(q.get('ground') ?? 56)
const tall = Number(q.get('tall') ?? 0.8)
const sil = q.get('mode') === 'sil'
const gap = Number(q.get('gap') ?? 0.9)
// the height the camera aims at, metres (the figure's middle unless a close look asks for the chest)
const aim = Number(q.get('aim') ?? MEASURE_HEIGHT * 0.5)

/** the sRGB grey of a CIE L* */
function greyOf(L: number): number {
  const Y = L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3
  return Y <= 0.0031308 ? 12.92 * Y : 1.055 * Y ** (1 / 2.4) - 0.055
}

const canvas = document.getElementById('stage') as HTMLCanvasElement
const renderer = new WebGPURenderer({ canvas, antialias: true })
renderer.setPixelRatio(devicePixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = NoToneMapping
renderer.shadowMap.enabled = !sil
await renderer.init()

const scene = new Scene()
const g = sil ? 1 : greyOf(groundL)
scene.background = new Color().setRGB(g, g, g, SRGBColorSpace)

// a long lens at the figure's middle height: the outline reads as on a size chart
const distance = 14
const camera = new PerspectiveCamera(1, innerWidth / innerHeight, 1, 100)
camera.fov = (2 * Math.atan(MEASURE_HEIGHT / tall / 2 / distance) * 180) / Math.PI
camera.position.set(0, aim, distance)
camera.lookAt(0, aim, 0)
camera.updateProjectionMatrix()

const material = sil ? new MeshBasicNodeMaterial({ color: 0x000000 }) : measureMaterial()
const meshes: Mesh[] = []
// what a load costs: the fetch and the parse of each file, then the first frame (the upload and the compile)
const timing: { load: number[]; firstFrame: number } = { load: [], firstFrame: 0 }
for (const [i, f] of figs.entries()) {
  const t0 = performance.now()
  const geometry = await loadMeasureGeometry(f.url)
  timing.load.push(performance.now() - t0)
  const m = measure(geometry, { material: material as ReturnType<typeof measureMaterial> })
  m.position.x = (i - (figs.length - 1) / 2) * gap
  // three-quarter: the figure turned 40 degrees to its left, so its right side comes toward the camera
  m.rotation.y = f.view === 'tq' ? (-40 * Math.PI) / 180 : 0
  scene.add(m)
  meshes.push(m)
}

if (!sil) {
  // the house's key: from the upper left in front, about 50 degrees up; a neutral sky for the shade
  const key = new DirectionalLight(0xffffff, Number(q.get('key') ?? 2.4))
  key.position.set(-4, 7, 5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const span = Math.max(2, figs.length * gap)
  Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: 25 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.01
  scene.add(key, new HemisphereLight(0xffffff, 0x808080, Number(q.get('sky') ?? 0.9)))
  // the ground takes only the figure's shadow, so its own lightness stays the page's
  const floor = new Mesh(new PlaneGeometry(40, 40), new ShadowNodeMaterial({ opacity: 0.45 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
}

const t1 = performance.now()
renderer.render(scene, camera)
await (renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device?.queue.onSubmittedWorkDone()
timing.firstFrame = performance.now() - t1
;(window as unknown as { __measure: unknown }).__measure = {
  ready: true,
  timing,
  figures: meshes.map((m) => ({ tris: (m.geometry.index?.count ?? 0) / 3, verts: m.geometry.getAttribute('position').count })),
  render: () => renderer.render(scene, camera),
}
