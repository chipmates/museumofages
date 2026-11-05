/* THE FRESH TABLET ON THE TURNTABLE: a cushion of unfired clay, the stylus beside it as a plain tool (ours, grey as
   our measures are), the 10 cm ruler in front. Its written face is a fine grid that the press field moves: each press
   sinks the next wedge of KÁ.DINGIR.RA.KI as the cutter's tetrahedral pit with its slight lip, and only the vertices
   round the wedge that moved are worked again. A faint pencil outline on the clay shows where the next wedge goes; a
   finished sign is lit faintly by its own clay (a lift of the face round it, no added light), until the next press.
   The run's clock counts wedges (`clay-data.ts` PACE), so the filmed cycle is recorded from this same piece. No hand. */
import {
  BufferAttribute, BufferGeometry, BoxGeometry, DataTexture, DoubleSide, FloatType, Group, LinearFilter, Mesh,
  MeshBasicNodeMaterial, RGBAFormat, Vector3, Vector4, type Object3D,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { buildBlock, facePoint, samples, type FaceSpec, type Wear } from '../objects/block'
import { wedgeTris, type FaceWedge } from '../objects/inscription'
import { clayMaterial, pencilMaterial } from '../objects/stuff'
import { FACING, layRuler, ruler } from '../objects/objects'
import type { TurntableBody, TurntableStep } from '../../vitrine/turntable'
import { finished, layout, LINE, period, presses, pressState, TABLET, type ClaySignFile, type Press } from './clay-data'
import { pressField, type Rect } from './clay-press'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { float, texture, uniform, uv, vec4 } = T

/** THE FACE'S GRIDS (mm): the press field's step, the written strip's vertex step, the plain faces' step */
export const GRID = Object.freeze({ field: 0.1, strip: 0.2, plain: 2 })
/** THE CUSHION: how far the face falls from its flat middle to its rim (mm), the smoothing's ripple (mm) */
const CUSHION = Object.freeze({ fall: 0.9, ripple: 0.035, pores: 0.012 })
/** THE GHOST: its pencil line's width and its lift off the clay (mm), its strength */
const GHOST = Object.freeze({ width: 0.2, lift: 0.12, alpha: 0.6, seg: 0.5 })
/** THE FINISHED SIGN'S LIGHT: the lift of its clay round its wedges, how far round them (mm), how fast it comes (s) */
const LIT = Object.freeze({ lift: 0.05, reach: 0.9, ease: 0.5 })
/** THE STYLUS (metres): length, its back's width and its tip's, its height; the tip's slant (share of the width) */
const STYLUS = Object.freeze({ length: 0.105, back: 0.0075, tip: 0.0055, height: 0.006, slant: 0.35 })

/** a smooth value noise of the face's own mm, about 0, for the hand's smoothing */
function ripple(seed: number): (u: number, v: number, f: number) => number {
  const h = (i: number, j: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
    return s - Math.floor(s)
  }
  return (u, v, f) => {
    const x = u * f, y = v * f, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1)
    return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) - 0.5
  }
}

export interface ClayBody {
  body: TurntableBody
  /** the run's period (s): one second a wedge, then the name held */
  period: number
  total: number
  wedges: readonly Press[]
  /** the clock the body was last posed at (s, one a wedge) */
  clock(): number
  /** the run's named steps: fresh clay, then each sign at its last wedge; they name no part (a tap names a sign) */
  steps(text: readonly string[]): TurntableStep[]
  /** the hidden target of each sign, in the edition's order */
  signParts: readonly string[]
  /** the signs finished at the clock as it stands, in the edition's order */
  finishedSigns(): number[]
  /** the sign finished at this moment (lit), or null */
  lit(): number | null
  /** the vertices worked at the last press (for the frame-time read) */
  worked(): number
}

