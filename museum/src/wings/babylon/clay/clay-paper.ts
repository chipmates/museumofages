/* FEATURE 6 ON PAPER: the drawing at a point of the look's slider (1 letters, 2 signs, 3 students, 4 readers; below 1
   the press stands on the turntable and the plate shows the letters it crosses to). Pure: the same numbers in node and
   in the page.

   - THE LETTERS: the city's name in our alphabet, one pencil box a letter (our measure; the letters are page text).
   - THE FOLD: a copy of the seven boxes drops under them and folds shut, its six walls closing in pairs onto the four
     cells of the signs; the signs ink in last. The walls close onto quarter marks, never onto a letter's edge: no
     letter or group of letters is drawn as a sign's (the name is the Greek form of the city's; the signs write it
     their own way).
   - THE SIGNS: the four signs of the clay, from the same sign file and the same layout as the press, in fine ink
     (Known), each wedge as a hand copy draws it: the head's outline and the tail's.
   - A STUDENT'S STEPS: one tablet unit, repeated, dashed and hatched (Guessed: a type for these tablets), in the type's
     order; beside it the one real school tablet, the Met's photo at true size against our 10 cm pencil ruler. */

import type { Box, Seg, Side, Taken } from '../paper/placer'
import type { PaperFraming } from '../paper/framing'
import { rulerPaths } from '../paper/figure'
import { wedgeTris } from '../objects/inscription'
import { layout, presses, MET_TABLET, type ClaySignFile, type Press } from './clay-data'
import { STUDENT_STEPS, type StudentStep } from './clay-words'

export type PrimMark = 'known' | 'guessed' | 'measure' | 'pencil'
export type Prim =
  | { type: 'rect'; id: string; mark: PrimMark; x: number; y: number; w: number; h: number; cls?: string; alpha?: number }
  | { type: 'line'; id: string; mark: PrimMark; ax: number; ay: number; bx: number; by: number; cls?: string; alpha?: number }
  | { type: 'path'; id: string; mark: PrimMark; d: string; cls?: string; alpha?: number; width?: number }

export type LabelKind = 'ink' | 'pencil' | 'quiet' | 'count' | 'big'
/** a label's words, by what it names: a letter of the name, a sign's reading, a step's name, the ruler, the credit */
export type Say = { what: 'letter'; i: number } | { what: 'reading'; i: number } | { what: 'step'; step: StudentStep } | { what: 'ruler' } | { what: 'credit' } | { what: 'later' }
export interface Anchor { id: string; say: Say; x: number; y: number; sides: readonly Side[]; gap: number; reach?: number; kind: LabelKind; over?: string[] }

export interface ClayPaperScene {
  prims: Prim[]
  anchors: Anchor[]
  taken: Taken[]
  walls: Seg[]
  bounds: Box
  /** the photo's whole image and the crop it shows, in the plate's pixels; null where the strip is not drawn */
  photo: { x: number; y: number; w: number; h: number; clip: Box; alpha: number } | null
  /** the strip's scale, pixels a centimetre (the photo and the ruler share it) */
  pxPerCm: number
  /** the parts as drawn at this point, each counted where it stands at full strength */
  letters: number
  cells: number
  signs: number
  tablets: number
  /** the signs' scale, pixels a millimetre of the clay's face */
  k: number
}

const ease = (x: number): number => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
const f = (n: number): string => (Math.round(n * 100) / 100).toString()
const FULL = 0.999

