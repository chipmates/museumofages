/* THE GATE'S MESHES: the pure lists of `gate-geom.ts` as three geometries.
   Every surface carries the attributes its material reads (the bond's u, the
   distance to a corner that carries the corner stripes, the course parity and
   what kind of wall it is, and its classes for the switch), so one material
   draws every wall and the switch changes only its colour. */

import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, Vector3 } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls, Face, GArch, GBox, GPrism, P2, Panel, Run, Surf, V3 } from './gate-geom'
import type { Field } from './gate-relief'

export const CLS: Record<Cls, number> = { M: 0, R: 1, G: 2, T: 2 }
/** what a surface is, for the material: the gate's glazed wall, a lion wall, plain brick, mud brick, plain glaze, cedar, copper, bronze */
export const KIND = { gate: 0, lion: 1, brick: 2, mud: 3, glaze: 4, cedar: 5, copper: 6, bronze: 7 } as const
const kindOfSurf = (s: Surf): number => (s === 'glaze' ? KIND.gate : s === 'mud' ? KIND.mud : s === 'cedar' ? KIND.cedar : s === 'copper' ? KIND.copper : s === 'bronze' ? KIND.bronze : KIND.brick)

/** per-vertex attributes of one surface piece */
interface Attr { u: number; edge: [number, number]; info: [number, number, number, number]; cls: [number, number, number, number] }

/** a growing triangle soup with the surface attributes */
export class Soup {
  pos: number[] = []
  nrm: number[] = []
  gU: number[] = []
  gEdge: number[] = []
  gInfo: number[] = []
  gCls: number[] = []
  /** where each named body starts (a vertex index), so an offline check can split the merged soup by body */
  marks: Array<{ id: string; from: number }> = []
  mark(id: string): void {
    this.marks.push({ id, from: this.pos.length / 3 })
  }
  tri(a: V3, b: V3, c: V3, n: V3, at: (p: V3) => Attr): void {
    for (const p of [a, b, c]) {
      const t = at(p)
      this.pos.push(...p)
      this.nrm.push(...n)
      this.gU.push(t.u)
      this.gEdge.push(...t.edge)
      this.gInfo.push(...t.info)
      this.gCls.push(...t.cls)
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, at: (p: V3) => Attr): void {
    this.tri(a, b, c, n, at)
    this.tri(a, c, d, n, at)
  }
  /** add a three geometry (non-indexed or indexed) with attributes from its normals */
  add(g: BufferGeometry, at: (p: V3, n: V3) => Attr): void {
    const ng = g.index ? g.toNonIndexed() : g
    const P = ng.getAttribute('position'), N = ng.getAttribute('normal')
    for (let i = 0; i < P.count; i++) {
      const p: V3 = [P.getX(i), P.getY(i), P.getZ(i)], n: V3 = [N.getX(i), N.getY(i), N.getZ(i)]
      const t = at(p, n)
      this.pos.push(...p)
      this.nrm.push(...n)
      this.gU.push(t.u)
      this.gEdge.push(...t.edge)
      this.gInfo.push(...t.info)
      this.gCls.push(...t.cls)
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('gU', new Float32BufferAttribute(this.gU, 1))
    g.setAttribute('gEdge', new Float32BufferAttribute(this.gEdge, 2))
    g.setAttribute('gInfo', new Float32BufferAttribute(this.gInfo, 4))
    g.setAttribute('gCls', new Float32BufferAttribute(this.gCls, 4))
    g.computeBoundingSphere()
    return g
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const UP: V3 = [0, 1, 0]

/** u along a wall from its normal: up x n, anchored in the world so faces on one plane share their bond */
const plainU = (p: V3, n: V3): number => (Math.abs(n[1]) > 0.5 ? p[0] : dot(p, cross(UP, n)))

export function bodyAttr(kind: number, plan: Cls, height: Cls, band: number, rTop = -1, frieze = 0, flag = 0): (p: V3, n: V3) => Attr {
  return (p, n) => ({ u: plainU(p, n), edge: [99, 99], info: [flag, 0, kind, frieze], cls: [CLS[plan], CLS[height], band, rTop] })
}

/** a box with its insets, six faces */
export function addBox(s: Soup, b: GBox, kind = kindOfSurf(b.surf)): void {
  const x0 = b.x0 + (b.inset?.nx ?? 0), x1 = b.x1 - (b.inset?.px ?? 0), z0 = b.z0 + (b.inset?.nz ?? 0), z1 = b.z1 - (b.inset?.pz ?? 0)
  const y0 = b.y0, y1 = b.y1
  const at = bodyAttr(kind, b.plan, b.height, b.band, b.rTop ?? -1)
  const A = (n: V3) => (p: V3) => at(p, n)
  s.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], A([0, 0, 1]))
  s.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], A([0, 0, -1]))
  s.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], A([1, 0, 0]))
  s.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], A([-1, 0, 0]))
  s.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], A([0, 1, 0]))
  s.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], A([0, -1, 0]))
}

