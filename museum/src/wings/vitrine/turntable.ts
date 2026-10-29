/** THE MACHINE ON ITS TURNTABLE.
 *
 * The room's own body is lent to a scene of its own: a dark ground under the
 * wing's key and fill, drawn through the museum's one stack while the room
 * holds still, and handed back at rest. The machine's clock is a scalar the
 * visitor's hand writes: a drag across the model, the slider under it, the
 * arrow keys, a step in the list. The steps light the part they name, and a
 * tap on the model names the part it lands on.
 */
import {
  AdditiveBlending, Box3, BoxGeometry, Color, CustomBlending, DstColorFactor, Group, Matrix4, Mesh,
  MeshBasicNodeMaterial, OneFactor, PerspectiveCamera, Raycaster, Scene,
  InstancedMesh, Sphere, Vector2, Vector3, ZeroFactor, type BufferGeometry, type Object3D,
} from 'three/webgpu'
import { float, normalView, positionViewDirection, vec3 } from 'three/tsl'
import type { Grade, Stack, StackLightOptions } from '../../stack'
import { createStageSetting, onCanvas, stageGrade, stageNumbers, surfacePoints, type StageSetting } from './stage-close-view'
import {
  advancePlayback, initialPlayback, type PlaybackSchedule, type PlaybackState,
} from '../vinci/machines/bench/playback'
import { LOOK_RULE } from '../vinci/input'
import { deskStageHeight } from '../desk-stage'
import type { VitrinePayload, VitrinePayloadHost } from './types'
import { islandFit } from './fit'
import { captionRoom } from './fit'
import { paintSlider } from './slider'
import { folioDoor } from './folio'

export interface TurntableBody {
  object: Object3D
  ready: Promise<void>
  animate(t: number, dt: number): void
  part?(id: string): { node: Object3D; geometry: BufferGeometry } | null
}

export interface TurntableStep {
  /** A fraction of the period, 0 to 1. */
  at: number
  part: string
  /** The caption, in the page's language. */
  text: string
  certainty: string
}

export type TurntableViewpoint = 'whole' | 'drive' | 'working-part'

type Metres3 = readonly [number, number, number]
/** A VIEW FROM WITHIN THE BODY'S OWN ENVELOPE: where the eye stands and what
 * it looks at, in the body's own metres, with the phone's own pair where its
 * frame asks for one. */
export interface TurntableEye { at: Metres3; look: Metres3; narrow?: { at: Metres3; look: Metres3 } }

export interface TurntableOptions {
  stack: Stack
  body: TurntableBody
  title: string
  schedule: PlaybackSchedule
  steps: readonly TurntableStep[]
  /** The dossier's own tree, child to parent, so a tap on a fitting finds
   * the step that speaks of the part it belongs to. */
  parents: ReadonlyMap<string, string>
  /** The part each viewpoint looks at; `whole` looks at the machine. A view
   * may name its own bearing and height where the whole view's do not serve. */
  viewpoints: readonly { id: TurntableViewpoint; label: string; part: string | null; yaw?: number; pitch?: number; eye?: TurntableEye }[]
  words: { play: string; pause: string; again: string; clock: string }
  /** Where a part lives in a body that was not built from its dossier. */
  nodeNames?: Readonly<Record<string, string>>
  /** Every part's own name by its dossier id, in the page's language. */
  partNames?: ReadonlyMap<string, string>
  /** The parts that are this machine's screen: what its demonstration lands
   * on. The light marks them by their edge instead of filling their face. */
  screens?: ReadonlySet<string>
  /** the wing's rig and print, kept for the caller's record: the island stands under the close view's own (`STAGE`) */
  light: {
    key: StackLightOptions
    fill: { color: string; groundColor: string; intensity: number }
    environmentIntensity: number
    fitting: { color: string; intensity: number; distance: number; decay: number; height: number }
  }
  grade: Grade
  /** The folio beside the model: its thumbnail where the store holds one. */
  sheet?: { src: Promise<string | null> | null; label: string; open(): void }
  /** A machine that walks is fitted and centred on the ground its whole run
   * covers, not on the pose it starts from, so its last step is never cut. */
  travels?: boolean
  /** THE RUN CARRIES THE EYE, in seconds of the run: over each stage the eye
   * eases from where the stage before left it to this bearing, on the run's
   * centre (`whole`) or on a viewpoint's part, and holds there until the
   * next. The visitor's own turn or view ends it until the run starts again. */
  runViews?: readonly { from: number; to: number; view: TurntableViewpoint; yaw: number; pitch: number }[]
  /** Hand the stage back to the room. */
  restore(): void
  /** True once the eye stands where it walked for this machine: the room
   * draws the walk until then, and the body is lent only after it. */
  standing?(): boolean
  /** The body's turn about the vertical on the stage alone, radians, so the
   * side its steps speak of faces the whole view. The room is not turned. */
  turn?: number
}

const DEG = Math.PI / 180
/** The whole machine three quarters on, from a little above a person's eye: a long lens from far off keeps it life size. */
const WHOLE = { yaw: 35 * DEG, pitch: 10 * DEG }
const PITCH = { least: 3 * DEG, most: 58 * DEG }
const EASE_S = .7
/** A jump of the run's clock is followed by the eye, never cut. */
const CARRY_FOLLOW_S = .45
/** A full drag across the viewport is one period of the machine's clock. */
const DRAG_PERIODS = 1
/** An arrow key turns the crank by this share of the period. */
const KEY_SHARE = 1 / 24
const OVERLAY = { color: '#f2c77a', opacity: .3 }
/** A LIT PART KEEPS ITS OWN SURFACE. The light on a named part raises what is
 * already drawn there by this share of the warm colour, so grain, shade and
 * shadow stay where they were; an added flat colour paints the part over.
 * A dark part has little to raise, so a thin warm edge is added where its
 * surface turns from the eye, with a trace of warmth on its face. */
const LIFT = { face: .45, rim: .75, edge: 1.1, trace: .08 }
/** The border that marks a screen: a share of its shorter side, never thinner
 * than this, and standing a little proud of the sheet so it reads from both
 * faces of something as thin as paper. */
const EDGE = { share: .04, least: .006 }
/** The sphere fit leaves a machine's box corners air; the table stands it a
 * little nearer. */
const WHOLE_FIT = .86

/** `via` marks a view whose eye stands inside the body's envelope: the low
 * point outside the body every way into it and out of it passes. */
interface View { yaw: number; pitch: number; distance: number; target: Vector3; via?: Vector3 | null }

/** THE RECORDING'S HAND. The filmed cycle is the island drawn on the export's
 * own clock: the machine's clock set outright, running on from there or held,
 * and the named step's light on or off, so every frame of the recording is a
 * function of its clock alone. */
export interface TurntableFilm {
  /** the machine's period in seconds, 0 for a machine that does not move */
  readonly period: number
  /** where each step lands on the dial when it is pressed, 0 to 1 */
  readonly lands: readonly number[]
  pose(clock: number, how: { playing: boolean; lit: boolean }): void
  /** the box the machine is fitted in while recording, centred on the stage; null gives the window's own back */
  frame(box: { width: number; height: number } | null): void
  /** what the eye frames now, in the stage's CSS pixels: the picture's box, the machine's outline at this moment and the
   * box its run sweeps; null before the body stands */
  measure(): TurntableMeasure | null
}