/** THE TABLET UNIT: a fresh tablet's pillow outline, as the drawing's one repeated unit (its size is ours) */
export function tabletPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(w, h) * 0.22, k = r * 0.45
  return `M${f(x + r)} ${f(y)}L${f(x + w - r)} ${f(y)}C${f(x + w - k)} ${f(y)} ${f(x + w)} ${f(y + k)} ${f(x + w)} ${f(y + r)}`
    + `L${f(x + w)} ${f(y + h - r)}C${f(x + w)} ${f(y + h - k)} ${f(x + w - k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}`
    + `L${f(x + r)} ${f(y + h)}C${f(x + k)} ${f(y + h)} ${f(x)} ${f(y + h - k)} ${f(x)} ${f(y + h - r)}`
    + `L${f(x)} ${f(y + r)}C${f(x)} ${f(y + k)} ${f(x + k)} ${f(y)} ${f(x + r)} ${f(y)}Z`
}

/** where the seven walls close: each onto the nearest quarter mark of the row (the row's ends included) */
export function foldTo(letters: number, signs: number): number[] {
  const out: number[] = []
  for (let i = 1; i < letters; i++) {
    const at = i / letters
    out.push(Math.round(at * signs) / signs)
  }
  return out
}

let cached: { file: ClaySignFile; all: Press[]; boxes: { u0: number; v0: number; u1: number; v1: number }[] } | null = null
function signsOf(file: ClaySignFile): { all: Press[]; boxes: { u0: number; v0: number; u1: number; v1: number }[] } {
  if (cached?.file !== file) {
    const placed = layout(file)
    cached = { file, all: presses(placed), boxes: placed.map(p => p.box) }
  }
  return cached
}

