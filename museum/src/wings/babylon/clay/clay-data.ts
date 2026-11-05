/* FEATURE 6'S FACTS AND THE NAME'S LAYOUT. The four signs of KÁ.DINGIR.RA.KI as the sign file reads them off
   Amiaud and Méchineau's "Bab. mod." column (each sign on its own page, in that page's pixels), laid in one line on
   our fresh tablet, and the press order (ours). Pure: no renderer, no DOM and no JSON import (the caller hands the
   sign file in), so node reads it as it is. */

import { wedgeTris, type FaceWedge, type Inscription, type WedgeRow } from '../objects/inscription'

export interface ClaySign {
  sign: string
  code: string
  reading: string
  /** the sign's number in the table, its page and the scan's leaf */
  am: number
  page: number
  leaf: number
  from: string
  /** a determinative: written, not spoken (the edition's braces) */
  silent?: boolean
  w: WedgeRow[]
}
export interface ClaySignFile {
  id: string
  text: string
  edition: string
  credit: string
  copy: { name: string; item: string; note: string }
  order: string
  signs: ClaySign[]
}

/** the edition's signs in order (RIBo Nebuchadnezzar II 035 ii 6) and their readings there; KI is written, not read */
export const EDITION = ['KA2', 'AN', 'RA', 'KI'] as const
export const READINGS = ['KÁ', 'DINGIR', 'RA', 'KI'] as const

/** OUR TABLET, metres: a fresh tablet of about the size of a school exercise (the Met's is 9.9 by 9.7 cm), long
 *  enough for the name in one line; its size, shape and the wedge order are ours */
export const TABLET = Object.freeze({ size: [0.112, 0.026, 0.072] as const, round: 0.007 })

/** THE LINE: one stylus makes every head, so each sign's copy is scaled until its wedges' heads are the stylus's
 *  width (mm; the copies are drawn at different sizes per page); the air between signs (mm); the cut's depth as a
 *  share of the head's width and its softening (mm) */
export const LINE = Object.freeze({ head: 2.7, air: 3.4, depth: 0.55, soften: 0.12 })

/** a copy row as the cutter's wedge, at a scale (mm a copy px) from an origin */
export function rowWedge(row: WedgeRow, origin: readonly [number, number] = [0, 0], scale = 1, at: readonly [number, number] = [0, 0]): FaceWedge {
  const [x, y, a, len, wid, kind] = row, r = a * Math.PI / 180
  return { u: at[0] + (x - origin[0]) * scale, v: at[1] + (y - origin[1]) * scale, du: Math.cos(r), dv: Math.sin(r), len: len * scale,
    wid: wid * scale, hook: kind === 'w', long: kind === 'l', line: 1, sign: 0, restored: false }
}