/** an upright prism over a polygon (either winding): the shape in (x, -z) extruded up, as the map builds its blocks */
export function addPrism(s: Soup, p: GPrism): void {
  const sh = new Shape()
  sh.moveTo(p.poly[0]![0], -p.poly[0]![1])
  for (const [x, z] of p.poly.slice(1)) sh.lineTo(x, -z)
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: p.y1 - p.y0, bevelEnabled: false, steps: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, p.y0, 0)
  const kind = p.frieze !== undefined ? KIND.lion : kindOfSurf(p.surf)
  s.add(g, bodyAttr(kind, p.plan, p.height, p.band, p.rTop ?? -1, p.frieze ?? 0))
}

/** a wall piece over a door with its semicircular cut, extruded through the wall */
export function addArch(s: Soup, a: GArch): void {
  const sh = new Shape()
  sh.moveTo(a.x0, a.springing)
  sh.lineTo(-a.r, a.springing)
  sh.absarc(0, a.springing, a.r, Math.PI, 0, true)
  sh.lineTo(a.x1, a.springing)
  sh.lineTo(a.x1, a.top)
  sh.lineTo(a.x0, a.top)
  sh.closePath()
  const z0 = a.z0 + (a.inset0 ?? 0)
  const depth = a.z1 - a.inset - z0
  const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 48 })
  g.translate(0, 0, z0)
  s.add(g, bodyAttr(KIND.gate, a.plan, a.height, -99, -1))
}

/* ── glazed skins: a face minus its relief panels' rectangles ── */
export interface PanelBox { u0: number; u1: number; y0: number; y1: number }

export function panelRect(p: Panel, L: number, margin: number, course: number): PanelBox {
  return { u0: p.u0 - margin, u1: p.u0 + L + margin, y0: p.y0 - course, y1: p.y0 + 14 * course }
}

export function faceAttr(f: Face, bandTop: number): (p: V3) => Attr {
  const o = f.origin, d = f.uDir
  const kind = f.kind === 'lion' ? KIND.lion : KIND.gate
  return (p) => {
    const lu = (p[0] - o[0]) * d[0] + (p[2] - o[2]) * d[2]
    const eL = f.convex[0] === null ? 99 : Math.abs(lu - f.convex[0])
    const eR = f.convex[1] === null ? 99 : Math.abs(f.convex[1] - lu)
    return { u: lu + f.uOff, edge: [eL, eR], info: [f.shift, f.borders ? 1 : 0, kind, f.frieze ?? 0], cls: [CLS[f.plan], CLS[f.height], bandTop, f.rTop] }
  }
}

/** a face's flat skin around the panels on it: rectangles between the panels' boxes, or the face with its arch cut */
export function addSkin(s: Soup, f: Face, boxes: PanelBox[], bandTop: number): void {
  const at = faceAttr(f, bandTop)
  const P = (u: number, y: number): V3 => [f.origin[0] + f.uDir[0] * u, y, f.origin[2] + f.uDir[2] * u]
  const n = f.normal
  if (f.arch) {
    const sh = new Shape()
    const cu = f.arch.u - f.uOff
    sh.moveTo(0, f.y0)
    sh.lineTo(cu - f.arch.r, f.y0)
    sh.absarc(cu, f.arch.springing, f.arch.r, Math.PI, 0, true)
    sh.lineTo(f.width, f.y0)
    sh.lineTo(f.width, f.y1)
    sh.lineTo(0, f.y1)
    sh.closePath()
    const pts = sh.extractPoints(48)
    const g = new ExtrudeGeometry(sh, { depth: 0.001, bevelEnabled: false, curveSegments: 48 })
    void pts
    const ni = g.toNonIndexed()
    const PA = ni.getAttribute('position'), NA = ni.getAttribute('normal')
    for (let i = 0; i < PA.count; i += 3) {
      if (NA.getZ(i) < 0.5) continue
      const v = [0, 1, 2].map((k) => P(PA.getX(i + k), PA.getY(i + k)))
      s.tri(v[0]!, v[1]!, v[2]!, n, at)
    }
    return
  }
  // horizontal breaks at the panels' boxes, then the free spans in each strip
  const ys = new Set<number>([f.y0, f.y1])
  for (const b of boxes) { if (b.y0 > f.y0 && b.y0 < f.y1) ys.add(b.y0); if (b.y1 > f.y0 && b.y1 < f.y1) ys.add(b.y1) }
  const ylist = [...ys].sort((a, b) => a - b)
  for (let i = 0; i + 1 < ylist.length; i++) {
    const ya = ylist[i]!, yb = ylist[i + 1]!
    const cut = boxes.filter((b) => b.y0 <= ya + 1e-6 && b.y1 >= yb - 1e-6).map((b) => [Math.max(0, b.u0), Math.min(f.width, b.u1)] as P2).sort((a, b) => a[0] - b[0])
    let from = 0
    const spans: P2[] = []
    for (const [c0, c1] of cut) { if (c0 > from + 1e-6) spans.push([from, c0]); from = Math.max(from, c1) }
    if (from < f.width - 1e-6) spans.push([from, f.width])
    for (const [u0, u1] of spans) s.quad(P(u0, ya), P(u1, ya), P(u1, yb), P(u0, yb), n, at)
  }
}

