/* FEATURE 1'S THINGS, HIDDEN WORDS: a common baked brick with the king's six-line stamp on the face it lay on, a white
   limestone slab with his words on one edge, and a red breccia slab with his words on its edge and an older king's
   name underneath. Each stands for its type: one brick, one slab of each stone, their signs drawn wedge by wedge
   from the editions' hand copies (signs/*.json). Each is a body for the vitrine's turntable: its turn as the beats
   name it, played by a clock the visitor's hand can hold, beside a 10 cm ruler in the walk's grey. The words of the
   band belong to the feature's own round: the beats here carry keys, never sentences. */
import { BoxGeometry, Group, Mesh, MeshBasicNodeMaterial, Object3D, Vector3, Box3, type BufferGeometry } from 'three/webgpu'
import type { TurntableBody, TurntableStep, TurntableViewpoint } from '../../vitrine/turntable'
import { buildBlock, type Wear, facePoint, type Block, type FaceSpec } from './block'
import { cutField, depthAt, type CutField, type Inscription } from './inscription'
import { brecciaMaterial, clayMaterial, limestoneMaterial, pencilMaterial } from './stuff'
import brickB5 from './signs/brick-b5.json'
import slabA from './signs/slab-limestone-005.json'
import slabN from './signs/slab-breccia-007.json'
import senV from './signs/slab-breccia-sennacherib.json'

export type ObjectId = 'brick' | 'limestone' | 'breccia'

export const INSCRIPTIONS: Record<string, Inscription> = {
  'brick-b5': brickB5 as unknown as Inscription,
  'slab-limestone-005': slabA as unknown as Inscription,
  'slab-breccia-007': slabN as unknown as Inscription,
  'slab-breccia-sennacherib': senV as unknown as Inscription,
}

/** THE RECORD'S ROWS each part shows (pieces.json names the same by the body's name) */
export const RECORD = Object.freeze({
  brick: { body: '', needs: "the king's common baked brick (P2021 p. 20)", text: 'bab.brickstamp' },
  limestone: { body: 'bab.paving.limestone', text: 'bab.paving.inscription' },
  breccia: { body: 'bab.paving.breccia', text: 'bab.paving.inscription', under: '' },
})

/** SIZES, metres: the brick about 33 cm square and 8 cm high (P2021 p. 20, "33 × 33 × 10 cm" with its mortar, a
 *  brick 8 to 10 cm); slab a's edge as K1901 Pl. 1 measures it, its depth the record's 105 cm; the breccia slab the
 *  record's 66 cm square and 20 cm thick */
export const SIZES = Object.freeze({
  brick: [0.33, 0.08, 0.33] as const,
  limestone: [1.07, 0.35, 1.05] as const,
  breccia: [0.66, 0.2, 0.66] as const,
  ruler: [0.1, 0.0025, 0.012] as const,
})

const DEG = Math.PI / 180
/** the whole view's bearing in the turntable (`WHOLE`): the side a body turns to face it */
export const FACING = 35 * DEG

export interface Beat { key: string; at: number }
export interface HiddenObject {
  id: ObjectId
  body: TurntableBody
  /** the clock's period, seconds: one turn and back */
  period: number
  /** the beats, shares of the period, each a key for the feature's band */
  beats: Beat[]
  /** the eye over the run, desktop and phone (the phone's adds the 2 s crop on the signs) */
  runViews: { desk: RunView[]; phone: RunView[] }
  /** the part the crop and the signs' view look at */
  signsPart: string
  credits: string[]
  record: { body: string; text: string; needs?: string; under?: string }
}
export interface RunView { from: number; to: number; view: TurntableViewpoint; yaw: number; pitch: number }

/** a value noise of the face's own mm, for the grain a face carries in its shape (not its colour) */
/** THE WEAR OF HANDLING AND USE: the arrises rounded a little more than the mason left them and, here and there,
 *  chipped; a chip is a shallow scoop a few millimetres to a couple of centimetres long, never a clean bevel.
 *  reach: how far in from an arris a chip runs (mm); deep: the deepest chip (mm); rub: the arris's general rounding */