/** a wedge's own box on its copy: the corners of the triangles the cutter makes of it */
export function wedgeBox(row: WedgeRow): { x0: number; y0: number; x1: number; y1: number } {
  const xs: number[] = [], ys: number[] = []
  for (const t of wedgeTris(rowWedge(row), 0.5)) { xs.push(t.ax, t.bx, t.cx); ys.push(t.ay, t.by, t.cy) }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** a sign's box on its copy: the union of its wedges' boxes */
export function signBox(s: ClaySign): { x0: number; y0: number; x1: number; y1: number } {
  const b = s.w.map(wedgeBox)
  return { x0: Math.min(...b.map(q => q.x0)), y0: Math.min(...b.map(q => q.y0)), x1: Math.max(...b.map(q => q.x1)), y1: Math.max(...b.map(q => q.y1)) }
}

export interface PlacedSign {
  index: number
  sign: ClaySign
  /** mm per copy pixel for this sign: the stylus's head over the copy's middle head */
  scale: number
  /** the sign's box on the tablet's face, mm from its top-left (u right, v down as read) */
  box: { u0: number; v0: number; u1: number; v1: number }
  /** the copy pixel that lands on the box's top-left */
  origin: [number, number]
}

/** the middle head width of a sign's straight wedges on its copy (px) */
export function copyHead(s: ClaySign): number {
  const w = s.w.filter(r => r[5] !== 'w').map(r => r[4]).sort((x, y) => x - y)
  return w[Math.floor((w.length - 1) / 2)]!
}

/** THE NAME ON THE FACE: the four signs left to right, each scaled to the stylus, centred on the line's middle, the
 *  line centred on a face of `face` mm (u across, v down) */
export function layout(file: ClaySignFile, face: readonly [number, number] = [TABLET.size[0] * 1000, TABLET.size[2] * 1000]): PlacedSign[] {
  const boxes = file.signs.map(signBox)
  const scales = file.signs.map(s => LINE.head / copyHead(s))
  const widths = boxes.map((b, i) => (b.x1 - b.x0) * scales[i]!)
  const total = widths.reduce((s, w) => s + w, 0) + LINE.air * (widths.length - 1)
  let u = (face[0] - total) / 2
  return file.signs.map((sign, index) => {
    const b = boxes[index]!, s = scales[index]!, h = (b.y1 - b.y0) * s, v0 = (face[1] - h) / 2
    const placed: PlacedSign = { index, sign, scale: s, box: { u0: u, v0, u1: u + widths[index]!, v1: v0 + h }, origin: [b.x0, b.y0] }
    u += widths[index]! + LINE.air
    return placed
  })
}

/** A PRESSED WEDGE on the face, in the press order, with the sign it belongs to and its place inside that sign */
export interface Press extends FaceWedge { order: number; signIndex: number; inSign: number; last: boolean }

/** every wedge of the name on the face, mm, in the press order: the signs in the edition's order, inside each the
 *  file's own order (left to right, top to bottom; ours) */
export function presses(placed: readonly PlacedSign[]): Press[] {
  const out: Press[] = []
  for (const p of placed) p.sign.w.forEach((row, k) => {
    out.push({ ...rowWedge(row, p.origin, p.scale, [p.box.u0, p.box.v0]), sign: p.index + 1,
      order: out.length, signIndex: p.index, inSign: k, last: k === p.sign.w.length - 1 })
  })
  return out
}

/** THE SIGN FILE AS THE CUTTER'S OWN KIND (objects/inscription.ts), one line, so its checker reads it: each sign
 *  moved to its place in one virtual copy at one scale (1 mm a pixel), the area the whole line */
export function asInscription(file: ClaySignFile, placed: readonly PlacedSign[]): Inscription {
  const signs = placed.map(p => ({
    sign: p.sign.sign, code: p.sign.code, reading: p.sign.reading, from: p.sign.from,
    w: p.sign.w.map(([x, y, a, len, wid, kind]) => {
      const row: WedgeRow = [p.box.u0 + (x - p.origin[0]) * p.scale, p.box.v0 + (y - p.origin[1]) * p.scale, a, len * p.scale, wid * p.scale]
      if (kind) row.push(kind)
      return row
    }),
  }))
  const u0 = Math.min(...placed.map(p => p.box.u0)), u1 = Math.max(...placed.map(p => p.box.u1))
  const v0 = Math.min(...placed.map(p => p.box.v0)), v1 = Math.max(...placed.map(p => p.box.v1))
  return {
    id: file.id, text: file.text, credit: file.credit,
    copy: { name: file.copy.name, page: 'Bab. mod.', file: file.copy.item, origin: [0, 0], mmPerPx: 1 },
    area: { u: [u0, u1], v: [v0, v1] }, depth: LINE.depth, soften: LINE.soften,
    lines: [{ n: 1, translit: file.text, edition: [...EDITION], signs }],
  }
}

/** THE RUN'S PACE, seconds of its clock: one wedge a second, each sinking over the first share of its second; the
 *  whole name held a while before the run comes round to fresh clay */
export const PACE = Object.freeze({ sink: 0.45, hold: 3 })
export const period = (total: number): number => total + PACE.hold

/** WHERE THE PRESSES STAND at a clock of the run (seconds, one a wedge): wedges in whole, and the next one's share */
export function pressState(clock: number, total: number): { done: number; sinking: number; sink: number } {
  const c = Math.max(0, Math.min(total, clock))
  const k = Math.floor(c + 1e-6), f = c - k
  if (k >= total) return { done: total, sinking: -1, sink: 0 }
  if (f >= PACE.sink - 1e-6) return { done: k + 1, sinking: k + 1 < total ? k + 1 : -1, sink: 0 }
  return { done: k, sinking: k, sink: f / PACE.sink }
}

/** ONE PRESS from a clock: where the run plays from, where it stops (the wedge in) and the clock it is set to there;
 *  null at the end. A wedge already sinking is the one the press finishes. */
export function pressFrom(clock: number, total: number): { from: number; stop: number; land: number } | null {
  const { done, sink } = pressState(clock, total)
  if (done >= total) return null
  const from = sink > 0 ? clock : done
  return { from, stop: done + PACE.sink, land: done + 1 }
}

/** BACK ONE: the last wedge out again (one partly in is taken out first) */
export function backFrom(clock: number, total: number): number {
  const { done, sink } = pressState(clock, total)
  return sink > 0 ? done : Math.max(0, done - 1)
}

/** THE SIGNS FINISHED at a count of pressed wedges, and the one that just finished (lit until the next press) */
export function finished(done: number, all: readonly Press[]): { signs: number[]; just: number | null; all: boolean } {
  const signs: number[] = []
  for (const p of all) if (p.last && p.order < done) signs.push(p.signIndex)
  const last = done > 0 ? all[done - 1] : undefined
  return { signs, just: last?.last ? last.signIndex : null, all: done >= all.length }
}

/** A STUDENT'S STEPS, a type (Gesche 2000 as Still summarises it, RES 1; TARGETS-W2A 7.5): each step Guessed for these
 *  tablets, drawn dashed; their order is the type's, their size not known */
export const STUDENT_STEPS = ['stylus', 'signs', 'words', 'extracts', 'letters', 'literary'] as const
export type StudentStep = typeof STUDENT_STEPS[number]

/** THE ONE REAL TABLET: the Met's school exercise tablet, CC0, a later century's (WANTED 2) */
export const MET_TABLET = Object.freeze({
  id: '86.11.361',
  /** the Met's size, cm: width, height, thickness */
  cm: [9.9, 9.7, 4.4] as const,
  /** the photo's file and its pixels; the tablet's extent in it (px), measured off the photo's light ground */
  file: 'met-86.11.361-school-exercise-tablet.jpg',
  px: [800, 772] as const,
  credit: 'Photo: The Metropolitan Museum of Art, New York, 86.11.361, Purchase 1886. Public domain (CC0).',
})
