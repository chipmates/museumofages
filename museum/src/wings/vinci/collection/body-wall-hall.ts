/** THE ANATOMY IN THE GREAT HALL, and the three paintings shown there: the
 * plates the hall stands in its cabinet, on its pier and on its easels. The
 * hall lays out every place (`house-hall.ts`); this module only fetches and
 * draws the store's admitted plates on them, with the policy's own records.
 * Loaded by the hall on demand, so the hall's fabric never waits for it.
 */
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicNodeMaterial, PlaneGeometry, SphereGeometry, Vector3 } from 'three/webgpu'
import { float, mix, normalView, positionViewDirection, vec3 } from 'three/tsl'
import { loadManifest } from '../../../manifest'
import { createPlateStream, type PlateStream } from '../pictures/stream'
import { findPlateEntries, getWork, reproductionCardSize } from '../pictures/register'
import { pictureDisplayUV, pictureDisplayWindow } from '../pictures/registration'
import { bodySheetSources } from './body-wall'

type V3 = [number, number, number]
/** One plate's place, east/north/up: its centre and its three axes. */
export interface HallPlate {
  kind: 'sheet' | 'painting'
  /** the sheet's register id, or the painting's work id */
  id: string
  centre: V3
  right: V3
  up: V3
  normal: V3
  /** the sheet's own plate size; a painting takes its card size from the register */
  width?: number
  height?: number
  /** the room's light at its place, times the prints' gain (`house-hall.ts`) */
  tone?: V3
}

/** The one full resolution at a time: the nearest plate within reach. */
const REACH = { sheet: 1.9, painting: 3.2 } as const

const world = (p: V3): Vector3 => new Vector3(p[0], p[2], -p[1])

export interface HallPlates {
  /** settles once every plate's preview has arrived or failed */
  ready: Promise<void>
  tick(eye: V3): void
  pending(): number
}

/** THE GLASS MODEL OF THE VALVE, ours: nothing of his survives and nobody is
 * sure he built one. A glass root with its three sinuses on a turned oak
 * foot, three thin cusps opening and shutting once in a beat, and grass
 * seeds turning in the water behind them, as he planned to show the flow.
 * Its oak foot is the hall's (`house-hall.ts`). Drawn in the room's light at
 * the stand, `light`: the glass clear in the middle and catching the room at
 * its edges, as glass does, never lit from outside the hall.
 * Local metres, y up, the foot's underside at 0. */
