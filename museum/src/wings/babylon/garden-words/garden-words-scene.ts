/* FEATURE 3 AS A DRAWING: the stop's colour beside paper (the held frame,
   the terraces in colour, on the left or above), and on the paper the texts'
   gardens one step at a time, every one Guessed (dashed stroke, hatched fill):
   Esarhaddon's nouns for Ea's temple garden as three small drawn things (an
   orchard, a garden with canals, vegetable beds); Jeremiah 29:5 as one house
   and one bed; then a small locator that puts Ea's temple in the Esagila
   complex on the river bank, far from this stop. Never a plan of a found
   place: no scale bar, no north arrow, no plant named, no bow land drawn.
   Pure, so the page draws it and node checks it. */

import type { PaperFraming } from '../paper/framing'
import type { Box, Seg, Taken } from '../paper/placer'
import { circlePath, ease, settledAt, type Anchor, type Inset, type PaperScene, type Prim } from '../paper/scene'
import { COLOUR, EKARZAGINNA, PLAN, WINDOW, type Pt } from './garden-words-data'

export type WordsLabel = 'orchard' | 'canals' | 'beds' | 'house' | 'garden' | 'esagila' | 'ekarzaginna' | 'river' | 'palace'

/** how strongly a step's drawing stands at a point of the slider: whole at its step, gone before the next */
const at = (t: number, c: number): number => ease(1 - Math.abs(t - c) * 1.25)

const f = (n: number): string => n.toFixed(1)
const rectPath = (x: number, y: number, w: number, h: number, ccw = false): string =>
  ccw ? `M${f(x)} ${f(y)}V${f(y + h)}H${f(x + w)}V${f(y)}Z` : `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`

export interface WordsFacts {
  step: number
  colour: Box
  paper: Box
  shown: { ea: number; jeremiah: number; where: number }
}