function arrisWear(size: [number, number, number], reach: number, deep: number, rub: number, seed: number): Wear {
  const half = [size[0] * 500, size[1] * 500, size[2] * 500]
  const h = (i: number, j: number, k: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453
    return s - Math.floor(s)
  }
  const noise = (x: number, y: number, z: number): number => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz)
    const l = (a: number, b: number, t: number): number => a + (b - a) * t
    return l(l(l(h(i, j, k), h(i + 1, j, k), sx), l(h(i, j + 1, k), h(i + 1, j + 1, k), sx), sy),
      l(l(h(i, j, k + 1), h(i + 1, j, k + 1), sx), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), sx), sy), sz)
  }
  return (p) => {
    const x = p.x * 1000, y = p.y * 1000, z = p.z * 1000
    const gaps = [half[0]! - Math.abs(x), half[1]! - Math.abs(y), half[2]! - Math.abs(z)].sort((a, b) => a - b)
    // a point's way to its nearest arris: the second smallest gap (the smallest is the face it stands on)
    const toArris = gaps[1]!
    if (toArris > reach) return 0
    const near = 1 - toArris / reach
    const patch = noise(x / 23, y / 23, z / 23) * 0.6 + noise(x / 6, y / 6, z / 6) * 0.4
    const chip = Math.max(0, (patch - 0.58) / 0.42)
    return near * near * rub + Math.pow(near, 1.6) * Math.min(1, chip * 2.2) * deep
  }
}

function grain(seed: number): (u: number, v: number, scale: number) => number {
  const hash = (i: number, j: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
    return s - Math.floor(s)
  }
  return (u, v, scale) => {
    const x = u / scale, y = v / scale, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy - 0.5
  }
}

const ease = (k: number): number => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t) }
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a))

/** the inscribed area's fine grid on a face, with the cut's own margin */
const fineOf = (ins: Inscription, field: CutField, step: number): FaceSpec['fine'] => ({
  u: [field.u0, field.u0 + (field.nu - 1) * field.step], v: [field.v0, field.v0 + (field.nv - 1) * field.step], step,
})

/** A HIDDEN TARGET for the eye's crop and a tap: a box where the signs stand at the hold, drawn by nothing */
function signsTarget(name: string, box: Box3): Mesh {
  const size = box.getSize(new Vector3()), middle = box.getCenter(new Vector3())
  const geometry: BufferGeometry = new BoxGeometry(Math.max(size.x, 1e-3), Math.max(size.y, 1e-3), Math.max(size.z, 1e-3))
  const material = new MeshBasicNodeMaterial()
  material.visible = false
  const mesh = new Mesh(geometry, material)
  mesh.position.copy(middle)
  mesh.name = name
  mesh.userData['vitrineTarget'] = true
  return mesh
}

/** THE SIGNS' PLACE AT THE HOLD, in the body's own metres: the inscribed area's middle on its face, as the face stands
 *  at the moment the body is posed in, boxed to the area's size for the eye's crop */
function signsAt(root: Object3D, block: Block, faceName: string, ins: Inscription, name: string): Mesh {
  root.updateMatrixWorld(true)
  const mesh = block.faces.get(faceName)!, spec = block.specs.get(faceName)!
  const inv = root.matrixWorld.clone().invert()
  const mid = facePoint(spec, block.size, (ins.area.u[0] + ins.area.u[1]) / 2, (ins.area.v[0] + ins.area.v[1]) / 2)
    .applyMatrix4(mesh.matrixWorld).applyMatrix4(inv)
  const w = (ins.area.u[1] - ins.area.u[0]) / 1000, h = (ins.area.v[1] - ins.area.v[0]) / 1000
  return signsTarget(name, new Box3().setFromCenterAndSize(mid, new Vector3(w, h, 0.004)))
}

