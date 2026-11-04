/* THE SIGNS AS DATA, AND THE CUT THEY MAKE. Each object's text is a file of lines, each line the edition's signs in
   order, each sign its wedges as read by eye off one hand copy (never traced): the head's back, the tail's bearing,
   the whole length and the head's width, in the copy's own pixels. A sign worn or lost on the copy is drawn after the
   same copy's other occurrence (`like`), and says so. The copy's pixels land on the face by the copy's own scale.
   Each wedge is cut as a tetrahedron: three sloped facets meeting at a deep point, nothing below them (a scholar's
   reading of the wedge, SIGNS 5). Pure: no renderer, so the tests read it as it is. */

/** a wedge on the copy: head back x, y (copy px), the tail's bearing (degrees, 0 to the right, 90 down the copy),
 *  the whole length and the head's width (copy px); 'w' marks a Winkelhaken, a head pressed with no tail, 'l' a long
 *  head that runs to the tip (the copy's long triangles) */
export type WedgeRow = [x: number, y: number, a: number, len: number, wid: number, kind?: 'w' | 'l']

export interface SignEntry {
  /** the sign's name as the edition's data gives it */
  sign: string
  /** its code point, U+ form */
  code: string
  /** the edition's reading here */
  reading: string
  /** where on the copy its wedges were read, or what stood in for it */
  from: string
  w?: WedgeRow[]
  /** a sign drawn after another occurrence on the same copy: its line and place (from 1), moved by dx, dy copy px */
  like?: { line: number; sign: number; dx: number; dy: number }
  /** the copy draws it in outline: restored by the copy's maker, not preserved */
  restored?: boolean
}

export interface LineEntry {
  n: number
  translit: string
  /** the edition's signs in order, as SIGNS gives them */
  edition: string[]
  signs: SignEntry[]
}

export interface Inscription {
  id: string
  text: string
  credit: string
  copy: {
    name: string
    page: string
    file: string
    /** the copy px that lands on the face's origin, and how many mm one copy px is */
    origin: [number, number]
    mmPerPx: number
  }
  /** the inscribed rect on the face, mm, from the face's origin (u right, v down) */
  area: { u: [number, number]; v: [number, number] }
  /** a wedge's depth as a share of its head's width, and the edge's softening (mm) */
  depth: number
  soften: number
  /** A STAMP'S OWN FIELD: the copy's border sunk into the face (copy px, its corner's radius), its rows parted by
   *  ruled grooves (their middles in copy y, the span they run, their width in copy px); depths in mm; the rim (mm)
   *  where the clay was pushed and smeared as the stamp came out */
  field?: { rect: [number, number, number, number]; corner: number; sink: number; wall: number; rules: number[]; span: [number, number]; rule: number; ruleDepth: number; rim: number }
  lines: LineEntry[]
}

/** a wedge on the face, mm: head back (u, v), the tail's unit bearing, the length and the head's width */
export interface FaceWedge { u: number; v: number; du: number; dv: number; len: number; wid: number; hook: boolean; long: boolean; line: number; sign: number; restored: boolean }

const RAD = Math.PI / 180

/** every sign's wedges, a `like` resolved to the occurrence it names */
export function signWedges(ins: Inscription, line: number, sign: number, seen = new Set<string>()): WedgeRow[] {
  const key = `${line}:${sign}`
  if (seen.has(key)) throw new Error(`${ins.id}: line ${line} sign ${sign} is drawn after itself`)
  seen.add(key)
  const entry = ins.lines.find(l => l.n === line)?.signs[sign - 1]
  if (!entry) throw new Error(`${ins.id}: no line ${line} sign ${sign}`)
  if (entry.w?.length) return entry.w
  if (!entry.like) return []
  const { dx, dy } = entry.like
  return signWedges(ins, entry.like.line, entry.like.sign, seen).map(([x, y, a, len, wid, k]) =>
    (k ? [x + dx, y + dy, a, len, wid, k] : [x + dx, y + dy, a, len, wid]) as WedgeRow)
}

