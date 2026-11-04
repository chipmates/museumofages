/* FEATURE 7 AS A DRAWING: what stands on the plate at any point of the slider,
   in the plate's pixels. Pure, so the same scene is drawn by the page and
   checked by node (every step's labels placed without a touch, in English and
   German, wide and upright).

   Side-on, the tower's foot on the ground line: under it what was dug (the
   core's stump and the mantle's footings, in place, heavy and solid); above
   it nothing at "not known", one dashed line at "about 66 m" with no outline,
   the tablet's stages hatched at "about 90 m". Beside it grey figures of 1.70
   m stand on each other's heads, as many as each reading holds, with one
   figure drawn large in a key. Then the bricks of one model in pencil squares
   of a million, and the city walls as twelve to fifteen of the tower's whole
   count, each shrunk to one mark. */

// the kit's pure modules one by one, not its index (which brings the sheet's style), so node draws the scene too
import { figurePath, figuresFor, stackPath, FIGURE_M } from '../paper/figure'
import { unitGrid, gridBox } from '../paper/counter'
import type { Box, Seg, Side, Taken } from '../paper/placer'
import type { PaperFraming } from '../paper/plate'
import { BRICKS, READINGS, TOWER, tabletHeight } from './measure-data'

export type PrimMark = 'place' | 'known' | 'guessed' | 'measure' | 'pencil'
export type Prim =
  | { type: 'rect'; id: string; mark: PrimMark; x: number; y: number; w: number; h: number; cls?: string; alpha?: number }
  | { type: 'line'; id: string; mark: PrimMark; ax: number; ay: number; bx: number; by: number; cls?: string; alpha?: number; width?: number }
  | { type: 'path'; id: string; mark: PrimMark; d: string; cls?: string; alpha?: number; width?: number }

export type LabelKey = 'base' | 'notKnown' | 'about66' | 'about90' | 'figure' | 'count' | 'oneModel' | 'mudPair' | 'bakedPair'
  | 'tower' | 'walls' | 'lo' | 'hi'
export interface Anchor { id: LabelKey; x: number; y: number; sides: readonly Side[]; gap: number; kind: 'ink' | 'pencil' | 'quiet' | 'count' | 'big' | 'pair'; over?: string[]; alpha?: number }

export interface MeasureScene {
  prims: Prim[]
  /** the labels this point of the slider shows, in the order they are placed */
  anchors: Anchor[]
  /** what the labels must stay clear of */
  taken: Taken[]
  walls: Seg[]
  bounds: Box
  /** the stack's count and the stages' share drawn, for the list and the readout */
  figures: number
  stages: number
  units: { mud: number; baked: number }
  marks: number
  /** the elevation's scale, pixels a metre */
  s: number
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const ease = (x: number): number => { const u = clamp01(x); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
const lerpBox = (a: Box, b: Box, u: number): Box => ({ l: lerp(a.l, b.l, u), t: lerp(a.t, b.t, u), r: lerp(a.r, b.r, u), b: lerp(a.b, b.b, u) })
/** a span of the slider as 0 to 1 */
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a))

const HALF = TOWER.base / 2
/** the stack stands this far beyond the tower's side, metres */
const STACK_OFF = 6
/** air in pixels: over the top label, under the dimension's label, beside the stack's count */
const HEAD = 46, FOOT = 34, SIDE = 40
/** metres under the foot: the dug section and the dimension line under it */
const UNDER = -TOWER.mantle.foot + 4.5

interface Zones { elev: Box; counter: Box }