/** the 10 cm ruler in the walk's grey: a flat bar, a notch every centimetre, a longer one at 5 and 10 */
function ruler(): Mesh {
  const [x, y, z] = SIZES.ruler
  const notch = (u: number, v: number): number => {
    const cm = u / 10, near = Math.abs(cm - Math.round(cm)) * 10
    const long = Math.round(cm) % 5 === 0 ? 0.62 : 0.38
    return near < 0.35 && v < z * 1000 * long ? 0.45 : 0
  }
  const faces: FaceSpec[] = (['+x', '-x', '+y', '-y', '+z', '-z'] as const).map(axis => ({
    axis, name: `obj:ruler${axis === '+y' ? '' : `-${axis}`}`,
    u: axis === '+x' || axis === '-x' ? '+z' : '+x', v: axis === '+y' || axis === '-y' ? '+z' : '-y', step: 1,
    ...(axis === '+y' ? { depth: notch, fine: { u: [0, 100] as [number, number], v: [0, 12] as [number, number], step: 0.1 } } : {}),
  }))
  const block = buildBlock([x, y, z], 0.0004, faces, pencilMaterial())
  const holder = new Group()
  holder.add(block.group)
  holder.name = 'obj:ruler'
  return holder as unknown as Mesh
}

/** where the ruler lies: on the floor in front of the body as the eye sees it, its left end under the body's left
 *  side, `ahead` metres out from the body's middle (clear of whatever the body sweeps as it turns) */
function layRuler(r: Object3D, left: number, ahead: number): void {
  r.position.set(left + SIZES.ruler[0] / 2, SIZES.ruler[1] / 2, ahead).applyAxisAngle(new Vector3(0, 1, 0), FACING)
  r.rotation.y = FACING
}

/** THE BRICK. It lay stamp-down in the wall (P2021 p. 20): at rest the stamp is underneath; it lifts, turns over and
 *  settles stamp-up while the eye rises over it; back. */
