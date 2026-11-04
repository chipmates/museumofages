/* THE FOUR MARKS, and the pencil. One honest way of drawing for every paper
   feature: what still stands is heavy and solid, what is known is a fine plain
   outline, what is guessed is dashed and hatched, and what nobody knows is
   bare paper, at most the word. Our own measures (the figure, the ruler, a
   counted unit, the counter) are grey pencil and never draw a thing of the past.

   The marks differ by pattern, never by hue alone: the grammar reads in
   greyscale and to a reader who sees no colour at all. Every stroke that
   carries a meaning is ink or pencil, and both keep 3:1 or better against the
   paper (`tokens.ts`). */

import { PAPER_TOKENS, INK_SHARE, hexRgb } from './tokens'

export type PaperMark = 'place' | 'known' | 'guessed' | 'unknown' | 'measure'

export interface MarkStyle {
  /** the stroke's width in CSS pixels, at every plate size; 0 draws none */
  stroke: number
  /** the dash and its gap, in CSS pixels, or null for a plain line */
  dash: readonly [number, number] | null
  fill: 'solid' | 'hatch' | 'none' | 'unit'
  /** whose line: the drawing's ink, or our pencil */
  hand: 'ink' | 'pencil'
}

export const MARKS: Readonly<Record<PaperMark, MarkStyle>> = {
  place: { stroke: 3, dash: null, fill: 'solid', hand: 'ink' },
  known: { stroke: 1.25, dash: null, fill: 'none', hand: 'ink' },
  guessed: { stroke: 1.5, dash: [7, 4], fill: 'hatch', hand: 'ink' },
  unknown: { stroke: 0, dash: null, fill: 'none', hand: 'ink' },
  measure: { stroke: 1.25, dash: null, fill: 'unit', hand: 'pencil' },
}

/** THE HATCH: one family of lines at 45 degrees, spaced so it still reads as a
 * hatch on a 360 px phone and never closes up into a tone */
export const HATCH = { spacing: 6, width: 1.1, angle: 45 } as const

const SVG = 'http://www.w3.org/2000/svg'
type Attrs = Record<string, string | number>

export function svg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Attrs = {}, cls?: string): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, typeof value === 'number' ? fmt(value) : value)
  if (cls) node.setAttribute('class', cls)
  return node
}
export const fmt = (n: number): string => String(Math.round(n * 100) / 100)

/** the ids one drawing's patterns go by: two plates on a page never share one */
export interface MarkIds { hatch: string }

/** THE DRAWING'S OWN DEFINITIONS: the hatch, in the plate's pixels */
export function markDefs(doc: Document, prefix: string): { defs: SVGDefsElement; ids: MarkIds } {
  const ids: MarkIds = { hatch: `${prefix}-hatch` }
  const defs = svg(doc, 'defs')
  const pattern = svg(doc, 'pattern', {
    id: ids.hatch, patternUnits: 'userSpaceOnUse', width: HATCH.spacing, height: HATCH.spacing,
    patternTransform: `rotate(${HATCH.angle})`,
  })
  pattern.append(svg(doc, 'line', { x1: HATCH.spacing / 2, y1: -1, x2: HATCH.spacing / 2, y2: HATCH.spacing + 1, 'stroke-width': HATCH.width }, 'paper-hatch-line'))
  defs.append(pattern)
  return { defs, ids }
}

/** the attributes one mark puts on a shape: its stroke, its dash and its fill */
export function markAttrs(mark: PaperMark, ids: MarkIds): Attrs {
  const style = MARKS[mark]
  const out: Attrs = { 'data-mark': mark }
  out['stroke-width'] = style.stroke
  if (style.dash) out['stroke-dasharray'] = `${style.dash[0]} ${style.dash[1]}`
  // a style, not an attribute: the kit's sheet sets the marks' fills, and a sheet outranks an attribute
  if (style.fill === 'hatch') out['style'] = `fill: url(#${ids.hatch})`
  return out
}

/** a rectangle in one mark, in the plate's pixels */
export function markRect(doc: Document, mark: PaperMark, ids: MarkIds, box: { x: number; y: number; w: number; h: number }, cls = ''): SVGRectElement {
  return svg(doc, 'rect', { x: box.x, y: box.y, width: Math.max(0, box.w), height: Math.max(0, box.h), ...markAttrs(mark, ids) }, `paper-mark ${cls}`.trim())
}

/** a line in one mark: a ground line, a height line, an edge */
export function markLine(doc: Document, mark: PaperMark, ids: MarkIds, a: { x: number; y: number }, b: { x: number; y: number }, cls = ''): SVGLineElement {
  const attrs = markAttrs(mark, ids)
  delete attrs['style']
  return svg(doc, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...attrs }, `paper-mark paper-line ${cls}`.trim())
}

/** a path in one mark */
export function markPath(doc: Document, mark: PaperMark, ids: MarkIds, d: string, cls = ''): SVGPathElement {
  return svg(doc, 'path', { d, ...markAttrs(mark, ids) }, `paper-mark ${cls}`.trim())
}

/** THE PAPER'S GRAIN as a tile the browser rasterises once: fibre in the ink at
 * its own small share, so the sheet is paper and not a flat plane */
export function grainTile(tokens: { ink: string } = PAPER_TOKENS, share: number = INK_SHARE.grain): string {
  const [r, g, b] = hexRgb(tokens.ink).map(c => (c / 255).toFixed(3))
  // the noise's red channel becomes the fibre's alpha; its colour is the ink's, set as the matrix's offset
  const body = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>`
    + `<filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='7' stitchTiles='stitch'/>`
    + `<feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  3 0 0 0 -1.2'/></filter>`
    + `<rect width='240' height='240' opacity='${(share * 4).toFixed(3)}' filter='url(%23g)'/></svg>`
  return `url("data:image/svg+xml,${body.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}")`
}
