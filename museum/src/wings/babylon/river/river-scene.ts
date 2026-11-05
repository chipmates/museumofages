/* FEATURE 10'S DRAWING: an ink map, north up, of the river at the bridge in dated states, and last the photograph.
   The states jump at the half step, never morph: no river line of any date is a found line and no move between two
   states is measured. The piers are drawn from one set of coordinates in every state. Pure: no DOM. */

import type { PaperFraming } from '../paper/framing'
import type { Box, Seg, Taken } from '../paper/placer'
import { settledAt, type Anchor, type Inset, type PaperScene, type Prim } from '../paper/scene'
import { BRIDGE, DECK_W, DIG, PHOTO, QUAY, RIVER_570, TODAY, WINDOWS, type P2 } from './river-data'

export const STEP_IDS = ['then', 'dig', 'today', 'photo'] as const
export type StepId = typeof STEP_IDS[number]
export type RiverLabel = 'river' | 'width' | 'pier' | 'channel' | 'road' | 'north' | 'year' | 'credit'

/** what each state draws: the land piers the record holds at that date (Koldewey dug seven: the six and the west one) */
const PIERS_OF: Record<StepId, readonly string[]> = {
  then: ['land-east', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'land-west'],
  dig: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'land-west'],
  today: ['land-east', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'land-west'],
  photo: [],
}

/* ── the bridge's own frame: t metres west along the axis from the quay, c metres toward the north ── */
const A = BRIDGE.axis[0]!, Bw = BRIDGE.axis[1]!
const LEN = Math.hypot(Bw[0] - A[0], Bw[1] - A[1])
const D: P2 = [(Bw[0] - A[0]) / LEN, (Bw[1] - A[1]) / LEN]
const NN: P2 = D[1] < 0 ? [D[1], -D[0]] : [-D[1], D[0]]
export const at = (t: number, c: number): P2 => [A[0] + D[0] * t + NN[0] * c, A[1] + D[1] * t + NN[1] * c]

/** every pier's outline in UTM, by id: the same numbers in every state */
export function pierOutlines(): Record<string, P2[]> {
  const P = BRIDGE.piers, L = BRIDGE.abutments
  const out: Record<string, P2[]> = {}
  for (let i = 0; i < P.count; i++) {
    const t = P.first + i * (P.along + P.gap)
    out[`p${i + 1}`] = BRIDGE.outline.map(([u, v]) => at(t + u, v))
  }
  const rect = (from: number, to: number, half: number): P2[] => [at(from, -half), at(to, -half), at(to, half), at(from, half)]
  out['land-east'] = rect(L.east.from, L.east.to, L.east.across / 2)
  out['land-west'] = rect(L.west.from, L.west.to, L.west.across / 2)
  return out
}

/** a line offset sideways by d (positive to the left going along it), joined at its corners */
function offset(line: readonly P2[], d: number): P2[] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d] as P2
  })
}

