/** THE ANATOMY IN THE GREAT HALL, and the three paintings shown there: the
 * plates the hall stands in its cabinet, on its pier and on its easels. The
 * hall lays out every place (`house-hall.ts`); this module only fetches and
 * draws the store's admitted plates on them, with the policy's own records.
 * Loaded by the hall on demand, so the hall's fabric never waits for it.
 */
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicNodeMaterial, PlaneGeometry, SphereGeometry, Vector3 } from 'three/webgpu'
import { clamp, faceDirection, float, luminance, max, min, mix, normalView, normalWorld, positionViewDirection, smoothstep, sRGBTransferEOTF, sRGBTransferOETF, select, sqrt, vec3 } from 'three/tsl'
import { loadManifest } from '../../../manifest'
import { createPlateStream, type PlateStream } from '../pictures/stream'
import { findPlateEntries, getWork, reproductionCardSize } from '../pictures/register'
import { pictureDisplayUV, pictureDisplayWindow } from '../pictures/registration'
import { bodySheetSources } from './body-wall'
import { cardDistance, filmReachMetres, previewPitch } from './film-plates'
import { PRINT, STATION_EXPOSURE, STATION_SHOULDER } from '../print'

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
  /** a painting's display value: its source's encoded pixels times this one number, the hall's print undone */
  value?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL's node types do not follow a chain of maths
type N = any
/** The hall's print (`stack/post.ts` step 5: exposure, the wing's lift, saturation, the full Neutral shoulder, whose
 * own toe takes the darkest channel) run backwards, so a painting leaves the print as its source scaled by `value`
 * in the display's encoding: the print's cool lift and the toe's offset would otherwise outweigh a dim painting's
 * own colour. The print's darkest reach is about 0.0021 linear a channel; a darker aim stands there. */