const ROOT = { foot: .028, low: .1, sinus: .13, junction: .17, top: .27, tube: .034, bulge: .052 } as const
const BEAT_S = 2.6
/** a demonstration size, small enough to stand whole under its sheet in the valve's look */
const MODEL_SCALE = 1.25
function rootRadius(y: number, angle: number): number {
  const lobe = Math.max(0, Math.cos(3 * angle)) ** 1.5
  const swell = y < ROOT.low ? 0 : y > ROOT.junction ? 0 : Math.sin(Math.PI * (y - ROOT.low) / (ROOT.junction - ROOT.low))
  return ROOT.tube + (ROOT.bulge - ROOT.tube) * swell * (.55 + .45 * lobe)
}
function glassValve(light: V3): { group: Group; beat(t: number): void } {
  const group = new Group()
  group.name = 'vinci/house-hall/glass-valve'
  const room = vec3(...light)
  // a pane's share of the room it mirrors grows toward a grazing view
  const edge = float(1).sub(normalView.dot(positionViewDirection.negate()).abs()).pow(2.5)
  const glass = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
  glass.colorNode = mix(vec3(.62, .66, .64), vec3(.86, .9, .88), edge).mul(room)
  glass.opacityNode = mix(float(.05), float(.6), edge)
  const water = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  water.colorNode = vec3(.55, .62, .6).mul(room)
  water.opacityNode = mix(float(.04), float(.16), edge)
  const cusp = new MeshBasicNodeMaterial({ transparent: true, opacity: .85, side: DoubleSide })
  cusp.colorNode = vec3(.62, .55, .42).mul(room)
  const seedMat = new MeshBasicNodeMaterial()
  seedMat.colorNode = vec3(.07, .045, .02).mul(room)
  // the root, its three sinuses swelling between the cusps' commissures
  const A = 60, Y = 30, pos: number[] = [], idx: number[] = []
  for (let j = 0; j <= Y; j++) for (let i = 0; i <= A; i++) {
    const y = ROOT.foot + (ROOT.top - ROOT.foot) * j / Y, a = i / A * Math.PI * 2, r = rootRadius(y, a)
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r)
  }
  for (let j = 0; j < Y; j++) for (let i = 0; i < A; i++) { const k = j * (A + 1) + i; idx.push(k, k + A + 1, k + 1, k + 1, k + A + 1, k + A + 2) }
  const shell = new BufferGeometry()
  shell.setAttribute('position', new Float32BufferAttribute(pos, 3)); shell.setIndex(idx); shell.computeVertexNormals()
  const root = new Mesh(shell, glass); root.renderOrder = 2
  const fill = new Mesh(shell.clone().scale(.96, .97, .96).translate(0, .002, 0), water); fill.renderOrder = 1
  group.add(fill, root)
  // the three cusps, hung from the root's wall along their arcs
  const I = 10, J = 7, cusps: BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const g = new BufferGeometry(), ci: number[] = []
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array((I + 1) * (J + 1) * 3), 3))
    for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) { const q = j * (I + 1) + i; ci.push(q, q + I + 1, q + 1, q + 1, q + I + 1, q + I + 2) }
    g.setIndex(ci)
    cusps.push(g)
    group.add(new Mesh(g, cusp))
  }
  // the seeds, turning in the sinuses behind the cusps
  const seeds: { mesh: Mesh; lobe: number; phase: number; r: number; y: number }[] = []
  const seedGeo = new SphereGeometry(.0022, 6, 4).scale(1, .45, .45)
  for (let n = 0; n < 15; n++) {
    const mesh = new Mesh(seedGeo, seedMat)
    seeds.push({ mesh, lobe: n % 3, phase: (n * 2.399) % (Math.PI * 2), r: .006 + (n % 4) * .002, y: ROOT.low + .02 + (n % 5) * .007 })
    group.add(mesh)
  }
  const beat = (t: number): void => {
    // shut through most of the beat, a quick opening as the flow passes
    const phase = (t / BEAT_S) % 1, open = phase < .38 ? Math.sin(Math.PI * phase / .38) : 0
    for (let k = 0; k < 3; k++) {
      const at = cusps[k]!.getAttribute('position') as Float32BufferAttribute
      const mid = Math.PI / 3 + k * 2 * Math.PI / 3
      for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
        const s = i / I - .5, t2 = j / J, a = mid + s * 2 * Math.PI / 3 * .97
        const wall = rootRadius(ROOT.low, a) * .985
        // the attachment rises toward the commissures; the free edge reaches the
        // middle when shut and lies back along the wall when open
        const reach = .97 - .78 * open
        const r = wall * (1 - t2 * reach * (1 - .25 * Math.abs(s) * 2)), y = ROOT.low + .028 * (2 * Math.abs(s)) ** 2 * (1 - t2) + t2 * (.008 + .03 * open)
        at.setXYZ(j * (I + 1) + i, Math.cos(a) * r, y, Math.sin(a) * r)
      }
      at.needsUpdate = true
      cusps[k]!.computeVertexNormals()
    }
    for (const sd of seeds) {
      // the swirl behind each cusp turns faster as the cusps begin to shut
      const a = sd.phase + t * (1.2 + 1.6 * (1 - open)), lobe = Math.PI / 3 + sd.lobe * 2 * Math.PI / 3
      const cx = Math.cos(lobe) * .04, cz = Math.sin(lobe) * .04
      sd.mesh.position.set(cx + Math.cos(a) * sd.r * Math.cos(lobe), sd.y + Math.sin(a) * sd.r, cz + Math.cos(a) * sd.r * Math.sin(lobe))
      sd.mesh.rotation.set(0, -lobe, a)
    }
  }
  beat(0)
  return { group, beat }
}