/** Sutherland-Hodgman: a polygon cut to a box (plate pixels) */
function clipPoly(pts: readonly P2[], b: Box): P2[] {
  let out = pts.slice() as P2[]
  const edges: [(p: P2) => boolean, (p: P2, q: P2) => P2][] = [
    [(p) => p[0] >= b.l, (p, q) => [b.l, p[1] + ((q[1] - p[1]) * (b.l - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b.r, (p, q) => [b.r, p[1] + ((q[1] - p[1]) * (b.r - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b.t, (p, q) => [p[0] + ((q[0] - p[0]) * (b.t - p[1])) / (q[1] - p[1]), b.t]],
    [(p) => p[1] <= b.b, (p, q) => [p[0] + ((q[0] - p[0]) * (b.b - p[1])) / (q[1] - p[1]), b.b]],
  ]
  for (const [inside, cut] of edges) {
    const src = out
    out = []
    for (let i = 0; i < src.length; i++) {
      const p = src[i]!, q = src[(i + 1) % src.length]!
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q) }
      else if (inside(p)) out.push(cut(p, q))
    }
  }
  return out
}

/** an open line cut to a box: the runs inside it */
function clipRuns(pts: readonly P2[], b: Box): P2[][] {
  const inside = (p: P2): boolean => p[0] >= b.l && p[0] <= b.r && p[1] >= b.t && p[1] <= b.b
  const runs: P2[][] = []
  let cur: P2[] = []
  const cross = (p: P2, q: P2): P2 => {
    // the point where p to q leaves (or enters) the box, by the largest step inside
    let lo = 0, hi = 1
    const pin = inside(p)
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; const x: P2 = [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m]; if (inside(x) === pin) lo = m; else hi = m }
    const m = pin ? lo : hi
    return [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m]
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (inside(p)) {
      if (!cur.length && i > 0) cur.push(cross(p, pts[i - 1]!))
      cur.push(p)
    } else if (cur.length) { cur.push(cross(cur[cur.length - 1]!, p)); runs.push(cur); cur = [] }
  }
  if (cur.length >= 2) runs.push(cur)
  return runs.filter((r) => r.length >= 2)
}

const f = (n: number): string => (Math.round(n * 10) / 10).toString()
const pathOf = (pts: readonly P2[], close = false): string => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}${close ? 'Z' : ''}`
const boxOf = (pts: readonly P2[]): Box => ({ l: Math.min(...pts.map((p) => p[0])), t: Math.min(...pts.map((p) => p[1])), r: Math.max(...pts.map((p) => p[0])), b: Math.max(...pts.map((p) => p[1])) })

export interface RiverFacts {
  step: number
  state: StepId
  scale: number
  piers: { id: string; box: Box }[]
  /** where today's channel's east bank and the 570 quay's water face cross the bridge's line, plate x (for the tests) */
  bridgeLine: { today: number | null; quay: number | null; westEnd: number }
  photo: Box | null
}

export function riverScene(t: number, framing: PaperFraming, w: number, h: number, o: { inset: Inset }): PaperScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const wide = framing === 'wide'
  const I = o.inset
  const box: Box = { l: I.l, t: I.t, r: w - I.r, b: h - I.b }
  const bw = box.r - box.l, bh = box.b - box.t
  const settled = settledAt(t)
  // a jump at the half step: between two steps the nearer state stands whole
  const si = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(t)))
  const state = STEP_IDS[si]!
  const labels = settled !== null

  /* THE MAP'S FRAME: the window fitted inside the plate, north up, one scale both ways */
  const Wn = WINDOWS[wide ? 'wide' : 'upright']
  const k = Math.min(bw / (Wn.e - Wn.w), bh / (Wn.n - Wn.s))
  const Ec = (Wn.w + Wn.e) / 2, Nc = (Wn.s + Wn.n) / 2
  const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2
  const P = (p: P2): P2 => [cx + (p[0] - Ec) * k, cy - (p[1] - Nc) * k]
  const map: Box = { l: Math.max(box.l, P([Wn.w, Wn.n])[0]), t: Math.max(box.t, P([Wn.w, Wn.n])[1]), r: Math.min(box.r, P([Wn.e, Wn.s])[0]), b: Math.min(box.b, P([Wn.e, Wn.s])[1]) }
  const wallsOf = (pts: readonly P2[]): void => { for (let q = 0; q + 1 < pts.length; q++) walls.push({ ax: pts[q]![0], ay: pts[q]![1], bx: pts[q + 1]![0], by: pts[q + 1]![1] }) }
  const line = (id: string, mark: 'known' | 'guessed' | 'place', pts: readonly P2[], cls?: string): void => {
    for (const [j, run] of clipRuns(pts.map(P), map).entries()) {
      prims.push({ type: 'path', id: `${id}-${j}`, mark, d: pathOf(run), cls })
      wallsOf(run)
    }
  }

  const piers: RiverFacts['piers'] = []
  let bridgeToday: number | null = null, bridgeQuay: number | null = null
  const bridgeY = P(at(LEN / 2, 0))[1]
  const westEnd = P(at(BRIDGE.abutments.west.to, 0))[0]
  // the x where a line crosses the bridge's axis, in plate pixels
  const crossAxis = (pts: readonly P2[]): number | null => {
    const q = pts.map(P)
    for (let i = 0; i + 1 < q.length; i++) {
      const a = q[i]!, b = q[i + 1]!
      if ((a[1] - bridgeY) * (b[1] - bridgeY) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (bridgeY - a[1])) / (b[1] - a[1])
    }
    return null
  }

  if (state !== 'photo') {
    /* THE RIVER OF ABOUT 570 BC in the stop's own colour, its west bank dashed: drawn, never dug */
    if (state === 'then') {
      const water = clipPoly(RIVER_570.poly.map(P), map)
      if (water.length >= 3) prims.push({ type: 'path', id: 'water-570', mark: 'known', cls: 'river-water', d: pathOf(water, true) })
      const west = RIVER_570.poly.slice(RIVER_570.westFrom).filter((p) => p[1] >= RIVER_570.westBank.from && p[1] <= RIVER_570.westBank.to)
      line('bank-570', 'guessed', west, 'paper-open river-bank')
    }
    /* TODAY: the channel the 2004 picture shows, in place; the old bed's west edge dashed, the road in the old bed */
    if (state === 'today') {
      const channel = clipPoly([...TODAY.west, ...TODAY.east.slice().reverse()].map(P), map)
      if (channel.length >= 3) prims.push({ type: 'path', id: 'channel-today', mark: 'place', cls: 'river-channel', d: pathOf(channel, true) })
      for (const side of ['west', 'east'] as const) for (const run of clipRuns(TODAY[side].map(P), map)) wallsOf(run)
      const west = RIVER_570.poly.slice(RIVER_570.westFrom).filter((p) => p[1] >= RIVER_570.westBank.from && p[1] <= RIVER_570.westBank.to)
      line('bed-570', 'guessed', west, 'paper-open river-bed')
      line('road', 'known', TODAY.road, 'river-road')
      bridgeToday = crossAxis(TODAY.east)
    }
    /* THE QUAY of about 570 BC: the wall's band in a fine plain outline, in every map state */
    for (const [id, l] of [['quay-north', QUAY.north], ['quay-south', QUAY.south]] as const) {
      const band = [...offset(l, QUAY.thick / 2), ...offset(l, -QUAY.thick / 2).reverse()]
      const clipped = clipPoly(band.map(P), map)
      if (clipped.length >= 3) { prims.push({ type: 'path', id, mark: 'known', cls: 'river-quay', d: pathOf(clipped, true) }); wallsOf([...clipped, clipped[0]!]) }
    }
    bridgeQuay = crossAxis(offset(QUAY.north, -QUAY.thick / 2).concat(offset(QUAY.south, -QUAY.thick / 2)))
    /* THE DIG of 1910 to 1911: the trench round the dug piers, its outline ours (dashed, open) */
    if (state === 'dig') {
      const T = DIG.trench
      const pts = [at(T.from, -T.half), at(T.to, -T.half), at(T.to, T.half), at(T.from, T.half)].map(P)
      prims.push({ type: 'path', id: 'trench', mark: 'guessed', cls: 'paper-open river-trench', d: pathOf(pts, true) })
      wallsOf([...pts, pts[0]!])
    }
    /* THE DECK of 570, hatched: Guessed */
    if (state === 'then') {
      const deck = [at(0, -DECK_W / 2), at(BRIDGE.abutments.west.to, -DECK_W / 2), at(BRIDGE.abutments.west.to, DECK_W / 2), at(0, DECK_W / 2)].map(P)
      prims.push({ type: 'path', id: 'deck', mark: 'guessed', cls: 'river-deck', d: pathOf(deck, true) })
      taken.push({ ...boxOf(deck), id: 'deck' })
    }
    /* THE PIERS, heavy and solid, from one set of coordinates in every state */
    const outlines = pierOutlines()
    for (const id of PIERS_OF[state]) {
      const pts = outlines[id]!.map(P)
      prims.push({ type: 'path', id: `pier-${id}`, mark: 'place', cls: 'river-pier', d: pathOf(pts, true) })
      const b = boxOf(pts)
      taken.push({ l: b.l - 1.5, t: b.t - 1.5, r: b.r + 1.5, b: b.b + 1.5, id: `pier-${id}` })
      piers.push({ id, box: { l: +b.l.toFixed(2), t: +b.t.toFixed(2), r: +b.r.toFixed(2), b: +b.b.toFixed(2) } })
    }
    /* NORTH: our pencil arrow at the drawing's top right (a wide plate's paper runs on past the drawing) */
    const nx = Math.min(map.r - 14, P([445760, 0])[0]), ny = map.t + 8, len = wide ? 30 : 24
    prims.push({ type: 'path', id: 'north', mark: 'pencil', width: 1.25, d: `M${f(nx)} ${f(ny + len)}L${f(nx)} ${f(ny)}M${f(nx - 4)} ${f(ny + 6)}L${f(nx)} ${f(ny)}L${f(nx + 4)} ${f(ny + 6)}` })
    taken.push({ l: nx - 5, t: ny - 1, r: nx + 5, b: ny + len + 1, id: 'north' })

    if (labels) {
      anchors.push({ id: 'north', x: nx, y: ny + len / 2, sides: ['left'], gap: 6, kind: 'pencil' })
      if (state === 'then') {
        // the width across the water between the land piers' inner faces, a pencil measure north of the bridge
        const c = 40
        const a0 = P(at(BRIDGE.abutments.east.to, c)), a1 = P(at(BRIDGE.abutments.west.from, c))
        const tick = (p: P2): string => { const n = [-(a1[1] - a0[1]), a1[0] - a0[0]], l = Math.hypot(n[0]!, n[1]!); return `M${f(p[0] - (n[0]! / l) * 5)} ${f(p[1] - (n[1]! / l) * 5)}L${f(p[0] + (n[0]! / l) * 5)} ${f(p[1] + (n[1]! / l) * 5)}` }
        prims.push({ type: 'path', id: 'width', mark: 'pencil', width: 1.25, d: `M${f(a0[0])} ${f(a0[1])}L${f(a1[0])} ${f(a1[1])}${tick(a0)}${tick(a1)}` })
        taken.push({ ...boxOf([a0, a1]), t: Math.min(a0[1], a1[1]) - 5, b: Math.max(a0[1], a1[1]) + 5, id: 'width' })
        const mid: P2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2]
        // the recorded width is set in ink like the map's names (text keeps 4.5:1 on the water's wash), its line is our pencil
        anchors.push({ id: 'width', x: mid[0], y: mid[1], sides: ['above', 'above-left', 'above-right'], gap: 6, kind: 'ink' })
        const r = P(wide ? [445450, 3600020] : [445440, 3600160])
        anchors.push({ id: 'river', x: r[0], y: r[1], sides: ['on'], gap: 0, kind: 'ink' })
      }
      if (state === 'dig') {
        const p = P(at(BRIDGE.piers.first, -DIG.trench.half))
        anchors.push({ id: 'pier', x: p[0], y: p[1], sides: ['below', 'below-left', 'below-right'], gap: 8, kind: 'ink' })
      }
      if (state === 'today') {
        // the channel's name beside it where the plate has room: up the channel on a wide plate, south of the bridge upright
        const c = P(wide ? [444960, 3600080] : [445312, 3599480])
        anchors.push({ id: 'channel', x: c[0], y: c[1], sides: wide ? ['right', 'above-right', 'left', 'below-left'] : ['right', 'below-right', 'above-right'], gap: 10, kind: 'ink' })
        const rd = P(TODAY.road[2]!)
        anchors.push({ id: 'road', x: rd[0], y: rd[1], sides: ['right', 'left'], gap: 8, kind: 'ink' })
      }
    }
  }

  /* LAST, THE PHOTOGRAPH: Gadmer's 1927 autochrome on its own, dated on the plate, its credit printed under it */
  let photo: Box | null = null
  if (state === 'photo') {
    const C = PHOTO.crop, cw = C.r - C.l, ch = C.b - C.t
    const yearRoom = 34, creditRoom = wide ? 26 : 62
    const room = { w: bw, h: bh - yearRoom - creditRoom }
    const s = Math.min(room.w / cw, room.h / ch)
    const pw = cw * s, ph = ch * s
    const px = cx - pw / 2, py = box.t + yearRoom + (room.h - ph) / 2
    photo = { l: px, t: py, r: px + pw, b: py + ph }
    prims.push({ type: 'image', id: 'photo', key: 'photo', x: px - C.l * s, y: py - C.t * s, w: PHOTO.file.w * s, h: PHOTO.file.h * s, fit: 'fill', clip: photo })
    taken.push({ ...photo, id: 'photo' })
    if (labels) {
      anchors.push({ id: 'year', x: px, y: py, sides: ['above-right'], gap: 6, kind: 'ink' })
      // the credit under the picture, from its left edge on a wide plate, centred under it upright (it takes the plate's width)
      anchors.push(wide ? { id: 'credit', x: px, y: py + ph, sides: ['below-right'], gap: 6, kind: 'credit', width: pw - 2 }
        : { id: 'credit', x: px + pw / 2, y: py + ph, sides: ['below'], gap: 6, kind: 'credit', width: pw - 2 })
    }
  }

  const facts: RiverFacts = { step: settled ?? -1, state, scale: Math.round(k * 1000) / 1000, piers, bridgeLine: { today: bridgeToday, quay: bridgeQuay, westEnd }, photo }
  return { prims, anchors, taken, walls, bounds: box, facts: facts as unknown as Record<string, unknown> }
}