export function brickObject(): HiddenObject {
  const ins = INSCRIPTIONS['brick-b5']!
  const field = cutField(ins, 0.25, 6)
  const [sx, sy, sz] = SIZES.brick
  const g = grain(1)
  const F = ins.field!
  const s = ins.copy.mmPerPx, [ox, oy] = ins.copy.origin
  const stampMid = { u: ((F.rect[0] + F.rect[2]) / 2 - ox) * s, v: ((F.rect[1] + F.rect[3]) / 2 - oy) * s }
  const stampHalf = { u: (F.rect[2] - F.rect[0]) * s / 2 + F.rim, v: (F.rect[3] - F.rect[1]) * s / 2 + F.rim }
  /** the clay's sand-moulded unevenness, quieter inside the stamp, which the stamp pressed flat */
  const clay = (u: number, v: number, inStamp: number): number =>
    (g(u, v, 9) * 0.28 + g(u + 40, v, 2.2) * 0.12 + g(u, v + 70, 0.7) * 0.05) * (1 - 0.75 * inStamp)
  const faces: FaceSpec[] = [
    { axis: '-y', u: '+x', v: '-z', step: 1.5, name: 'obj:brick-stamp', fine: fineOf(ins, field, 0.25),
      depth: (u, v) => {
        const k = Math.max(Math.abs(u - stampMid.u) / stampHalf.u, Math.abs(v - stampMid.v) / stampHalf.v)
        return depthAt(field, u, v) + clay(u, v, k < 1 ? 1 : 0)
      } },
    { axis: '+y', u: '+x', v: '+z', step: 1.5, name: 'obj:brick-bed', depth: (u, v) => clay(u, v, 0) },
    { axis: '+x', u: '-z', v: '-y', step: 1.5, name: 'obj:brick-side-e', depth: (u, v) => clay(u + 500, v, 0) * 0.8 },
    { axis: '-x', u: '+z', v: '-y', step: 1.5, name: 'obj:brick-side-w', depth: (u, v) => clay(u + 900, v, 0) * 0.8 },
    { axis: '+z', u: '+x', v: '-y', step: 1.5, name: 'obj:brick-side-s', depth: (u, v) => clay(u + 1300, v, 0) * 0.8 },
    { axis: '-z', u: '-x', v: '-y', step: 1.5, name: 'obj:brick-side-n', depth: (u, v) => clay(u + 1700, v, 0) * 0.8 },
  ]
  const block = buildBlock([sx, sy, sz], 0.004, faces, clayMaterial(), arrisWear([sx, sy, sz], 12, 5, 1.0, 1))
  const tilt = new Group(), turn = new Group(), root = new Group()
  tilt.add(block.group)
  turn.add(tilt)
  root.add(turn)
  turn.rotation.y = FACING
  root.name = 'obj:brick'
  const r = ruler()
  layRuler(r, -sx / 2, sz / 2 + 0.04)
  root.add(r)
  const period = 16
  const T = { lift: 1.5, over: 2.4, down: 4.6, hold: 5.2, back: 12.5, flat: 15.2 }
  function pose(clock: number): void {
    const t = ((clock % period) + period) % period
    // the turn over, then the turn back: 0 stamp down, 1 stamp up
    const k = t < T.back ? span(t, T.over - 0.4, T.down) : 1 - span(t, T.back + 0.5, T.flat - 0.4)
    const phi = Math.PI * k
    const lift = t < T.back ? Math.sin(Math.PI * span(t, T.lift, T.hold)) : Math.sin(Math.PI * span(t, T.back, T.flat))
    tilt.rotation.x = phi
    const h = (sy / 2) * Math.abs(Math.cos(phi)) + (sz / 2) * Math.abs(Math.sin(phi))
    tilt.position.y = h + lift * 0.05
  }
  pose(0)
  // the signs' place at the hold, for the crop
  pose(8)
  const target = signsAt(root, block, 'obj:brick-stamp', ins, 'obj:brick-signs')
  root.add(target)
  pose(0)
  return {
    id: 'brick', period,
    body: { object: root, ready: Promise.resolve(), animate: (clock) => pose(clock), part: (id) => id === 'obj:brick-signs' ? { node: target, geometry: target.geometry } : null },
    beats: [{ key: 'brick.rest', at: 0 }, { key: 'brick.turn', at: T.lift / period }, { key: 'brick.stamp', at: T.hold / period }, { key: 'brick.back', at: T.back / period }],
    runViews: {
      desk: [{ from: T.down - 0.6, to: T.hold + 0.8, view: 'whole', yaw: FACING, pitch: 62 * DEG },
        { from: 7.4, to: 8.2, view: 'working-part', yaw: FACING, pitch: 62 * DEG }, { from: 10.0, to: 10.8, view: 'whole', yaw: FACING, pitch: 62 * DEG },
        { from: T.back, to: T.flat, view: 'whole', yaw: FACING, pitch: 10 * DEG }],
      phone: [{ from: T.down - 0.6, to: T.hold + 0.8, view: 'whole', yaw: FACING, pitch: 62 * DEG },
        { from: 7.4, to: 8.0, view: 'working-part', yaw: FACING, pitch: 62 * DEG }, { from: 10.0, to: 10.6, view: 'whole', yaw: FACING, pitch: 62 * DEG },
        { from: T.back, to: T.flat, view: 'whole', yaw: FACING, pitch: 10 * DEG }],
    },
    signsPart: 'obj:brick-signs',
    credits: [ins.credit],
    record: { body: RECORD.brick.body, text: RECORD.brick.text, needs: RECORD.brick.needs },
  }
}

/** the face spec of a slab's edge text: fine where the lines are, the stone's dressing elsewhere */
function slabEdge(ins: Inscription, field: CutField, step: number, rough: (u: number, v: number) => number, name: string): FaceSpec {
  return { axis: '+z', u: '+x', v: '-y', step: 3, name, fine: fineOf(ins, field, step), depth: (u, v) => depthAt(field, u, v) + rough(u, v) }
}