export function clayPaperScene(t: number, framing: PaperFraming, w: number, h: number, file: ClaySignFile, letters = 7): ClayPaperScene {
  const prims: Prim[] = [], anchors: Anchor[] = [], taken: Taken[] = [], walls: Seg[] = []
  const upright = framing === 'upright'
  const m = upright ? 16 : Math.max(28, w * 0.05)
  const bounds: Box = { l: 6, t: 6, r: w - 6, b: h - 6 }
  const { all, boxes } = signsOf(file)
  const nSigns = boxes.length
  const fold = ease(t - 1), cross = ease(t - 2)
  const nameA = 1 - cross, stripA = cross
  let lettersN = 0, cellsN = 0, signsN = 0, tabletsN = 0, k = 0, pxPerCm = 0
  let photo: ClayPaperScene['photo'] = null

  if (nameA > 0.001) {
    // THE ROWS: the letters' row on top, the signs' row under it, one span; the signs' cells sized to the signs' shape
    const signW = Math.max(...boxes.map(b => b.u1 - b.u0)), signH = Math.max(...boxes.map(b => b.v1 - b.v0))
    const rowW = Math.min(w - 2 * m, letters * (upright ? 60 : 112))
    const L = (w - rowW) / 2, R = L + rowW
    const cell = rowW / letters
    const cellH = Math.min(cell * 1.05, h * (upright ? 0.16 : 0.2))
    const sCell = rowW / nSigns
    const readRoom = upright ? 30 : 36
    const gap = Math.max(22, cellH * 0.4)
    const room = h - 2 * m - cellH - gap - readRoom
    // one scale for every sign, as one stylus made them: the widest sign fills most of its cell
    k = Math.min((sCell * 0.8) / signW, Math.max(10, room) * 0.62 / signH)
    const sCellH = Math.min(Math.max(signH * k / 0.62, cellH), Math.max(cellH, room))
    const block = cellH + gap + sCellH + readRoom
    const y0 = Math.max(m, (h - block) / 2)
    const y1 = y0 + cellH + gap

    // the letters' row: our measure, in pencil
    for (let i = 0; i < letters; i++) {
      const x = L + i * cell
      prims.push({ type: 'rect', id: `cell${i}`, mark: 'measure', x, y: y0, w: cell, h: cellH, cls: 'paper-open', alpha: nameA })
      taken.push({ l: x, t: y0, r: x + cell, b: y0 + cellH, id: `cell${i}` })
      if (nameA >= FULL) {
        anchors.push({ id: `letter${i}`, say: { what: 'letter', i }, x: x + cell / 2, y: y0 + cellH / 2, sides: ['on'], gap: 0, kind: 'count', over: [`cell${i}`] })
        lettersN++
      }
    }

    // THE FOLD: the boxes' copy drops under the row and its walls close onto the signs' cells
    if (fold > 0.001) {
      const yy = lerp(y0, y1, fold), hh = lerp(cellH, sCellH, fold)
      const show = Math.min(1, fold * 3) * nameA
      prims.push({ type: 'rect', id: 'fold', mark: 'measure', x: L, y: yy, w: rowW, h: hh, cls: 'paper-open', alpha: show })
      const to = foldTo(letters, nSigns)
      to.forEach((end, i) => {
        const x = L + rowW * lerp((i + 1) / letters, end, fold)
        prims.push({ type: 'line', id: `wall${i}`, mark: 'pencil', ax: x, ay: yy, bx: x, by: yy + hh, alpha: show })
      })
      if (fold >= FULL) {
        cellsN = nSigns
        for (let j = 0; j < nSigns; j++) taken.push({ l: L + j * sCell, t: y1, r: L + (j + 1) * sCell, b: y1 + sCellH, id: `sign${j}` })
      }
      // the signs ink in as the walls close
      const inkA = ease((fold - 0.55) / 0.45) * nameA
      if (inkA > 0.001) {
        for (let j = 0; j < nSigns; j++) {
          const b = boxes[j]!, cx = L + (j + 0.5) * sCell, cy = yy + hh / 2
          const uc = (b.u0 + b.u1) / 2, vc = (b.v0 + b.v1) / 2
          let d = ''
          for (const p of all) {
            if (p.signIndex !== j) continue
            for (const tri of wedgeTris(p, 0.5)) {
              const X = (u: number): string => f(cx + (u - uc) * k), Y = (v: number): string => f(cy + (v - vc) * k)
              d += `M${X(tri.ax)} ${Y(tri.ay)}L${X(tri.bx)} ${Y(tri.by)}L${X(tri.cx)} ${Y(tri.cy)}Z`
            }
          }
          prims.push({ type: 'path', id: `sign${j}`, mark: 'known', d, cls: 'clay-sign', alpha: inkA })
          if (inkA >= FULL) {
            signsN++
            anchors.push({ id: `reading${j}`, say: { what: 'reading', i: j }, x: cx, y: y1 + sCellH, sides: ['below'], gap: 6, kind: 'big' })
          }
        }
      }
    }
  }

  if (stripA > 0.001) {
    // A STUDENT'S STEPS: one unit, repeated; the photo at true size; the ruler under it
    const n = STUDENT_STEPS.length
    const credit = 26, later = 24, rulerH = (c: number): number => Math.max(10, c * 0.9)
    const [ex0, ey0, ex1, ey1] = MET_TABLET.extent
    const perCm = (ex1 - ex0) / MET_TABLET.cm[0]
    let tw: number, th: number, tx: (i: number) => number, ty: (i: number) => number
    let area: Box
    if (!upright) {
      const left = m, right = w * 0.6
      tw = Math.max(64, Math.min(118, (right - left) / (n + (n - 1) * 0.55)))
      th = tw * 0.74
      const step = tw * 1.55
      const x0 = left + ((right - left) - (tw + (n - 1) * step)) / 2
      tx = i => x0 + i * step
      ty = () => h / 2 - th / 2 - 12
      area = { l: w * 0.64, t: m + later, r: w - m, b: h - m - credit - 34 }
    } else {
      // the column takes about two fifths of the plate's height, so the one real tablet keeps the larger share
      th = Math.max(22, Math.min(32, (h * 0.4 - (n - 1) * 8) / n))
      tw = th / 0.74
      const gapY = Math.max(7, th * 0.3)
      const col = n * th + (n - 1) * gapY
      // the steps' column, then the photo under it in the room that is left
      const top = m
      tx = () => m + 4
      ty = i => top + i * (th + gapY)
      area = { l: m, t: top + col + 16 + later, r: w - m, b: h - m - credit - 18 }
    }
    for (let i = 0; i < n; i++) {
      const step = STUDENT_STEPS[i]!, x = tx(i), y = ty(i)
      prims.push({ type: 'path', id: `tablet-${step}`, mark: 'guessed', d: tabletPath(x, y, tw, th), alpha: stripA })
      taken.push({ l: x, t: y, r: x + tw, b: y + th, id: `tablet-${step}` })
      if (stripA >= FULL) {
        tabletsN++
        anchors.push(upright
          ? { id: `step-${step}`, say: { what: 'step', step }, x: x + tw, y: y + th / 2, sides: ['right'], gap: 10, kind: 'ink' }
          : { id: `step-${step}`, say: { what: 'step', step }, x: x + tw / 2, y: y + th / 2, sides: i % 2 ? ['above', 'below'] : ['below', 'above'], gap: th / 2 + 8, reach: 1, kind: 'ink' })
      }
    }
    // THE PHOTO: the tablet's own extent at the strip's scale, cropped to it with a little of the photo's ground
    const aw = Math.max(40, area.r - area.l), ah = Math.max(40, area.b - area.t)
    const fitCm = Math.min(aw / (MET_TABLET.cm[0] * 1.1), ah / (MET_TABLET.cm[1] * 1.1))
    pxPerCm = Math.max(6, fitCm)
    const s = pxPerCm / perCm
    const pad = 14 * s
    const cw = (ex1 - ex0) * s + 2 * pad, ch = (ey1 - ey0) * s + 2 * pad
    const cx0 = area.l + (aw - cw) / 2, cy0 = area.t + (ah - ch) / 2
    const clip: Box = { l: cx0, t: cy0, r: cx0 + cw, b: cy0 + ch }
    photo = { x: cx0 + pad - ex0 * s, y: cy0 + pad - ey0 * s, w: MET_TABLET.px[0] * s, h: MET_TABLET.px[1] * s, clip, alpha: stripA }
    prims.push({ type: 'rect', id: 'photo-frame', mark: 'known', x: clip.l, y: clip.t, w: cw, h: ch, alpha: stripA })
    taken.push({ ...clip, id: 'photo' })
    // the ruler starts under the tablet's own left edge, so its ten centimetres read against the tablet's 9.9
    const rx = cx0 + pad, ry = clip.b + 8
    const ruler = rulerPaths(rx, ry, pxPerCm, 10)
    prims.push({ type: 'path', id: 'ruler-body', mark: 'pencil', d: ruler.body, width: 1, alpha: stripA })
    prims.push({ type: 'path', id: 'ruler-ticks', mark: 'pencil', d: ruler.ticks, width: 1, alpha: stripA })
    taken.push({ l: rx, t: ry, r: rx + 10 * pxPerCm, b: ry + rulerH(pxPerCm), id: 'ruler' })
    if (stripA >= FULL) {
      anchors.push({ id: 'ruler', say: { what: 'ruler' }, x: rx + 10 * pxPerCm, y: ry + rulerH(pxPerCm) / 2, sides: ['right', 'below'], gap: 8, kind: 'pencil' })
      anchors.push({ id: 'credit', say: { what: 'credit' }, x: clip.l, y: ry + rulerH(pxPerCm), sides: ['below-right', 'below'], gap: 6, kind: 'quiet' })
      // the photo's date, printed in with its credit: one of the same tradition, from a later century (WANTED 2)
      anchors.push({ id: 'later', say: { what: 'later' }, x: upright ? Math.min(clip.l, m) : clip.l, y: clip.t, sides: ['above-right', 'above'], gap: 6, kind: 'quiet' })
    }
  }

  return { prims, anchors, taken, walls, bounds, photo, pxPerCm, letters: lettersN, cells: cellsN, signs: signsN, tablets: tabletsN, k }
}
