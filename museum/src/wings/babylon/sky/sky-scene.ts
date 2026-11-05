/* FEATURE 11'S DRAWING, three states that jump at the half step:
   1 the two evenings: the western sky of 14 and of 15 April at the sunset second, true azimuth across and airless
     altitude up on one scale for both, the horizon, the set Sun under it, the Moon's place at its true size, its track
     to its setting, its height, and beside each a disc drawn larger whose lit part is the computed phase and tilt;
   2 one shekel: the photograph of a diary's form (BM 36761, under its own date) and the stage's picture of the heaps,
     with the lump of silver larger in its own picture over a pencil ruler;
   3 the river's rise: a pencil gauge, the rise of 1.65 m filling as the step comes, and the 1.70 m figure on one scale.
   Pure: no DOM. */

import type { PaperFraming } from '../paper/framing'
import type { Box, Seg, Taken } from '../paper/placer'
import { circlePath, ease, settledAt, span, type Anchor, type Inset, type PaperScene, type Prim } from '../paper/scene'
import { FIGURE_M, figurePath, rulerPaths } from '../paper/figure'
import { FIGURE_HEIGHT, GOOD_IDS, HEAPS_PLAN, PHOTO, SKY_WINDOW, SILVER_MM, heaps, project, riseM, type Evening, type P2 } from './sky-data'
import { STEP_IDS, type StepId } from './sky-words'

export { STEP_IDS, type StepId }

/** the pictures the stage renders for step 2, their pixel sizes (the shooter writes them at these) */
export const HEAPS_PICTURE = { wide: { w: 1600, h: 1000 }, upright: { w: 1200, h: 1200 }, silver: { w: 800, h: 800 } } as const

export interface SkyData { evenings: Evening[] }

/** upright, the heaps' picture shows its lower share: the sweep above the figure's head is empty */
export const UPRIGHT_SHOWN = 0.72

export interface PanelFacts {
  id: string
  /** px a degree, both ways */
  k: number
  horizon: number
  moon: { x: number; y: number; r: number }
  sun: { x: number; y: number; r: number }
  /** the Moon's altitude as drawn: its centre over the horizon divided by k, degrees */
  drawnHeight: number
  drawnSunEl: number
  disc: { x: number; y: number; r: number; litWidth: number; limb: number }
  box: Box
}
export interface SkyFacts {
  step: number
  state: StepId
  panels: PanelFacts[]
  photo: Box | null
  heaps: Box | null
  silver: Box | null
  /** the ring round the lump at its true size on the heaps' picture, and whether a leader joins it to its close picture */
  silverMark: { x: number; y: number; r: number; lead: boolean } | null
  /** px a metre on the heaps' picture at the figure's depth, and each heap's drawn foot width and top in metres */
  heapsDrawn: { id: string; x: number; foot: number; top: number }[]
  rise: { pxPerM: number; drawn: number; figure: number; fill: number } | null
}