/** THE PLATE'S ROOMS: while it measures, the elevation and its key; while it counts, the elevation steps aside for the counter */
function zones(framing: PaperFraming, w: number, h: number, count: number): Zones {
  const u = ease(count)
  if (framing === 'wide') {
    const pad = Math.max(20, w * 0.035)
    const measuring = { l: w * 0.1, t: pad, r: w * 0.66, b: h - pad * 0.6 }
    const counting = { l: pad, t: pad, r: w * 0.5, b: h - pad * 0.6 }
    return { elev: lerpBox(measuring, counting, u), counter: { l: w * 0.56, t: pad + 8, r: w - pad, b: h - pad } }
  }
  const pad = 12
  const split = lerp(h - pad, h * 0.34, u)
  return { elev: { l: pad, t: pad, r: w - pad, b: split }, counter: { l: pad + 4, t: split + 8, r: w - pad - 4, b: h - pad } }
}

/** the tower's frame: its middle, its foot, its scale, fitted into a zone */
function towerFrame(z: Box, head = HEAD): { s: number; gx: number; gy: number } {
  const top = tabletHeight()
  const sv = (z.b - z.t - head - FOOT) / (top + UNDER)
  const sh = (z.r - z.l - SIDE) / (TOWER.base + STACK_OFF + 1)
  const s = Math.max(0.5, Math.min(sv, sh))
  const used = (TOWER.base + STACK_OFF + 1) * s + SIDE
  const gx = z.l + (z.r - z.l - used) / 2 + HALF * s
  const gy = z.t + head + top * s
  return { s, gx, gy }
}

/** the tower's stepped outline in the tablet's stages, as a mark in a box: the counted group "one tower" */
export function towerMark(x: number, foot: number, w: number, h: number): string {
  return stagesOutline(x, foot, w / TOWER.base, h / tabletHeight(), tabletHeight())
}

/** THE TABLET'S TOWER as one closed outline, up to `reach` metres: its silhouette, for the hatch */
function stagesOutline(x: number, foot: number, sx: number, sy: number, reach: number): string {
  const left: [number, number][] = []
  let y = 0
  for (const st of TOWER.stages) {
    if (y >= reach) break
    const top = Math.min(y + st.h, reach)
    left.push([-st.side / 2, y], [-st.side / 2, top])
    y += st.h
  }
  const all = [...left, ...left.map(([px, py]) => [-px, py] as [number, number]).reverse()]
  return `M${all.map(([px, py]) => `${(x + px * sx).toFixed(2)} ${(foot - py * sy).toFixed(2)}`).join('L')}Z`
}