export function clayBody(file: ClaySignFile): ClayBody {
  const [sx, sy, sz] = TABLET.size
  const lu = sx * 1000, lv = sz * 1000
  const placed = layout(file, [lu, lv])
  const wedges = presses(placed)
  const field = pressField(wedges, LINE.depth, GRID.field)
  const fine = { u: [field.u0, field.u0 + (field.nu - 1) * field.step] as [number, number],
    v: [field.v0, field.v0 + (field.nv - 1) * field.step] as [number, number], step: GRID.strip }
  const g = ripple(3)
  /** THE CUSHION AND THE HAND'S SMOOTHING as one field of the body (mm in at a point, metres): the face flat in its
   *  middle and falling toward its rim, the back the same, the sides rippled; shared, so the faces' joins stay shut */
  const wear: Wear = (q) => {
    const a = q.x / (sx / 2), b = q.z / (sz / 2), up = Math.abs(q.y) / (sy / 2)
    const fall = CUSHION.fall * (0.55 * Math.min(1, a * a) ** 2 + 0.45 * Math.min(1, b * b) ** 2) * up * up
    const mm = [q.x * 1000, q.y * 1000, q.z * 1000] as const
    // the hand's strokes run along the tablet's length; the clay's own fine pits are a few tenths of a millimetre
    return fall + CUSHION.ripple * (g(mm[0] + mm[1] * 0.7, mm[2], 0.08) * 2 + g(mm[0] * 0.25 + 50, mm[2] * 1.6 + mm[1] * 0.7, 0.5))
      + CUSHION.pores * (g(mm[0] * 3 + mm[1], mm[2] * 3, 1.1) + g(mm[0] * 7, mm[2] * 7 + mm[1], 1.3) * 0.6)
  }
  /** the fresh face's own depth at a face point (mm), as the wear lays it */
  const surface = (u: number, v: number): number => wear(facePoint(top, new Vector3(sx, sy, sz), u, v))
  const top: FaceSpec = { axis: '+y', u: '+x', v: '+z', step: GRID.plain, fine, name: 'clay:tablet-face' }
  const plainFace = (axis: FaceSpec['axis'], u: FaceSpec['u'], v: FaceSpec['v'], name: string): FaceSpec => ({ axis, u, v, step: GRID.plain, name })
  const faces: FaceSpec[] = [top, plainFace('-y', '+x', '-z', 'clay:tablet-back'),
    plainFace('+x', '-z', '-y', 'clay:tablet-side-e'), plainFace('-x', '+z', '-y', 'clay:tablet-side-w'),
    plainFace('+z', '+x', '-y', 'clay:tablet-side-s'), plainFace('-z', '-x', '-y', 'clay:tablet-side-n')]

  // THE FINISHED SIGN'S MASK over the whole face: one channel per sign, how near its wedges each texel stands
  const MW = Math.round(lu / 0.25), MH = Math.round(lv / 0.25)
  const mask = new Float32Array(MW * MH * 4)
  placed.forEach((p, s) => {
    const tris = wedges.filter(w => w.signIndex === s).flatMap(w => wedgeTris(w, LINE.depth))
    const i0 = Math.max(0, Math.floor((p.box.u0 - LIT.reach * 2) / 0.25)), i1 = Math.min(MW - 1, Math.ceil((p.box.u1 + LIT.reach * 2) / 0.25))
    const j0 = Math.max(0, Math.floor((p.box.v0 - LIT.reach * 2) / 0.25)), j1 = Math.min(MH - 1, Math.ceil((p.box.v1 + LIT.reach * 2) / 0.25))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const u = (i + 0.5) * 0.25, v = (j + 0.5) * 0.25
      let near = Infinity
      for (const t of tris) near = Math.min(near, Math.hypot(u - (t.ax + t.bx + t.cx) / 3, v - (t.ay + t.by + t.cy) / 3) - Math.max(Math.hypot(t.ax - t.cx, t.ay - t.cy), Math.hypot(t.bx - t.cx, t.by - t.cy)) / 2)
      const k = Math.max(0, Math.min(1, 1 - near / LIT.reach))
      // the face's uv runs as read (v down from its top), and so do the texture's rows
      mask[(j * MW + i) * 4 + s] = k * k * (3 - 2 * k)
    }
  })
  const maskTex = new DataTexture(mask, MW, MH, RGBAFormat, FloatType)
  maskTex.magFilter = LinearFilter; maskTex.minFilter = LinearFilter
  maskTex.needsUpdate = true
  const litLevel = uniform(new Vector4(0, 0, 0, 0))
  const clay = clayMaterial({ fresh: true })
  const lift = texture(maskTex, uv()).dot(litLevel)
  clay.colorNode = (clay.colorNode as N).mul(float(1).add(lift.mul(LIT.lift)))
  const plain = clayMaterial({ fresh: true })
  const block = buildBlock([sx, sy, sz], TABLET.round, faces, f => (f.name === top.name ? clay : plain), wear)
  const face = block.faces.get(top.name)!
  const geo = face.geometry
  const pos = geo.getAttribute('position') as BufferAttribute, nor = geo.getAttribute('normal') as BufferAttribute
  const base = (pos.array as Float32Array).slice(), out = (nor.array as Float32Array).slice()
  const us = samples(lu, top.step, TABLET.round * 1000, fine.u, fine.step)
  const vs = samples(lv, top.step, TABLET.round * 1000, fine.v, fine.step)
  const nu = us.length
  if (nu * vs.length !== pos.count) throw new Error(`clay: the face's grid ${nu} x ${vs.length} against ${pos.count} vertices`)
  const firstAt = (list: number[], x: number): number => { let lo = 0, hi = list.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]! < x) lo = m + 1; else hi = m } return lo }
  let worked = 0
  const p = new Vector3(), a = new Vector3(), b = new Vector3(), n = new Vector3()
  /** the face's vertices over a rect of the field (texels) moved to the field's height, their normals from the grid */
  function work(rect: Rect): void {
    const ua = field.u0 + rect.i0 * field.step, ub = field.u0 + rect.i1 * field.step
    const va = field.v0 + rect.j0 * field.step, vb = field.v0 + rect.j1 * field.step
    const i0 = Math.max(1, firstAt(us, ua) - 1), i1 = Math.min(nu - 2, firstAt(us, ub) + 1)
    const j0 = Math.max(1, firstAt(vs, va) - 1), j1 = Math.min(vs.length - 2, firstAt(vs, vb) + 1)
    const P = pos.array as Float32Array, Nn = nor.array as Float32Array
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nu + i, d = field.depthAt(us[i]!, vs[j]!) / 1000
      P[k * 3] = base[k * 3]! - out[k * 3]! * d
      P[k * 3 + 1] = base[k * 3 + 1]! - out[k * 3 + 1]! * d
      P[k * 3 + 2] = base[k * 3 + 2]! - out[k * 3 + 2]! * d
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nu + i
      a.set(P[(k + 1) * 3]! - P[(k - 1) * 3]!, P[(k + 1) * 3 + 1]! - P[(k - 1) * 3 + 1]!, P[(k + 1) * 3 + 2]! - P[(k - 1) * 3 + 2]!)
      b.set(P[(k + nu) * 3]! - P[(k - nu) * 3]!, P[(k + nu) * 3 + 1]! - P[(k - nu) * 3 + 1]!, P[(k + nu) * 3 + 2]! - P[(k - nu) * 3 + 2]!)
      n.crossVectors(b, a).normalize()
      p.set(out[k * 3]!, out[k * 3 + 1]!, out[k * 3 + 2]!)
      if (n.dot(p) < 0) n.negate()
      Nn[k * 3] = n.x; Nn[k * 3 + 1] = n.y; Nn[k * 3 + 2] = n.z
    }
    const from = (j0 - 1) * nu * 3, count = (j1 - j0 + 3) * nu * 3
    pos.clearUpdateRanges(); nor.clearUpdateRanges()
    pos.addUpdateRange(from, count); nor.addUpdateRange(from, count)
    pos.needsUpdate = true; nor.needsUpdate = true
    worked = (j1 - j0 + 1) * (i1 - i0 + 1)
  }

  // THE GHOST: the next wedge's outline in pencil, laid on the clay as it stands
  const ghostMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
  ghostMat.colorNode = T['vec3'](0.16)
  const ghostAlpha = uniform(GHOST.alpha)
  ghostMat.opacityNode = ghostAlpha
  const ghost = new Mesh(new BufferGeometry(), ghostMat)
  ghost.name = 'clay:ghost'
  ghost.userData['vitrineOverlay'] = true
  ghost.renderOrder = 5
  ghost.frustumCulled = false
  let ghostFor = -1
  const onFace = (u: number, v: number, lift: number): Vector3 =>
    facePoint(top, block.size, u, v).addScaledVector(new Vector3(0, 1, 0), (lift - surface(u, v) - field.depthAt(u, v)) / 1000)
  function layGhost(index: number): void {
    if (index === ghostFor) return
    ghostFor = index
    ghost.geometry.dispose()
    if (index < 0 || index >= wedges.length) { ghost.geometry = new BufferGeometry(); ghost.visible = false; return }
    const tris = wedgeTris(wedges[index] as FaceWedge, LINE.depth)
    const pts: number[] = []
    for (const t of tris) {
      const corners: Array<[number, number]> = [[t.ax, t.ay], [t.bx, t.by], [t.cx, t.cy]]
      for (let e = 0; e < 3; e++) {
        const [x1, y1] = corners[e]!, [x2, y2] = corners[(e + 1) % 3]!
        const len = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.ceil(len / GHOST.seg))
        const ox = -(y2 - y1) / len * GHOST.width / 2, oy = (x2 - x1) / len * GHOST.width / 2
        for (let s = 0; s < steps; s++) {
          const k0 = s / steps, k1 = (s + 1) / steps
          const q = [[x1 + (x2 - x1) * k0, y1 + (y2 - y1) * k0], [x1 + (x2 - x1) * k1, y1 + (y2 - y1) * k1]] as const
          const c = [onFace(q[0][0] + ox, q[0][1] + oy, GHOST.lift), onFace(q[0][0] - ox, q[0][1] - oy, GHOST.lift),
            onFace(q[1][0] + ox, q[1][1] + oy, GHOST.lift), onFace(q[1][0] - ox, q[1][1] - oy, GHOST.lift)]
          for (const v of [c[0], c[1], c[2], c[1], c[3], c[2]]) pts.push(v!.x, v!.y, v!.z)
        }
      }
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    ghost.geometry = geom
    ghost.visible = true
  }

  // HIDDEN TARGETS: each sign's box on the face for a tap, and the line's for the eye
  const target = (name: string, u0: number, u1: number, v0: number, v1: number): Mesh => {
    const m = new MeshBasicNodeMaterial(); m.visible = false
    const mesh = new Mesh(new BoxGeometry((u1 - u0) / 1000, 0.003, (v1 - v0) / 1000), m)
    mesh.position.copy(facePoint(top, block.size, (u0 + u1) / 2, (v0 + v1) / 2))
    mesh.name = name
    mesh.userData['vitrineTarget'] = true
    return mesh
  }
  const signParts = placed.map((_, i) => `clay:sign-${i + 1}`)
  const tablet = new Group()
  tablet.add(block.group, ghost)
  placed.forEach((pl, i) => { const m = target(signParts[i]!, pl.box.u0 - 1, pl.box.u1 + 1, pl.box.v0 - 1.5, pl.box.v1 + 1.5); m.visible = false; tablet.add(m) })
  tablet.position.y = sy / 2

  // THE STYLUS beside the tablet, lying on the floor, its cut tip toward the tablet's foot
  const stylus = stylusMesh()
  stylus.position.set(sx / 2 + 0.018, STYLUS.height / 2, -0.004)
  const turn = new Group(), root = new Group()
  turn.add(tablet, stylus)
  turn.rotation.y = FACING
  const r = ruler()
  layRuler(r, -sx / 2, sz / 2 + 0.022)
  root.add(turn, r)
  root.name = 'clay:root'

  const total = wedges.length, P = period(total)
  let posed = 0, shown = { done: -1, sink: -1 }, litSign: number | null = null
  const litNow = [0, 0, 0, 0]
  function show(clock: number): void {
    const { done, sink } = pressState(clock % P, total)
    if (done !== shown.done || sink !== shown.sink) {
      const rect = field.set(done, sink)
      if (rect) work(rect)
      shown = { done, sink }
    }
    layGhost(done < total ? done : -1)
    ghostAlpha.value = GHOST.alpha * (1 - Math.min(1, sink * 1.6))
    litSign = finished(done, wedges).just
  }
  function animate(clock: number, dt: number): void {
    posed = clock
    show(clock)
    // the finished sign's light comes over half a second and goes the same way at the next press; a pose sets it
    for (let s = 0; s < 4; s++) {
      const want = litSign === s ? 1 : 0
      litNow[s] = dt > 0 ? litNow[s]! + Math.sign(want - litNow[s]!) * Math.min(Math.abs(want - litNow[s]!), dt / LIT.ease) : want
    }
    ;(litLevel.value as Vector4).set(litNow[0]!, litNow[1]!, litNow[2]!, litNow[3]!)
  }
  show(0)
  const part = (id: string): { node: Object3D; geometry: BufferGeometry } | null => {
    const m = tablet.getObjectByName(id) as Mesh | undefined
    return m ? { node: m, geometry: m.geometry } : null
  }
  const ends = placed.map((_, s) => wedges.filter(w => w.signIndex === s).at(-1)!.order + 1)
  return {
    body: { object: root, ready: Promise.resolve(), animate, part },
    period: P, total, wedges, signParts,
    clock: () => posed,
    steps: (text) => [0, ...ends].map((at, k) => ({ at: at / P, part: '', text: text[k] ?? '', certainty: 'documented' })),
    finishedSigns: () => finished(pressState(posed % P, total).done, wedges).signs,
    lit: () => litSign,
    worked: () => worked,
  }
}

/** a plain tool: a tapered bar of square section, its tip cut square across with a slight slant */
function stylusMesh(): Mesh {
  const { length: L, back: B, tip: W, height: H, slant } = STYLUS
  const geom = new BoxGeometry(B, H, L)
  const at = geom.getAttribute('position') as BufferAttribute
  for (let k = 0; k < at.count; k++) {
    if (at.getZ(k) <= 0) continue
    at.setX(k, at.getX(k) * W / B)
    // the tip's top edge stands back of its bottom edge by the slant
    if (at.getY(k) > 0) at.setZ(k, at.getZ(k) - W * slant)
  }
  geom.computeVertexNormals()
  const mesh = new Mesh(geom, pencilMaterial())
  mesh.name = 'clay:stylus'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