/** a mirrored copy keeps its normals but must turn its triangles round */
export function flipWinding(g: BufferGeometry): BufferGeometry {
  const ni = g.index ? g.toNonIndexed() : g
  const Q = ni.getAttribute('position'), M = ni.getAttribute('normal')
  for (let i = 0; i < Q.count; i += 3) {
    for (const A of [Q, M]) {
      const x = A.getX(i + 1), y = A.getY(i + 1), z = A.getZ(i + 1)
      A.setXYZ(i + 1, A.getX(i + 2), A.getY(i + 2), A.getZ(i + 2))
      A.setXYZ(i + 2, x, y, z)
    }
  }
  return ni
}

/* ── battlements: stepped merlons along a run, a parapet on the wall's outer edge ── */
export function merlonShape(): Shape {
  // three steps a side, two courses each with a quarter-brick setback, a crown one course high (K1918 p. 45)
  const q = 0.0825, c = 0.086
  const pts: Array<[number, number]> = [[0, 0], [0.825, 0], [0.825, 2 * c], [0.825 - q, 2 * c], [0.825 - q, 4 * c], [0.825 - 2 * q, 4 * c], [0.825 - 2 * q, 6 * c], [0.825 - 3 * q, 6 * c], [0.825 - 3 * q, 7 * c], [3 * q, 7 * c], [3 * q, 6 * c], [2 * q, 6 * c], [2 * q, 4 * c], [q, 4 * c], [q, 2 * c], [0, 2 * c]]
  const s = new Shape()
  s.moveTo(pts[0]![0], pts[0]![1])
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1])
  s.closePath()
  return s
}

export function addRun(s: Soup, r: Run, pitch: number, at: (p: V3, n: V3) => Attr): void {
  const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L = Math.hypot(dx, dz)
  if (L < 0.5) return
  const ux = dx / L, uz = dz / L
  const n = Math.max(1, Math.floor((L + 0.165) / pitch))
  const start = (L - (n * pitch - 0.165)) / 2
  const base = new ExtrudeGeometry(merlonShape(), { depth: r.thick, bevelEnabled: false })
  // the merlon's own frame: x along the run, y up, z inward from the outer edge
  for (let k = 0; k < n; k++) {
    const g = base.clone()
    const u0 = start + k * pitch
    const P = g.getAttribute('position'), N = g.getAttribute('normal')
    for (let i = 0; i < P.count; i++) {
      const lx = P.getX(i) + u0, ly = P.getY(i), lz = P.getZ(i)
      P.setXYZ(i, r.a[0] + ux * lx - r.out[0] * lz, r.y + ly, r.a[1] + uz * lx - r.out[1] * lz)
      const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i)
      N.setXYZ(i, ux * nx - r.out[0] * nz, ny, uz * nx - r.out[1] * nz)
    }
    // a run walked the other way turns its merlons inside out: flip the winding when the frame is mirrored
    // the frame (along, up, inward) is right-handed only when out = (uz, -ux)
    const det = r.out[0] * uz - r.out[1] * ux
    if (det < 0) s.add(flipWinding(g), at)
    else s.add(g, at)
  }
}