export function mountHallPlates(host: Group, plates: readonly HallPlate[], hero: boolean, valveAt?: V3, valveLight: V3 = [.3, .25, .2]): HallPlates {
  const group = new Group()
  group.name = 'vinci/house-hall/plates'
  host.add(group)
  const model = valveAt ? glassValve(valveLight) : null
  if (model && valveAt) { model.group.position.copy(world(valveAt)); model.group.scale.setScalar(MODEL_SCALE); group.add(model.group) }
  const placed: { plate: HallPlate; stream: PlateStream; at: Vector3 }[] = []
  let loading = true, raised: PlateStream | null = null, switching = false, last = performance.now()
  const ready = loadManifest().then(manifest => {
    const sheets = new Map(bodySheetSources(manifest).map(source => [source.sheet.id, source]))
    for (const plate of plates) {
      let stream: PlateStream, geometry: PlaneGeometry
      if (plate.kind === 'sheet') {
        const source = sheets.get(plate.id)
        if (!source || plate.width === undefined || plate.height === undefined) continue
        stream = createPlateStream(source.preview, source.page, { previewMaxEdge: hero ? 1024 : 512, ...(plate.tone ? { tone: vec3(...plate.tone) } : {}), family: 'sheet' })
        geometry = new PlaneGeometry(plate.width, plate.height)
      } else {
        const work = getWork(plate.id)
        const entry = findPlateEntries(work, manifest).find(source => source.face === 'front')
        if (!entry) continue
        const registration = pictureDisplayWindow(entry.plate)
        const window = registration ? pictureDisplayUV(registration) : null
        const size = reproductionCardSize(work, window ? { width: window.contentAspect, height: 1 } : entry.pixels)
        stream = createPlateStream(entry.preview, entry.plate, { previewMaxEdge: hero ? 1024 : 512, ...(plate.tone ? { tone: vec3(...plate.tone) } : {}) })
        geometry = new PlaneGeometry(size.widthM, size.heightM)
        if (window) {
          const uv = geometry.getAttribute('uv')
          for (let i = 0; i < uv.count; i++) uv.setXY(i, window.offsetU + uv.getX(i) * window.scaleU, window.offsetV + uv.getY(i) * window.scaleV)
          uv.needsUpdate = true
        }
      }
      const mesh = new Mesh(geometry, stream.material)
      mesh.name = `vinci/house-hall/plates/${plate.id}`
      mesh.matrixAutoUpdate = false
      mesh.matrix.copy(new Matrix4().makeBasis(world(plate.right).sub(world([0, 0, 0])), world(plate.up).sub(world([0, 0, 0])), world(plate.normal).sub(world([0, 0, 0])))
        .setPosition(world(plate.centre)))
      mesh.castShadow = false; mesh.receiveShadow = false
      mesh.userData = { manifestId: plate.kind === 'sheet' ? `vinci/collection-body-wall` : 'vinci/collection-plates', asset: plate.id,
        light: 'the great hall at the fixed hour', display: plate.kind === 'sheet' ? 'present-day display' : 'shown on an easel' }
      group.add(mesh)
      placed.push({ plate, stream, at: world(plate.centre) })
    }
    group.updateMatrixWorld(true)
    return Promise.all(placed.map(p => p.stream.ready)).then(() => undefined)
  }).catch(() => undefined).finally(() => { loading = false })
  return {
    ready,
    tick(eye) {
      const now = performance.now(), dt = Math.min(.1, (now - last) / 1000)
      last = now
      model?.beat(now / 1000)
      for (const p of placed) p.stream.update(dt)
      if (switching) return
      const at = world(eye)
      let best: PlateStream | null = null, bestD = Infinity
      for (const p of placed) {
        const d = p.at.distanceTo(at)
        if (d < REACH[p.plate.kind] && d < bestD) { best = p.stream; bestD = d }
      }
      if (best === raised) return
      // the slot is released before another plate takes it
      switching = true
      const was = raised
      raised = best
      void (was ? was.high(false) : Promise.resolve()).then(() => best?.high(true)).finally(() => { switching = false })
    },
    pending: () => Number(loading) + placed.reduce((sum, p) => sum + p.stream.pending(), 0),
  }
}
