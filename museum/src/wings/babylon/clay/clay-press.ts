/* THE PRESS AS A HEIGHT FIELD over the tablet's written strip: each pressed wedge is the cutter's tetrahedral pit
   (objects/inscription.ts), its clay pushed aside into a slight lip round its edge; the wedge being pressed sinks by
   its share. Only the strip round the wedge that changed is worked again, so a press costs a few thousand texels.
   Pure: no renderer, so the tests read it as it is. */

import { triDepth, wedgeTris, type FaceWedge } from '../objects/inscription'

/** THE LIP: its crest's height as a share of the wedge's own depth, how far out the crest stands (mm), and how far the
 *  pushed clay reaches (mm); the edge's softening (mm) */
export const LIP = Object.freeze({ share: 0.07, crest: 0.28, reach: 1.4, soften: 0.12 })

export interface Rect { i0: number; j0: number; i1: number; j1: number }

export interface PressField {
  /** the grid: its origin on the face (mm), its step (mm) and size (texels) */
  u0: number; v0: number; step: number; nu: number; nv: number
  /** the face's height at each texel, mm (up out of the face is positive): the pits below 0, the lips above */
  height: Float32Array
  /** set the field to `done` wedges pressed and the next one sunk by `sink` (0 to 1); the texels that changed */
  set(done: number, sink: number): Rect | null
  /** how many wedges are pressed whole, and the sinking one's share */
  state(): { done: number; sink: number }
  /** the depth of the pit at a face point (mm, positive down), bilinear */
  depthAt(u: number, v: number): number
}

interface Own { i0: number; j0: number; i1: number; j1: number; nu: number; cut: Float32Array; lip: Float32Array }

/** the distance from a point to a triangle's outline, 0 inside */
function outside(t: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number }, x: number, y: number): number {
  const seg = (x1: number, y1: number, x2: number, y2: number): number => {
    const ex = x2 - x1, ey = y2 - y1, k = Math.max(0, Math.min(1, ((x - x1) * ex + (y - y1) * ey) / (ex * ex + ey * ey || 1)))
    return Math.hypot(x - x1 - ex * k, y - y1 - ey * k)
  }
  const s = (x1: number, y1: number, x2: number, y2: number): number => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
  const a = s(t.ax, t.ay, t.bx, t.by), b = s(t.bx, t.by, t.cx, t.cy), c = s(t.cx, t.cy, t.ax, t.ay)
  if ((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0)) return 0
  return Math.min(seg(t.ax, t.ay, t.bx, t.by), seg(t.bx, t.by, t.cx, t.cy), seg(t.cx, t.cy, t.ax, t.ay))
}

