/** THE ANATOMY IN THE GREAT HALL, and the three paintings shown there: the
 * plates the hall stands in its cabinet, on its pier and on its easels. The
 * hall lays out every place (`house-hall.ts`); this module only fetches and
 * draws the store's admitted plates on them, with the policy's own records.
 * Loaded by the hall on demand, so the hall's fabric never waits for it.
 */
import { Group, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three/webgpu'
import { vec3 } from 'three/tsl'
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
}

/** The hall's return on a print, as the multiplier the stream applies: the
 * cabinet's sheets stand in the partition's shade, the easels nearer the
 * windows. Measured against the linen and the panels round them. */
const TONE = { sheet: vec3(.74, .69, .61), painting: vec3(.86, .81, .73) } as const
/** The one full resolution at a time: the nearest plate within reach. */
const REACH = { sheet: 1.9, painting: 3.2 } as const

const world = (p: V3): Vector3 => new Vector3(p[0], p[2], -p[1])

export interface HallPlates {
  /** settles once every plate's preview has arrived or failed */
  ready: Promise<void>
  tick(eye: V3): void
  pending(): number
}

export function mountHallPlates(host: Group, plates: readonly HallPlate[], hero: boolean): HallPlates {
  const group = new Group()
  group.name = 'vinci/house-hall/plates'
  host.add(group)
  const placed: { plate: HallPlate; stream: PlateStream; at: Vector3 }[] = []
  let loading = true, raised: PlateStream | null = null, switching = false, last = performance.now()
  const ready = loadManifest().then(manifest => {
    const sheets = new Map(bodySheetSources(manifest).map(source => [source.sheet.id, source]))
    for (const plate of plates) {
      let stream: PlateStream, geometry: PlaneGeometry
      if (plate.kind === 'sheet') {
        const source = sheets.get(plate.id)
        if (!source || plate.width === undefined || plate.height === undefined) continue
        stream = createPlateStream(source.preview, source.page, { previewMaxEdge: hero ? 1024 : 512, tone: TONE.sheet, family: 'sheet' })
        geometry = new PlaneGeometry(plate.width, plate.height)
      } else {
        const work = getWork(plate.id)
        const entry = findPlateEntries(work, manifest).find(source => source.face === 'front')
        if (!entry) continue
        const registration = pictureDisplayWindow(entry.plate)
        const window = registration ? pictureDisplayUV(registration) : null
        const size = reproductionCardSize(work, window ? { width: window.contentAspect, height: 1 } : entry.pixels)
        stream = createPlateStream(entry.preview, entry.plate, { previewMaxEdge: hero ? 1024 : 512, tone: TONE.painting })
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