/** the copy's wedges on the face, mm */
export function placeWedges(ins: Inscription): FaceWedge[] {
  const { origin: [x0, y0], mmPerPx: s } = ins.copy
  const out: FaceWedge[] = []
  for (const line of ins.lines) line.signs.forEach((sign, i) => {
    for (const [x, y, a, len, wid, k] of signWedges(ins, line.n, i + 1)) {
      out.push({ u: (x - x0) * s, v: (y - y0) * s, du: Math.cos(a * RAD), dv: Math.sin(a * RAD), len: len * s, wid: wid * s,
        hook: k === 'w', long: k === 'l', line: line.n, sign: i + 1, restored: sign.restored === true })
    }
  })
  return out
}

/** THE SHAPE OF A WEDGE IN PLAN: a head (a short wide triangle at the back) and a tail (a long thin one to the tip);
 *  a Winkelhaken is one triangle, its point at the back, opening along its bearing. Each with the deep point its
 *  facets meet at, as a share along the bearing, and the depth there as a share of the head's depth. */
export const WEDGE = Object.freeze({
  /** the head's length as a share of its width; the tail's width at the head as a share of the head's */
  head: 0.95, tail: 0.3,
  /** where the deep point stands along the head and along the tail, shares of each one's length */
  headDeep: 0.24, tailDeep: 0.12,
  /** the tail's depth against the head's */
  tailDepth: 0.5,
  /** a Winkelhaken: its deep point along its length, its depth against a head of its width */
  hookDeep: 0.36, hookDepth: 0.85,
})

interface Tri { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; px: number; py: number; d: number }

/** the triangles a wedge cuts, each a tetrahedron (deep point p at depth d) */
export function wedgeTris(w: FaceWedge, depthShare: number): Tri[] {
  const nu = -w.dv, nv = w.du
  const D = depthShare * w.wid
  if (w.hook) {
    const half = w.wid / 2
    return [{ ax: w.u, ay: w.v, bx: w.u + w.du * w.len + nu * half, by: w.v + w.dv * w.len + nv * half,
      cx: w.u + w.du * w.len - nu * half, cy: w.v + w.dv * w.len - nv * half,
      px: w.u + w.du * w.len * WEDGE.hookDeep, py: w.v + w.dv * w.len * WEDGE.hookDeep, d: D * WEDGE.hookDepth }]
  }
  const lh = w.long ? w.len : Math.min(w.len, WEDGE.head * w.wid), half = w.wid / 2
  const tris: Tri[] = [{ ax: w.u + nu * half, ay: w.v + nv * half, bx: w.u - nu * half, by: w.v - nv * half,
    cx: w.u + w.du * lh, cy: w.v + w.dv * lh, px: w.u + w.du * lh * WEDGE.headDeep, py: w.v + w.dv * lh * WEDGE.headDeep, d: D }]
  if (w.len > lh * 1.05) {
    const t = w.wid * WEDGE.tail / 2
    tris.push({ ax: w.u + nu * t, ay: w.v + nv * t, bx: w.u - nu * t, by: w.v - nv * t, cx: w.u + w.du * w.len, cy: w.v + w.dv * w.len,
      px: w.u + w.du * w.len * WEDGE.tailDeep, py: w.v + w.dv * w.len * WEDGE.tailDeep, d: D * WEDGE.tailDepth })
  }
  return tris
}

/** the depth a tetrahedron cuts at (x, y): the least of its three facets, each 0 on its edge and d at the deep point */
export function triDepth(t: Tri, x: number, y: number): number {
  let least = Infinity
  const edges: Array<[number, number, number, number, number, number]> = [
    [t.ax, t.ay, t.bx, t.by, t.cx, t.cy], [t.bx, t.by, t.cx, t.cy, t.ax, t.ay], [t.cx, t.cy, t.ax, t.ay, t.bx, t.by]]
  for (const [x1, y1, x2, y2, ox, oy] of edges) {
    const ex = x2 - x1, ey = y2 - y1
    // the inward side is the side the opposite corner stands on
    const side = Math.sign(ex * (oy - y1) - ey * (ox - x1)) || 1
    const at = side * (ex * (y - y1) - ey * (x - x1))
    if (at < 0) return 0
    const deep = side * (ex * (t.py - y1) - ey * (t.px - x1))
    if (deep <= 0) return 0
    least = Math.min(least, at / deep)
  }
  return t.d * Math.min(1, least)
}