const f = (n: number): string => String(Math.round(n * 100) / 100)
const pathOf = (pts: readonly P2[], close = false): string => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}${close ? 'Z' : ''}`

/** the lit part of a disc as one closed outline: the bright limb's half and the terminator's half ellipse, the limb at
    `limb` degrees clockwise from straight up on the screen, for the phase angle `sto` (degrees) */
export function crescentOutline(cx: number, cy: number, r: number, limb: number, sto: number, n = 40): P2[] {
  const a = limb * Math.PI / 180, ci = Math.cos(sto * Math.PI / 180)
  const U: P2 = [Math.sin(a), -Math.cos(a)], V: P2 = [Math.cos(a), Math.sin(a)]
  const at = (u: number, v: number): P2 => [cx + r * (u * U[0] + v * V[0]), cy + r * (u * U[1] + v * V[1])]
  const pts: P2[] = []
  for (let i = 0; i <= n; i++) { const p = -Math.PI / 2 + Math.PI * i / n; pts.push(at(Math.cos(p), Math.sin(p))) }
  for (let i = n - 1; i >= 1; i--) { const p = -Math.PI / 2 + Math.PI * i / n; pts.push(at(-ci * Math.cos(p), Math.sin(p))) }
  return pts
}

export function skyScene(t: number, framing: PaperFraming, w: number, h: number, o: { inset: Inset; data: SkyData; lang?: string }): PaperScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const wide = framing === 'wide'
  const I = o.inset
  const box: Box = { l: I.l, t: I.t, r: w - I.r, b: h - I.b }
  const bw = box.r - box.l, bh = box.b - box.t
  const settled = settledAt(t)
  const si = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(t)))
  const state = STEP_IDS[si]!
  const labels = settled !== null
  const facts: SkyFacts = { step: settled ?? -1, state, panels: [], photo: null, heaps: null, silver: null, silverMark: null, heapsDrawn: [], rise: null }
  const take = (b: Box, id: string, pad = 0): void => { taken.push({ l: b.l - pad, t: b.t - pad, r: b.r + pad, b: b.b + pad, id }) }

  if (state === 'evenings') {
    /* THE TWO EVENINGS: side by side on a wide plate, stacked on a tall one; one scale for both */
    const E = o.data.evenings
    const dateRoom = wide ? 34 : 28, gap = wide ? 48 : 14, below = wide ? 46 : 40
    const Wn = SKY_WINDOW[wide ? 'wide' : 'upright']
    const azSpan = Wn.az[1] - Wn.az[0]
    const elOf = (id: string): readonly number[] => Wn.el[id as '0414']
    const spans = E.map((e) => elOf(e.id)[1]! - elOf(e.id)[0]!)
    // stacked where stacking draws the evenings larger than side by side (the tall phones), else side by side
    const kSide = Math.min((bw - gap) / 2 / azSpan, (bh - dateRoom - below) / Math.max(...spans))
    const kStack = Math.min(bw / azSpan, (bh - gap - E.length * (dateRoom + below)) / spans.reduce((a, b) => a + b, 0))
    const stacked = !wide && kStack >= kSide
    const k = stacked ? kStack : kSide
    const pw = stacked ? bw : (bw - gap) / 2
    let cellT = box.t
    // the setting's pair is two rows, about 37 px on a phone (its read-back box)
    const PAIR_H = 37, sight: Anchor[] = []
    E.forEach((e, i) => {
      const [elLo, elHi] = elOf(e.id) as [number, number]
      const drawW = azSpan * k, drawH = (elHi - elLo) * k
      const cellL = stacked ? box.l : box.l + i * (pw + gap)
      const x0 = cellL + (pw - drawW) / 2, top = cellT + dateRoom
      if (stacked) cellT = top + drawH + below + gap
      const X = (az: number): number => x0 + (az - Wn.az[0]) * k
      const horizon = top + elHi * k
      const Y = (el: number): number => horizon - el * k
      const panel: Box = { l: x0, t: top, r: x0 + drawW, b: top + drawH }
      const id = e.id

      // the horizon, a fine plain ink line across the window
      prims.push({ type: 'line', id: `horizon-${id}`, mark: 'known', ax: panel.l, ay: horizon, bx: panel.r, by: horizon, width: 1.5 })
      walls.push({ ax: panel.l, ay: horizon, bx: panel.r, by: horizon })
      // our scale: a pencil rule up the left edge, a tick each 5 degrees
      const ruleX = panel.l
      const ruleTop = Math.floor(Math.min(20, elHi) / 5) * 5
      let ticks = `M${f(ruleX)} ${f(Y(0))}L${f(ruleX)} ${f(Y(ruleTop))}`
      for (let d = 5; d <= ruleTop; d += 5) ticks += `M${f(ruleX)} ${f(Y(d))}h${d % 10 === 0 ? 8 : 5}`
      prims.push({ type: 'path', id: `rule-${id}`, mark: 'pencil', d: ticks, width: 1 })
      take({ l: ruleX - 2, t: Y(ruleTop) - 2, r: ruleX + 9, b: horizon }, `rule-${id}`)
      // due west: a pencil tick under the horizon
      const wx = X(270)
      if (wide) {
        prims.push({ type: 'line', id: `west-${id}`, mark: 'pencil', ax: wx, ay: horizon + 2, bx: wx, by: horizon + 9, width: 1 })
        take({ l: wx - 3, t: horizon, r: wx + 3, b: horizon + 10 }, `west-${id}`)
      }
      // the Sun at the sunset second, its centre under the horizon (airless), at its true size
      const sr = Math.max(2.5, e.sun.diam / 2 * k), sx = X(e.sun.az), sy = Y(e.sun.el)
      prims.push({ type: 'path', id: `sun-${id}`, mark: 'known', d: circlePath(sx, sy, sr), width: 1.25 })
      take({ l: sx - sr, t: sy - sr, r: sx + sr, b: sy + sr }, `sun-${id}`, 2)
      // the Moon's track from its place to the horizon, dotted pencil, and its setting point
      const track = e.track.map(([az, el]) => [X(az), Y(el)] as P2)
      const end = e.track.length - 1
      const [aA, aE] = e.track[end - 1]!, [bA, bE] = e.track[end]!
      const fz = aE / (aE - bE)
      const setAt: P2 = [X(aA + (bA - aA) * fz), horizon]
      const run = [...track.slice(0, end), setAt]
      const mr = Math.max(2.5, e.moon.diam / 2 * k), mx = track[0]![0], my = track[0]![1]
      prims.push({ type: 'path', id: `track-${id}`, mark: 'pencil', d: pathOf(run.slice(0, 1).map(() => [mx, my + mr] as P2).concat(run.slice(1))), width: 1, cls: 'sky-track' })
      for (let q = 0; q + 1 < run.length; q++) walls.push({ ax: run[q]![0], ay: run[q]![1], bx: run[q + 1]![0], by: run[q + 1]![1] })
      prims.push({ type: 'line', id: `moonset-${id}`, mark: 'pencil', ax: setAt[0], ay: horizon - 5, bx: setAt[0], by: horizon + 5, width: 1.25 })
      take({ l: setAt[0] - 3, t: horizon - 6, r: setAt[0] + 3, b: horizon + 6 }, `moonset-${id}`)
      // the Moon's place, its true size: a pencil ring (the lit edge is far under a pixel here)
      prims.push({ type: 'path', id: `moon-${id}`, mark: 'pencil', d: circlePath(mx, my, mr), width: 1.25, cls: 'sky-moon' })
      take({ l: mx - mr, t: my - mr, r: mx + mr, b: my + mr }, `moon-${id}`, 3)
      // its height: a pencil dimension from the horizon to the disc's foot, left of the Moon
      const hx = mx - Math.max(10, mr + 6)
      prims.push({ type: 'path', id: `height-${id}`, mark: 'pencil', d: `M${f(hx)} ${f(horizon)}L${f(hx)} ${f(my)}M${f(hx - 4)} ${f(my)}h8M${f(hx - 4)} ${f(horizon)}h8`, width: 1 })
      walls.push({ ax: hx, ay: horizon, bx: hx, by: my })
      // the disc drawn larger, up and to the right of the Moon (away from its track's start), kept inside the window;
      // its lit part the computation's phase and tilt
      const R = wide ? Math.min(52, Math.max(30, k * 2.1)) : Math.min(34, Math.max(20, k * 2.2))
      const off = R + (wide ? 70 : 34)
      const dx = Math.min(panel.r - R - 4, mx + off * 0.8), dy = Math.max(panel.t + R + 4, my - off * 0.75)
      prims.push({ type: 'path', id: `disc-${id}`, mark: 'pencil', d: circlePath(dx, dy, R), width: 1, cls: 'sky-disc' })
      const lit = crescentOutline(dx, dy, R, e.limb, e.moon.sto)
      prims.push({ type: 'path', id: `lit-${id}`, mark: 'place', d: pathOf(lit, true), cls: 'sky-lit' })
      take({ l: dx - R, t: dy - R, r: dx + R, b: dy + R }, `disc-${id}`, 3)
      // a pencil leader from the drawn disc toward the Moon's place, stopping short of both
      const lx = mx - dx, ly = my - dy, ll = Math.hypot(lx, ly)
      const a0: P2 = [dx + lx / ll * (R + 6), dy + ly / ll * (R + 6)], a1: P2 = [mx - lx / ll * (mr + 6), my - ly / ll * (mr + 6)]
      if (ll > R + mr + 20) {
        prims.push({ type: 'line', id: `leader-${id}`, mark: 'pencil', ax: a0[0], ay: a0[1], bx: a1[0], by: a1[1], width: 0.75, cls: 'sky-leader' })
        walls.push({ ax: a0[0], ay: a0[1], bx: a1[0], by: a1[1] })
      }
      if (labels) {
        const sunRight = sx > setAt[0]
        anchors.push({ id: `date-${id}`, x: panel.l, y: top - 6, sides: ['above-right'], gap: 0, kind: 'big' })
        anchors.push({ id: `height-${id}`, x: hx, y: (horizon + my) / 2, sides: ['left', 'right', 'above-left', 'below-left'], gap: 6, kind: 'ink' })
        // the lit share and Yallop's class in words under the disc; side by side on a phone the disc has no room for
        // the words, so they stand under the evening, level with the other's
        const beside = !wide && !stacked
        anchors.push({ id: `${beside ? 'share' : 'lit'}-${id}`, x: dx, y: dy + R, sides: ['below', 'below-left', 'left', 'below-right', 'right'], gap: 6, kind: beside ? 'ink' : 'pair' })
        // each name may stand against its own mark's margin, never on another's
        if (wide || i === 0) anchors.push({ id: `sun-${id}`, x: sx, y: sy + sr, sides: sunRight ? ['below-right', 'right', 'below'] : ['below-left', 'left', 'below'], gap: 4, kind: 'ink', over: [`sun-${id}`] })
        // under the set Sun's ring, so the pair may pass beside it
        // side by side on a phone the Sun's name and the setting's pair may meet: the pair takes a second row
        const second = !wide && !stacked && i === 0 && Math.abs(sx - setAt[0]) < 70 ? 22 : 0
        anchors.push({ id: `moonset-${id}`, x: setAt[0], y: Math.max(horizon + 6, sy + sr + 4) + second, sides: sunRight ? ['below-left', 'below'] : ['below-right', 'below', 'below-left'], gap: 4, kind: 'pair', over: [`moonset-${id}`] })
        if (beside) sight.push({ id: `sight-${id}`, x: (panel.l + panel.r) / 2, y: Math.max(horizon + 6, sy + sr + 4) + second + PAIR_H, sides: ['below', 'below-right', 'below-left'], gap: 8, kind: 'ink' })
        if (wide) anchors.push({ id: `west-${id}`, x: wx, y: horizon + 10, sides: ['below-left', 'below'], gap: 2, kind: 'pencil' })
      }
      facts.panels.push({
        id, k, horizon, moon: { x: mx, y: my, r: mr }, sun: { x: sx, y: sy, r: sr },
        drawnHeight: (horizon - my) / k, drawnSunEl: (horizon - sy) / k,
        disc: { x: dx, y: dy, r: R, litWidth: R * (1 + Math.cos(e.moon.sto * Math.PI / 180)), limb: e.limb },
        box: panel,
      })
    })
    const sightY = Math.max(...sight.map((a) => a.y))
    for (const a of sight) anchors.push({ ...a, y: sightY })
  }

  if (state === 'shekel') {
    /* ONE SHEKEL: the diary's photograph under its own date, the heaps' picture with each heap's name under it, the
       lump larger in its own picture over a pencil ruler */
    const C = PHOTO.crop, cw = C.r - C.l, ch = C.b - C.t
    const P = HEAPS_PICTURE[wide ? 'wide' : 'upright'], S = HEAPS_PICTURE.silver
    const nameRoom = wide ? 50 : 42, tabletRoom = wide ? 50 : 44, creditRoom = wide ? 34 : 40, gap = wide ? 28 : 6
    let photo: Box, pic: Box, silver: Box
    if (wide) {
      const ph = bh - tabletRoom - creditRoom
      const pwid = Math.min(ph * cw / ch, bw * 0.3)
      const phh = pwid * ch / cw
      photo = { l: box.l, t: box.t + tabletRoom, r: box.l + pwid, b: box.t + tabletRoom + phh }
      const sw = Math.min(200, bw * 0.13)
      const rest = bw - pwid - sw - 2 * gap
      const hh = Math.min(bh - tabletRoom - nameRoom, rest * P.h / P.w), hw = hh * P.w / P.h
      const hl = photo.r + gap + (rest - hw) / 2
      pic = { l: hl, t: box.t + tabletRoom, r: hl + hw, b: box.t + tabletRoom + hh }
      silver = { l: box.r - sw, t: pic.t, r: box.r, b: pic.t + sw }
    } else if (bh < 480) {
      // a short plate: the photograph with its name, date and credit beside it; under it the heaps' picture with the
      // lump's picture, ruler and name at its right; two rows of names under the heaps
      const rowH = Math.max(84, bh * 0.26)
      const pwid = rowH * cw / ch
      photo = { l: box.l, t: box.t, r: box.l + pwid, b: box.t + rowH }
      const sw = Math.min(86, bw * 0.26)
      // the credit beside the photograph runs to about three rows under the name and date
      const picT = box.t + Math.max(rowH, 112) + gap
      const hw = Math.min(bw - sw - 10, (box.b - picT - 2 * nameRoom - 12) / UPRIGHT_SHOWN)
      pic = { l: box.l, t: picT, r: box.l + hw, b: picT + hw * UPRIGHT_SHOWN }
      silver = { l: box.r - sw, t: picT, r: box.r, b: picT + sw }
    } else {
      // a top row: the photograph, its name and date beside it, the lump's picture at the right over its ruler and
      // name; the credit under the row across the plate; then the heaps' picture, its lower share (the upper is the
      // empty sweep), and two rows of names under it
      const rowH = Math.min(150, Math.max(92, bh * 0.25))
      const pwid = Math.min(rowH * cw / ch, bw * 0.36)
      photo = { l: box.l, t: box.t, r: box.l + pwid, b: box.t + pwid * ch / cw }
      const sw = Math.max(40, rowH - 62)
      silver = { l: box.r - sw, t: box.t, r: box.r, b: box.t + sw }
      const credTop = box.t + rowH + 6
      const avail = box.b - (credTop + creditRoom + 2 * nameRoom - 6) - gap
      const hw = Math.min(bw, avail / UPRIGHT_SHOWN)
      pic = { l: box.l + (bw - hw) / 2, t: credTop + creditRoom + gap, r: box.l + (bw + hw) / 2, b: credTop + creditRoom + gap + hw * UPRIGHT_SHOWN }
    }
    const s = (photo.r - photo.l) / cw
    prims.push({ type: 'image', id: 'photo', key: 'photo', x: photo.l - C.l * s, y: photo.t - C.t * s, w: PHOTO.file.w * s, h: PHOTO.file.h * s, fit: 'fill', clip: photo })
    take(photo, 'photo')
    // the whole picture placed so that its shown share fills the box (upright: its lower share)
    const shown = wide ? 1 : UPRIGHT_SHOWN
    const full = { x: pic.l, y: pic.b - (pic.r - pic.l) * P.h / P.w, w: pic.r - pic.l, h: (pic.r - pic.l) * P.h / P.w }
    void shown
    prims.push({ type: 'image', id: 'heaps', key: 'heaps', x: full.x, y: full.y, w: full.w, h: full.h, fit: 'fill', clip: pic })
    take(pic, 'heaps')
    prims.push({ type: 'image', id: 'silver', key: 'silver', x: silver.l, y: silver.t, w: silver.r - silver.l, h: silver.b - silver.t, fit: 'fill' })
    take(silver, 'silver')
    // the ruler under the lump's picture: its own scale, a centimetre as the silver picture draws it at the lump
    const sv = HEAPS_PLAN.views.silver, lump = HEAPS_PLAN.silver
    const pa = project('silver', [lump[0] - 0.005, 0, lump[1]]), pb = project('silver', [lump[0] + 0.005, 0, lump[1]])
    const pxPerCm = (pb.x - pa.x) * (silver.r - silver.l)
    const cm = Math.max(1, Math.min(5, Math.floor((silver.r - silver.l - 8) / pxPerCm)))
    const rulerY = silver.b + 8
    const ruler = rulerPaths(silver.l + (silver.r - silver.l - cm * pxPerCm) / 2, rulerY, pxPerCm, cm)
    prims.push({ type: 'path', id: 'ruler', mark: 'measure', d: ruler.body, width: 1, cls: 'paper-open' })
    prims.push({ type: 'path', id: 'ruler-ticks', mark: 'pencil', d: ruler.ticks, width: 1 })
    const rulerH = Math.max(10, pxPerCm * 0.9)
    take({ l: ruler.ends[0] - 1, t: rulerY - 1, r: ruler.ends[1] + 1, b: rulerY + rulerH + 1 }, 'ruler')
    void sv
    // the lump on the stage at its true size is a speck: a ring round it in the paper's own colour, and where its close
    // picture stands beside the heaps' a leader to it, in the paper's colour over the stage and in pencil past its edge
    const pvL: 'wide' | 'upright' = wide ? 'wide' : 'upright'
    const fullW = pic.r - pic.l, fullH = fullW * P.h / P.w, fullY = pic.b - fullH
    const sp = project(pvL, [lump[0], 0.003, lump[1]])
    const sx = pic.l + sp.x * fullW, sy = fullY + sp.y * fullH, rr = wide ? 10 : 7
    if (sx - rr > pic.l && sx + rr < pic.r && sy - rr > pic.t && sy + rr < pic.b) {
      prims.push({ type: 'path', id: 'silver-ring', mark: 'pencil', d: circlePath(sx, sy, rr), width: 1.25, cls: 'sky-callout' })
      const besideIt = silver.l >= pic.r + 4
      if (besideIt) {
        const gx = (pic.r + silver.l) / 2, ty = Math.min(silver.b - 6, Math.max(silver.t + 6, sy))
        prims.push({ type: 'path', id: 'silver-lead', mark: 'pencil', d: `M${f(sx + rr)} ${f(sy)}H${f(pic.r)}`, width: 1, cls: 'sky-callout' })
        prims.push({ type: 'path', id: 'silver-lead-out', mark: 'pencil', d: `M${f(pic.r)} ${f(sy)}H${f(gx)}V${f(ty)}H${f(silver.l)}`, width: 1 })
        walls.push({ ax: pic.r, ay: sy, bx: gx, by: sy }, { ax: gx, ay: sy, bx: gx, by: ty }, { ax: gx, ay: ty, bx: silver.l, by: ty })
      }
      facts.silverMark = { x: sx, y: sy, r: rr, lead: besideIt }
    }
    // each heap's name under the picture, below its own foot; the figure's at its feet
    const pv: 'wide' | 'upright' = wide ? 'wide' : 'upright'
    const pw = full.w, phh = full.h
    const fig = HEAPS_PLAN.figure
    const fTop = project(pv, [fig[0], FIGURE_HEIGHT, fig[1]]), fFoot = project(pv, [fig[0], 0, fig[1]])
    const pxPerM = (fFoot.y - fTop.y) * phh / FIGURE_HEIGHT
    for (const hp of heaps()) {
      const c = project(pv, [hp.at[0], 0, hp.at[1]]), l = project(pv, [hp.at[0] - hp.R, 0, hp.at[1]]), r = project(pv, [hp.at[0] + hp.R, 0, hp.at[1]])
      const top = project(pv, [hp.at[0], hp.H, hp.at[1]])
      const x = full.x + c.x * pw
      facts.heapsDrawn.push({ id: hp.id, x, foot: (r.x - l.x) * pw / pxPerM, top: (c.y - top.y) * phh / pxPerM })
      // upright the small heap in front takes a second row
      const row = !wide && hp.id === 'sesame' ? nameRoom : 0
      const sides = wide ? ['below'] as const : hp.id === 'barley' ? ['below-left', 'below'] as const : hp.id === 'dates' ? ['below-right', 'below'] as const : ['below'] as const
      if (labels) anchors.push({ id: `good-${hp.id}`, x, y: pic.b + row, sides, gap: 6, kind: 'pair' })
    }
    if (labels) {
      anchors.push(wide ? { id: 'tablet', x: photo.l, y: photo.t, sides: ['above-right'], gap: 4, kind: 'pair' }
        : { id: 'tablet', x: photo.r, y: photo.t + 2, sides: ['below-right', 'right'], gap: 8, kind: 'pair' })
      const short = !wide && bh < 480
      anchors.push(wide ? { id: 'credit', x: photo.l, y: photo.b, sides: ['below-right'], gap: 4, kind: 'credit', width: photo.r - photo.l }
        : short ? { id: 'credit', x: photo.r + 8, y: photo.t + 50, sides: ['below-right'], gap: 0, kind: 'credit', width: box.r - photo.r - 10 }
        : { id: 'credit', x: box.l, y: box.t + Math.min(150, Math.max(92, bh * 0.25)) + 6, sides: ['below-right'], gap: 0, kind: 'credit', width: bw - 2 })
      anchors.push({ id: 'silver', x: (silver.l + silver.r) / 2, y: rulerY + rulerH, sides: ['below'], gap: 4, kind: 'pair' })
      if (wide) anchors.push({ id: 'figure', x: full.x + fFoot.x * pw, y: pic.b, sides: ['below'], gap: 6, kind: 'pencil' })
    }
    facts.photo = photo; facts.heaps = pic; facts.silver = silver
    void GOOD_IDS; void SILVER_MM
  }

  if (state === 'rise') {
    /* THE RIVER'S RISE: the rise of the diary as water filling up, a pencil gauge of two metres at its edge, the figure
       on the same base and scale */
    const top = box.t + (wide ? 64 : 56), base = box.b - (wide ? 24 : 20)
    const pxPerM = Math.min((base - top) / 2.05, (bw - 20) / 1.55)
    const cx = (box.l + box.r) / 2
    // the group (the water, the staff at its right, the gap, the figure's half width) centred on the plate; a wide
    // plate draws the water two metres across, so it reads as the river and not a post; the rise's name stands over
    // the water and leftward of it, clear of the staff and the figure
    const waterM = wide ? 2 : 0.5
    const colW = pxPerM * waterM
    const gx = cx - pxPerM * (waterM + 0.76) / 2
    const sx = gx + colW + 1
    const fill = settled !== null ? 1 : ease(span(t, 1.5, 2))
    const riseTop = base - riseM() * pxPerM * fill
    // the base: a fine plain line, the river's level at the rise's start (its height not known)
    const fx = sx + pxPerM * 0.55
    const baseL = gx - 12, baseR = fx + pxPerM * 0.21 + 12
    prims.push({ type: 'line', id: 'base', mark: 'known', ax: baseL, ay: base, bx: baseR, by: base, width: 1.5 })
    walls.push({ ax: baseL, ay: base, bx: baseR, by: base })
    // the rise: the water's wash from the base to the diary's height, its top a fine ink line
    if (fill > 0) {
      prims.push({ type: 'rect', id: 'rise', mark: 'known', x: gx, y: riseTop, w: colW, h: base - riseTop, cls: 'sky-water' })
      prims.push({ type: 'line', id: 'rise-top', mark: 'known', ax: gx, ay: riseTop, bx: sx, by: riseTop, width: 1.5 })
      take({ l: gx, t: riseTop - 2, r: sx, b: base }, 'rise')
      // the drawings' water-level mark on both levels, a small triangle on the line (the risen one with two short
      // strokes under it): the old in the water, the risen on its line between the staff and the figure, where the
      // rise's name above the water never meets it
      const u = wide ? 8 : 6
      for (const [id, y, lx] of [['level-old', base, gx + Math.min(colW * 0.3, pxPerM * 0.3)], ['level-new', riseTop, sx + pxPerM * 0.14]] as const) {
        if (id === 'level-new' && base - riseTop < 3 * u) continue
        prims.push({ type: 'path', id, mark: 'pencil', d: `M${f(lx - u)} ${f(y - 1.6 * u)}L${f(lx + u)} ${f(y - 1.6 * u)}L${f(lx)} ${f(y)}Z` })
        take({ l: lx - u, t: y - 1.6 * u, r: lx + u, b: y }, id, 3)
        if (id === 'level-new') prims.push({ type: 'path', id: `${id}-strokes`, mark: 'pencil', d: `M${f(lx - 0.8 * u)} ${f(y + 0.8 * u)}h${f(1.6 * u)}M${f(lx - 0.4 * u)} ${f(y + 1.5 * u)}h${f(0.8 * u)}`, width: 1 })
      }
      // the risen level carried across to the figure, dashed, so the two heights meet on one line
      prims.push({ type: 'line', id: 'level-across', mark: 'pencil', ax: sx + 2, ay: riseTop, bx: fx + pxPerM * 0.3, by: riseTop, width: 0.75, cls: 'sky-leader' })
    }
    // the gauge: a pencil staff at the water's right edge, a tick each 10 cm into the water, longer each half metre
    let staff = `M${f(sx)} ${f(base)}L${f(sx)} ${f(base - 2 * pxPerM)}`
    for (let i = 1; i <= 20; i++) staff += `M${f(sx)} ${f(base - i * 0.1 * pxPerM)}h${i % 5 === 0 ? -12 : -6}`
    prims.push({ type: 'path', id: 'gauge', mark: 'pencil', d: staff, width: 1.25 })
    take({ l: sx - 13, t: base - 2 * pxPerM - 2, r: sx + 2, b: base }, 'gauge')
    // the figure, pencil, on the same base at the same scale
    prims.push({ type: 'path', id: 'figure', mark: 'measure', d: figurePath(fx, base, pxPerM), width: 1 })
    take({ l: fx - pxPerM * 0.25, t: base - FIGURE_M * pxPerM - 2, r: fx + pxPerM * 0.25, b: base }, 'figure')
    if (labels) {
      anchors.push({ id: 'rise', x: sx - 14, y: riseTop, sides: ['above-left', 'above'], gap: 6, kind: 'pair' })
      anchors.push({ id: 'figure', x: fx, y: base - FIGURE_M * pxPerM, sides: ['above', 'above-right', 'right'], gap: 6, kind: 'pencil' })
    }
    facts.rise = { pxPerM, drawn: (base - riseTop) / pxPerM, figure: FIGURE_M, fill }
  }

  return { prims, anchors, taken, walls, bounds: box, facts: facts as unknown as Record<string, unknown> }
}