/** a guard storey's wall with round loopholes through it */
export function addHoledWall(s: Soup, b: GBox, holes: Array<{ c: V3; n: V3; r: number }>, at: (p: V3, n: V3) => Attr): boolean {
  const mine = holes.filter((h) => h.c[0] >= b.x0 - 0.01 && h.c[0] <= b.x1 + 0.01 && h.c[2] >= b.z0 - 0.01 && h.c[2] <= b.z1 + 0.01 && h.c[1] > b.y0 && h.c[1] < b.y1)
  if (!mine.length) return false
  const n = mine[0]!.n
  const alongX = Math.abs(n[2]) > 0.5
  const x0 = b.x0 + (b.inset?.nx ?? 0), x1 = b.x1 - (b.inset?.px ?? 0), z0 = b.z0 + (b.inset?.nz ?? 0), z1 = b.z1 - (b.inset?.pz ?? 0)
  // the wall in its own plane: a along it, y up; extruded through its thickness
  const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1
  const sh = new Shape()
  sh.moveTo(a0, b.y0)
  sh.lineTo(a1, b.y0)
  sh.lineTo(a1, b.y1)
  sh.lineTo(a0, b.y1)
  sh.closePath()
  for (const h of mine) {
    const p = new Path()
    p.absarc(alongX ? h.c[0] : h.c[2], h.c[1], h.r, 0, Math.PI * 2, false)
    sh.holes.push(p)
  }
  const t0 = alongX ? z0 : x0, t1 = alongX ? z1 : x1
  const g = new ExtrudeGeometry(sh, { depth: t1 - t0, bevelEnabled: false, curveSegments: 24 })
  const P = g.getAttribute('position'), N = g.getAttribute('normal')
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i) + t0
    const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i)
    if (alongX) { P.setXYZ(i, x, y, z); N.setXYZ(i, nx, ny, nz) }
    else { P.setXYZ(i, z, y, x); N.setXYZ(i, nz, ny, nx) }
  }
  s.add(alongX ? g : flipWinding(g), at)
  return true
}

/** an open door leaf: cedar with copper, its outer edge up to the springing, its top following the arch */
export function leafGeometry(w: number, springing: number, thick: number): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(0, 0)
  sh.lineTo(w, 0)
  sh.lineTo(w, springing + w)
  sh.absarc(w, springing, w, Math.PI / 2, Math.PI, false)
  sh.lineTo(0, 0)
  const g = new ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 24 })
  return g
}

/* ── the relief panel grid: one per kind, displaced on the GPU ── */
export function panelGrid(L: number, margin: number, course: number, step = 0.01): BufferGeometry {
  const u0 = -margin, u1 = L + margin, v0 = -course, v1 = 14 * course
  const nu = Math.ceil((u1 - u0) / step), nv = Math.ceil((v1 - v0) / step)
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2)
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv
    const k = j * (nu + 1) + i
    pos.set([u, v, 0], k * 3)
    uv.set([u, v], k * 2)
  }
  const idx: number[] = []
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1
    idx.push(a, b, d, a, d, c)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3))
  g.setIndex(idx)
  return g
}

/** the inflated bronze: an animal's height field pushed out both ways from a middle plane, the outline closed */
export function bronzeGeometry(field: { w: number; h: number; res: number; height: Float32Array; detail: Float32Array; L: number }, thick: number, step = 0.012): BufferGeometry {
  const nu = Math.ceil(field.L / step), nv = Math.ceil((field.h * field.res) / step)
  const sample = (u: number, v: number): number => {
    const i = Math.min(field.w - 1, Math.max(0, Math.round(u / field.res))), j = Math.min(field.h - 1, Math.max(0, Math.round(v / field.res)))
    return field.height[j * field.w + i]! + field.detail[j * field.w + i]!
  }
  const hMax = 0.05
  const sides: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const pos: number[] = []
    const z = (u: number, v: number): number => { const h = sample(u, v); return h > 0 ? side * (thick * Math.pow(Math.min(1, h / hMax), 0.7)) : 0 }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const ua = i * step, ub = (i + 1) * step, va = j * step, vb = (j + 1) * step
      const hs = [sample(ua, va), sample(ub, va), sample(ub, vb), sample(ua, vb)]
      if (hs.every((h) => h <= 0)) continue
      const A: V3 = [ua, va, z(ua, va)], B: V3 = [ub, va, z(ub, va)], Cc: V3 = [ub, vb, z(ub, vb)], D: V3 = [ua, vb, z(ua, vb)]
      if (side > 0) pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...D)
      else pos.push(...A, ...Cc, ...B, ...A, ...D, ...Cc)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    sides.push(g)
  }
  return mergeGeometries(sides)
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
}