export interface TurntableMeasure {
  stage: { width: number; height: number }
  fit: { left: number; top: number; width: number; height: number }
  now: { left: number; top: number; right: number; bottom: number }
  sweep: { left: number; top: number; right: number; bottom: number }
  fov: number
  distance: number
}

export type TurntablePayload = VitrinePayload & { readonly film: TurntableFilm }

export function createTurntablePayload(options: TurntableOptions): TurntablePayload {
  const { stack, body, schedule, steps } = options
  const period = schedule.kind === 'static' ? 0 : schedule.period
  let host: VitrinePayloadHost | undefined
  let scene: Scene | undefined, camera: PerspectiveCamera | undefined, stage: StageSetting | undefined
  let lent: { parent: Object3D | null; position: Vector3; quaternion: import('three/webgpu').Quaternion; scale: Vector3; visible: boolean } | undefined
  const shadows = new Map<Mesh, boolean>()
  let state: PlaybackState = { clock: 0, playing: false, fixed: false }
  let standing = false, mounted = false
  let radius = 1, centre = new Vector3()
  const view: View = { ...WHOLE, distance: 1, target: new Vector3() }
  let goal: View | null = null, from: View | null = null, eased = 0
  let chosen: TurntableViewpoint = 'whole'
  const runViews = options.runViews ?? []
  /** how far along the run's views the eye stands, 0 the whole view */
  let carrying = runViews.length > 0, carried = 0
  let carryViews: View[] | null = null, carryShown: TurntableViewpoint | null = null
  let active = -1
  /** true while the recording draws the machine with no part lit */
  let dark = false
  let framed: { width: number; height: number } | null = null
  const overlays = new Map<string, Mesh[]>()
  /** Geometry the overlay built itself, which it owns and gives back. */
  const owned = new Set<BufferGeometry>()
  // The border of a screen stands off the sheet over whatever lies behind it,
  // so it keeps a colour of its own.
  const overlayMaterial = new MeshBasicNodeMaterial({ color: new Color(OVERLAY.color), transparent: true,
    opacity: OVERLAY.opacity, depthWrite: false, blending: AdditiveBlending, fog: false })
  const warm = new Color(OVERLAY.color)
  const grazing = float(1).sub(normalView.dot(positionViewDirection).abs()).clamp(0, 1).pow(2)
  const liftMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
  liftMaterial.colorNode = vec3(warm.r, warm.g, warm.b).mul(grazing.mul(LIFT.rim).add(LIFT.face))
  // drawn = drawn + drawn * lift: a multiple of the surface under it, alpha kept
  liftMaterial.blending = CustomBlending
  liftMaterial.blendSrc = DstColorFactor
  liftMaterial.blendDst = OneFactor
  liftMaterial.blendSrcAlpha = ZeroFactor
  liftMaterial.blendDstAlpha = OneFactor
  const edgeMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
  edgeMaterial.colorNode = vec3(warm.r, warm.g, warm.b).mul(grazing.pow(1.5).mul(LIFT.edge).add(LIFT.trace))
  for (const material of [overlayMaterial, liftMaterial, edgeMaterial]) {
    material.polygonOffset = true
    material.polygonOffsetFactor = -2
    material.polygonOffsetUnits = -2
  }
  const ray = new Raycaster()
  let tapped: { node: Object3D; local: Vector3; text: string } | null = null

  // The controls, built once per mount.
  let play: HTMLButtonElement | undefined, slider: HTMLInputElement | undefined
  let stepButtons: HTMLButtonElement[] = [], viewButtons = new Map<TurntableViewpoint, HTMLButtonElement>()
  let leader: SVGSVGElement | undefined, leaderLine: SVGLineElement | undefined, leaderText: HTMLElement | undefined

  const share = (): number => {
    if (!period) return 0
    if (schedule.kind === 'loop') return (state.clock % period) / period
    return Math.min(1, state.clock / period)
  }
  /** Where each step starts on the dial. A last step at the cycle's own end
   * stands for the second half of the way from the step before it, so the
   * end of a turn is read before the turn begins again. */
  const starts = steps.map((step, i) => step.at >= 1 && i > 0 ? (steps[i - 1]!.at + 1) / 2 : step.at)
  /** every line the caption will carry: the box the machine is fitted in keeps the longest of them clear */
  const captionTexts = steps.map(step => step.text)
  function stepAt(u: number): number {
    let found = -1
    for (let i = 0; i < steps.length; i++) if (u + 1e-6 >= starts[i]!) found = i
    return found
  }

  function setClock(clock: number, playing = false): void {
    const bounded = schedule.kind === 'finite' ? Math.min(period, Math.max(0, clock)) : Math.max(0, clock)
    state = { clock: bounded, playing, fixed: false }
  }
  /** RELEASE: a finite demonstration coasts to its end and a continuous one
   * keeps its schedule. Under reduced motion the hand's pose is kept. */
  function release(): void {
    if (!period || host?.reducedMotion) return
    state = { clock: state.clock, playing: schedule.kind === 'loop' || state.clock < period, fixed: false }
  }

  function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const n = host!.element.ownerDocument.createElement(tag)
    n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }

  // ---- the part a step names, and the light on it
  function nodeFor(id: string): { node: Object3D; geometries: { node: Object3D; geometry: BufferGeometry }[] } | null {
    const built = body.part?.(id)
    if (built) return { node: built.node, geometries: [built] }
    const name = options.nodeNames?.[id] ?? id
    const node = body.object.getObjectByName(name)
    if (!node) return null
    const geometries: { node: Object3D; geometry: BufferGeometry }[] = []
    node.traverse(child => { if (child instanceof Mesh && !child.userData['vitrineOverlay']) geometries.push({ node: child, geometry: child.geometry }) })
    return geometries.length ? { node, geometries } : null
  }
  /** A part and every part the dossier hangs from it: a leaf is its stile,
   * its panels and its beams. A part another step names is that step's own,
   * so the mast lights without the sail it carries. */
  const children = new Map<string, string[]>()
  for (const [child, parent] of options.parents) children.set(parent, [...children.get(parent) ?? [], child])
  const named = new Set(steps.map(step => step.part))
  function family(id: string): string[] {
    const out = [id]
    for (let i = 0; i < out.length; i++) out.push(...(children.get(out[i]!) ?? []).filter(child => !named.has(child)))
    return out
  }
  /** A SCREEN IS MARKED BY ITS EDGE. The step that names a machine's screen is
   * the step about what lands on it, and a fill over the face hides exactly
   * that, so the light runs a border round the part instead of covering it.
   * The border is built off the part's own box, in the part's own space. */
  function border(geometry: BufferGeometry): BufferGeometry[] {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const size = box.getSize(new Vector3()), middle = box.getCenter(new Vector3())
    const axes = ['x', 'y', 'z'] as const
    const thin = axes.reduce((least, axis) => size[axis] < size[least] ? axis : least, 'x' as typeof axes[number])
    const face = axes.filter(axis => axis !== thin) as [typeof axes[number], typeof axes[number]]
    const band = Math.max(Math.min(size[face[0]], size[face[1]]) * EDGE.share, EDGE.least)
    const bars: BufferGeometry[] = []
    for (const along of face) {
      const across = along === face[0] ? face[1] : face[0]
      for (const side of [-1, 1]) {
        const width = { x: 0, y: 0, z: 0 }
        width[along] = size[along]
        width[across] = band
        width[thin] = size[thin] + band * .5
        const bar = new BoxGeometry(width.x, width.y, width.z)
        const at = middle.clone()
        at[across] = middle[across] + side * (size[across] - band) / 2
        bar.translate(at.x, at.y, at.z)
        bars.push(bar)
      }
    }
    return bars
  }
  /** THE LIGHT MARKS WHAT THE EYE WAS SENT TO: the part a chosen view names,
   * or, from the whole view, the part the step under way names. */
  function litPart(): string | null {
    if (dark) return null
    const view = chosen === 'whole' ? null : options.viewpoints.find(v => v.id === chosen)?.part ?? null
    return view ?? steps[active]?.part ?? null
  }
  function light(id: string | null): void {
    for (const [part, meshes] of overlays) for (const mesh of meshes) mesh.visible = part === id
    // a body not yet standing names no parts: its light is built once it stands, never kept empty
    if (!id || overlays.has(id) || !standing) return
    /* A mark built for the hand is not what the light lands on: it is the
       reach of a tap, and its own mark stands beside it. */
    const found = family(id).flatMap(part => (nodeFor(part)?.geometries ?? []).map(hit => ({ ...hit, part })))
      .filter(({ node }) => !node.userData['vitrineTarget'])
    const meshes: Mesh[] = []
    for (const { node, geometry, part } of found) {
      const screen = options.screens?.has((node.userData['partId'] as string | undefined) ?? part) === true
      // the light rides the mesh that draws the geometry: a part's node can
      // hold its mesh at an offset, and a light on the node lands beside it
      let holder: Object3D = node
      node.traverse(child => { if (holder === node && child instanceof Mesh && child.geometry === geometry) holder = child })
      for (const shape of screen ? border(geometry) : [geometry]) {
        if (screen) owned.add(shape)
        for (const [material, order] of screen ? [[overlayMaterial, 10] as const] : [[liftMaterial, 10] as const, [edgeMaterial, 11] as const]) {
          const mesh = new Mesh(shape, material)
          mesh.userData['vitrineOverlay'] = true
          mesh.renderOrder = order
          mesh.frustumCulled = false
          holder.add(mesh)
          meshes.push(mesh)
        }
      }
    }
    overlays.set(id, meshes)
  }

  // ---- the eye on its bounded orbit
  function viewportFit(): { left: number; top: number; width: number; height: number } {
    // a recording names its own box, centred on the stage, so no lens shift is needed to draw it
    if (framed) return { left: (innerWidth - framed.width) / 2, top: (deskStageHeight() - framed.height) / 2, ...framed }
    return islandFit(host!, captionRoom(host!, captionTexts))
  }
  function fitDistance(r: number): number {
    const fit = viewportFit(), w = innerWidth, h = deskStageHeight()
    const tanY = Math.tan(camera!.fov * DEG / 2) * fit.height / h
    const tanX = Math.tan(camera!.fov * DEG / 2) * (w / h) * fit.width / w
    return r / Math.sin(Math.atan(Math.min(tanX, tanY))) * 1.02
  }
  /** THE WHOLE MACHINE FILLS ITS VIEWPORT: every corner of its rest box
   * stands inside the viewport from the whole view's own bearing, which a
   * sphere cannot do for a tall crane or a flat gate. */
  let rest = new Box3()
  /** How many moments of the run the fitted box is measured over. */
  const RUN_SAMPLES = 8
  /** THE MACHINE'S OWN OUTLINE, not its box: a round sail's box has corners
   * a third wider than the sail, and a fit to them leaves the machine small
   * in its own window. Points of its surfaces over the run, a few hundred a
   * part, in the table's metres. */
  let outline: Vector3[] = []
  const OUTLINE_PER_PART = 360
  const instance = new Matrix4()
  /** the outline over the run; a machine that walks, round the place it has walked to at each moment */
  function outlineOver(moments: number): Vector3[] {
    const points: Vector3[] = [], at = new Vector3()
    for (let i = 0; i < moments; i++) {
      body.animate(period * i / moments, 0)
      const from = points.length
      outlineNow(points)
      if (walk) {
        walkAt(period * i / moments, at)
        for (let k = from; k < points.length; k++) points[k]!.sub(at)
      }
    }
    body.animate(0, 0)
    body.object.updateMatrixWorld(true)
    return points
  }
  /** A MACHINE THAT WALKS IS FOLLOWED. Where its body stands on the floor at moments of its run, against the run's
   * middle, eased over a stride each side so the eye glides and never steps with a leg: the whole view stands on it,
   * so the machine keeps the middle of its window and its share while it walks, and its fit is the box it takes
   * round that place. */
  let walk: { x: Float32Array; z: Float32Array } | null = null
  const WALK = { samples: 64, ease: 4, passes: 2 }
  function walkOf(): void {
    walk = null
    if (!options.travels || !period) return
    const n = WALK.samples + 1, x = new Float32Array(n), z = new Float32Array(n), box = new Box3()
    for (let i = 0; i < n; i++) {
      body.animate(period * i / WALK.samples, 0)
      box.setFromPoints(outlineNow())
      x[i] = (box.min.x + box.max.x) / 2 - centre.x
      z[i] = (box.min.z + box.max.z) / 2 - centre.z
    }
    body.animate(0, 0)
    body.object.updateMatrixWorld(true)
    const loop = schedule.kind === 'loop'
    for (const line of [x, z]) for (let pass = 0; pass < WALK.passes; pass++) {
      const was = line.slice()
      for (let i = 0; i < n; i++) {
        let sum = 0
        for (let k = -WALK.ease; k <= WALK.ease; k++) {
          const j = loop ? ((i + k) % WALK.samples + WALK.samples) % WALK.samples : Math.min(n - 1, Math.max(0, i + k))
          sum += was[j]!
        }
        line[i] = sum / (2 * WALK.ease + 1)
      }
    }
    walk = { x, z }
  }
  /** where the walking body stands at a clock of its run, against the run's middle; nought for any other machine */
  function walkAt(clock: number, out: Vector3): Vector3 {
    if (!walk) return out.set(0, 0, 0)
    const u = schedule.kind === 'loop' ? (clock % period) / period : Math.min(1, Math.max(0, clock / period))
    const f = u * WALK.samples, i = Math.min(WALK.samples - 1, Math.floor(f)), k = f - i
    return out.set(walk.x[i]! + (walk.x[i + 1]! - walk.x[i]!) * k, 0, walk.z[i]! + (walk.z[i + 1]! - walk.z[i]!) * k)
  }
  /** how far the eye stands in the whole view (1) or stepped in toward a part (0), eased */
  function wholeness(): number {
    const whole = wholeRef > 0 && hull.length ? Math.min(1, Math.max(0, (view.distance / wholeRef - .75) / .2)) : 0
    return whole * whole * (3 - 2 * whole)
  }
  const walked = new Vector3(), aim = new Vector3(), rested = new Vector3(), started = new Vector3()
  /** the outline's points of the pose the body holds now */
  function outlineNow(points: Vector3[] = []): Vector3[] {
    const box = new Box3(), at = new Vector3()
    body.object.updateMatrixWorld(true)
    body.object.traverseVisible(child => {
      if (!(child instanceof Mesh) || child.userData['vitrineOverlay'] || child.userData['vitrineTarget']) return
      if (child instanceof InstancedMesh) {
        // EACH INSTANCE BY ITS OWN BOX: the box of them all stands off the machine at its corners (a ring of
        // whippings round a sail has a square box whose corners lie far outside the ring)
        const geometry = child.geometry as BufferGeometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        box.copy(geometry.boundingBox!)
        const stride = Math.max(1, Math.ceil(child.count / OUTLINE_PER_PART))
        for (let i = 0; i < child.count; i += stride) {
          child.getMatrixAt(i, instance)
          instance.premultiply(child.matrixWorld)
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new Vector3(x, y, z).applyMatrix4(instance))
        }
        return
      }
      const position = (child.geometry as BufferGeometry).getAttribute('position')
      if (!position) return
      const stride = Math.max(1, Math.ceil(position.count / OUTLINE_PER_PART))
      for (let k = 0; k < position.count; k += stride) points.push(at.fromBufferAttribute(position, k).applyMatrix4(child.matrixWorld).clone())
    })
    return points
  }
  /** THE BOX THE RUN NEEDS. A machine's rest pose is not its widest moment:
   * the legs open, the arm swings. Where the work owns the stage it is fitted
   * to the box the whole run stands in, so no step of it is ever cut. */
  function runBox(from: Box3): Box3 {
    if (!period) return from
    const union = from.clone(), sample = new Box3()
    for (let i = 1; i < RUN_SAMPLES; i++) {
      body.animate(period * i / RUN_SAMPLES, 0)
      body.object.updateMatrixWorld(true)
      union.union(sample.setFromObject(body.object, true))
    }
    body.animate(0, 0)
    body.object.updateMatrixWorld(true)
    return union
  }
  /** THE OUTLINE'S EXTREMES: its farthest point in each of a few dozen directions, enough to find its box on the
   * canvas from any eye every frame */
  let hull: Vector3[] = []
  function hullOf(points: readonly Vector3[]): Vector3[] {
    const n = 192, best: { at: number; point: Vector3 | null }[] = [], toward: Vector3[] = []
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963
      toward.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); best.push({ at: -Infinity, point: null })
    }
    for (const point of points) for (let k = 0; k < n; k++) {
      const at = point.dot(toward[k]!)
      if (at > best[k]!.at) best[k] = { at, point }
    }
    return [...new Set(best.map(b => b.point).filter((p): p is Vector3 => p !== null))]
  }
  /** the whole view's distance, kept so the even margin is given to the whole view alone */
  let wholeRef = 0
  function wholeDistance(at: { yaw: number; pitch: number } = WHOLE): number {
    if (rest.isEmpty()) return fitDistance(radius) * WHOLE_FIT
    const fit = viewportFit(), w = innerWidth, h = deskStageHeight()
    const tanY = Math.tan(camera!.fov * DEG / 2) * fit.height / h
    const tanX = Math.tan(camera!.fov * DEG / 2) * (w / h) * fit.width / w
    const cos = Math.cos(at.pitch)
    // A MACHINE THAT WALKS IS FITTED AT ITS WIDEST BEARING: a hand's turn keeps the whole view's distance and shows its
    // walk broadside, which a fit to the three-quarter view alone would press against the window's sides
    const turns = options.travels ? 12 : 1
    const axes = Array.from({ length: turns }, (_, i) => {
      const yaw = at.yaw + i * 2 * Math.PI / turns
      const toward = new Vector3(Math.sin(yaw) * cos, Math.sin(at.pitch), Math.cos(yaw) * cos)
      const right = new Vector3().crossVectors(new Vector3(0, 1, 0), toward).normalize()
      return { toward, right, up: new Vector3().crossVectors(toward, right).normalize() }
    })
    const corner = new Vector3()
    const points = hull.length ? hull : [rest.min.x, rest.max.x].flatMap(x => [rest.min.y, rest.max.y].flatMap(y => [rest.min.z, rest.max.z].map(z => new Vector3(x, y, z))))
    const { share } = stageNumbers(), [across, tall] = host?.narrow ? share.phone : share.desktop
    // on the desk the machine stands at most at `most` of the picture's height, where its box is the whole picture
    const upright = host?.narrow ? tall : Math.min(tall, share.most * h / fit.height)
    /** the run's outline on the canvas from these bearings at a distance, against its share of the fit box across and up */
    const filled = (distance: number): number => {
      let most = 0
      for (const { toward, right, up } of axes) {
        let left = Infinity, rightmost = -Infinity, low = Infinity, high = -Infinity
        for (const point of points) {
          corner.copy(point).sub(centre)
          const ahead = distance - corner.dot(toward)
          if (ahead <= 1e-3) return Infinity
          const u = corner.dot(right) / ahead, v = corner.dot(up) / ahead
          left = Math.min(left, u); rightmost = Math.max(rightmost, u); low = Math.min(low, v); high = Math.max(high, v)
        }
        most = Math.max(most, (rightmost - left) / (2 * tanX * across), (high - low) / (2 * tanY * upright))
      }
      return most
    }
    // THE ONE RULE: the outline's own box takes the setting's share of the fit box (its place is evened in placeCamera)
    const want = 1
    let near = radius * .05, far = radius * 400
    for (let i = 0; i < 40; i++) {
      const mid = Math.sqrt(near * far)
      if (filled(mid) > want) near = mid
      else far = mid
    }
    wholeRef = far
    return far
  }
  /** The eye and its aim, from the body's own metres onto the table, and the
   * point on the eye's own side, past the body and at the eye's height, that
   * the way in passes: under the body, never through its floor or its skin. */
  function eyeView(eye: TurntableEye): View {
    const pick = host?.narrow && eye.narrow ? eye.narrow : eye
    body.object.updateMatrixWorld(true)
    const at = body.object.localToWorld(new Vector3(...pick.at)), look = body.object.localToWorld(new Vector3(...pick.look))
    const offset = at.clone().sub(look), distance = Math.max(1e-3, offset.length())
    const out = new Vector3(at.x - centre.x, 0, at.z - centre.z)
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1)
    out.normalize()
    const halfX = (rest.max.x - rest.min.x) / 2, halfZ = (rest.max.z - rest.min.z) / 2
    const leaves = Math.min(halfX / Math.max(1e-6, Math.abs(out.x)), halfZ / Math.max(1e-6, Math.abs(out.z)))
    const via = new Vector3(centre.x, at.y, centre.z).addScaledVector(out, leaves + radius * .3)
    return { yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(offset.y / distance), distance, target: look, via }
  }
  function goalFor(id: TurntableViewpoint, own?: { yaw: number; pitch: number }): View {
    const entry = options.viewpoints.find(v => v.id === id)
    if (entry?.eye && id !== 'whole' && !own) return eyeView(entry.eye)
    const part = entry?.part ? family(entry.part).flatMap(name => nodeFor(name)?.geometries ?? []) : []
    if (!part.length || id === 'whole') {
      const at = own ? { yaw: own.yaw, pitch: own.pitch } : WHOLE
      return { ...at, distance: wholeDistance(at), target: centre.clone() }
    }
    const box = new Box3()
    for (const { node, geometry } of part) {
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      box.union(geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld))
    }
    const sphere = box.getBoundingSphere(new Sphere())
    const whole = wholeDistance()
    const toward = new Vector3(Math.sin(WHOLE.yaw), 0, Math.cos(WHOLE.yaw))
    const across = new Vector3(sphere.center.x - centre.x, 0, sphere.center.z - centre.z)
    // A part on the far side of the machine is looked at from its own side,
    // so the body does not stand between the eye and it.
    const yaw = own?.yaw ?? entry?.yaw ?? (across.dot(toward) < -radius * .1 ? WHOLE.yaw + Math.PI : WHOLE.yaw)
    // A STEP IN, NEVER A NEW PLACE: the eye comes a third to two thirds of
    // the way toward the part, which keeps the machine it belongs to in the
    // frame and the eye inside the air the whole view stands in.
    const distance = Math.min(whole * .7, Math.max(whole * .35, fitDistance(sphere.radius * 2.6)))
    return { yaw, pitch: own?.pitch ?? entry?.pitch ?? WHOLE.pitch + 4 * DEG, distance, target: centre.clone().lerp(sphere.center, .75) }
  }
  function choose(id: TurntableViewpoint): void {
    carrying = false
    chosen = id
    for (const [name, button] of viewButtons) button.setAttribute('aria-pressed', String(name === id))
    tapped = null
    light(litPart())
    const next = goalFor(id)
    if (host?.reducedMotion) { Object.assign(view, next); view.via = next.via ?? null; goal = null; return }
    from = { ...view, target: view.target.clone() }
    goal = next
    eased = 0
  }
  function orbit(dx: number, dy: number): void {
    // an eye inside the body is taken back out along its own way before the hand turns the table
    if (view.via || goal?.via || (goal && from?.via)) {
      if (!goal) choose('whole')
      return
    }
    goal = null
    carrying = false
    view.yaw -= dx
    view.pitch = Math.min(PITCH.most, Math.max(PITCH.least, view.pitch + dy))
    if (chosen !== 'whole') { chosen = 'whole'; light(litPart()) }
    for (const [, button] of viewButtons) button.setAttribute('aria-pressed', 'false')
  }
  const eyeOf = (v: View): Vector3 => {
    const cos = Math.cos(v.pitch)
    return new Vector3(Math.sin(v.yaw) * cos, Math.sin(v.pitch), Math.cos(v.yaw) * cos).multiplyScalar(v.distance).add(v.target)
  }
  /** The eye standing at a view's low point, aimed where the view aims. */
  const outside = (v: View): View => {
    const offset = v.via!.clone().sub(v.target), distance = Math.max(1e-3, offset.length())
    return { yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(offset.y / distance), distance, target: v.target.clone() }
  }
  /** A straight way between two eyes, the aim carried along it. */
  function line(a: View, b: View, k: number): void {
    const eye = eyeOf(a).lerp(eyeOf(b), k)
    view.target.lerpVectors(a.target, b.target, k)
    const offset = eye.sub(view.target)
    view.distance = Math.max(1e-3, offset.length())
    view.yaw = Math.atan2(offset.x, offset.z)
    view.pitch = Math.asin(Math.max(-1, Math.min(1, offset.y / view.distance)))
  }
  /** Into or out of the body only on the straight line from its low point;
   * the turn round the body happens out there, in the air. */
  const INSIDE_LEG = .3
  function blend(a: View, b: View, k: number): void {
    if (a.via || b.via) {
      const start = a.via ? outside(a) : a, end = b.via ? outside(b) : b
      const out = a.via ? INSIDE_LEG : 0, back = b.via ? 1 - INSIDE_LEG : 1
      // the eye counts as inside only on the straight legs, so a way broken
      // off out in the air turns from where it is
      if (k < out) { line(a, start, k / out); view.via = a.via! }
      else if (k > back) { line(end, b, (k - back) / (1 - back)); view.via = b.via! }
      else { sweep(start, end, (k - out) / Math.max(1e-6, back - out)); view.via = null }
      return
    }
    view.via = null
    sweep(a, b, k)
  }
  function sweep(a: View, b: View, k: number): void {
    let swing = b.yaw - a.yaw
    swing = Math.atan2(Math.sin(swing), Math.cos(swing))
    view.yaw = a.yaw + swing * k
    view.pitch = a.pitch + (b.pitch - a.pitch) * k
    view.distance = a.distance + (b.distance - a.distance) * k
    view.target.lerpVectors(a.target, b.target, k)
  }
  /** How far along the run's views the eye belongs at a clock of the run. */
  function runViewAt(clock: number): number {
    const at = schedule.kind === 'loop' && period ? clock % period : clock
    let want = 0
    runViews.forEach((stage, i) => {
      if (at <= stage.from) return
      const u = Math.min(1, (at - stage.from) / Math.max(1e-3, stage.to - stage.from))
      want = i + u * u * (3 - 2 * u)
    })
    return want
  }
  /** The eye along the run's views, by the clock; under reduced motion it
   * cuts to a stage's view once that stage's move would have ended. */
  function carry(dt: number): void {
    const want = runViewAt(state.clock)
    if (host?.reducedMotion) carried = Math.floor(want + 1e-6)
    else carried += (want - carried) * (1 - Math.exp(-dt / CARRY_FOLLOW_S))
    standCarried()
  }
  function standCarried(): void {
    carryViews ??= [goalFor('whole'), ...runViews.map(stage => goalFor(stage.view, stage))]
    const i = Math.min(runViews.length - 1, Math.floor(carried))
    blend(carryViews[i]!, carryViews[i + 1]!, carried - i)
    const shown = carried > runViews.length - .001 ? runViews[runViews.length - 1]!.view : 'whole'
    if (shown === carryShown) return
    carryShown = shown
    for (const [name, button] of viewButtons) button.setAttribute('aria-pressed', String(name === shown))
  }
  function placeCamera(dt: number): void {
    if (!camera || !host) return
    if (goal && from) {
      eased = Math.min(1, eased + dt / (goal.via || from.via ? EASE_S * 2 : EASE_S))
      blend(from, goal, eased * eased * (3 - 2 * eased))
      if (eased >= 1) goal = null
    } else if (carrying && standing) carry(dt)
    // the whole view stands where the walking machine has walked to; a view stepping in hands that back
    const whole = wholeness()
    walkAt(state.clock, walked).multiplyScalar(whole)
    aim.copy(view.target).add(walked)
    const cos = Math.cos(view.pitch)
    camera.position.set(Math.sin(view.yaw) * cos, Math.sin(view.pitch), Math.cos(view.yaw) * cos)
      .multiplyScalar(view.distance).add(aim)
    camera.lookAt(aim)
    // the shade where it stands walks with it
    if (walk) stage?.carry(walkAt(state.clock, rested).sub(walkAt(0, started)))
    // the air is measured from the eye it has now, so a view that steps in keeps the machine clear
    const reach = camera.position.distanceTo(started.copy(centre).add(walked))
    const { air } = stageNumbers()
    stage?.air(reach + radius * air.near, reach + radius * air.far)
    const w = innerWidth, h = deskStageHeight(), fit = viewportFit()
    // THE WORK STANDS IN THE MIDDLE OF ITS OWN VIEWPORT, not of the stage: a shift of the lens written into the
    // projection itself, since a view offset is the export's to set and clear round every draw
    camera.aspect = w / h
    if (camera.view?.enabled) camera.clearViewOffset()
    camera.updateProjectionMatrix()
    const shift = (sx: number, sy: number): void => {
      camera!.projectionMatrix.elements[8] = -2 * (fit.left + fit.width / 2 - w / 2 + sx) / w
      camera!.projectionMatrix.elements[9] = 2 * (fit.top + fit.height / 2 - h / 2 + sy) / h
      camera!.projectionMatrixInverse.copy(camera!.projectionMatrix).invert()
    }
    shift(0, 0)
    // AN EVEN MARGIN: in the whole view the outline's own box, not the body's centre, stands in the viewport's middle;
    // a view stepping in toward a part hands that back smoothly
    if (whole > 0) {
      camera.updateMatrixWorld()
      const at = new Vector3()
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
      for (const point of hull) {
        at.copy(point).add(walked).project(camera)
        const x = (at.x * .5 + .5) * w, y = (.5 - at.y * .5) * h
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      shift((fit.left + fit.width / 2 - (left + right) / 2) * whole, (fit.top + fit.height / 2 - (top + bottom) / 2) * whole)
    }
    // the rig turns with the eye, and the field's pool stands behind the machine where the picture puts it
    camera.updateMatrixWorld()
    stage?.follow({ yaw: view.yaw, centre: onCanvas(aim, camera), picture: fit.height / h, eye: camera.position, lens: camera.fov * DEG })
  }

  // ---- the words that follow the clock
  function paint(): void {
    if (!host) return
    const u = share()
    const at = stepAt(u)
    if (slider && document.activeElement !== slider) slider.value = String(Math.round(u * 1000))
    if (slider) paintSlider(slider)
    if (slider) slider.setAttribute('aria-valuetext', period ? `${state.clock.toFixed(1)} s / ${period} s` : '')
    if (play) {
      const held = schedule.kind === 'finite' && state.clock >= period
      const text = state.playing ? options.words.pause : held ? options.words.again : options.words.play
      if (play.textContent !== text) play.textContent = text
      play.setAttribute('aria-pressed', String(state.playing))
    }
    if (at !== active) {
      active = at
      const step = steps[at]
      host.caption.textContent = step?.text ?? ''
      host.caption.lang = host.lang
      // THE RUN'S CAPTIONS, ONE AT A TIME, and the clock that counts them:
      // the label reads which step is under way, never a second hand.
      host.step?.(at, steps.length)
      stepButtons.forEach((button, i) => { if (i === at) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current') })
      light(litPart())
      host.describe(step ? `${options.title}. ${step.text}` : options.title)
    }
    paintLeader()
  }
  function paintLeader(): void {
    if (!leader || !leaderLine || !leaderText || !camera || !host) return
    if (!tapped) { leader.style.display = 'none'; leaderText.hidden = true; return }
    const point = tapped.node.localToWorld(tapped.local.clone()).project(camera)
    const x = (point.x * .5 + .5) * innerWidth, y = (-point.y * .5 + .5) * deskStageHeight()
    const rect = host.viewport()
    const box = leaderText.getBoundingClientRect()
    // The name stands at the viewport's upper corner on the far side of the
    // part, and its line rides the part as the machine moves.
    // The phone's folio stands in its viewport's upper right, so the name keeps
    // to the left there.
    const left = host.narrow ? rect.left + 8 : x < rect.left + rect.width / 2 ? rect.left + rect.width - box.width - 16 : rect.left + 16
    const top = rect.top + (host.narrow ? 8 : 16)
    leaderText.style.left = `${Math.round(left)}px`
    leaderText.style.top = `${Math.round(top)}px`
    leaderLine.setAttribute('x1', String(x))
    leaderLine.setAttribute('y1', String(y))
    leaderLine.setAttribute('x2', String(x < rect.left + rect.width / 2 ? left : left + box.width))
    leaderLine.setAttribute('y2', String(top + box.height / 2))
    leader.style.display = ''
    leaderText.hidden = false
  }

  // ---- a tap names a part, a drag turns the crank, two fingers turn the table
  function stepFor(part: string): number {
    for (let id: string | undefined = part; id; id = options.parents.get(id)) {
      const at = steps.findIndex(step => step.part === id)
      if (at >= 0) return at
    }
    return -1
  }
  /** The dossier id a node of the body stands for: its own name, or the name
   * a body built outside its record gives that part. */
  const idsByNode = new Map(Object.entries(options.nodeNames ?? {}).map(([part, node]) => [node, part]))
  /** WHAT THE FRAME ACTUALLY DRAWS. A ray does not care whether a part is
   * visible, so a wall a cutaway has lifted still catches every tap and names
   * itself over the open chamber behind it. A tap lands on what a visitor can
   * see: every node up the chain drawn, the material on, and never the light's
   * own overlay. A mark built for the hand alone is the one exception, because
   * nothing draws it and a hand has to reach it. */
  function drawn(object: Object3D): boolean {
    if (object.userData['vitrineOverlay']) return false
    for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false
    const material = (object as Mesh).material
    if (object.userData['vitrineTarget']) return true
    return !(material && !Array.isArray(material) && material.visible === false)
  }
  function tap(x: number, y: number): void {
    if (!camera) return
    ray.setFromCamera(new Vector2(x / innerWidth * 2 - 1, -(y / deskStageHeight()) * 2 + 1), camera)
    const hit = ray.intersectObject(body.object, true).find(h => drawn(h.object))
    tapped = null
    if (hit) {
      for (let node: Object3D | null = hit.object; node && node !== body.object; node = node.parent) {
        const name = node.name.replace(/:(surface|rigid-surfaces)$/, '')
        const part = options.partNames?.has(name) ? name : idsByNode.get(name)
        const named = part ? options.partNames?.get(part) : undefined
        // A PART IS NAMED BY ITS OWN NAME. Where the record names none, the step
        // that speaks of it still does.
        let at = named ? -1 : stepFor(name)
        if (!named && at < 0 && part) at = stepFor(part)
        if (!named && at < 0) continue
        const text = named ?? steps[at]!.text
        tapped = { node: hit.object, local: hit.object.worldToLocal(hit.point.clone()), text }
        if (leaderText) { leaderText.textContent = text; leaderText.lang = host!.lang }
        light(named ? part! : steps[at]!.part)
        break
      }
    }
    paintLeader()
  }

  const pointers = new Map<number, { x: number; y: number }>()
  /** THE FIRST FINGER OWNS THE CLOCK. A press, a drag and a tap are told apart
   * by the tracked path from where it went down, never by the lifting event's
   * own coordinates, which WebKit does not promise; a second contact turns the
   * table and takes the tap away. */
  let press: { id: number; x: number; y: number; clock: number; moved: boolean; orbit: boolean } | null = null
  const listening = new AbortController()
  function clear(): void {
    pointers.clear()
    press = null
  }
  function bindHand(surface: HTMLElement): void {
    const signal = listening.signal
    surface.addEventListener('contextmenu', event => event.preventDefault(), { signal })
    surface.addEventListener('pointerdown', event => {
      if ((event.target as Element).closest('button,a,input')) return
      if (pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      // WebKit refuses capture for a pointer it no longer tracks.
      try { surface.setPointerCapture(event.pointerId) } catch { /* the viewport covers the model either way */ }
      event.preventDefault()
      if (pointers.size === 1) press = { id: event.pointerId, x: event.clientX, y: event.clientY, clock: state.clock, moved: false, orbit: event.button === 2 }
      else if (press) { press.orbit = true; press.moved = true }
    }, { signal })
    surface.addEventListener('pointermove', event => {
      const last = pointers.get(event.pointerId)
      if (!last || !press) return
      const dx = event.clientX - last.x, dy = event.clientY - last.y
      last.x = event.clientX; last.y = event.clientY
      if (!press.moved && event.pointerId === press.id
        && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LOOK_RULE.slopPx) press.moved = true
      if (!press.moved) return
      if (press.orbit) { orbit(dx * .008 / Math.max(1, pointers.size), dy * .006 / Math.max(1, pointers.size)); return }
      if (!period || event.pointerId !== press.id) return
      tapped = null
      const across = viewportFit().width
      setClock(press.clock + (event.clientX - press.x) / across * period * DRAG_PERIODS)
    }, { signal })
    surface.addEventListener('pointerup', event => {
      if (!pointers.delete(event.pointerId) || !press || pointers.size) return
      const was = press
      press = null
      if (!was.moved && event.pointerId === was.id) tap(was.x, was.y)
      else if (!was.orbit && period) release()
    }, { signal })
    // A cancelled or lost contact ends as nothing at all: no tap, no coast.
    const lost = (event: PointerEvent): void => {
      if (!pointers.delete(event.pointerId)) return
      if (!pointers.size) press = null
    }
    surface.addEventListener('pointercancel', lost, { signal })
    surface.addEventListener('lostpointercapture', lost, { signal })
    const view = surface.ownerDocument.defaultView
    view?.addEventListener('blur', clear, { signal })
    surface.ownerDocument.addEventListener('visibilitychange', clear, { signal })
    surface.addEventListener('wheel', event => event.preventDefault(), { signal, passive: false })
  }

  function buildControls(next: VitrinePayloadHost): void {
    const row = next.controls
    const clock = make('div', 'vitrine-clock')
    play = make('button', 'vitrine-control vitrine-play')
    play.type = 'button'
    play.disabled = !period
    play.addEventListener('click', () => {
      if (!period) return
      if (schedule.kind === 'finite' && state.clock >= period) {
        setClock(0, true)
        // a replay is the run again, and its eye with it
        if (runViews.length && !carrying) { choose('whole'); carrying = true; carried = 0 }
      }
      else state = { clock: state.clock, playing: !state.playing, fixed: false }
      paint()
    }, { signal: listening.signal })
    slider = make('input', 'vitrine-slider')
    slider.type = 'range'
    slider.min = '0'; slider.max = '1000'; slider.step = '1'
    slider.disabled = !period
    slider.setAttribute('aria-label', options.words.clock)
    slider.addEventListener('input', () => {
      if (!period) return
      tapped = null
      const u = Number(slider!.value) / 1000
      const cycle = schedule.kind === 'loop' ? Math.floor(state.clock / period) : 0
      setClock((cycle + Math.min(u, schedule.kind === 'loop' ? .9999 : 1)) * period)
    }, { signal: listening.signal })
    slider.addEventListener('change', () => release(), { signal: listening.signal })
    slider.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault(); event.stopPropagation()
      turn(event.key === 'ArrowRight' ? 1 : -1)
    }, { signal: listening.signal })
    const track = make('div', 'vitrine-track')
    track.append(slider)
    for (const start of starts) {
      const tick = make('span', 'vitrine-tick')
      tick.style.left = `${start * 100}%`
      tick.setAttribute('aria-hidden', 'true')
      track.append(tick)
    }
    clock.append(play, track)
    const views = make('div', 'vitrine-views')
    viewButtons = new Map()
    for (const entry of options.viewpoints) {
      const button = make('button', 'vitrine-control vitrine-viewpoint', entry.label)
      button.type = 'button'
      button.disabled = entry.id !== 'whole' && (!entry.part || !nodeFor(entry.part))
      button.setAttribute('aria-pressed', String(entry.id === chosen))
      button.addEventListener('click', () => choose(entry.id), { signal: listening.signal })
      viewButtons.set(entry.id, button)
      views.append(button)
    }
    row.append(views, clock)
    // THE STEPS ARE THE TEXT ALTERNATIVE FOR THE MOTION, one button each.
    stepButtons = []
    if (steps.length) {
      const list = make('ul', 'vitrine-steps')
      list.setAttribute('role', 'list')
      steps.forEach((step, i) => {
        const item = make('li', '')
        const button = make('button', 'vitrine-step-item')
        button.type = 'button'
        button.lang = next.lang
        const dot = make('span', 'vinci-title-dot')
        dot.dataset['certainty'] = step.certainty
        dot.setAttribute('aria-hidden', 'true')
        button.append(dot, make('span', '', step.text))
        button.addEventListener('click', () => jump(i), { signal: listening.signal })
        stepButtons.push(button)
        item.append(button)
        list.append(item)
      })
      next.aside.append(list)
    }
    // THE SHEET BESIDE THE MODEL: the folio the machine was read from.
    if (options.sheet) {
      const sheet = folioDoor(next.element.ownerDocument, options.sheet, next.narrow, listening.signal, () => mounted)
      // ON THE PHONE THE FOLIO IS A GLASS in the views' row, never a chip on the model
      if (next.narrow) views.append(sheet)
      else next.element.append(sheet)
    }
    const svg = next.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'vitrine-leader')
    svg.setAttribute('aria-hidden', 'true')
    leaderLine = next.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'line')
    svg.append(leaderLine)
    leader = svg
    leaderText = make('p', 'vitrine-part-name')
    leaderText.hidden = true
    next.element.append(svg, leaderText)
  }

  /** where a pressed step lands on the dial: its start, or a turn's own end */
  const landOf = (index: number): number =>
    steps[index]!.at >= 1 ? (schedule.kind === 'finite' ? 1 : starts[index]! + .02) : starts[index]!
  function jump(index: number): void {
    const step = steps[index]
    if (!step || !period) return
    tapped = null
    const at = landOf(index)
    const cycle = schedule.kind === 'loop' ? Math.floor(state.clock / period) : 0
    setClock((cycle + at) * period)
    active = -2
    paint()
  }
  function turn(direction: number): void {
    if (!period) return
    tapped = null
    setClock(state.clock + direction * period * KEY_SHARE)
  }

  let bodyReady = false
  function stand(): void {
    if (!mounted || !host || standing) return
    // A body out of the store names its parts only once it stands.
    for (const entry of options.viewpoints) {
      const button = viewButtons.get(entry.id)
      if (button) button.disabled = entry.id !== 'whole' && (!entry.part || !nodeFor(entry.part))
    }
    scene = new Scene()
    const { lens } = stageNumbers()
    camera = new PerspectiveCamera(host.narrow ? lens.phone : lens.desktop, innerWidth / deskStageHeight(), .01, 1000)
    const table = new Group()
    table.name = 'vitrine/turntable'
    scene.add(table)
    const object = body.object
    lent = { parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(),
      scale: object.scale.clone(), visible: object.visible }
    // THE REST POSE IS WHAT THE TABLE MEASURES, so every machine stands on
    // the ground at the same place however far its clock had gone.
    body.animate(0, 0)
    table.add(object)
    object.position.set(0, 0, 0)
    object.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), options.turn ?? 0)
    object.visible = true
    object.updateMatrixWorld(true)
    const box = new Box3().setFromObject(object, true)
    const size = box.getSize(new Vector3())
    object.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    object.updateMatrixWorld(true)
    rest = new Box3().setFromObject(object, true)
    radius = Math.max(.05, box.getBoundingSphere(new Sphere()).radius)
    centre = new Vector3(0, size.y / 2, 0)
    const whole = host.banded || host.narrow || options.travels === true
    if (whole) {
      rest = runBox(rest)
      centre.setY((rest.min.y + rest.max.y) / 2)
      radius = Math.max(radius, rest.getBoundingSphere(new Sphere()).radius)
    }
    if (options.travels) centre.set((rest.min.x + rest.max.x) / 2, centre.y, (rest.min.z + rest.max.z) / 2)
    walkOf()
    outline = outlineOver(whole ? (period ? RUN_SAMPLES : 1) : 1)
    hull = hullOf(outline)
    const span = Math.max(size.x, size.y, size.z)
    object.traverse(child => {
      if (!(child instanceof Mesh) || child.userData['vitrineOverlay']) return
      shadows.set(child, child.castShadow)
      child.castShadow = true
    })
    camera.near = Math.max(.005, span / 400)
    camera.far = span * 80
    // THE CLOSE VIEW'S OWN STAGE AND PRINT: a machine looks the same from whichever room it was opened
    stack.setScene(scene, camera, stageGrade(span))
    stage = createStageSetting({ stack, scene, span, radius, centre: centre.clone(), floorY: 0, footprint: rest })
    // the shade where it stands is painted from its rest pose: a walker's path is not its foot
    stage.contact(surfacePoints(object))
    stage.machine(object)
    view.target.copy(centre)
    view.distance = wholeDistance()
    view.yaw = WHOLE.yaw; view.pitch = WHOLE.pitch
    placeCamera(0)
    standing = true
    host.surface('own')
    active = -2
    paint()
  }

  const film: TurntableFilm = {
    period,
    lands: steps.map((_, i) => landOf(i)),
    pose(clock, how) {
      tapped = null
      dark = !how.lit
      state = { clock: schedule.kind === 'finite' ? Math.min(period, Math.max(0, clock)) : Math.max(0, clock), playing: how.playing, fixed: !how.playing }
      active = -2
      // the recorded run carries the eye as the live run does, by its clock alone
      if (runViews.length && standing && !goal && chosen === 'whole') {
        carrying = false
        carried = runViewAt(state.clock)
        standCarried()
      }
      if (standing) { body.animate(state.clock, 0); paint() }
    },
    frame(box) {
      framed = box
      carryViews = null
      if (standing && !goal && chosen === 'whole' && !carrying) view.distance = wholeDistance()
      placeCamera(0)
    },
    measure() {
      if (!standing || !camera) return null
      const w = innerWidth, h = deskStageHeight(), at = new Vector3()
      camera.updateMatrixWorld()
      const boxOf = (points: readonly Vector3[]) => {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
        for (const point of points) {
          at.copy(point).project(camera!)
          const x = (at.x * .5 + .5) * w, y = (.5 - at.y * .5) * h
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
        }
        return { left, top, right, bottom }
      }
      walkAt(state.clock, walked).multiplyScalar(wholeness())
      return { stage: { width: w, height: h }, fit: viewportFit(), now: boxOf(outlineNow()),
        sweep: boxOf(outline.map(point => point.clone().add(walked))), fov: camera.fov, distance: view.distance }
    },
  }

  return {
    kind: 'machine',
    // the machine takes the glass on the phone, its card folded to a peek under it
    fill: true,
    film,
    mount(next) {
      host = next
      mounted = true
      state = initialPlayback(schedule, { reducedMotion: next.reducedMotion })
      buildControls(next)
      bindHand(next.element)
      next.element.tabIndex = 0
      next.describe(options.title)
      paint()
      void body.ready.then(() => { bodyReady = true }).catch(error => console.error(error))
    },
    update(dt) {
      // THE WALK COMES FIRST: the room draws the leg to the plinth, and the
      // body is lent to the table in the frame after the eye stands.
      if (!standing && mounted && bodyReady && (options.standing?.() ?? true)) stand()
      if (!standing || !host) return
      if (!press || press.orbit) state = advancePlayback(schedule, state, Math.min(.1, dt))
      body.animate(state.clock, dt)
      placeCamera(dt)
      paint()
    },
    layout() {
      if (!standing) return
      carryViews = null
      if (!goal && chosen === 'whole' && !carrying) view.distance = wholeDistance()
      placeCamera(0)
    },
    key(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const direction = event.key === 'ArrowRight' ? 1 : -1
        if (event.shiftKey) orbit(direction * 12 * DEG, 0)
        else turn(direction)
        return true
      }
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        orbit(0, (event.key === 'ArrowUp' ? 1 : -1) * 6 * DEG)
        return true
      }
      return false
    },
    unmount() {
      mounted = false
      listening.abort()
      for (const meshes of overlays.values()) for (const mesh of meshes) mesh.removeFromParent()
      overlays.clear()
      for (const shape of owned) shape.dispose()
      owned.clear()
      overlayMaterial.dispose()
      liftMaterial.dispose()
      edgeMaterial.dispose()
      if (lent) {
        // BACK TO THE ROOM AT REST, where it stood and as it stood.
        const object = body.object
        body.animate(0, 0)
        for (const [mesh, cast] of shadows) mesh.castShadow = cast
        shadows.clear()
        object.removeFromParent()
        lent.parent?.add(object)
        object.position.copy(lent.position)
        object.quaternion.copy(lent.quaternion)
        object.scale.copy(lent.scale)
        object.visible = lent.visible
        object.updateMatrixWorld(true)
        lent = undefined
      }
      if (standing) {
        stage?.dispose()
        scene?.clear()
        options.restore()
      }
      standing = false
      stage = undefined; scene = undefined; camera = undefined
      outline = []; hull = []; wholeRef = 0; walk = null
      host = undefined
    },
  }
}
