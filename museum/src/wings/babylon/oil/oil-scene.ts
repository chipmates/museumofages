/* FEATURE 2 AS A DRAWING: what stands on the plate at any point of the slider,
   in the plate's pixels. Pure, so the page draws it and node checks it.

   Steps 0 to 4: the holder's photograph of VAT 16378 at true size where the
   plate holds it (a CSS centimetre a centimetre), a 10 cm pencil ruler beside
   it at the photograph's own scale, nothing drawn on it, its credit printed
   under it. Then rows of the counted unit, one pencil square a sila, repeated
   and never enlarged: 10 for the king of Judah, 2½ for his five sons
   together, 4 for eight men from Judah, ½ for a carpenter from Arvad, and
   twenty such halves in a row as long as the king's. Step 5: the photograph
   leaves, the rows shrink into the dots of their lands on today's coasts, and
   the other lands the lists name light: dots only, no line between them.

   The plate's words are numbers with their unit and single names; a row's
   count stands only where the step's band line names it. */

import { rulerPaths } from '../paper/figure'
import { unitGrid, poured } from '../paper/counter'
import type { PaperFraming } from '../paper/framing'
import type { Box, Seg, Side, Taken } from '../paper/placer'
import { circlePath, clipLine, ease, lerp, span, settledAt, type Anchor, type Inset, type PaperScene, type Prim } from '../paper/scene'
import { CSS_CM, HALVES, LANDS, MAP, PHOTO, type Coasts, type LandId, type RowId } from './oil-data'

/** which counts each step's band line names: a row's count stands on the plate only at these steps */
export const COUNTED: Record<number, readonly string[]> = { 1: ['king'], 2: ['sons'], 3: ['men'], 4: ['king', 'carpenter', 'halves'] }
/** the ruler's length stands only where the band names it */
export const RULER_NAMED = [0]

export type OilLabel = 'ruler' | 'credit' | `row-${RowId}` | 'row-halves' | `land-${LandId}`

/** where a land's name may stand round its dot, in order: off the coast into the sea, or inland, clear of the next city */
const SIDES: Record<LandId, readonly Side[]> = {
  judah: ['right', 'below-right', 'below', 'left'],
  tyre: ['left', 'above-left', 'right', 'below-left'],
  byblos: ['right', 'above-right', 'left', 'below-right'],
  arvad: ['left', 'above-left', 'above', 'right'],
  lydia: ['above', 'right', 'left', 'below'],
  egypt: ['below', 'left', 'right', 'above'],
  babylon: ['right', 'above', 'below', 'left'],
}
/** upright, the coast's three cities stand closer than a name is tall: they take turns, sea and land */
const SIDES_UPRIGHT: Partial<Record<LandId, readonly Side[]>> = {
  arvad: ['right', 'above-right', 'above-left', 'above'],
  // never below-right: there Byblos's name stands level with Tyre's dot and reads as its name
  byblos: ['right', 'left'],
  tyre: ['left', 'below-left', 'above-left'],
}
/** upright, Arvad's and Byblos's names sit a little above and below their dots' line, so Byblos's clears Arvad's dot */
const NUDGE_UPRIGHT: Partial<Record<LandId, number>> = { arvad: -4, byblos: 6 }

/** a vertical ruler: the kit's ruler laid on its side, its ticks against the thing it measures (to its left) */
function rulerUpright(x: number, y: number, pxPerCm: number): { body: string; ticks: string; w: number; h: number } {
  const r = rulerPaths(y, x, pxPerCm)
  const swap = (d: string): string => d.replace(/M(-?[\d.]+) (-?[\d.]+)/g, 'M$2 $1').replace(/[hv]/g, (c) => (c === 'h' ? 'v' : 'h'))
  return { body: swap(r.body), ticks: swap(r.ticks), w: Math.max(10, pxPerCm * 0.9), h: 10 * pxPerCm }
}


export interface OilFacts {
  rows: { id: string; count: number; units: number; size: number; w: number; left: number; y: number }[]
  unit: number
  photo: { x: number; y: number; w: number; h: number; scale: number; trueSize: boolean; pxPerCm: number } | null
  ruler: { x: number; y: number; w: number; h: number; cm: number } | null
  dots: { id: string; x: number; y: number; r: number; lit: number; restored: boolean }[]
  map: number
}