const HALL_PRINT = { exposure: STATION_EXPOSURE.hall ?? PRINT.exposure, lift: PRINT.lift, saturation: PRINT.saturation, shoulder: STATION_SHOULDER.hall ?? 0 }
if (HALL_PRINT.shoulder !== 1) throw new Error('The hall paintings invert a print on the full Neutral shoulder')
const PRINT_FLOOR = .0021
function unprintNode(colour: N, value: number): N {
  const encoded: N = (sRGBTransferOETF as N)(clamp(colour, 0, 1))
  const aim: N = max((sRGBTransferEOTF as N)(encoded.mul(value)), vec3(PRINT_FLOOR))
  // Neutral's toe: out = c - (x - 6.25 x^2), x the smallest channel, under x 0.08; so x = 0.4 sqrt(smallest out)
  const m = min(aim.x, min(aim.y, aim.z)), x = sqrt(m).mul(.4)
  const neutral = aim.add(select(m.lessThan(.04), x.sub(m), float(.04))) as N
  const s = HALL_PRINT.saturation, grey = luminance(neutral)
  const sat = neutral.sub(grey.mul(1 - s)).div(s) as N
  const lift = vec3(...HALL_PRINT.lift), liftL = luminance(lift)
  const before = luminance(sat).sub(liftL).div(float(1).sub(liftL))
  const lifted = sat.sub(lift.mul(clamp(float(1).sub(before), 0, 1)))
  return max(lifted, vec3(0)).div(HALL_PRINT.exposure) as N
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
 * foot, three thin cusps opening and shutting once in a beat. (The grass
 * seeds he planned for the flow read as specks at the look's distance, so
 * none are drawn: SEED_COUNT.)
 * Its oak foot is the hall's (`house-hall.ts`). Drawn in the room's light at
 * the stand, `light`: the glass clear in the middle and catching the room at
 * its edges, as glass does, never lit from outside the hall.
 * Local metres, y up, the foot's underside at 0. */
const ROOT = { foot: .028, low: .1, sinus: .13, junction: .17, top: .22, tube: .034, bulge: .058 } as const
const BEAT_S = 2.6
const SEED_COUNT = 0
/** the cusps' grid and the half thickness of a leaf, local metres */
const CUSP_I = 24, CUSP_J = 12, CUSP_HALF = .0011
/** a demonstration size, small enough to stand whole under its sheet in the valve's look */
const MODEL_SCALE = 1.25
function rootRadius(y: number, angle: number): number {
  const lobe = Math.max(0, Math.cos(3 * angle)) ** 1.5
  const swell = y < ROOT.low ? 0 : y > ROOT.junction ? 0 : Math.sin(Math.PI * (y - ROOT.low) / (ROOT.junction - ROOT.low))
  return ROOT.tube + (ROOT.bulge - ROOT.tube) * swell * (.55 + .45 * lobe)
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
function glassValve(light: V3): { group: Group; beat(t: number): void } {
  const group = new Group()
  group.name = 'vinci/house-hall/glass-valve'
  const room = vec3(...light)
  // a pane's share of the room it mirrors grows toward a grazing view
  const edge = float(1).sub(normalView.dot(positionViewDirection.negate()).abs()).pow(2.5)
  const glass = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
  // the room's window as one narrow streak along the jar's axis on its near
  // curve: read from the normal's turn about the axis only, so a bulb draws a
  // line and never a round spot; faded where the wall turns toward the axis
  // (a basic material: the room's light, never a lamp)
  const nv = normalView.mul(faceDirection)
  const around = vec3(nv.x, 0, nv.z).normalize().dot(vec3(.45, 0, .89).normalize())
  const streak = smoothstep(.992, .999, around).mul(smoothstep(.6, .25, nv.y.abs())).mul(.8)
  glass.colorNode = mix(mix(vec3(.62, .66, .64), vec3(.86, .9, .88), edge).mul(room), vec3(1, .98, .95).mul(room.mul(2.6)), streak.clamp(0, 1))
  glass.opacityNode = mix(float(.05), float(.6), edge).max(streak.clamp(0, 1).mul(.55))
  const water = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  water.colorNode = vec3(.55, .62, .6).mul(room)
  water.opacityNode = mix(float(.04), float(.16), edge)
  const cusp = new MeshBasicNodeMaterial({ transparent: true, opacity: .9, side: DoubleSide })
  // shaded by hand in the room's light, so each leaf's belly and curl read: a
  // wrapped fall-off from above the eye's side, the underside a step darker
  const lam = normalWorld.mul(faceDirection).dot(vec3(-.3, .82, .48).normalize()).mul(.5).add(.5)
  cusp.colorNode = vec3(.62, .55, .42).mul(room).mul(lam.mul(lam).mul(.95).add(.42))
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
  // the three cusps, hung from the root's wall along their arcs: each a leaf
  // with a thickness, its two faces and its free edge's strip
  const I = CUSP_I, J = CUSP_J, NV = (I + 1) * (J + 1), cusps: BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const g = new BufferGeometry(), ci: number[] = []
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array((2 * NV + 2 * (I + 1)) * 3), 3))
    g.setAttribute('normal', new Float32BufferAttribute(new Float32Array((2 * NV + 2 * (I + 1)) * 3), 3))
    for (const off of [0, NV]) for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) {
      const q = off + j * (I + 1) + i
      if (off) ci.push(q, q + 1, q + I + 1, q + 1, q + I + 2, q + I + 1); else ci.push(q, q + I + 1, q + 1, q + 1, q + I + 1, q + I + 2)
    }
    const e0 = 2 * NV
    for (let i = 0; i < I; i++) ci.push(e0 + i, e0 + I + 1 + i, e0 + i + 1, e0 + i + 1, e0 + I + 1 + i, e0 + I + 2 + i)
    g.setIndex(ci)
    cusps.push(g)
    group.add(new Mesh(g, cusp))
  }
  // the seeds, turning in the sinuses behind the cusps
  const seeds: { mesh: Mesh; lobe: number; phase: number; r: number; y: number }[] = []
  const seedGeo = new SphereGeometry(.0022, 6, 4).scale(1, .45, .45)
  for (let n = 0; n < SEED_COUNT; n++) {
    const mesh = new Mesh(seedGeo, seedMat)
    seeds.push({ mesh, lobe: n % 3, phase: (n * 2.399) % (Math.PI * 2), r: .006 + (n % 4) * .002, y: ROOT.low + .02 + (n % 5) * .007 })
    group.add(mesh)
  }
  const beat = (t: number): void => {
    // shut through most of the beat, a quick opening as the flow passes
    const phase = (t / BEAT_S) % 1, open = phase < .38 ? Math.sin(Math.PI * phase / .38) : 0
    const mids = new Float32Array(NV * 3)
    const P = (i: number, j: number): [number, number, number] => { const q = 3 * (j * (I + 1) + i); return [mids[q]!, mids[q + 1]!, mids[q + 2]!] }
    for (let k = 0; k < 3; k++) {
      const at = cusps[k]!.getAttribute('position') as Float32BufferAttribute, nm = cusps[k]!.getAttribute('normal') as Float32BufferAttribute
      const mid = Math.PI / 3 + k * 2 * Math.PI / 3
      for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
        const s = i / I - .5, t2 = j / J, a = mid + s * 2 * Math.PI / 3 * .97
        const wall = rootRadius(ROOT.low, a) * .985
        // the attachment rises toward the commissures; the free edge reaches the
        // middle when shut and lies back along the wall when open; the leaf's
        // belly sags between them while it is shut
        // (shut, the free edges stop 2 % of the radius short of the middle, so the
        // three thick leaves meet edge to edge and never pass through each other)
        const reach = .95 - .76 * open
        const r = wall * (1 - t2 * reach * (1 - .25 * Math.abs(s) * 2))
        const y = ROOT.low + .028 * (2 * Math.abs(s)) ** 2 * (1 - t2) + t2 * (.008 + .03 * open) - .009 * Math.sin(Math.PI * t2) * Math.cos(Math.PI * s) * (1 - .6 * open)
        mids.set([Math.cos(a) * r, y, Math.sin(a) * r], 3 * (j * (I + 1) + i))
      }
      // each face offset by the leaf's half thickness along the mid surface's normal
      for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
        const du = sub3(P(Math.min(i + 1, I), j), P(Math.max(i - 1, 0), j)), dv = sub3(P(i, Math.min(j + 1, J)), P(i, Math.max(j - 1, 0)))
        // (the leaf thins toward its free edge, as a cusp does)
        const n = norm3(cross3(dv, du)), p = P(i, j), q = j * (I + 1) + i, half = CUSP_HALF * (1 - .55 * j / J)
        at.setXYZ(q, p[0] + n[0] * half, p[1] + n[1] * half, p[2] + n[2] * half); nm.setXYZ(q, n[0], n[1], n[2])
        at.setXYZ(NV + q, p[0] - n[0] * half, p[1] - n[1] * half, p[2] - n[2] * half); nm.setXYZ(NV + q, -n[0], -n[1], -n[2])
        if (j === J) {
          const o = norm3(sub3(P(i, J), P(i, J - 1)))
          at.setXYZ(2 * NV + i, p[0] + n[0] * half, p[1] + n[1] * half, p[2] + n[2] * half); nm.setXYZ(2 * NV + i, o[0], o[1], o[2])
          at.setXYZ(2 * NV + I + 1 + i, p[0] - n[0] * half, p[1] - n[1] * half, p[2] - n[2] * half); nm.setXYZ(2 * NV + I + 1 + i, o[0], o[1], o[2])
        }
      }
      at.needsUpdate = true; nm.needsUpdate = true
      cusps[k]!.computeBoundingSphere()
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