/** A FIELD OF CUT DEPTHS over a rect of the face: mm per texel, the rect's origin and size in texels */
export interface CutField { u0: number; v0: number; step: number; nu: number; nv: number; depth: Float32Array }

/** the cut of every wedge over the inscribed area plus a margin, the union of the tetrahedra (the deepest wins),
 *  softened by a box filter twice over (a tent) of the inscription's own softening */
export function cutField(ins: Inscription, step: number, margin = 4): CutField {
  const u0 = ins.area.u[0] - margin, v0 = ins.area.v[0] - margin
  const nu = Math.ceil((ins.area.u[1] - ins.area.u[0] + 2 * margin) / step) + 1
  const nv = Math.ceil((ins.area.v[1] - ins.area.v[0] + 2 * margin) / step) + 1
  const depth = new Float32Array(nu * nv)
  const F = ins.field, s = ins.copy.mmPerPx, [ox, oy] = ins.copy.origin
  /** how far inside the stamp's border a face point stands (mm, negative outside), its corners rounded */
  const inside = (u: number, v: number): number => {
    if (!F) return Infinity
    const [x0, y0, x1, y1] = F.rect, r = F.corner * s
    const hu = (x1 - x0) * s / 2 - r, hv = (y1 - y0) * s / 2 - r
    const cu = ((x0 + x1) / 2 - ox) * s, cv = ((y0 + y1) / 2 - oy) * s
    const qu = Math.abs(u - cu) - hu, qv = Math.abs(v - cv) - hv
    const outside = Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0)
    return r - outside
  }
  // the field's own floor first: the stamp's face sunk with a sloped wall, the ruled grooves a V in it
  const floor = new Float32Array(nu * nv)
  if (F) for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u = u0 + i * step, v = v0 + j * step
    const k = Math.min(1, Math.max(0, inside(u, v) / F.wall))
    let d = F.sink * k * k * (3 - 2 * k)
    const x = u / s + ox, y = v / s + oy
    if (x > F.span[0] && x < F.span[1]) for (const rule of F.rules) {
      const g = 1 - Math.abs(y - rule) / (F.rule / 2)
      if (g > 0) d += F.ruleDepth * g
    }
    floor[j * nu + i] = d
  }
  for (const w of placeWedges(ins)) for (const t of wedgeTris(w, ins.depth)) {
    const i0 = Math.max(0, Math.floor((Math.min(t.ax, t.bx, t.cx) - u0) / step))
    const i1 = Math.min(nu - 1, Math.ceil((Math.max(t.ax, t.bx, t.cx) - u0) / step))
    const j0 = Math.max(0, Math.floor((Math.min(t.ay, t.by, t.cy) - v0) / step))
    const j1 = Math.min(nv - 1, Math.ceil((Math.max(t.ay, t.by, t.cy) - v0) / step))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = triDepth(t, u0 + i * step, v0 + j * step)
      if (d > depth[j * nu + i]!) depth[j * nu + i] = d
    }
  }
  for (let k = 0; k < depth.length; k++) depth[k] = Math.max(depth[k]! + floor[k]!, floor[k]!)
  const r = Math.round(ins.soften / step)
  if (r > 0) for (let pass = 0; pass < 2; pass++) boxBlur(depth, nu, nv, r)
  // THE RIM SMEARED: near the stamp's border the clay was dragged as the stamp lifted, so the field's edge and the
  // signs nearest it lose their crispness over the rim's width
  if (F && F.rim > 0) {
    const soft = depth.slice()
    const rr = Math.max(1, Math.round(F.rim / 2 / step))
    for (let pass = 0; pass < 3; pass++) boxBlur(soft, nu, nv, rr)
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = Math.abs(inside(u0 + i * step, v0 + j * step)) / F.rim
      const k = a < 1 ? (1 - a) * (1 - a) : 0
      depth[j * nu + i] = depth[j * nu + i]! * (1 - k) + soft[j * nu + i]! * k
    }
  }
  return { u0, v0, step, nu, nv, depth }
}