/** THE WHITE SLAB. In the street its edge lay against the next slab; here it turns that edge to the eye; back. */
export function limestoneObject(): HiddenObject {
  const ins = INSCRIPTIONS['slab-limestone-005']!
  const field = cutField(ins, 0.6, 8)
  const [sx, sy, sz] = SIZES.limestone
  const g = grain(2)
  const H = sy * 1000
  /** the dressing: the upper part of an edge worked smooth for the joint, below the text left rough (K1901 Pl. 1 a) */
  const dressed = (u: number, v: number, seed: number): number => {
    const low = Math.min(1, Math.max(0, (v / H - 0.79) / 0.08))
    return (g(u + seed, v, 22) * 0.5 + g(u + seed, v, 6) * 0.25) * (0.25 + low * 1.0) + low * (g(u + seed, v, 3) * 1.6 + g(u, v + seed, 11) * 1.4 + 0.9)
  }
  const walked = (u: number, v: number): number => g(u, v, 160) * 0.8 + g(u + 30, v, 35) * 0.25
  const plainEdge = (axis: FaceSpec['axis'], u: FaceSpec['u'], seed: number, name: string): FaceSpec =>
    ({ axis, u, v: '-y', step: 4, name, depth: (a, b) => dressed(a, b, seed) })
  const faces: FaceSpec[] = [
    slabEdge(ins, field, 0.6, (u, v) => dressed(u, v, 0), 'obj:limestone-edge-text'),
    plainEdge('-z', '-x', 300, 'obj:limestone-edge-n'),
    plainEdge('+x', '-z', 600, 'obj:limestone-edge-e'),
    plainEdge('-x', '+z', 900, 'obj:limestone-edge-w'),
    { axis: '+y', u: '+x', v: '+z', step: 6, name: 'obj:limestone-walked', depth: walked },
    { axis: '-y', u: '+x', v: '-z', step: 12, name: 'obj:limestone-bed', depth: (u, v) => g(u, v, 40) * 3 + 1.5 },
  ]
  const top = limestoneMaterial(true), rest = limestoneMaterial(false)
  const block = buildBlock([sx, sy, sz], 0.0025, faces, (face) => face.axis === '+y' ? top : rest, arrisWear([sx, sy, sz], 16, 8, 1.2, 2))
  return slabBody('limestone', block, ins, [sx, sy, sz], 14, {
    beats: (T) => [{ key: 'limestone.rest', at: 0 }, { key: 'limestone.turn', at: T.turn / 14 }, { key: 'limestone.edge', at: T.hold / 14 }, { key: 'limestone.back', at: T.back / 14 }],
  })
}

/** THE RED SLAB. Its edge carries the king's words; it turns over and its underside carries Sennacherib's name. */
export function brecciaObject(): HiddenObject {
  const ins = INSCRIPTIONS['slab-breccia-007']!
  const under = INSCRIPTIONS['slab-breccia-sennacherib']!
  const field = cutField(ins, 0.5, 8)
  const underField = cutField(under, 0.6, 10)
  const [sx, sy, sz] = SIZES.breccia
  const g = grain(3)
  const H = sy * 1000
  const dressed = (u: number, v: number, seed: number): number => {
    const low = Math.min(1, Math.max(0, (v / H - 0.8) / 0.1))
    return (g(u + seed, v, 18) * 0.4 + g(u + seed, v, 5) * 0.2) * (0.3 + low) + low * (g(u + seed, v, 3) * 1.2 + g(u, v + seed, 9) * 1.0 + 0.6)
  }
  const bed = (u: number, v: number): number => g(u, v, 30) * 1.6 + g(u + 9, v, 7) * 0.5 + 0.6
  const faces: FaceSpec[] = [
    slabEdge(ins, field, 0.5, (u, v) => dressed(u, v, 0), 'obj:breccia-edge-text'),
    { axis: '-z', u: '-x', v: '-y', step: 4, name: 'obj:breccia-edge-n', depth: (u, v) => dressed(u, v, 300) },
    { axis: '+x', u: '-z', v: '-y', step: 4, name: 'obj:breccia-edge-e', depth: (u, v) => dressed(u, v, 600) },
    { axis: '-x', u: '+z', v: '-y', step: 4, name: 'obj:breccia-edge-w', depth: (u, v) => dressed(u, v, 900) },
    { axis: '+y', u: '+x', v: '+z', step: 5, name: 'obj:breccia-walked', depth: (u, v) => g(u, v, 120) * 0.6 },
    { axis: '-y', u: '+x', v: '-z', step: 4, name: 'obj:breccia-underside-text', fine: fineOf(under, underField, 0.6),
      depth: (u, v) => depthAt(underField, u, v) + bed(u, v) * 0.5 },
  ]
  const top = brecciaMaterial(true), rest = brecciaMaterial(false)
  const block = buildBlock([sx, sy, sz], 0.002, faces, (face) => face.axis === '+y' ? top : rest, arrisWear([sx, sy, sz], 14, 5, 1.1, 3))
  return slabBody('breccia', block, ins, [sx, sy, sz], 18, { under })
}