/** The film shows the hall's plates by the film's own rule (`film-plates.ts`), not the one live slot: the slot
 * raised whichever plate stood nearest the eye, often a neighbour of the sheet a close look reads. */
export interface HallFilm { stageHeight: () => number }

export function mountHallPlates(host: Group, plates: readonly HallPlate[], hero: boolean, valveAt?: V3, valveLight: V3 = [.3, .25, .2], film: HallFilm | null = null): HallPlates {
  const group = new Group()
  group.name = 'vinci/house-hall/plates'
  host.add(group)
  const model = valveAt ? glassValve(valveLight) : null
  if (model && valveAt) { model.group.position.copy(world(valveAt)); model.group.scale.setScalar(MODEL_SCALE); group.add(model.group) }
  const placed: { plate: HallPlate; stream: PlateStream; at: Vector3; mesh: Mesh; halfW: number; halfH: number; texels: [number, number] }[] = []
  let loading = true, raised: PlateStream | null = null, switching = false, last = performance.now()
  const ready = loadManifest().then(manifest => {
    const sheets = new Map(bodySheetSources(manifest).map(source => [source.sheet.id, source]))
    for (const plate of plates) {
      let stream: PlateStream, geometry: PlaneGeometry, texels: [number, number] = [1, 1]
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
        if (plate.value !== undefined) stream.material.colorNode = unprintNode(stream.material.colorNode as N, plate.value)
        geometry = new PlaneGeometry(size.widthM, size.heightM)
        if (window) {
          const uv = geometry.getAttribute('uv')
          for (let i = 0; i < uv.count; i++) uv.setXY(i, window.offsetU + uv.getX(i) * window.scaleU, window.offsetV + uv.getY(i) * window.scaleV)
          uv.needsUpdate = true
          texels = [window.scaleU, window.scaleV]
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
      const size = geometry.parameters
      placed.push({ plate, stream, at: world(plate.centre), mesh, halfW: size.width / 2, halfH: size.height / 2, texels })
    }
    group.updateMatrixWorld(true)
    return Promise.all(placed.map(p => p.stream.ready)).then(() => { if (film) void holdForFilm() })
  }).catch(() => undefined).finally(() => { loading = false })
  /** Four decodes at a time, counted in `pending` while they run. */
  async function holdForFilm(): Promise<void> {
    const queue = [...placed]
    const worker = async (): Promise<void> => { for (let p = queue.shift(); p; p = queue.shift()) await p.stream.filmHold() }
    await Promise.all([worker(), worker(), worker(), worker()])
  }
  const eyeAt = new Vector3(), faceAt = new Vector3(), rightAt = new Vector3(), upAt = new Vector3()
  /** THE FILM'S RULE: a plate whose preview texel would take more than the cap of a pixel shows its full raster in
   * this very frame, every other its preview; a pure function of where the eye stands. */
  function filmNear(eye: V3, rule: HallFilm): void {
    const stageHeight = rule.stageHeight()
    const at = world(eye)
    eyeAt.copy(at)
    for (const p of placed) {
      const upload = p.stream.residency().previewUpload
      if (!upload) continue
      const m = p.mesh.matrixWorld
      faceAt.setFromMatrixPosition(m)
      rightAt.setFromMatrixColumn(m, 0).normalize()
      upAt.setFromMatrixColumn(m, 1).normalize()
      const d = cardDistance([eyeAt.x, eyeAt.y, eyeAt.z], [faceAt.x, faceAt.y, faceAt.z], [rightAt.x, rightAt.y, rightAt.z], [upAt.x, upAt.y, upAt.z], p.halfW, p.halfH)
      const pitch = previewPitch(2 * p.halfW, 2 * p.halfH, upload.width * p.texels[0], upload.height * p.texels[1])
      p.stream.filmShow(d !== null && d < filmReachMetres(pitch, stageHeight))
    }
  }
  return {
    ready,
    tick(eye) {
      const now = performance.now(), dt = Math.min(.1, (now - last) / 1000)
      last = now
      model?.beat(now / 1000)
      for (const p of placed) p.stream.update(dt)
      if (film) { if (!loading) filmNear(eye, film); return }
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