export function gardenWordsScene(t: number, framing: PaperFraming, w: number, h: number, o: { inset: Inset; focus?: readonly [number, number] }): PaperScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const wide = framing === 'wide'
  const I = o.inset
  const step = settledAt(t)
  // THE STOP'S COLOUR: the held frame round the terraces; whole at the first step, then on its side as the paper comes in
  const open = ease(Math.min(1, Math.max(0, t * 2)))
  const side = (share: number): number => 1 - (1 - share) * open
  const colour: Box = wide ? { l: 0, t: 0, r: Math.round(w * side(COLOUR.wide)), b: h } : { l: 0, t: 0, r: w, b: Math.round(h * side(COLOUR.upright)) }
  prims.push({ type: 'image', id: 'colour', key: 'colour', x: colour.l, y: colour.t, w: colour.r - colour.l, h: colour.b - colour.t, fit: 'cover', focus: o.focus ?? [0.5, 0.3] })
  // the paper's place is where it settles, so its drawings never move while the colour slides
  const paper: Box = wide ? { l: Math.round(w * COLOUR.wide) + Math.max(36, I.l), t: I.t, r: w - I.r, b: h - I.b } : { l: I.l, t: Math.round(h * COLOUR.upright) + 16, r: w - I.r, b: h - I.b }
  const pw = paper.r - paper.l, ph = paper.b - paper.t
  const G = (id: string, d: string, alpha: number, cls?: string): void => { prims.push({ type: 'path', id, mark: 'guessed', d, alpha, ...(cls ? { cls } : {}) }) }
  const GL = (id: string, ax: number, ay: number, bx: number, by: number, alpha: number): void => {
    prims.push({ type: 'line', id, mark: 'guessed', ax, ay, bx, by, alpha }); walls.push({ ax, ay, bx, by })
  }
  // a label's room under its drawing
  const LABEL = 30

  /* EA'S TEMPLE GARDEN: the text's three nouns as three small drawn things, apart, never one plan */
  // the first drawings wait until the colour has made room
  const ea = at(t, 1) * ease(Math.min(1, Math.max(0, (t - 0.4) / 0.1)))
  if (ea > 0.01) {
    const cells: Box[] = []
    if (wide) {
      const cw = pw / 3
      for (let i = 0; i < 3; i++) cells.push({ l: paper.l + i * cw, t: paper.t, r: paper.l + (i + 1) * cw, b: paper.b })
    } else {
      const rh = ph / 2
      cells.push({ l: paper.l, t: paper.t, r: paper.l + pw / 2, b: paper.t + rh }, { l: paper.l + pw / 2, t: paper.t, r: paper.r, b: paper.t + rh },
        { l: paper.l + pw / 4, t: paper.t + rh, r: paper.r - pw / 4, b: paper.b })
    }
    const fit = (c: Box): { cx: number; cy: number; s: number } => {
      const s = Math.min(c.r - c.l - 20, c.b - c.t - LABEL - 16, wide ? 230 : 150)
      return { cx: (c.l + c.r) / 2, cy: c.t + (c.b - c.t - LABEL) / 2, s }
    }
    { // the orchard: three trees, a crown on a trunk, side-on on their ground
      const { cx, cy, s } = fit(cells[0]!)
      const r = s * 0.16, foot = cy + s * 0.32
      GL('orchardGround', cx - s * 0.48, foot, cx + s * 0.48, foot, ea)
      for (const [i, dx] of [-0.3, 0, 0.3].entries()) {
        const x = cx + dx * s, crown = foot - r * 1.5 - r
        GL(`orchardTrunk${i}`, x, foot, x, crown + r, ea)
        G(`orchardCrown${i}`, circlePath(x, crown, r), ea)
      }
      taken.push({ l: cx - s * 0.5, t: foot - r * 2.6 - 2, r: cx + s * 0.5, b: foot + 2, id: 'orchard' })
      if (step === 1) anchors.push({ id: 'orchard', x: cx, y: foot + 2, sides: ['below'], gap: 8, kind: 'ink' })
    }
    { // the garden with canals: a plot cut by two canals crossing, seen from above
      const { cx, cy, s } = fit(cells[1]!)
      const S = s * 0.78, c = S * 0.13, q = (S - c) / 2, x0 = cx - S / 2, y0 = cy - S / 2
      for (const [i, [qx, qy]] of [[0, 0], [q + c, 0], [0, q + c], [q + c, q + c]].entries()) G(`canalPlot${i}`, rectPath(x0 + qx!, y0 + qy!, q, q), ea)
      taken.push({ l: x0 - 2, t: y0 - 2, r: x0 + S + 2, b: y0 + S + 2, id: 'canals' })
      if (step === 1) anchors.push({ id: 'canals', x: cx, y: y0 + S + 2, sides: ['below'], gap: 8, kind: 'ink' })
    }
    { // the vegetable beds: five long beds side by side, seen from above
      const { cx, cy, s } = fit(cells[2]!)
      const S = s * 0.78, n = 5, bw = S / (n * 1.6 - 0.6), x0 = cx - S / 2, y0 = cy - S * 0.45
      for (let i = 0; i < n; i++) G(`bed${i}`, rectPath(x0 + i * bw * 1.6, y0, bw, S * 0.9), ea)
      taken.push({ l: x0 - 2, t: y0 - 2, r: x0 + S + 2, b: y0 + S * 0.9 + 2, id: 'beds' })
      if (step === 1) anchors.push({ id: 'beds', x: cx, y: y0 + S * 0.9 + 2, sides: ['below'], gap: 8, kind: 'ink' })
    }
  }

  /* JEREMIAH 29:5: one house and one bed, side-on on one ground */
  const jer = at(t, 2)
  if (jer > 0.01) {
    const s = Math.min(pw * (wide ? 0.62 : 0.86), (ph - LABEL - 16) * 1.5, wide ? 520 : 330)
    const cx = (paper.l + paper.r) / 2, foot = paper.t + (ph - LABEL) / 2 + s * 0.2
    const hw = s * 0.42, hh = s * 0.3, hx = cx - s * 0.47
    GL('ground', cx - s * 0.5, foot, cx + s * 0.5, foot, jer)
    // the house's door is an opening: drawn as a hole, so no hatch stands in it
    const dw = hw * 0.18, dh = hh * 0.55
    G('house', `${rectPath(hx, foot - hh, hw, hh)}${rectPath(hx + hw * 0.62, foot - dh, dw, dh, true)}`, jer)
    taken.push({ l: hx - 2, t: foot - hh - 2, r: hx + hw + 2, b: foot + 2, id: 'house' })
    // one bed: a low hatched bank on the ground with its rows of sprouts
    const bx = cx + s * 0.08, bw = s * 0.4, bh = s * 0.06
    G('bed', rectPath(bx, foot - bh, bw, bh), jer)
    for (let i = 0; i < 5; i++) { const x = bx + bw * (0.1 + i * 0.2); GL(`sprout${i}`, x, foot - bh, x, foot - bh - s * 0.07, jer) }
    taken.push({ l: bx - 2, t: foot - bh - s * 0.07 - 2, r: bx + bw + 2, b: foot + 2, id: 'bedJ' })
    if (step === 2) {
      anchors.push({ id: 'house', x: hx + hw / 2, y: foot + 1, sides: ['below'], gap: 8, kind: 'ink' })
      anchors.push({ id: 'garden', x: bx + bw / 2, y: foot + 1, sides: ['below'], gap: 8, kind: 'ink' })
    }
  }

  /* THE LOCATOR: the river, Esagila and its annex, the South Palace from the walk's plan; Ea's temple a guessed patch
     in the complex on the bank; this stop a pencil ring. North up, no scale bar, no arrow */
  const where = at(t, 3)
  if (where > 0.01) {
    const sx = pw / (WINDOW.e - WINDOW.w), sy = (ph - 8) / (WINDOW.n - WINDOW.s)
    const k = Math.min(sx, sy)
    const ox = (paper.l + paper.r) / 2 - ((WINDOW.e - WINDOW.w) * k) / 2, oy = paper.t + 4 + (ph - 8 - (WINDOW.n - WINDOW.s) * k) / 2
    const P = ([e, n]: Pt): [number, number] => [ox + (e - WINDOW.w) * k, oy + (WINDOW.n - n) * k]
    const frame: Box = { l: ox, t: oy, r: ox + (WINDOW.e - WINDOW.w) * k, b: oy + (WINDOW.n - WINDOW.s) * k }
    const ring = [...PLAN.river, PLAN.river[0]!].map(P)
    // the river's banks, clipped to the window: two fine known lines
    let run: [number, number][] = [], j = 0
    const flush = (): void => {
      if (run.length >= 2) {
        prims.push({ type: 'path', id: `river${j++}`, mark: 'known', cls: 'paper-line', d: `M${run.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`, alpha: where })
        for (let i = 0; i + 1 < run.length; i++) walls.push({ ax: run[i]![0], ay: run[i]![1], bx: run[i + 1]![0], by: run[i + 1]![1] })
      }
      run = []
    }
    const inside = ([x, y]: [number, number]): boolean => x >= frame.l - 0.5 && x <= frame.r + 0.5 && y >= frame.t - 0.5 && y <= frame.b + 0.5
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i]!, b = ring[i + 1]!
      const cut = clipSeg(a, b, frame)
      if (!cut) { flush(); continue }
      if (!run.length || Math.hypot(run[run.length - 1]![0] - cut[0][0], run[run.length - 1]![1] - cut[0][1]) > 0.01) { flush(); run.push(cut[0]) }
      run.push(cut[1])
      if (!inside(b)) flush()
    }
    flush()
    const poly = (id: string, pts: readonly Pt[], mark: 'known' | 'place'): void => {
      const q = pts.map(P)
      prims.push({ type: 'path', id, mark, d: `M${q.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`, alpha: where, cls: 'paper-outline' })
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1])
      taken.push({ l: Math.min(...xs) - 2, t: Math.min(...ys) - 2, r: Math.max(...xs) + 2, b: Math.max(...ys) + 2, id })
    }
    poly('esagila', PLAN.esagila, 'known')
    poly('annex', PLAN.annex, 'known')
    poly('palace', PLAN.palace, 'known')
    // Ea's temple: where in the complex is not known, so a patch, guessed
    const [ex, ey] = P([EKARZAGINNA.e - EKARZAGINNA.w / 2, EKARZAGINNA.n + EKARZAGINNA.h / 2])
    const ew = EKARZAGINNA.w * k, eh = EKARZAGINNA.h * k
    G('ekarzaginna', rectPath(ex, ey, ew, eh), where)
    taken.push({ l: ex - 2, t: ey - 2, r: ex + ew + 2, b: ey + eh + 2, id: 'ekarzaginna' })
    // this stop: a pencil ring round the vaulted building in the palace's corner
    const st = PLAN.stop.map(P), scx = st.reduce((s, p) => s + p[0], 0) / st.length, scy = st.reduce((s, p) => s + p[1], 0) / st.length
    const rr = Math.max(9, 30 * k)
    prims.push({ type: 'path', id: 'stopRing', mark: 'pencil', width: 1.5, d: circlePath(scx, scy, rr), alpha: where, cls: 'words-ring' })
    taken.push({ l: scx - rr - 2, t: scy - rr - 2, r: scx + rr + 2, b: scy + rr + 2, id: 'stopRing' })
    if (step === 3) {
      const [esx, esy] = P([445810, 3599735])
      anchors.push({ id: 'esagila', x: esx, y: esy, sides: ['right', 'below-right', 'above-right'], gap: 8, kind: 'ink', over: ['annex'] })
      anchors.push({ id: 'ekarzaginna', x: ex, y: ey + eh / 2, sides: ['left', 'below-left', 'above-left', 'below', 'right'], gap: 8, kind: 'ink', reach: 4 })
      const [rx, ry] = P([445420, 3600250])
      anchors.push({ id: 'river', x: rx, y: ry, sides: ['left', 'right', 'above', 'below'], gap: 6, kind: 'quiet', reach: 4 })
      const [px, py] = P([445812, 3600700])
      anchors.push({ id: 'palace', x: px, y: py, sides: ['right', 'above-right', 'below-right'], gap: 8, kind: 'ink', over: ['palace'] })
    }
  }

  return {
    prims, anchors, taken, walls, bounds: { l: wide ? paper.l : I.l, t: paper.t, r: paper.r, b: paper.b },
    facts: { step: step ?? -1, colour, paper, shown: { ea: Math.round(ea * 1000) / 1000, jeremiah: Math.round(at(t, 2) * 1000) / 1000, where: Math.round(at(t, 3) * 1000) / 1000 } } as unknown as Record<string, unknown>,
  }
}

/** a segment inside a box, or null */
function clipSeg(a: [number, number], b: [number, number], box: Box): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a[0] - box.l], [dx, box.r - a[0]], [-dy, a[1] - box.t], [dy, box.b - a[1]]] as const) {
    if (p === 0) { if (q < 0) return null; continue }
    const r = q / p
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r } else { if (r < t0) return null; if (r < t1) t1 = r }
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]]
}