export function measureScene(t: number, framing: PaperFraming, w: number, h: number): MeasureScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const count = span(t, 3, 4)
  const wide = framing === 'wide'
  const z = zones(framing, w, h, count)
  // upright, the counting plate has no reading over the tower to keep air for
  const { s, gx, gy } = towerFrame(z.elev, wide ? HEAD : lerp(HEAD, 10, ease(count)))
  const X = (m: number): number => gx + m * s
  const Y = (m: number): number => gy - m * s
  const settled = Math.abs(t - Math.round(t)) < 1e-3
  const step = Math.round(t)

  // the ground line, known: the court's level at the tower's foot
  const g0 = Math.max(z.elev.l, X(-HALF - 10)), g1 = Math.min(w - 4, X(HALF + STACK_OFF + 8))
  prims.push({ type: 'line', id: 'ground', mark: 'known', ax: g0, ay: gy, bx: g1, by: gy })
  walls.push({ ax: g0, ay: gy, bx: g1, by: gy })

  // WHAT WAS DUG, in place: the mantle's footings either side and the core's stump between them
  const mantle = { l: X(-HALF), r: X(HALF), t: Y(TOWER.mantle.top), b: Y(TOWER.mantle.foot) }
  prims.push({ type: 'rect', id: 'mantle', mark: 'place', x: mantle.l, y: mantle.t, w: mantle.r - mantle.l, h: mantle.b - mantle.t })
  const core = { l: X(-TOWER.core.side / 2), r: X(TOWER.core.side / 2), t: Y(TOWER.core.top), b: Y(TOWER.mantle.foot) }
  prims.push({ type: 'rect', id: 'core', mark: 'place', cls: 'paper-deep', x: core.l, y: core.t, w: core.r - core.l, h: core.b - core.t })
  taken.push({ l: mantle.l - 2, t: Math.min(core.t, gy) - 2, r: mantle.r + 2, b: mantle.b + 2, id: 'dug' })

  // the base's width, our measure: a pencil dimension under the section
  const dimY = Y(TOWER.mantle.foot - 2.5)
  prims.push({ type: 'path', id: 'dimension', mark: 'pencil', width: 1.25,
    d: `M${X(-HALF)} ${dimY}H${X(HALF)}M${X(-HALF)} ${dimY - 6}v12M${X(HALF)} ${dimY - 6}v12` })
  walls.push({ ax: X(-HALF), ay: dimY, bx: X(HALF), by: dimY })
  taken.push({ l: X(-HALF) - 2, t: dimY - 7, r: X(-HALF) + 2, b: dimY + 7 }, { l: X(HALF) - 2, t: dimY - 7, r: X(HALF) + 2, b: dimY + 7 })
  if (settled) anchors.push({ id: 'base', x: gx, y: dimY, sides: ['below', 'above'], gap: 4, kind: 'pencil' })

  // THE STACK: one figure at "not known", as many as each reading holds, climbing and leaving between them
  const n66 = figuresFor(66), n90 = figuresFor(90)
  const figures = t <= 1 ? lerp(1, n66, ease(t)) : t <= 2 ? lerp(n66, n90, ease(t - 1)) : t <= 3 ? lerp(n90, 1, ease(t - 2)) : 1
  const shown = Math.max(1, Math.floor(figures + 1e-6))
  const sx = X(HALF + STACK_OFF)
  prims.push({ type: 'path', id: 'stack', mark: 'pencil', d: stackPath(sx, gy, s, shown) })
  const stackTop = Y(shown * FIGURE_M)
  taken.push({ l: sx - 3, t: stackTop - 2, r: sx + 3, b: gy, id: 'stack' })

  // THE KEY: one figure drawn large in a pencil frame, its height measured beside it, while the plate measures
  const keyA = 1 - ease(count * 2.5)
  if (keyA > 0.01) {
    const kb = wide
      ? { l: Math.min(w - 196, sx + Math.max(56, w * 0.05)), t: gy - 236, r: Math.min(w - 196, sx + Math.max(56, w * 0.05)) + 176, b: gy }
      : { l: 12, t: 12, r: 98, b: 12 + Math.min(118, Math.max(96, Y(74) - 12)) }
    // upright, the height's label stands under the figure, inside the frame
    const inner = (kb.b - kb.t) - (wide ? 44 : 44)
    const ks = inner / FIGURE_M
    const kfoot = kb.b - (wide ? 22 : 30)
    const kx = kb.l + (wide ? 46 : 30)
    const dx = kx + (wide ? 34 : 22)
    prims.push({ type: 'rect', id: 'keyFrame', mark: 'measure', cls: 'paper-open', x: kb.l, y: kb.t, w: kb.r - kb.l, h: kb.b - kb.t, alpha: keyA })
    prims.push({ type: 'path', id: 'keyFigure', mark: 'pencil', d: figurePath(kx, kfoot, ks), alpha: keyA })
    prims.push({ type: 'path', id: 'keyDimension', mark: 'pencil', width: 1.25, alpha: keyA,
      d: `M${dx} ${kfoot}V${kfoot - FIGURE_M * ks}M${dx - 5} ${kfoot}h10M${dx - 5} ${kfoot - FIGURE_M * ks}h10` })
    taken.push({ l: kx - 0.3 * ks - 2, t: kfoot - FIGURE_M * ks - 2, r: kx + 0.3 * ks + 2, b: kfoot + 1, id: 'key' },
      { l: dx - 6, t: kfoot - FIGURE_M * ks - 2, r: dx + 6, b: kfoot + 2, id: 'keyDim' })
    // the frame's own edges hold the label inside it
    walls.push({ ax: kb.l, ay: kb.t, bx: kb.r, by: kb.t }, { ax: kb.r, ay: kb.t, bx: kb.r, by: kb.b }, { ax: kb.l, ay: kb.b, bx: kb.r, by: kb.b },
      { ax: kb.l, ay: kb.t, bx: kb.l, by: kb.b })
    if (settled && step <= 3) {
      anchors.push(wide ? { id: 'figure', x: dx, y: kfoot - FIGURE_M * ks / 2, sides: ['right'], gap: 4, kind: 'pencil' }
        : { id: 'figure', x: (kb.l + kb.r) / 2, y: kfoot + 1, sides: ['below'], gap: 2, kind: 'pencil' })
    }
  }

  // THE READINGS
  const r66 = t <= 1 ? clamp01(t * 3 - 0.3) : t <= 2 ? 1 - clamp01((t - 1) * 3.5) : 0
  if (r66 > 0) {
    // at 66 m once it has arrived; while the figures climb it rides their crown
    const at = t >= 1 ? 66 : Math.min(66, shown * FIGURE_M)
    const y = Y(at)
    prims.push({ type: 'line', id: 'h66', mark: 'guessed', ax: X(-HALF), ay: y, bx: sx + 4, by: y, alpha: r66 })
    walls.push({ ax: X(-HALF), ay: y, bx: sx + 4, by: y })
  }
  const built = t > 1 && t < 3 ? (t <= 2 ? ease(t - 1) : 1) : 0
  const fade = t > 2 ? 1 - ease((t - 2) * 1.6) : 1
  let stagesDrawn = 0
  if (built > 0 && fade > 0) {
    const reach = built * tabletHeight()
    // the hatch fills the silhouette once; each stage's own sides and top are dashed, never its foot, so no two dashes lie on each other
    prims.push({ type: 'path', id: 'stagesHatch', mark: 'guessed', cls: 'paper-hatch-only', d: stagesOutline(gx, gy, s, s, reach), alpha: fade })
    let y = 0
    for (const [i, st] of TOWER.stages.entries()) {
      const shownH = Math.max(0, Math.min(st.h, reach - y))
      if (shownH > 0) {
        const l = X(-st.side / 2), r = X(st.side / 2), b = Y(y), tp = Y(y + shownH)
        // the stage's top only where it is its own (its full width); its sides from the stage below's top
        prims.push({ type: 'path', id: `stage${i + 1}`, mark: 'guessed', cls: 'paper-edge',
          d: `M${l.toFixed(2)} ${b.toFixed(2)}V${tp.toFixed(2)}${shownH >= st.h ? `H${r.toFixed(2)}` : `M${r.toFixed(2)} ${tp.toFixed(2)}`}V${b.toFixed(2)}`, alpha: fade })
        stagesDrawn += shownH / st.h
      }
      y += st.h
    }
    // each stage its own box, so a label may stand in the air beside a narrower stage
    let at = 0
    for (const [i, st] of TOWER.stages.entries()) {
      const top = Math.min(reach, at + st.h)
      if (top > at) taken.push({ l: X(-st.side / 2) - 2, t: Y(top) - 2, r: X(st.side / 2) + 2, b: Y(at), id: `stage${i + 1}` })
      at += st.h
    }
  }

  // THE LABELS of a settled step
  const reading = step < READINGS.length ? READINGS[step] : null
  if (settled && step <= 3) {
    if (reading === null) {
      anchors.push({ id: 'notKnown', x: gx, y: Y(tabletHeight() * 0.45), sides: ['on'], gap: 0, kind: 'quiet' })
    } else if (reading === 66) {
      anchors.push({ id: 'about66', x: X(-HALF) + 2, y: Y(66), sides: ['above-right', 'below-right'], gap: 6, kind: 'ink' })
      anchors.push({ id: 'count', x: sx, y: stackTop, sides: ['above', 'above-right', 'right'], gap: 6, kind: 'count' })
    } else {
      anchors.push({ id: 'about90', x: gx, y: Y(tabletHeight()), sides: ['above', 'above-right', 'above-left'], gap: 8, kind: 'ink' })
      anchors.push({ id: 'count', x: sx, y: stackTop, sides: ['above', 'above-right', 'right'], gap: 6, kind: 'count' })
    }
  } else if (settled) {
    anchors.push({ id: 'notKnown', x: gx, y: Y(tabletHeight() * 0.45), sides: ['on', 'above'], gap: 0, kind: 'quiet' })
  }

  // THE COUNT in one model, from the third step on: two piles of pencil squares, a million bricks each, standing on a ground
  const units = { mud: 0, baked: 0 }
  let marks = 0
  if (t > 3) {
    const c = z.counter
    const per = 5
    const size = wide ? Math.max(14, Math.min(40, (c.r - c.l) / 16)) : Math.max(10, Math.min(17, (c.r - c.l) / 22))
    const gap = Math.max(3, size * 0.22), pitch = size + gap
    const pileW = per * pitch - gap
    const pour = span(t, 3, 4)
    const gather = span(t, 4, 4.45), row = span(t, 4.4, 5)
    units.mud = Math.round(Math.min(BRICKS.mud, BRICKS.mud * clamp01(pour / 0.32)) * 10) / 10
    units.baked = Math.round(Math.min(BRICKS.baked, BRICKS.baked * clamp01((pour - 0.32) / 0.68)) * 10) / 10
    // wide, the piles stand on the tower's own ground beside it; upright, on a ground of their own under the elevation
    const base = wide ? gy : c.b - (wide ? 0 : 52)
    const x0 = wide ? Math.max(c.l, sx + 70) : c.l + 8
    const between = wide ? Math.max(70, pileW * 0.4) : Math.max(44, (c.r - c.l - 2 * pileW - 16) * 0.6)
    const mudX = x0, bakedX = x0 + pileW + between
    const tallest = base - Math.ceil(BRICKS.baked / per) * pitch
    const groundEnd = wide ? Math.min(w - 8, bakedX + pileW + 30) : c.r
    const ink = 1 - ease(gather)
    if (!wide) {
      prims.push({ type: 'line', id: 'countGround', mark: 'known', ax: c.l, ay: base, bx: groundEnd, by: base, alpha: ease(pour * 3) })
      walls.push({ ax: c.l, ay: base, bx: groundEnd, by: base })
    } else if (groundEnd > g1) {
      prims.push({ type: 'line', id: 'countGround', mark: 'known', ax: g1, ay: base, bx: groundEnd, by: base, alpha: ease(pour * 3) })
      walls.push({ ax: g1, ay: base, bx: groundEnd, by: base })
    }
    if (ink > 0.02) {
      const mud = unitGrid(units.mud, { x: mudX, y: base, size, gap, perRow: per, rise: true, cut: 'height' })
      const baked = unitGrid(units.baked, { x: bakedX, y: base, size, gap, perRow: per, rise: true, cut: 'height' })
      // gathering, every unit slides toward the one mark and fades
      const mark = { x: mudX + size * 0.3, y: base - size * 1.2 }
      for (const u of [...mud.map(u => ({ ...u, kind: 'mud' })), ...baked.map(u => ({ ...u, kind: 'baked' }))]) {
        const k = ease(gather)
        prims.push({ type: 'rect', id: `${u.kind}${u.index}`, mark: 'measure', cls: u.kind === 'mud' ? 'paper-full' : '',
          x: lerp(u.x, mark.x, k), y: lerp(u.y - gap, mark.y, k), w: lerp(u.w, size * 0.4, k), h: lerp(u.h, size * 0.4, k), alpha: ink })
      }
      const mudTop = base - Math.ceil(BRICKS.mud / per) * pitch
      taken.push({ l: mudX - 2, t: mudTop - 2, r: mudX + pileW + 2, b: base + 2, id: 'mudPile' })
      taken.push({ l: bakedX - 2, t: tallest - 2, r: bakedX + pileW + 2, b: base + 2, id: 'bakedPile' })
      if (settled && step === 4) {
        anchors.push({ id: 'oneModel', x: mudX, y: mudTop - 8, sides: ['above-right', 'above'], gap: 0, kind: 'quiet' })
        // each count stands under its own pile from the pile's left edge, so two long German counts never meet
        anchors.push({ id: 'mudPair', x: mudX - 2, y: base + 4, sides: ['below-right'], gap: 2, kind: 'pair' })
        anchors.push({ id: 'bakedPair', x: bakedX - 2, y: base + 4, sides: ['below-right'], gap: 2, kind: 'pair' })
      }
    }
    if (gather > 0) {
      // THE WALLS: the tower's whole count is one mark; the walls are twelve to fifteen of them, on the same ground
      const [lo, hi] = BRICKS.walls
      const wallEnd = wide ? w - Math.max(20, w * 0.035) : c.r
      const room = wallEnd - x0
      const mw = Math.min(wide ? 44 : 20, room / (hi * 1.12 + 1.9))
      const mh = mw * 0.98
      const inkW = ease(gather)
      prims.push({ type: 'path', id: 'towerMark', mark: 'measure', cls: 'paper-full', d: towerMark(x0 + mw / 2, base, mw, mh), alpha: inkW })
      taken.push({ l: x0 - 2, t: base - mh - 2, r: x0 + mw + 2, b: base + 2, id: 'towerMark' })
      const rowX = x0 + mw * 1.9
      const shownMarks = Math.floor(row * hi + 1e-6)
      marks = shownMarks
      const markX = (i: number): number => rowX + mw / 2 + i * mw * 1.12
      for (let i = 0; i < shownMarks; i++) {
        prims.push({ type: 'path', id: `wallMark${i}`, mark: 'measure', cls: i >= lo ? 'paper-open' : 'paper-full', d: towerMark(markX(i), base, mw, mh) })
      }
      if (shownMarks > 0) taken.push({ l: rowX - 2, t: base - mh - 2, r: markX(shownMarks - 1) + mw / 2 + 2, b: base + 2, id: 'wallRow' })
      // the row's own ground, where it runs past the piles'
      const rowEnd = markX(hi - 1) + mw / 2 + 16
      if (wide && rowEnd > groundEnd) {
        prims.push({ type: 'line', id: 'wallGround', mark: 'known', ax: groundEnd, ay: base, bx: rowEnd, by: base, alpha: inkW })
        walls.push({ ax: groundEnd, ay: base, bx: rowEnd, by: base })
      }
      if (settled && step === 5) {
        anchors.push({ id: 'oneModel', x: x0, y: base - mh * 2.4 - (wide ? 30 : 24), sides: ['above-right'], gap: 0, kind: 'quiet' })
        anchors.push({ id: 'tower', x: x0 + mw / 2, y: base - mh, sides: ['above-right', 'above'], gap: 6, kind: 'ink' })
        anchors.push({ id: 'walls', x: (markX(0) + markX(hi - 1)) / 2, y: base + 2, sides: ['below'], gap: 6, kind: 'ink' })
        anchors.push({ id: 'lo', x: markX(lo - 1), y: base - mh, sides: ['above'], gap: 4, kind: 'count' })
        anchors.push({ id: 'hi', x: markX(hi - 1), y: base - mh, sides: ['above'], gap: 4, kind: 'count' })
      }
    }
  }

  return {
    prims, anchors, taken, walls, bounds: { l: 2, t: 2, r: w - 2, b: h - 2 },
    figures: shown, stages: Math.round(stagesDrawn * 100) / 100, units, marks, s,
  }
}

/** the figures each reading holds, as the plate counts them */
export const FIGURES = { h66: figuresFor(66), h90: figuresFor(90) }