/** a separable running box filter of radius r, in place */
export function boxBlur(a: Float32Array, nu: number, nv: number, r: number): void {
  const row = new Float32Array(Math.max(nu, nv))
  const pass = (n: number, count: number, at: (k: number, i: number) => number): void => {
    for (let k = 0; k < count; k++) {
      for (let i = 0; i < n; i++) row[i] = a[at(k, i)]!
      let sum = 0
      for (let i = -r; i <= r; i++) sum += row[Math.min(n - 1, Math.max(0, i))]!
      for (let i = 0; i < n; i++) {
        a[at(k, i)] = sum / (2 * r + 1)
        sum += row[Math.min(n - 1, i + r + 1)]! - row[Math.max(0, i - r)]!
      }
    }
  }
  pass(nu, nv, (j, i) => j * nu + i)
  pass(nv, nu, (i, j) => j * nu + i)
}

/** the field's depth at a face point (mm), bilinear; 0 outside it */
export function depthAt(f: CutField, u: number, v: number): number {
  const x = (u - f.u0) / f.step, y = (v - f.v0) / f.step
  if (x < 0 || y < 0 || x > f.nu - 1 || y > f.nv - 1) return 0
  const i = Math.min(f.nu - 2, Math.floor(x)), j = Math.min(f.nv - 2, Math.floor(y)), fx = x - i, fy = y - j
  const at = (a: number, b: number): number => f.depth[b * f.nu + a]!
  return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy
}

/** WHAT A TEST ASKS OF A FILE: each line holds the edition's signs in order, and every sign has its wedges */
export function signProblems(ins: Inscription): string[] {
  const out: string[] = []
  for (const line of ins.lines) {
    const names = line.signs.map(s => s.sign)
    if (names.join(' ') !== line.edition.join(' ')) out.push(`${ins.id} line ${line.n}: signs ${names.join(' ')} against the edition's ${line.edition.join(' ')}`)
    line.signs.forEach((s, i) => {
      let wedges: WedgeRow[] = []
      try { wedges = signWedges(ins, line.n, i + 1) } catch (e) { out.push(String(e)) }
      if (!wedges.length) out.push(`${ins.id} line ${line.n} sign ${i + 1} (${s.sign}): no wedges`)
      if (!/^U\+[0-9A-F]{4,5}( U\+[0-9A-F]{4,5})*$/.test(s.code)) out.push(`${ins.id} line ${line.n} sign ${i + 1}: code "${s.code}"`)
      if (!s.from) out.push(`${ins.id} line ${line.n} sign ${i + 1}: no source`)
      for (const [x, y, a, len, wid] of wedges) if (![x, y, a, len, wid].every(Number.isFinite) || len <= 0 || wid <= 0) out.push(`${ins.id} line ${line.n} sign ${i + 1}: a wedge [${x}, ${y}, ${a}, ${len}, ${wid}]`)
    })
  }
  for (const w of placeWedges(ins)) {
    const pad = Math.max(w.len, w.wid)
    if (w.u < ins.area.u[0] - pad || w.u > ins.area.u[1] + pad || w.v < ins.area.v[0] - pad || w.v > ins.area.v[1] + pad) {
      out.push(`${ins.id} line ${w.line} sign ${w.sign}: a wedge at ${w.u.toFixed(1)}, ${w.v.toFixed(1)} mm stands off the inscribed area`)
      break
    }
  }
  return out
}