/** a slab's run, seconds: the turn begins and ends, the hold, the turn back begins and ends */
interface Times { turn: number; down: number; hold: number; back: number; flat: number }

/** a slab on the table: its turn about the upright (the white slab) or over onto its back edge (the red one) */
function slabBody(id: 'limestone' | 'breccia', block: Block, ins: Inscription, size: [number, number, number], period: number,
  o: { beats?: (T: Times) => Beat[]; under?: Inscription }): HiddenObject {
  const [, sy, sz] = size
  const tilt = new Group(), turn = new Group(), root = new Group()
  tilt.add(block.group)
  turn.add(tilt)
  root.add(turn)
  root.name = `obj:${id}`
  const r = ruler()
  root.add(r)
  const over = id === 'breccia'
  // the white slab: rest edge away, turn to the eye, hold, back; the red slab: edge to the eye, then over to its underside
  const T: Times = over
    ? { turn: 5.2, down: 8.4, hold: 8.8, back: 14.6, flat: 17.4 }
    : { turn: 1.5, down: 5.0, hold: 5.2, back: 11, flat: 13.6 }
  const AWAY = 150 * DEG
  function pose(clock: number): void {
    const t = ((clock % period) + period) % period
    const k = t < T.back ? span(t, T.turn, T.down) : 1 - span(t, T.back, T.flat)
    if (over) {
      const phi = -Math.PI / 2 * k
      tilt.rotation.x = phi
      const lift = Math.sin(Math.PI * k) * 0.04
      tilt.position.y = (sy / 2) * Math.abs(Math.cos(phi)) + (sz / 2) * Math.abs(Math.sin(phi)) + lift
      turn.rotation.y = FACING
    } else {
      tilt.position.y = sy / 2
      turn.rotation.y = FACING + AWAY * (1 - k)
    }
  }
  // the ruler beside the foot at the hold
  // clear of the corners' sweep: the white slab turns about its middle, the red one tips toward the eye
  layRuler(r, -size[0] / 2, over ? size[2] / 2 + 0.06 : Math.hypot(size[0], size[2]) / 2 + 0.05)
  // the signs' place at the hold
  pose(T.hold + 1)
  const target = signsAt(root, block, over ? 'obj:breccia-underside-text' : `obj:${id}-edge-text`, over ? o.under! : ins, `obj:${id}-signs`)
  root.add(target)
  pose(0)
  const beats = o.beats?.(T) ?? [{ key: `${id}.edge`, at: 0 }, { key: `${id}.turn`, at: T.turn / period }, { key: `${id}.under`, at: T.hold / period }, { key: `${id}.back`, at: T.back / period }]
  const credits = [ins.credit, ...(o.under ? [o.under.credit] : [])]
  const crop = T.hold + 2.2
  return {
    id, period,
    body: { object: root, ready: Promise.resolve(), animate: (clock) => pose(clock), part: (pid) => pid === `obj:${id}-signs` ? { node: target, geometry: target.geometry } : null },
    beats,
    runViews: {
      desk: [{ from: crop - 0.6, to: crop, view: 'working-part', yaw: FACING, pitch: 8 * DEG }, { from: crop + 2, to: crop + 2.6, view: 'whole', yaw: FACING, pitch: 10 * DEG }],
      phone: [{ from: crop - 0.6, to: crop, view: 'working-part', yaw: FACING, pitch: 8 * DEG }, { from: crop + 2, to: crop + 2.6, view: 'whole', yaw: FACING, pitch: 10 * DEG }],
    },
    signsPart: `obj:${id}-signs`,
    credits,
    record: over ? { body: RECORD.breccia.body, text: RECORD.breccia.text, under: RECORD.breccia.under } : { body: RECORD.limestone.body, text: RECORD.limestone.text },
  }
}

export function hiddenObject(id: ObjectId): HiddenObject {
  return id === 'brick' ? brickObject() : id === 'limestone' ? limestoneObject() : brecciaObject()
}

export const BEAT_STEPS = (o: HiddenObject, text: (key: string) => string): TurntableStep[] =>
  o.beats.map(b => ({ at: b.at, part: `${o.id}:${b.key}`, text: text(b.key), certainty: 'documented' }))