/** the field over the wedges' strip plus a margin (mm), at a step (mm); depth: a pit's depth as a share of its head */
export function pressField(wedges: readonly FaceWedge[], depth: number, step: number, margin = 3): PressField {
  const tris = wedges.map(w => wedgeTris(w, depth))
  const xs = tris.flat().flatMap(t => [t.ax, t.bx, t.cx]), ys = tris.flat().flatMap(t => [t.ay, t.by, t.cy])
  const u0 = Math.floor((Math.min(...xs) - margin) / step) * step, v0 = Math.floor((Math.min(...ys) - margin) / step) * step
  const nu = Math.ceil((Math.max(...xs) + margin - u0) / step) + 1, nv = Math.ceil((Math.max(...ys) + margin - v0) / step) + 1
  const pad = LIP.reach + LIP.soften * 2
  // EACH WEDGE'S OWN PIT AND LIP, worked once over its own box: a press only lays it into the whole
  const own: Own[] = tris.map(ts => {
    const xs = ts.flatMap(t => [t.ax, t.bx, t.cx]), ys = ts.flatMap(t => [t.ay, t.by, t.cy])
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - pad - u0) / step)), i1 = Math.min(nu - 1, Math.ceil((Math.max(...xs) + pad - u0) / step))
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - pad - v0) / step)), j1 = Math.min(nv - 1, Math.ceil((Math.max(...ys) + pad - v0) / step))
    const w = i1 - i0 + 1, h = j1 - j0 + 1, cut = new Float32Array(w * h), lip = new Float32Array(w * h)
    const deepest = Math.max(...ts.map(t => t.d))
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = u0 + (i0 + i) * step, y = v0 + (j0 + j) * step
      let d = 0, far = Infinity
      for (const t of ts) { d = Math.max(d, triDepth(t, x, y)); far = Math.min(far, outside(t, x, y)) }
      cut[j * w + i] = d
      // the crest stands a little out from the edge and falls away to nothing at the reach
      if (far > 0 && far < LIP.reach) {
        const k = far / LIP.crest
        lip[j * w + i] = LIP.share * deepest * k * Math.exp(1 - k) * (1 - far / LIP.reach)
      }
    }
    return { i0, j0, i1, j1, nu: w, cut, lip }
  })
  const cut = new Float32Array(nu * nv), lip = new Float32Array(nu * nv)
  const raw = new Float32Array(nu * nv), height = new Float32Array(nu * nv)
  let done = 0, sink = 0
  const r = Math.max(1, Math.round(LIP.soften / step))

  function lay(o: Own, into: { cut: Float32Array; lip: Float32Array }, share: number): void {
    for (let j = o.j0; j <= o.j1; j++) for (let i = o.i0; i <= o.i1; i++) {
      const a = (j - o.j0) * o.nu + (i - o.i0), k = j * nu + i
      into.cut[k] = Math.max(into.cut[k]!, o.cut[a]! * share)
      into.lip[k] = Math.max(into.lip[k]!, o.lip[a]! * share)
    }
  }
  /** the raw height and its softened copy over a rect (the rect grown by the softening first) */
  function compose(rect: Rect, sinking: Own | null, share: number): Rect {
    const g = { i0: Math.max(0, rect.i0 - 2 * r), j0: Math.max(0, rect.j0 - 2 * r), i1: Math.min(nu - 1, rect.i1 + 2 * r), j1: Math.min(nv - 1, rect.j1 + 2 * r) }
    for (let j = g.j0; j <= g.j1; j++) for (let i = g.i0; i <= g.i1; i++) {
      const k = j * nu + i
      let c = cut[k]!, l = lip[k]!
      if (sinking && i >= sinking.i0 && i <= sinking.i1 && j >= sinking.j0 && j <= sinking.j1) {
        const a = (j - sinking.j0) * sinking.nu + (i - sinking.i0)
        c = Math.max(c, sinking.cut[a]! * share)
        l = Math.max(l, sinking.lip[a]! * share)
      }
      // a later pit takes away the lip an earlier wedge pushed up where it lands
      raw[k] = -c + l * (1 - Math.min(1, c / 0.05))
    }
    // a tent of two box passes, within the grown rect
    const tmp = new Float32Array((g.i1 - g.i0 + 1) * (g.j1 - g.j0 + 1)), w = g.i1 - g.i0 + 1
    for (let j = g.j0; j <= g.j1; j++) for (let i = g.i0; i <= g.i1; i++) tmp[(j - g.j0) * w + (i - g.i0)] = raw[j * nu + i]!
    const box = (src: Float32Array): Float32Array => {
      const h = g.j1 - g.j0 + 1, a = new Float32Array(src.length), b = new Float32Array(src.length)
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let s = 0, n = 0
        for (let d = -r; d <= r; d++) { const x = i + d; if (x >= 0 && x < w) { s += src[j * w + x]!; n++ } }
        a[j * w + i] = s / n
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let s = 0, n = 0
        for (let d = -r; d <= r; d++) { const y = j + d; if (y >= 0 && y < h) { s += a[y * w + i]!; n++ } }
        b[j * w + i] = s / n
      }
      return b
    }
    const soft = box(box(tmp))
    // only the rect's inside is written: its rim of softening reads texels outside it, which stand as they were
    const inner = { i0: Math.max(0, rect.i0 - r), j0: Math.max(0, rect.j0 - r), i1: Math.min(nu - 1, rect.i1 + r), j1: Math.min(nv - 1, rect.j1 + r) }
    for (let j = inner.j0; j <= inner.j1; j++) for (let i = inner.i0; i <= inner.i1; i++) height[j * nu + i] = soft[(j - g.j0) * w + (i - g.i0)]!
    return inner
  }
  const union = (a: Rect | null, b: Rect | null): Rect | null => !a ? b : !b ? a
    : { i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1) }

  return {
    u0, v0, step, nu, nv, height,
    set(nextDone, nextSink) {
      nextDone = Math.max(0, Math.min(wedges.length, Math.floor(nextDone)))
      nextSink = nextDone >= wedges.length ? 0 : Math.max(0, Math.min(1, nextSink))
      if (nextDone === done && nextSink === sink) return null
      let dirty: Rect | null = null
      if (nextDone < done) {
        // back: the clay smoothed again, the presses laid anew
        cut.fill(0); lip.fill(0)
        for (let k = 0; k < nextDone; k++) lay(own[k]!, { cut, lip }, 1)
        dirty = { i0: 0, j0: 0, i1: nu - 1, j1: nv - 1 }
      } else {
        for (let k = done; k < nextDone; k++) { lay(own[k]!, { cut, lip }, 1); dirty = union(dirty, own[k]!) }
      }
      // the wedge sinking now, and the one that sank before it if the sink moved on
      if (done < wedges.length && (sink > 0 || nextDone !== done)) dirty = union(dirty, own[done]!)
      if (nextDone < wedges.length) dirty = union(dirty, own[nextDone]!)
      done = nextDone; sink = nextSink
      const s = sink * sink * (3 - 2 * sink)
      return dirty ? compose(dirty, done < wedges.length && sink > 0 ? own[done]! : null, s) : null
    },
    state: () => ({ done, sink }),
    depthAt(u, v) {
      const x = (u - u0) / step, y = (v - v0) / step
      if (x < 0 || y < 0 || x > nu - 1 || y > nv - 1) return 0
      const i = Math.min(nu - 2, Math.floor(x)), j = Math.min(nv - 2, Math.floor(y)), fx = x - i, fy = y - j
      const at = (a: number, b: number): number => -height[b * nu + a]!
      return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy
    },
  }
}

/** a wedge's deepest point on the face: where its head's facets meet */
export function deepPoint(w: FaceWedge, depth: number): { u: number; v: number; d: number } {
  const t = wedgeTris(w, depth)[0]!
  return { u: t.px, v: t.py, d: t.d }
}
