/* THE MAP'S GEOMETRY, pure: the plan file (UTM metres, German-zero levels)
   turned into prisms, boxes, ramps, water and the ground's height, in the
   scene's frame (x east, y up, z south). No DOM and no renderer, so node can
   mount it (`--experimental-strip-types`) and measure exactly what the page
   builds. No imports: node resolves none without extensions. */

export type Cls = 'M' | 'R' | 'G'
export type P2 = [number, number]

/** a vertical prism: polygon (scene x, z) with holes, from y0 to y1 */
export interface Prism {
  id: string
  name: string
  group: string
  poly: P2[]
  holes: P2[][]
  y0: number
  y1: number
  plan: Cls
  height: Cls
  /** the class band's top: the plan's class below it, the height's above */
  band: number
  /** its top is a floor a visitor stands on (a court in a palace) */
  walk?: boolean
  /** the outline at y1, vertex for vertex with `poly`, where the sides lean in (a battered pier) */
  top?: P2[]
}

/** an upright box: centre (x, z), size along its own x (sx) and z (sz), yaw about y */
export interface BoxRec {
  id: string
  group: string
  x: number
  z: number
  y0: number
  y1: number
  sx: number
  sz: number
  yaw: number
  plan: Cls
  height: Cls
  band: number
  /** a record only (a shaped body's footprint box), never drawn; such boxes come last in the list */
  hidden?: boolean
}

/** a sloped block: bottom edge centre `a` at y0 rising to top edge centre `b` at y1, width w; solid to `floor` */
export interface Ramp {
  id: string
  group: string
  a: P2
  b: P2
  y0: number
  y1: number
  w: number
  floor: number
  plan: Cls
  height: Cls
  band: number
}

export interface Water {
  id: string
  poly: P2[]
  level: number
  plan: Cls
  height: Cls
}

export interface StreetPoint {
  x: number
  z: number
  s: number
  level: number
  w: number
  cls: Cls
  deck: boolean
}

export interface Built {
  prisms: Prism[]
  boxes: BoxRec[]
  ramps: Ramp[]
  water: Water[]
  street: StreetPoint[]
  ground: (x: number, z: number) => number
  streetAt: (x: number, z: number) => { d: number; level: number; w: number; s: number }
  /** what a visitor stands on: the street inside its width (and the bridge's deck), a walkable top, else the ground */
  stand: (x: number, z: number) => number
  houses: number
  facts: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const D2R = Math.PI / 180

export function makeFrame(plan: J) {
  const E0: number = plan.frame.E0, N0: number = plan.frame.N0
  const s = (E: number, N: number): P2 => [E - E0, N0 - N]
  const utm = (x: number, z: number): P2 => [x + E0, N0 - z]
  /** a bearing (degrees clockwise from grid north) as a scene direction */
  const dir = (bearing: number): P2 => [Math.sin(bearing * D2R), -Math.cos(bearing * D2R)]
  /** yaw that turns a box's own +x toward a bearing */
  const yawOf = (bearing: number): number => (90 - bearing) * D2R
  return { E0, N0, s, utm, dir, yawOf }
}

/* ── plane helpers ── */
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k]
const len = (a: P2): number => Math.hypot(a[0], a[1])
const norm = (a: P2): P2 => mul(a, 1 / (len(a) || 1))
/** the left-hand normal of a direction, looking down on the map (north up) */
const leftOf = (d: P2): P2 => [d[1], -d[0]]

export function pointInPoly(p: P2, poly: P2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function segDist(p: P2, a: P2, b: P2): { d: number; t: number } {
  const ab = sub(b, a), ap = sub(p, a)
  const L2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = L2 > 0 ? Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1]) / L2)) : 0
  return { d: len(sub(p, add(a, mul(ab, t)))), t }
}

export function polyEdgeDist(p: P2, poly: P2[]): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i]!, poly[(i + 1) % poly.length]!).d)
  return d
}

export function polyArea(poly: P2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

function centroid(poly: P2[]): P2 {
  let x = 0, z = 0
  for (const p of poly) {
    x += p[0]
    z += p[1]
  }
  return [x / poly.length, z / poly.length]
}

/** the South Palace's ranges (map-plan.json `ranges`: UTM rects on C6.2's walls, clipped to the outline): each range's
    roof a deck inside a parapet `parapet.t` thick (the outer walls `parapet.outer`), so the rooms body keeps its walls' top as the parapets and loses each
    deck's well. Returns the wells (wound as the block's rect holes) and the decks, sunk 0.1 m into the floor body */
function palaceRanges(b: J, poly: P2[], s: (E: number, N: number) => P2): { wells: P2[][]; decks: Array<{ id: string; poly: P2[]; y0: number; y1: number }> } {
  const t: number = b.parapet.t
  const halves = poly.map((a, i) => {
    const c = poly[(i + 1) % poly.length]!, mid = mul(add(a, c), 0.5)
    let n = leftOf(norm(sub(c, a)))
    if (!pointInPoly(add(mid, mul(n, 0.05)), poly)) n = mul(n, -1)
    return { a, n }
  })
  const clip = (pts: P2[], a: P2, n: P2, off: number): P2[] => {
    const f = (p: P2): number => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1] - off
    const out: P2[] = []
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!, fp = f(p), fq = f(q)
      if (fp >= 0) out.push(p)
      if (fp >= 0 !== fq >= 0) out.push(add(p, mul(sub(q, p), fp / (fp - fq))))
    })
    return out
  }
  const wells: P2[][] = [], decks: Array<{ id: string; poly: P2[]; y0: number; y1: number }> = []
  for (const r of b.ranges) {
    const [e0, e1, n0, n1] = r.rect as number[]
    let w: P2[] = [s(e0! + t, n0! + t), s(e1! - t, n0! + t), s(e1! - t, n1! - t), s(e0! + t, n1! - t)]
    for (const h of halves) w = clip(w, h.a, h.n, b.parapet.outer ?? t)
    if (w.length < 3 || Math.abs(polyArea(w)) < 4) continue
    wells.push(w)
    decks.push({ id: `${b.id.replace(/-rooms$/, '')}-deck-${r.id}`, poly: [...w].reverse(), y0: b.base - 0.1, y1: r.deck ?? b.parapet.deck })
  }
  return { wells, decks }
}