/* ── the whole gate as geometry: the wall soup, the panels' instances per kind, the bronzes, the paving ── */
export interface PanelInstances { kind: 'bull' | 'dragon' | 'lion'; count: number; matrices: Float32Array; iU: Float32Array; iN: Float32Array; iA: Float32Array; iB: Float32Array }
export interface Assembled {
  walls: BufferGeometry
  marks: Soup['marks']
  panels: PanelInstances[]
  bronzes: Array<{ geometry: BufferGeometry; cls: [number, number, number, number] }>
  paving: BufferGeometry
  counts: Record<string, number>
}

const SCHEME: Record<Panel['colour'], number> = { yellow: 0, white: 1, lionWhite: 2, lionYellow: 3 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assemble(B: Built, plan: any, fields: Record<'bull' | 'dragon' | 'lion', Field>): Assembled {
  const C: number = plan.course
  const MB: number = (plan.switch?.mBand?.courses ?? 1) * C
  const s = new Soup()
  const loopIn = B.loopholes
  const runKind = (id: string): number => (/^(lion|conn|bastion)-/.test(id) ? KIND.brick : KIND.gate)
  for (const b of B.boxes) {
    const kind = kindOfSurf(b.surf)
    s.mark(b.id)
    if (/^m?guard-.*-(n|w|e)$/.test(b.id) && addHoledWall(s, b, loopIn.map((l) => ({ c: l.c, n: l.n, r: l.r })), bodyAttr(kind, b.plan, b.height, b.band, b.rTop ?? -1))) continue
    addBox(s, b, kind)
  }
  for (const b of B.beams) { s.mark(b.id); addBox(s, b, KIND.cedar) }
  for (const p of B.prisms) { s.mark(p.id); addPrism(s, p) }
  for (const a of B.arches) { s.mark(a.id); addArch(s, a) }
  // the skins, with holes where the relief panels sit
  const margin = 0.02
  const L = { bull: fields.bull.L, dragon: fields.dragon.L, lion: fields.lion.L }
  for (const f of B.faces) {
    const boxes = B.panels.filter((q) => q.face === f.id).map((q) => panelRect(q, L[q.kind], margin, C))
    const bandTop = f.kind === 'lion' ? f.origin[1] + 3 + MB : MB
    s.mark(`skin:${f.id}`)
    addSkin(s, f, boxes, bandTop)
  }
  for (const r of B.runs) {
    const k = runKind(r.id)
    s.mark(r.id)
    addRun(s, r, plan.battlements.pitch, bodyAttr(k, r.plan, r.plan, -99, -1))
  }
  // the pedestals: square brick blocks, the round one a drum
  for (const p of B.pedestals) {
    const at = bodyAttr(KIND.brick, p.plan, p.height, p.y0 + 0.4 + MB, -1)
    s.mark(`ped-${p.n}`)
    if (p.shape === 'round') {
      const sh = new Shape()
      sh.absarc(0, 0, p.d / 2, 0, Math.PI * 2, false)
      const gg = new ExtrudeGeometry(sh, { depth: p.y1 - p.y0, bevelEnabled: false, curveSegments: 48 })
      gg.rotateX(-Math.PI / 2)
      gg.translate(p.x, p.y0, p.z)
      s.add(gg, at)
    } else addBox(s, { id: `ped-${p.n}`, part: 'forecourt', x0: p.x - p.d / 2, x1: p.x + p.d / 2, y0: p.y0, y1: p.y1, z0: p.z - p.d / 2, z1: p.z + p.d / 2, surf: 'brick', plan: p.plan, height: p.height, band: p.y0 + 0.4 + MB }, KIND.brick)
  }
  // the open door leaves: cedar with copper bands, hinged at the jamb, swung into the chamber
  for (const [di, d] of B.doors.entries()) {
    s.mark(`leaf-${di}`)
    const geo = leafGeometry(d.w, d.springing, d.thick)
    const sgn = d.pivot[0] > 0 ? 1 : -1
    const P = geo.getAttribute('position'), Nn = geo.getAttribute('normal')
    for (let i = 0; i < P.count; i++) {
      const lx = P.getX(i), ly = P.getY(i), lz = P.getZ(i)
      // leaf x runs along the opened direction, its thickness toward the jamb's side
      P.setXYZ(i, d.pivot[0] + d.along[0] * lx + sgn * lz, ly, d.pivot[1] + d.along[1] * lx)
      const nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i)
      Nn.setXYZ(i, d.along[0] * nx + sgn * nz, ny, d.along[1] * nx)
    }
    // (along, up, thickness) is right-handed for the west leaf (along -z, thickness +x)
    const right = d.along[1] < 0 ? sgn > 0 : sgn < 0
    s.add(right ? geo : flipWinding(geo), bodyAttr(KIND.cedar, 'G', 'G', -99, -1, 0, 1))
  }
  const walls = s.geometry()

  // the panels' instances, one set per kind
  const panels: PanelInstances[] = []
  for (const kind of ['bull', 'dragon', 'lion'] as const) {
    const list = B.panels.filter((q) => q.kind === kind)
    const n = list.length
    const mats = new Float32Array(n * 16), iU = new Float32Array(n * 3), iN = new Float32Array(n * 3), iA = new Float32Array(n * 4), iB = new Float32Array(n * 4)
    list.forEach((q, i) => {
      const f = B.faces.find((x) => x.id === q.face)!
      const o = q.origin, u = q.uDir, nn = q.normal
      mats.set([u[0], u[1], u[2], 0, 0, 1, 0, 0, nn[0], nn[1], nn[2], 0, o[0], o[1], o[2], 1], i * 16)
      iU.set(u, i * 3)
      iN.set(nn, i * 3)
      iA.set([q.u0 + f.uOff, q.y0, q.dir, f.shift], i * 4)
      iB.set([SCHEME[q.colour], f.kind === 'lion' ? 1 : 0, 0, 0], i * 4)
    })
    panels.push({ kind, count: n, matrices: mats, iU, iN, iA, iB })
  }

  // the bronze animals on pedestals 1 and 2: plain bronze at the relief's proportions, walking toward the gate
  const bronzes: Assembled['bronzes'] = []
  const scale: number = plan.bronze.scale
  for (const p of B.pedestals) {
    if (!p.animal) continue
    const f = fields[p.animal as 'bull' | 'dragon']
    const geo = bronzeGeometry(f, 0.2, 0.012)
    const P = geo.getAttribute('position'), Nn = geo.getAttribute('normal')
    for (let i = 0; i < P.count; i++) {
      // field u (head forward) to -z, v up, its thickness along x
      const lu = (P.getX(i) - f.L / 2) * scale, lv = P.getY(i) * scale, lz = P.getZ(i) * scale
      P.setXYZ(i, p.x + lz, p.y1 + lv, p.z - lu)
      const nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i)
      Nn.setXYZ(i, nz, ny, -nx)
    }
    // (u -> -z, v -> y, w -> x) is right-handed, so the winding stands
    bronzes.push({ geometry: geo, cls: [2, 2, -99, -1] })
  }

  const paving = pavingGeometry(B, plan)
  return { walls, marks: s.marks, panels, bronzes, paving, counts: { wallTriangles: walls.getAttribute('position').count / 3, panels: B.panels.length, pavingTriangles: paving.getAttribute('position').count / 3 } }
}