export function oilScene(t: number, framing: PaperFraming, w: number, h: number, o: { inset: Inset; data: { coasts?: Coasts } }): PaperScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const wide = framing === 'wide'
  const I = o.inset
  const box: Box = { l: I.l, t: I.t, r: w - I.r, b: h - I.b }
  const bw = box.r - box.l, bh = box.b - box.t
  const step = settledAt(t)
  const leave = ease(span(t, 4, 4.45))
  // a low upright plate (the sheet raised on a short phone) cannot hold the photograph over five rows with their names
  // above them: there the photograph leaves as the rows come, and the names stand beside the rows as on a wide plate
  const low = !wide && bh < 300

  /* THE PHOTOGRAPH, at true size where the plate holds it, and the ruler at its scale: beside it on a wide plate,
     under it upright, where the photograph takes the plate's width */
  const trueScale = CSS_CM / PHOTO.pxPerCm
  const rulerH = (s: number): number => Math.max(10, PHOTO.pxPerCm * s * 0.9)
  const creditH = (wide ? 2 : 2) * 18.2 + 10
  // upright, the photograph is large on its own at the first step, then small at the top, its credit beside it
  const smallH = Math.max(92, Math.min(150, bh * 0.26))
  let scale: number
  if (wide) scale = Math.min(trueScale, (bh - creditH) / PHOTO.h, (bw * 0.42 - 16) / PHOTO.w)
  else {
    const big = Math.min(trueScale, bw / PHOTO.w, (bh - creditH - 12 - rulerH(trueScale) - 6) / PHOTO.h)
    scale = lerp(big, Math.min(big, smallH / PHOTO.h), ease(span(t, 0, 0.7)))
  }
  const pw = PHOTO.w * scale, ph = PHOTO.h * scale
  const pxPerCm = PHOTO.pxPerCm * scale
  // wide, the photograph and its ruler stand centred at the first step and move aside as the rows come
  const groupW = pw + 10 + rulerH(scale)
  const px = wide ? lerp(box.l + (bw - groupW) / 2, box.l, ease(span(t, 0, 0.7))) : box.l
  const py = wide ? box.t + Math.max(0, (bh - creditH - ph) / 2) * (1 - ease(span(t, 0, 0.7))) : box.t
  const photoA = (1 - leave) * (low ? 1 - ease(span(t, 0.2, 0.7)) : 1)
  let photo: OilFacts['photo'] = null, ruler: OilFacts['ruler'] = null
  if (photoA > 0.01) {
    prims.push({ type: 'image', id: 'photo', key: 'photo', x: px, y: py, w: pw, h: ph, fit: 'fill', alpha: photoA })
    taken.push({ l: px - 2, t: py - 2, r: px + pw + 2, b: py + ph + 2, id: 'photo' })
    photo = { x: px, y: py, w: pw, h: ph, scale, trueSize: scale >= trueScale - 1e-6, pxPerCm }
    let rb: Box
    if (wide) {
      // beside the tablet, its top level with the tablet's top, its ticks toward it
      const rx = px + pw + 10, ry = py + PHOTO.tablet.t * scale
      const r = rulerUpright(rx, ry, pxPerCm)
      prims.push({ type: 'path', id: 'rulerBody', mark: 'pencil', d: r.body, width: 1.25, alpha: photoA })
      prims.push({ type: 'path', id: 'rulerTicks', mark: 'pencil', d: r.ticks, width: 1, alpha: photoA })
      rb = { l: rx, t: ry, r: rx + r.w, b: ry + r.h }
    } else {
      // under the photograph, from its left edge, its ticks toward it
      const rx = px, ry = py + ph + 8
      const r = rulerPaths(rx, ry, pxPerCm)
      prims.push({ type: 'path', id: 'rulerBody', mark: 'pencil', d: r.body, width: 1.25, alpha: photoA })
      prims.push({ type: 'path', id: 'rulerTicks', mark: 'pencil', d: r.ticks, width: 1, alpha: photoA })
      rb = { l: rx, t: ry, r: r.ends[1], b: ry + rulerH(scale) }
    }
    taken.push({ l: rb.l - 1, t: rb.t - 1, r: rb.r + 1, b: rb.b + 1, id: 'ruler' })
    ruler = { x: rb.l, y: rb.t, w: rb.r - rb.l, h: rb.b - rb.t, cm: 10 }
    if (step !== null && step <= 4) {
      if (RULER_NAMED.includes(step)) {
        anchors.push(wide ? { id: 'ruler', x: (rb.l + rb.r) / 2, y: rb.b, sides: ['below', 'below-right'], gap: 6, kind: 'pencil' }
          : { id: 'ruler', x: rb.r, y: (rb.t + rb.b) / 2, sides: ['right'], gap: 6, kind: 'pencil' })
      }
      // the credit, printed under the picture; upright, once the picture is small, beside it
      const beside = !wide && step > 0
      const cx = beside ? px + pw + 12 : px
      const cw = beside ? box.r - cx : wide ? Math.min(bw * 0.45, Math.max(pw + 10 + rulerH(scale), 640)) : bw
      anchors.push({ id: 'credit', x: cx - 0.07, y: beside ? py : (wide ? py + ph : rb.b) + 8, sides: ['below-right'], gap: 0.1, kind: 'credit', width: cw, reach: 1 })
    }
  }

  /* THE ROWS: one pencil square a sila, never enlarged */
  // wide, the rows stand right of the photograph and its ruler as they stand once the rows come; upright, under them
  const restScale = wide ? scale : Math.min(scale, smallH / PHOTO.h)
  const upFrom = wide ? box.l + PHOTO.w * restScale + 10 + rulerH(restScale) + 64 : box.l
  const rowsTop = wide ? box.t + 8 : low ? box.t + 4 : box.t + PHOTO.h * restScale + 8 + rulerH(restScale) + 18
  const labelRoom = wide ? 210 : low ? 150 : 0
  const nRows = 5
  const gapOf = (s: number): number => Math.max(4, Math.round(s * 0.2))
  // upright, each row carries its label above it on one line
  const labelH = wide || low ? 0 : 26
  const vAir = wide ? 26 : low ? 20 : 12
  const byWidth = (box.r - upFrom - labelRoom) / (10 + 9 * 0.2)
  const byHeight = (box.b - rowsTop - nRows * (labelH + vAir) + vAir) / nRows
  const size = Math.max(8, Math.floor(Math.min(wide ? 56 : 26, byWidth, byHeight)))
  const gap = gapOf(size)
  const rowY = (i: number): number => rowsTop + i * (size + labelH + vAir) + labelH
  const rowsFacts: OilFacts['rows'] = []
  /* THE MAP: today's coasts and rivers, the lands' dots */
  const cos = Math.cos((MAP.lat0 * Math.PI) / 180)
  const k = Math.min(bw / ((MAP.e - MAP.w) * cos), bh / (MAP.n - MAP.s))
  const mx = (box.l + box.r) / 2, my = (box.t + box.b) / 2
  const cLon = (MAP.w + MAP.e) / 2, cLat = (MAP.s + MAP.n) / 2
  const proj = (lon: number, lat: number): [number, number] => [mx + (lon - cLon) * cos * k, my - (lat - cLat) * k]
  const dotR = wide ? 5.5 : 4.5
  const dotAt = new Map(LANDS.map((l) => [l.id as LandId, proj(l.lon, l.lat)]))

  const gather = ease(span(t, 4.1, 4.8))
  const rows: { id: string; count: number; land: LandId; share: number }[] = [
    { id: 'king', count: 10, land: 'judah', share: span(t, 0.12, 0.9) },
    { id: 'sons', count: 2.5, land: 'judah', share: span(t, 1.12, 1.8) },
    { id: 'men', count: 4, land: 'judah', share: span(t, 2.12, 2.85) },
    { id: 'carpenter', count: 0.5, land: 'arvad', share: span(t, 3.08, 3.3) },
    { id: 'halves', count: HALVES / 2, land: 'arvad', share: span(t, 3.35, 3.95) },
  ]
  for (const [i, row] of rows.entries()) {
    const shown = poured(row.count, row.share)
    if (shown <= 0) continue
    const y = rowY(i)
    const units = unitGrid(shown, { x: upFrom, y, size, gap, perRow: 10, cut: 'width' })
    const [dx, dy] = dotAt.get(row.land)!
    const fade = 1 - ease(span(t, 4.45, 4.85))
    if (fade > 0.01) for (const u of units) {
      // gathering, each unit slides to its land's dot and shrinks to it, never growing
      const tx = lerp(u.x, dx - 1, gather), ty = lerp(u.y, dy - 1, gather)
      const sw = lerp(u.w, Math.min(u.w, 2), gather), sh = lerp(u.h, Math.min(u.h, 2), gather)
      if (row.id === 'halves') {
        // a unit as its two halves, each the carpenter's share, with a hair between them
        const half = (size - 1) / 2
        const parts = u.part >= 1 ? [0, half + 1] : [0]
        for (const [j, off] of parts.entries()) prims.push({ type: 'rect', id: `halves${u.index}${j ? 'b' : 'a'}`, mark: 'measure', x: tx + off * (1 - gather), y: ty, w: lerp(half, Math.min(half, 2), gather), h: sh, alpha: fade })
      } else prims.push({ type: 'rect', id: `${row.id}${u.index}`, mark: 'measure', x: tx, y: ty, w: sw, h: sh, alpha: fade })
    }
    const full = Math.ceil(row.count - 1e-9)
    const rowW = Math.min(full, 10) * size + (Math.min(full, 10) - 1) * gap
    const drawnW = units.length ? units[units.length - 1]!.x + units[units.length - 1]!.w - upFrom : 0
    if (gather < 0.02) taken.push({ l: upFrom - 2, t: y - 2, r: upFrom + drawnW + 2, b: y + size + 2, id: `row-${row.id}` })
    rowsFacts.push({ id: row.id, count: row.count, units: row.id === 'halves' ? Math.round(shown * 2) : shown, size, w: drawnW, left: upFrom, y })
    if (step !== null && step >= 1 && step <= 4 && gather < 0.02 && shown >= row.count - 1e-6) {
      const id = `row-${row.id}` as OilLabel
      if (wide || low) anchors.push({ id, x: upFrom + rowW, y: y + size / 2, sides: ['right'], gap: wide ? 14 : 10, kind: 'pair' })
      else anchors.push({ id, x: upFrom - 0.07, y: y - 6, sides: ['above-right'], gap: 0.1, kind: 'pair', reach: 1 })
    }
  }

  /* THE MAP comes up as the rows leave */
  const mapA = ease(span(t, 4.25, 4.85))
  const dots: OilFacts['dots'] = []
  if (mapA > 0.01) {
    const coasts = o.data.coasts
    if (coasts) {
      const draw = (id: string, line: readonly (readonly [number, number])[], wd: number): void => {
        const pts = line.map(([lo, la]) => proj(lo, la))
        for (const [j, run] of clipLine(pts, box).entries()) {
          prims.push({ type: 'path', id: `${id}-${j}`, mark: 'pencil', width: wd, d: `M${run.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`, alpha: mapA, cls: 'oil-today' })
          for (let q = 0; q + 1 < run.length; q++) walls.push({ ax: run[q]![0], ay: run[q]![1], bx: run[q + 1]![0], by: run[q + 1]![1] })
        }
      }
      coasts.coasts.forEach((c, i) => draw(`coast${i}`, c, 1.15))
      coasts.rivers.forEach((r, i) => draw(`river${i}`, r.line, 0.75))
    }
    for (const land of LANDS) {
      const [x, y] = dotAt.get(land.id)!
      // the rows' lands light as their units arrive, the others after them
      const lit = land.id === 'judah' || land.id === 'arvad' ? ease(span(t, 4.55, 4.85)) : ease(span(t, 4.65, 5))
      if (lit <= 0.01) continue
      const r = land.restored ? dotR + 1 : dotR
      prims.push(land.restored
        ? { type: 'path', id: `dot-${land.id}`, mark: 'guessed', cls: 'paper-open oil-ring', d: circlePath(x, y, r), alpha: lit }
        : { type: 'path', id: `dot-${land.id}`, mark: 'known', cls: 'oil-dot', d: circlePath(x, y, r), alpha: lit })
      taken.push({ l: x - r - 1.5, t: y - r - 1.5, r: x + r + 1.5, b: y + r + 1.5, id: `dot-${land.id}` })
      dots.push({ id: land.id, x, y, r, lit, restored: land.restored })
      if (step === 5) {
        anchors.push(wide
          ? { id: `land-${land.id}`, x, y, sides: SIDES[land.id], gap: 8, kind: 'ink', reach: 4 }
          : { id: `land-${land.id}`, x, y: y + (NUDGE_UPRIGHT[land.id] ?? 0), sides: SIDES_UPRIGHT[land.id] ?? SIDES[land.id], gap: 9, kind: 'ink', reach: 4, over: [`dot-${land.id}`] })
      }
    }
  }

  return {
    prims, anchors, taken, walls, bounds: box,
    facts: { step: step ?? -1, rows: rowsFacts, unit: size, photo, ruler, dots, map: Math.round(k * 100) / 100 } as unknown as Record<string, unknown>,
  }
}