/** a polyline offset sideways by `off` (positive to the left, map view), mitred at the joints */
export function offsetLine(line: P2[], off: number): P2[] {
  const out: P2[] = []
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!
    const dPrev = i > 0 ? norm(sub(p, line[i - 1]!)) : null
    const dNext = i < line.length - 1 ? norm(sub(line[i + 1]!, p)) : null
    if (dPrev && dNext) {
      const n1 = leftOf(dPrev), n2 = leftOf(dNext)
      const m = norm(add(n1, n2))
      const cos = m[0] * n1[0] + m[1] * n1[1]
      out.push(add(p, mul(m, off / Math.max(cos, 0.25))))
    } else out.push(add(p, mul(leftOf((dPrev ?? dNext)!), off)))
  }
  return out
}

/** the outline of a thick polyline, centred on the line */
export function bandPoly(line: P2[], half0: number, half1: number = -half0): P2[] {
  const a = offsetLine(line, half0), b = offsetLine(line, half1)
  return [...a, ...b.reverse()]
}

/* ── seeded numbers ── */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Mount the plan. `houses: false` leaves the filled city out (the node checks do not need it). */
export function buildPlan(plan: J, opts: { houses?: boolean } = {}): Built {
  const F = makeFrame(plan)
  const prisms: Prism[] = [], boxes: BoxRec[] = [], ramps: Ramp[] = [], water: Water[] = []
  const facts: Record<string, unknown> = {}
  const BAND: number = plan.classes.band

  /* ── frames ── */
  const frames: Record<string, { o: P2; a: P2; c: P2; bearing: number }> = {}
  for (const [k, f] of Object.entries<J>(plan.frames)) {
    const o = F.s(f.origin[0], f.origin[1])
    frames[k] = { o, a: F.dir(f.bearing), c: F.dir(f.bearing + 90), bearing: f.bearing }
  }
  const local = (fr: string, a: number, c: number): P2 => {
    const f = frames[fr]!
    return add(add(f.o, mul(f.a, a)), mul(f.c, c))
  }

  /* ── the street: centreline in scene metres with its arc length ── */
  const street: StreetPoint[] = []
  {
    let s = 0
    const deck = plan.street.deck
    plan.street.points.forEach((p: J, i: number) => {
      const [x, z] = F.s(p.at[0], p.at[1])
      if (i > 0) s += Math.hypot(x - street[i - 1]!.x, z - street[i - 1]!.z)
      street.push({ x, z, s, level: p.level, w: p.w, cls: p.cls, deck: p.at[0] <= deck.from && p.at[0] > deck.to })
    })
  }
  const streetAt = (x: number, z: number): { d: number; level: number; w: number; s: number } => {
    let best = { d: Infinity, level: 0, w: 0, s: 0 }
    for (let i = 0; i + 1 < street.length; i++) {
      const a = street[i]!, b = street[i + 1]!
      const r = segDist([x, z], [a.x, a.z], [b.x, b.z])
      if (r.d < best.d) best = { d: r.d, level: a.level + (b.level - a.level) * r.t, w: a.w + (b.w - a.w) * r.t, s: a.s + (b.s - a.s) * r.t }
    }
    return best
  }
  const streetLevelAtS = (s: number): number => {
    for (let i = 0; i + 1 < street.length; i++) {
      const a = street[i]!, b = street[i + 1]!
      if (s <= b.s) return a.level + ((b.level - a.level) * (s - a.s)) / Math.max(1e-6, b.s - a.s)
    }
    return street[street.length - 1]!.level
  }

  /* ── water: the river, the north moat, the canal, the circuits' moats (added below) ── */
  for (const w of plan.water) water.push({ id: w.id, poly: w.poly.map((p: number[]) => F.s(p[0]!, p[1]!)), level: w.level, plan: w.plan, height: w.height })
  const canalLine: P2[] = plan.canal.line.map((p: number[]) => F.s(p[0]!, p[1]!))
  water.push({ id: 'canal', poly: bandPoly(canalLine, plan.canal.w / 2), level: plan.canal.level, plan: plan.canal.plan, height: plan.canal.height })

  /* ── circuits: main wall, front wall, embankment, towers, and the moat as water ── */
  const wallLines: Array<{ line: P2[]; half: number }> = []
  const towersOn = (id: string, line: P2[], t: J, side: 'left' | 'right', half: number, base: number, cls: { plan: Cls; height: Cls }, topAt?: (p: P2) => number): void => {
    const sgn = side === 'left' ? 1 : -1
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!, b = line[i + 1]!
      const L = len(sub(b, a))
      const d = norm(sub(b, a))
      const n = mul(leftOf(d), sgn)
      const count = Math.floor((L - t.w) / t.pitch)
      const start = (L - count * t.pitch) / 2
      for (let k = 0; k <= count; k++) {
        const along = start + k * t.pitch
        if (along < t.w || along > L - t.w) continue
        const depth = half + t.proj
        const c = add(add(a, mul(d, along)), mul(n, depth / 2))
        const top = topAt ? topAt(c) : t.top
        boxes.push({ id: `${id}-t${i}-${k}`, group: 'tower', x: c[0], z: c[1], y0: base, y1: top, sx: t.w, sz: depth, yaw: Math.atan2(-d[1], d[0]), plan: cls.plan, height: cls.height, band: 0 })
      }
    }
  }
  const pushWall = (id: string, name: string, line: P2[], thick: number, y0: number, y1: number, cls: { plan: Cls; height: Cls }): void => {
    prisms.push({ id, name, group: 'wall', poly: bandPoly(line, thick / 2), holes: [], y0, y1, plan: cls.plan, height: cls.height, band: 0 })
    wallLines.push({ line, half: thick / 2 })
  }

  for (const c of plan.circuits) {
    const line: P2[] = c.line.map((p: number[]) => F.s(p[0]!, p[1]!))
    const out = c.outward === 'left' ? 1 : -1
    for (let i = 0; i + 1 < line.length; i++) {
      const seg: P2[] = [line[i]!, line[i + 1]!]
      const ext = (k: number): P2[] => {
        // extend each segment past its joints so neighbouring pieces lap instead of meeting on one plane
        const d = norm(sub(seg[1]!, seg[0]!))
        return [sub(seg[0]!, mul(d, i > 0 ? k : 0)), add(seg[1]!, mul(d, i + 2 < line.length ? k : 0))]
      }
      const cls = { plan: (c.segments[i]?.plan ?? 'R') as Cls, height: c.height as Cls }
      const lift = (i % 2) * 0.012
      pushWall(`${c.id}-main-${i}`, `${c.name}, main wall`, ext(c.main.thick / 2), c.main.thick, 0, c.main.top + lift, cls)
      towersOn(`${c.id}-main-${i}`, seg, c.main.towers, out > 0 ? 'left' : 'right', c.main.thick / 2, 0, cls)
      if (c.front) {
        const fl = offsetLine(seg, out * c.front.offset)
        const d = norm(sub(fl[1]!, fl[0]!))
        const e: P2[] = [sub(fl[0]!, mul(d, i > 0 ? c.front.thick / 2 + 6 : 0)), add(fl[1]!, mul(d, i + 2 < line.length ? c.front.thick / 2 + 6 : 0))]
        pushWall(`${c.id}-front-${i}`, `${c.name}, front wall`, e, c.front.thick, 0, c.front.top + lift, cls)
        if (c.front.towers) towersOn(`${c.id}-front-${i}`, fl, c.front.towers, out > 0 ? 'left' : 'right', c.front.thick / 2, 0, cls)
      }
      if (c.karu) {
        const kl = offsetLine(seg, out * c.karu.offset)
        const d = norm(sub(kl[1]!, kl[0]!))
        const e: P2[] = [sub(kl[0]!, mul(d, i > 0 ? c.karu.thick / 2 + 30 : 0)), add(kl[1]!, mul(d, i + 2 < line.length ? c.karu.thick / 2 + 30 : 0))]
        pushWall(`${c.id}-karu-${i}`, `${c.name}, embankment`, e, c.karu.thick, -5, c.karu.top + lift, { plan: cls.plan, height: 'R' })
        if (c.karu.walk) {
          // the moat wall at the embankment's foot, its top the walkway; it laps 0.3 m into the embankment
          const W = c.karu.walk
          const wl = offsetLine(seg, out * (c.karu.offset + c.karu.thick / 2 + W.thick / 2 - 0.3))
          const dw = norm(sub(wl[1]!, wl[0]!))
          const ew: P2[] = [sub(wl[0]!, mul(dw, i > 0 ? W.thick / 2 + 30 : 0)), add(wl[1]!, mul(dw, i + 2 < line.length ? W.thick / 2 + 30 : 0))]
          pushWall(`${c.id}-walk-${i}`, `${c.name}, moat wall and walkway`, ew, W.thick, -5, W.top + lift, { plan: cls.plan, height: 'R' })
        }
      }
    }
    // the moat: from just outside the embankment to 80 m beyond it, the whole run in one strip
    const m0 = (c.karu ? c.karu.offset + c.karu.thick / 2 + (c.karu.walk ? c.karu.walk.thick - 0.3 : 0) : (c.front ? c.front.offset + c.front.thick / 2 : c.main.thick / 2)) + plan.moat.gap
    let run = line
    if (c.moatSkip) {
      const d = norm(sub(line[1]!, line[0]!))
      run = [add(line[0]!, mul(d, c.moatSkip)), ...line.slice(1)]
    }
    water.push({ id: `${c.id}-moat`, poly: [...offsetLine(run, out * m0), ...offsetLine(run, out * (m0 + plan.moat.width)).reverse()], level: -1, plan: plan.moat.plan, height: plan.moat.height })
  }

  /* ── blocks: rects, local boxes, polygons, with doors, courts and facades ── */
  const groundRef = { fn: (_x: number, _z: number): number => plan.ground.base }
  const footprints: Array<{ id: string; poly: P2[] }> = []
  const rectPoly = (c: P2, along: number, across: number, bearing: number): P2[] => {
    const a = F.dir(bearing), cc = F.dir(bearing + 90)
    const ha = along / 2, hc = across / 2
    return [add(add(c, mul(a, -ha)), mul(cc, -hc)), add(add(c, mul(a, ha)), mul(cc, -hc)), add(add(c, mul(a, ha)), mul(cc, hc)), add(add(c, mul(a, -ha)), mul(cc, hc))]
  }
  const scaled = (poly: P2[], k: number): P2[] => {
    const c = centroid(poly)
    return poly.map((p) => add(c, mul(sub(p, c), k)))
  }
  for (const b of plan.blocks) {
    const cls = { plan: b.plan as Cls, height: b.height as Cls }
    // the block's frame: a origin and two axes, a span along and across
    let poly: P2[]
    let axis: { o: P2; a: P2; c: P2; a0: number; a1: number; c0: number; c1: number } | null = null
    if (b.in) {
      const [a0, a1, c0, c1] = b.local as number[]
      const f = frames[b.in]!
      axis = { o: f.o, a: f.a, c: f.c, a0: a0!, a1: a1!, c0: c0!, c1: c1! }
      poly = [local(b.in, a0!, c0!), local(b.in, a1!, c0!), local(b.in, a1!, c1!), local(b.in, a0!, c1!)]
    } else if (b.rect) {
      const c = F.s(b.rect.c[0], b.rect.c[1])
      poly = rectPoly(c, b.rect.along, b.rect.across, b.rect.bearing)
      axis = { o: c, a: F.dir(b.rect.bearing), c: F.dir(b.rect.bearing + 90), a0: -b.rect.along / 2, a1: b.rect.along / 2, c0: -b.rect.across / 2, c1: b.rect.across / 2 }
    } else poly = b.poly.map((p: number[]) => F.s(p[0]!, p[1]!))
    footprints.push({ id: b.id, poly })
    const holes: P2[][] = []
    if (b.holes) for (const h of b.holes) {
      // an outline of UTM points, or a rect [E0, E1, N0, N1]
      if (h.poly) {
        holes.push(h.poly.map((p: number[]) => F.s(p[0]!, p[1]!)))
        continue
      }
      const [e0, e1, n0, n1] = h.rect as number[]
      holes.push([F.s(e0!, n0!), F.s(e1!, n0!), F.s(e1!, n1!), F.s(e0!, n1!)])
    }
    if (b.court) holes.push(scaled(poly, Math.sqrt(b.court)))
    if (b.courtRect) {
      const c = centroid(poly)
      const ea = norm(sub(poly[1]!, poly[0]!)), ec = norm(sub(poly[3]!, poly[0]!))
      const [w, h] = b.courtRect as number[]
      holes.push([add(add(c, mul(ea, -w! / 2)), mul(ec, -h! / 2)), add(add(c, mul(ea, w! / 2)), mul(ec, -h! / 2)), add(add(c, mul(ea, w! / 2)), mul(ec, h! / 2)), add(add(c, mul(ea, -w! / 2)), mul(ec, h! / 2))])
    }
    const ranges = b.ranges ? palaceRanges(b, poly, F.s) : null
    if (ranges) holes.push(...ranges.wells)
    const pushP = (id: string, p: P2[], y0: number, y1: number, hs: P2[][] = []): void => {
      prisms.push({ id, name: b.name, group: 'block', poly: p, holes: hs, y0, y1, plan: cls.plan, height: cls.height, band: 0, ...(b.walk ? { walk: true } : {}) })
    }
    if (b.door && axis) {
      // a passage along the block's own axis, centred, with a plug under the street it carries
      const { a0, a1, c0, c1 } = axis
      const at = (a: number, c: number): P2 => add(add(axis!.o, mul(axis!.a, a)), mul(axis!.c, c))
      const hw = b.door.w / 2
      const mid = add(at((a0 + a1) / 2, 0), [0, 0])
      const floor = streetAt(mid[0], mid[1]).level
      const sill = floor - 0.02
      const quad = (aa0: number, aa1: number, cc0: number, cc1: number): P2[] => [at(aa0, cc0), at(aa1, cc0), at(aa1, cc1), at(aa0, cc1)]
      pushP(`${b.id}-l`, quad(a0, a1, c0, -hw), b.base, b.top)
      pushP(`${b.id}-r`, quad(a0, a1, hw, c1), b.base, b.top)
      pushP(`${b.id}-lintel`, quad(a0, a1, -hw, hw), floor + b.door.h, b.top)
      pushP(`${b.id}-sill`, quad(a0, a1, -hw, hw), b.base, sill)
    } else if (b.facade) {
      // the hall behind, and its north wall in pieces between the doors
      const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1])
      const x0 = Math.min(...xs), x1 = Math.max(...xs), zN = Math.min(...zs), zS = Math.max(...zs)
      const wall = 6
      pushP(`${b.id}-hall`, [[x0, zN + wall], [x1, zN + wall], [x1, zS], [x0, zS]], b.base, b.top)
      const cx = (x0 + x1) / 2
      const doors: number[][] = [...b.facade.doors].sort((p: number[], q: number[]) => p[0]! - q[0]!)
      let from = x0
      doors.forEach((d, k) => {
        const l = cx + d[0]! - d[1]! / 2, r = cx + d[0]! + d[1]! / 2
        pushP(`${b.id}-wall-${k}`, [[from, zN], [l, zN], [l, zN + wall], [from, zN + wall]], b.base, b.top)
        pushP(`${b.id}-over-${k}`, [[l, zN], [r, zN], [r, zN + wall], [l, zN + wall]], b.base + b.facade.h, b.top)
        from = r
      })
      pushP(`${b.id}-wall-end`, [[from, zN], [x1, zN], [x1, zN + wall], [from, zN + wall]], b.base, b.top)
      facts['throne-room'] = { interior: [plan.blocks.find((q: J) => q.id === 'throne-room') ? 51.9 : 0], outer: [x1 - x0, zS - zN], doors: b.facade.doors }
    } else pushP(b.id, poly, b.base, b.top, holes)
    if (ranges) for (const d of ranges.decks) pushP(d.id, d.poly, d.y0, d.y1)
    if (b.front) {
      // the towered wall C6.2 draws before the South Palace's south face: a curtain on the towers' line, its towers
      const fr = b.front, fc = { plan: fr.plan as Cls, height: fr.height as Cls }
      const a = F.s(fr.line[0][0], fr.line[0][1]), c = F.s(fr.line[1][0], fr.line[1][1]), d = norm(sub(c, a))
      prisms.push({ id: `${b.id}-front`, name: fr.name, group: 'wall', poly: bandPoly([a, c], fr.thick / 2), holes: [], y0: fr.base, y1: fr.top, plan: fc.plan, height: fc.height, band: 0 })
      const T = fr.towers
      for (let k = 0; k < T.count; k++) {
        const along = (T.first + k * T.pitch - fr.line[0][0]) / d[0]
        const p = add(a, mul(d, along))
        boxes.push({ id: `${b.id}-front-t0-${k}`, group: 'tower', x: p[0], z: p[1], y0: fr.base, y1: T.top, sx: T.w, sz: T.w, yaw: Math.atan2(-d[1], d[0]), plan: fc.plan, height: fc.height, band: 0 })
      }
    }
  }

  /* ── walls by line: the Kasr's, the lion street's (stepped with the street), embankments, the precinct's ── */
  for (const w of plan.walls) {
    const cls = { plan: w.plan as Cls, height: w.height as Cls }
    let line: P2[] = w.in ? w.line.map((p: number[]) => local(w.in, p[0]!, p[1]!)) : w.line.map((p: number[]) => F.s(p[0]!, p[1]!))
    const base = w.base ?? 0
    if (w.rel === 'street') {
      // pieces one tower pitch long, each level with the street beside its middle
      const a = line[0]!, b = line[line.length - 1]!
      const L = len(sub(b, a)), d = norm(sub(b, a))
      const n = Math.ceil(L / w.towers.pitch)
      for (let k = 0; k < n; k++) {
        const p0 = add(a, mul(d, (k * L) / n)), p1 = add(a, mul(d, ((k + 1) * L) / n))
        const mid = mul(add(p0, p1), 0.5)
        const lv = streetAt(mid[0], mid[1]).level
        // a piece laps 0.3 m into the next, which stands at another height
        pushWall(`${w.id}-${k}`, w.name, [k > 0 ? sub(p0, mul(d, 0.3)) : p0, p1], w.thick, base, lv + w.top, cls)
      }
      towersOn(w.id, [a, b], w.towers, w.towers.side, w.thick / 2, base, cls, (p) => streetAt(p[0], p[1]).level + w.towers.top)
      continue
    }
    const pieces: P2[][] = []
    if (w.gaps) {
      // one straight line with openings
      const a = line[0]!, b = line[1]!
      const L = len(sub(b, a)), d = norm(sub(b, a))
      let from = 0
      for (const g of w.gaps) {
        const gc = F.s(g.at[0], g.at[1])
        const t = (sub(gc, a)[0] * d[0] + sub(gc, a)[1] * d[1])
        pieces.push([add(a, mul(d, from)), add(a, mul(d, t - g.w / 2))])
        from = t + g.w / 2
      }
      pieces.push([add(a, mul(d, from)), add(a, mul(d, L))])
    } else pieces.push(line)
    pieces.forEach((p, k) => pushWall(pieces.length > 1 ? `${w.id}-${k}` : w.id, w.name, p, w.thick, base, w.top, cls))
    if (w.towers) towersOn(w.id, line, w.towers, w.towers.side, w.thick / 2, base, cls)
    line = []
  }

  /* ── the bridge: two land piers, six free piers on a ship's waterline, the deck; t in metres from the axis' east end ── */
  const pierRecords: BoxRec[] = []
  {
    const br = plan.bridge
    const a = F.s(br.axis[0][0], br.axis[0][1]), b = F.s(br.axis[1][0], br.axis[1][1])
    const d = norm(sub(b, a))
    // across the axis toward the north (scene -z): the side the bows face
    const up: P2 = leftOf(d)[1] < 0 ? leftOf(d) : mul(leftOf(d), -1)
    const yaw = Math.atan2(-d[1], d[0])
    const at = (t: number): P2 => add(a, mul(d, t))
    const P = br.piers, A = br.abutments
    const piers: number[] = []
    for (let i = 0; i < P.count; i++) piers.push(P.first + i * (P.along + P.gap))
    // the batter: every outline point drawn toward the centre so each side leans in by `batter` a metre of height
    const hu = Math.max(...P.outline.map((q: number[]) => Math.abs(q[0]!))), hv = Math.max(...P.outline.map((q: number[]) => Math.abs(q[1]!)))
    const inset = P.batter * (P.top - P.base)
    const shape = (c: P2, ku: number, kv: number): P2[] => P.outline.map((q: number[]) => add(add(c, mul(d, q[0]! * ku)), mul(up, q[1]! * kv)))
    piers.forEach((t, i) => {
      const c = at(t)
      prisms.push({ id: `bridge-pier-${i + 1}`, name: br.name, group: 'bridge', poly: shape(c, 1, 1), top: shape(c, (hu - inset) / hu, (hv - inset) / hv), holes: [], y0: P.base, y1: P.top, plan: P.plan, height: P.height, band: 0 })
      pierRecords.push({ id: `bridge-pier-${i + 1}`, group: 'bridge', x: c[0], z: c[1], y0: P.base, y1: P.top, sx: P.along, sz: P.across, yaw, plan: P.plan, height: P.height, band: 0, hidden: true })
    })
    for (const [id, s] of [['bridge-abutment-east', A.east], ['bridge-abutment-west', A.west]] as Array<[string, J]>) {
      const c = at((s.from + s.to) / 2)
      boxes.push({ id, group: 'bridge', x: c[0], z: c[1], y0: A.base, y1: A.top, sx: s.to - s.from, sz: s.across, yaw, plan: A.plan, height: A.height, band: 0 })
    }
    // the deck spans the street's deck points (the axis ends) and no further: past them the street's own surface lies at the
    // same level, and a deck reaching over it fought it in depth
    const e0 = a, e1 = b
    const l0 = streetAt(e0[0], e0[1]).level, l1 = streetAt(e1[0], e1[1]).level
    ramps.push({ id: 'bridge-deck', group: 'bridge', a: e0, b: e1, y0: l0, y1: l1, w: br.deck.w, floor: Math.min(l0, l1) - br.deck.thick, plan: br.deck.plan, height: br.deck.height, band: 0 })
    facts['bridge'] = { piers: piers.map((t) => F.utm(...at(t))), abutmentsInner: [A.east.to, A.west.from], span: A.west.from - A.east.to, overall: A.west.to - A.east.from }
  }

  /* ── Etemenanki: stages and stairs ── */
  {
    const T = plan.tower
    const f = frames[T.in]!
    const yaw = Math.atan2(-f.a[1], f.a[0])
    let y = T.base
    const tower: Array<{ side: number; y0: number; y1: number }> = []
    T.stages.forEach((st: J, i: number) => {
      boxes.push({ id: `tower-stage-${i + 1}`, group: 'tower-stage', x: f.o[0], z: f.o[1], y0: i === 0 ? 0 : y - 0.05, y1: y + st.h, sx: st.side, sz: st.across ?? st.side, yaw, plan: st.plan, height: st.height, band: i === 0 ? 0 : -1 })
      tower.push({ side: st.side, y0: y, y1: y + st.h })
      y += st.h
    })
    const half = T.stages[0].side / 2
    const top1 = T.base + T.stairs.middle.top
    const m = T.stairs.middle
    ramps.push({ id: 'tower-stair-middle', group: 'stair', a: local(T.in, half + m.from, 0), b: local(T.in, half - 0.5, 0), y0: T.base, y1: top1, w: m.w, floor: 0, plan: m.plan, height: m.height, band: 0 })
    const sd = T.stairs.side
    for (const s of [-1, 1]) {
      ramps.push({ id: `tower-stair-${s < 0 ? 'east' : 'west'}`, group: 'stair', a: local(T.in, half + sd.w / 2, s * half), b: local(T.in, half + sd.w / 2, s * (half - sd.run)), y0: T.base, y1: top1, w: sd.w, floor: 0, plan: sd.plan, height: sd.height, band: 0 })
    }
    facts['tower'] = { base: T.stages[0].side, height: y - T.base, top: y, stages: tower, middleStairFrom: m.from }
  }

  /* ── the ground: the plain, the rises, the street's pull, the beds under water ── */
  const G = plan.ground
  const pts = G.points.map((p: J) => ({ at: F.s(p.at[0], p.at[1]), level: p.level as number, r: p.r as number }))
  const waterBoxes = water.map((w) => {
    const xs = w.poly.map((p) => p[0]), zs = w.poly.map((p) => p[1])
    return { w, x0: Math.min(...xs) - G.bedBlend, x1: Math.max(...xs) + G.bedBlend, z0: Math.min(...zs) - G.bedBlend, z1: Math.max(...zs) + G.bedBlend }
  })
  const field = (x: number, z: number): number => {
    let sw = G.baseWeight, sv = G.base * G.baseWeight
    for (const p of pts) {
      const q = Math.exp(-((x - p.at[0]) ** 2 + (z - p.at[1]) ** 2) / (p.r * p.r))
      sw += q
      sv += q * p.level
    }
    return sv / sw
  }
  // a quarter laid at one level (a dug house's street), flat inside its outline and easing back over `blend` metres
  const flats: Array<{ poly: P2[]; level: number; blend: number }> = (G.flats ?? []).map((f: J) => ({ poly: f.poly.map((p: number[]) => F.s(p[0]!, p[1]!)), level: f.level, blend: f.blend }))
  const ground = (x: number, z: number): number => {
    let h = field(x, z)
    const st = streetAt(x, z)
    if (st.d < 60) {
      const edge = st.d - st.w / 2
      const k = edge <= 8 ? 1 : edge >= 40 ? 0 : 1 - (edge - 8) / 32
      const want = st.level - 0.25
      h = h + (want - h) * (k * k * (3 - 2 * k))
    }
    for (const f of flats) {
      const k = pointInPoly([x, z], f.poly) ? 1 : Math.max(0, 1 - polyEdgeDist([x, z], f.poly) / f.blend)
      if (k > 0) h = h + (f.level - h) * (k * k * (3 - 2 * k))
    }
    for (const wb of waterBoxes) {
      if (x < wb.x0 || x > wb.x1 || z < wb.z0 || z > wb.z1) continue
      const blend = wb.w.id === 'canal' ? 0.8 : G.bedBlend
      const inside = pointInPoly([x, z], wb.w.poly)
      if (inside) return G.bed
      const d = polyEdgeDist([x, z], wb.w.poly)
      if (d < blend) h = G.bed + (h - G.bed) * (d / blend)
    }
    return h
  }
  groundRef.fn = ground

  const floors = prisms.filter((p) => p.walk)
  const stand = (x: number, z: number): number => {
    const st = streetAt(x, z)
    let y = st.d <= st.w / 2 + 0.5 ? st.level : ground(x, z)
    for (const p of floors) if (p.y1 > y && pointInPoly([x, z], p.poly) && !p.holes.some((h) => pointInPoly([x, z], h))) y = p.y1
    return y
  }

  /* the class band sits on the ground beside each body; a body that starts in the air (a lintel over a door) has none */
  const bandFor = (poly: P2[], y0: number): number => {
    const c = centroid(poly)
    let under = -Infinity
    for (const p of [...poly, c]) under = Math.max(under, stand(p[0], p[1]))
    for (const q of prisms) if (q.y1 <= y0 + 0.5 && q.y1 > under && pointInPoly(c, q.poly)) under = q.y1
    if (y0 > under + 1) return y0 - 1
    let lo = Infinity
    for (const p of [...poly, c]) lo = Math.min(lo, ground(p[0], p[1]))
    return Math.max(y0, lo) + BAND
  }
  for (const p of prisms) p.band = bandFor(p.poly, p.y0)
  // a body standing on the ground (not on another body) reaches down under every corner, so no slope shows a gap under it
  for (const p of prisms) {
    if (p.band === p.y0 - 1) continue
    let lo = Infinity, hi = -Infinity
    for (const q of p.poly) { const g = ground(q[0], q[1]); lo = Math.min(lo, g); hi = Math.max(hi, g) }
    if (p.y0 <= hi + 0.5) p.y0 = Math.min(p.y0, lo - 0.3)
  }
  for (const b of boxes) if (b.band === 0) b.band = Math.max(b.y0, ground(b.x, b.z)) + BAND
  for (const r of ramps) r.band = Math.max(r.floor, Math.min(ground(...r.a), ground(...r.b))) + BAND
  for (const b of boxes) if (b.band === -1) b.band = b.y0 - 1

  /* ── the filled city: courtyard houses on a grid, as a type ── */
  let houses = 0
  if (opts.houses !== false) {
    const H = plan.houses
    const R = rng(H.seed)
    const u = F.dir(H.bearing), v = F.dir(H.bearing + 90)
    const yawH = Math.atan2(-u[1], u[0])
    const keep = H.keepOut.map((k: J) => k.poly.map((p: number[]) => F.s(p[0]!, p[1]!)) as P2[])
    const blocked = (p: P2, clear: number): boolean => {
      for (const k of keep) if (pointInPoly(p, k)) return true
      for (const f of footprints) if (pointInPoly(p, f.poly) || polyEdgeDist(p, f.poly) < clear) return true
      for (const w of water) if (pointInPoly(p, w.poly) || polyEdgeDist(p, w.poly) < 8) return true
      for (const wl of wallLines) for (let i = 0; i + 1 < wl.line.length; i++) if (segDist(p, wl.line[i]!, wl.line[i + 1]!).d < wl.half + clear + 4) return true
      const st = streetAt(p[0], p[1])
      if (st.d < st.w / 2 + H.streetClear) return true
      return false
    }
    for (const reg of H.regions) {
      const poly: P2[] = reg.poly.map((p: number[]) => F.s(p[0]!, p[1]!))
      const us = poly.map((p) => p[0] * u[0] + p[1] * u[1]), vs = poly.map((p) => p[0] * v[0] + p[1] * v[1])
      const U0 = Math.min(...us), U1 = Math.max(...us), V0 = Math.min(...vs), V1 = Math.max(...vs)
      const at = (uu: number, vv: number): P2 => add(mul(u, uu), mul(v, vv))
      for (let bu = U0; bu < U1;) {
        const bw = H.block[0] + R() * (H.block[1] - H.block[0])
        for (let bv = V0; bv < V1;) {
          const bh = H.block[0] + R() * (H.block[1] - H.block[0])
          // two rows of houses back to back, each row cut into lots; a lane now and then
          const rows = bh > 70 ? 2 : 2
          const rowDepth = bh / rows
          for (let r = 0; r < rows; r++) {
            let lu = bu
            while (lu < bu + bw - 8) {
              const lw = Math.min(H.lot[0] + R() * (H.lot[1] - H.lot[0]), bu + bw - lu)
              if (bu + bw - lu - lw < H.lot[0] * 0.7) {
                /* the last lot takes the rest */
              }
              const lwUse = bu + bw - lu - lw < H.lot[0] * 0.7 ? bu + bw - lu : lw
              const v0 = bv + r * rowDepth, v1 = v0 + rowDepth
              const cU = lu + lwUse / 2, cV = (v0 + v1) / 2
              const c = at(cU, cV)
              const corners = [at(lu, v0), at(lu + lwUse, v0), at(lu + lwUse, v1), at(lu, v1)]
              const inside = corners.every((p) => pointInPoly(p, poly)) && pointInPoly(c, poly)
              const lane = R() < 0.08
              if (inside && !lane && !corners.some((p) => blocked(p, H.blockClear)) && !blocked(c, H.blockClear)) {
                const g = ground(c[0], c[1])
                const top = g + H.height[0] + R() * (H.height[1] - H.height[0])
                const y0 = g - 0.6
                // the house: four ranges round a court
                const ck = Math.sqrt(H.court)
                const cw = lwUse * ck, cd = rowDepth * ck
                const rN = (rowDepth - cd) / 2, rW = (lwUse - cw) / 2
                const box = (du: number, dv: number, su: number, sv: number, k: string): void => {
                  const p = at(cU + du, cV + dv)
                  boxes.push({ id: `house-${houses}-${k}`, group: 'house', x: p[0], z: p[1], y0, y1: top, sx: su, sz: sv, yaw: yawH, plan: 'G', height: 'G', band: g + BAND })
                }
                box(0, -rowDepth / 2 + rN / 2, lwUse, rN, 'n')
                box(0, rowDepth / 2 - rN / 2, lwUse, rN, 's')
                box(-lwUse / 2 + rW / 2, 0, rW, cd, 'w')
                box(lwUse / 2 - rW / 2, 0, rW, cd, 'e')
                houses++
              }
              lu += lwUse
            }
          }
          bv += bh + (R() < 0.3 ? H.street : H.lane)
        }
        bu += bw + (R() < 0.35 ? H.street : H.lane)
      }
    }
  }

  // the piers' footprint boxes go last, so a page's drawn boxes keep their order
  boxes.push(...pierRecords)
  facts['street'] = street.map((p) => ({ utm: F.utm(p.x, p.z), s: Math.round(p.s * 10) / 10, level: p.level }))
  facts['streetLevelAtS'] = streetLevelAtS
  // the same for the boxes standing on the ground (towers, houses): down to the lowest corner
  for (const r of boxes) {
    if (r.group === 'tower-stage' || r.band === r.y0 - 1) continue
    const c = Math.cos(r.yaw), sn = Math.sin(r.yaw)
    let lo = Infinity, hi = -Infinity
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const g = ground(r.x + (u * r.sx * c) / 2 + (v * r.sz * sn) / 2, r.z - (u * r.sx * sn) / 2 + (v * r.sz * c) / 2)
      lo = Math.min(lo, g)
      hi = Math.max(hi, g)
    }
    if (r.y0 <= hi + 0.5) r.y0 = Math.min(r.y0, lo - 0.3)
  }
  return { prisms, boxes, ramps, water, street, ground, streetAt, stand, houses, facts }
}