/** where the gate's own paving lies (the map's street and ground are masked there): the complex and the forecourt, then the lion street */
export function paved(B: Built, x: number, z: number, to: number): boolean {
  if (x >= -34 && x <= 30 && z >= -60 && z <= 50) return true
  const s = B.street.s(x, z), t = B.street.t(x, z)
  return s >= 20 && s <= to + 1 && Math.abs(t) <= B.street.halfWidth + 0.6
}

/** the paving: a 0.5 m grid at the street's level over the gate, the forecourt and the lion street, under every wall's foot */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pavingGeometry(B: Built, plan: any): BufferGeometry {
  const step = 0.5
  const zMin = -60
  const inside = (x: number, z: number): boolean => paved(B, x, z, plan.lionWalls.to)
  const pos: number[] = []
  const nx = Math.ceil(70 / step), x0 = -36
  for (let zi = 0; zi * step + zMin < plan.lionWalls.to + 4; zi++) {
    const za = zMin + zi * step, zb = za + step
    for (let xi = 0; xi < nx * 4; xi++) {
      const xa = x0 + xi * step, xb = xa + step
      if (xa > 60) break
      if (!inside((xa + xb) / 2, (za + zb) / 2)) continue
      const ya = B.level(za), yb = B.level(zb)
      pos.push(xa, yb, zb, xb, ya, za, xa, ya, za, xa, yb, zb, xb, yb, zb, xb, ya, za)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
