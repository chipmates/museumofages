/* FEATURE 11'S HEAPS ON THE STAGE (dev only, `/src/wings/babylon/sky/heaps.html`): the pictures step 2 shows, one eye
   per picture, the window sized to the picture by the shooter (`forge/babylon/sky-heaps-shoot.mjs`).
     ?view=wide|upright   the heaps, the lump and the figure on one stage
     ?view=silver         the lump alone on its own stage, at its own scale
   The rig `window.__heaps` reads where the plan's points fall on the canvas and the volumes as built. */
import { Box3, PerspectiveCamera, Scene, Sphere, Vector3 } from 'three/webgpu'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { createStageSetting, onCanvas, stageGrade, stageNumbers, surfacePoints } from '../../vitrine/stage-close-view'
import { FIGURE_HEIGHT, HEAPS_PLAN, heaps, type HeapView } from './sky-data'
import { buildHeaps, meshVolume } from './heaps'

const q = new URLSearchParams(location.search)
const view: HeapView = (['wide', 'upright', 'silver'] as const).find((v) => v === q.get('view')) ?? 'wide'
const says = document.getElementById('says')!
const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const idle = new Scene()
stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true)

const t0 = performance.now()
const H = buildHeaps()
const scene = new Scene()
const alone = view === 'silver'
if (alone) scene.add(H.meshes.silver)
else { scene.add(H.group); scene.add(H.figure) }
scene.updateMatrixWorld(true)
const box = new Box3()
if (alone) box.setFromObject(H.meshes.silver, true); else { box.setFromObject(H.group, true); box.expandByObject(H.figure, true) }
const size = box.getSize(new Vector3())
const span = Math.max(size.x, size.y, size.z)
const radius = box.getBoundingSphere(new Sphere()).radius
const centre = box.getCenter(new Vector3())

const V = HEAPS_PLAN.views[view]
const camera = new PerspectiveCamera(V.fov, V.aspect, Math.max(0.002, span / 400), span * 80)
camera.position.set(V.eye[0], V.eye[1], V.eye[2])
camera.lookAt(new Vector3(V.target[0], V.target[1], V.target[2]))
camera.updateMatrixWorld()
stack.setScene(scene, camera, stageGrade(span))
const stage = createStageSetting({ stack, scene, span, radius, centre, floorY: 0, footprint: box, onDemand: true })
stage.contact(surfacePoints(alone ? H.meshes.silver : H.group, 600, -Infinity))
stage.machine(alone ? H.meshes.silver : H.group)
if (!alone) stage.figure(H.figure)
const aim = new Vector3(V.target[0], V.target[1], V.target[2])
const yaw = Math.atan2(V.eye[0] - V.target[0], V.eye[2] - V.target[2])
function place(): void {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  const reach = camera.position.distanceTo(centre)
  const { air } = stageNumbers()
  stage.air(reach + radius * air.near, reach + radius * air.far)
  stage.follow({ yaw, centre: onCanvas(aim, camera), picture: 0.7, eye: camera.position, lens: camera.fov * Math.PI / 180, camera })
  stage.stir()
}
place()
addEventListener('resize', place)
const buildMs = Math.round(performance.now() - t0)

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  stack.render(dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r))
says.classList.add('off')

const rig = {
  ready: true,
  state: () => ({ backend: stack.backend, architecture: stack.architecture, view, buildMs, size: [innerWidth, innerHeight], aspect: camera.aspect }),
  /** the plan's points on the canvas (shares of its size) and the built volumes, litres */
  measure() {
    camera.updateMatrixWorld()
    const at = (p: [number, number, number]): { x: number; y: number } => { const v = new Vector3(...p).project(camera); return { x: v.x * 0.5 + 0.5, y: 0.5 - v.y * 0.5 } }
    const points: Record<string, { x: number; y: number }> = {}
    const fig = HEAPS_PLAN.figure, lump = HEAPS_PLAN.silver
    points['figure-foot'] = at([fig[0], 0, fig[1]]); points['figure-top'] = at([fig[0], FIGURE_HEIGHT, fig[1]])
    points['silver'] = at([lump[0], 0, lump[1]]); points['silver-cm-a'] = at([lump[0] - 0.005, 0, lump[1]]); points['silver-cm-b'] = at([lump[0] + 0.005, 0, lump[1]])
    for (const h of heaps()) { points[`${h.id}-foot`] = at([h.at[0], 0, h.at[1]]); points[`${h.id}-top`] = at([h.at[0], h.H, h.at[1]]) }
    const litres = Object.fromEntries((['barley', 'dates', 'sesame', 'silver'] as const).map((id) => [id, meshVolume(H.meshes[id]) * 1000]))
    const fb = new Box3().setFromObject(H.figure, true)
    return { points, litres, shell: H.built.shell, built: H.built, fruits: H.fruits.count, figureHeight: fb.max.y - fb.min.y, silverCm3: litres['silver']! * 1000 }
  },
}
;(window as unknown as { __heaps: typeof rig }).__heaps = rig
