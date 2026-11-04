/* THE PAPER PLATE: the sheet a paper feature draws on. Its ground is the paper
   token with its grain; its drawing is one SVG in the plate's own pixels,
   `aria-hidden`, with the names and numbers as page text over it in a layer
   that is hidden from a reader too. Everything a reader needs is the list
   beside the plate, which the feature fills from the same words. Each plate
   is drawn twice, `wide` and `upright`, never one squeezed into the other. */

import css from './paper.css?inline'
import { markDefs, svg, grainTile, type MarkIds } from './marks'
import { paperStyle } from './tokens'

export type PaperFraming = 'wide' | 'upright'

export interface PaperPlate {
  readonly root: HTMLDivElement
  readonly drawing: SVGSVGElement
  readonly labels: HTMLDivElement
  readonly list: HTMLUListElement
  readonly ids: MarkIds
  readonly dir: 'ltr' | 'rtl'
  size(): { w: number; h: number }
  /** the plate's size in CSS pixels; the drawing's unit is the page's pixel */
  resize(w: number, h: number): void
  /** a label's own element, made once and reused, in the page's language */
  label(id: string, text: string, kind?: 'ink' | 'pencil' | 'quiet' | 'count' | 'big'): HTMLSpanElement
  /** a label of two parts on one line: a number in pencil and the name it counts in ink */
  labelPair(id: string, count: string, name: string): HTMLSpanElement
  /** a group of the drawing, made once, in drawing order */
  layer(id: string): SVGGElement
  dispose(): void
}

let seq = 0

/** the kit's style sheet, once per document */
export function paperSheet(doc: Document): void {
  if (doc.getElementById('paper-kit-style')) return
  const style = doc.createElement('style')
  style.id = 'paper-kit-style'
  style.textContent = css
  doc.head.append(style)
}

/** the framing a box of this shape takes: upright where it is taller than it is wide */
export const framingOf = (w: number, h: number): PaperFraming => (h > w * 1.05 ? 'upright' : 'wide')

export function createPaperPlate(doc: Document, o: { lang: string; dir?: 'ltr' | 'rtl'; name?: string }): PaperPlate {
  paperSheet(doc)
  const prefix = `paper${++seq}`
  const dir = o.dir ?? 'ltr'
  const root = doc.createElement('div')
  root.className = 'paper-plate'
  root.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)
  root.lang = o.lang
  root.dir = dir
  const drawing = svg(doc, 'svg', { 'aria-hidden': 'true', focusable: 'false' }, 'paper-drawing')
  const { defs, ids } = markDefs(doc, prefix)
  drawing.append(defs)
  const labels = doc.createElement('div')
  labels.className = 'paper-labels'
  labels.setAttribute('aria-hidden', 'true')
  root.append(drawing, labels)
  const list = doc.createElement('ul')
  list.className = 'paper-list'
  list.lang = o.lang
  list.dir = dir
  if (o.name) list.setAttribute('aria-label', o.name)
  const made = new Map<string, HTMLSpanElement>()
  const groups = new Map<string, SVGGElement>()
  let w = 0, h = 0

  return {
    root, drawing, labels, list, ids, dir,
    size: () => ({ w, h }),
    resize(nw, nh) {
      w = Math.max(1, Math.round(nw)); h = Math.max(1, Math.round(nh))
      drawing.setAttribute('viewBox', `0 0 ${w} ${h}`)
      drawing.setAttribute('width', String(w))
      drawing.setAttribute('height', String(h))
      root.style.width = `${w}px`
      root.style.height = `${h}px`
    },
    label(id, text, kind = 'ink') {
      let node = made.get(id)
      if (!node) {
        node = doc.createElement('span')
        node.className = `paper-label paper-label-${kind}`
        node.dataset['label'] = id
        labels.append(node)
        made.set(id, node)
      }
      if (node.textContent !== text) node.textContent = text
      return node
    },
    labelPair(id, count, name) {
      let node = made.get(id)
      if (!node) {
        node = doc.createElement('span')
        node.className = 'paper-label paper-label-pair'
        node.dataset['label'] = id
        const a = doc.createElement('span'), b = doc.createElement('span')
        a.className = 'paper-pair-count'; b.className = 'paper-pair-name'
        node.append(a, ' ', b)
        labels.append(node)
        made.set(id, node)
      }
      const [a, , b] = Array.from(node.childNodes) as [HTMLSpanElement, Text, HTMLSpanElement]
      if (a.textContent !== count) a.textContent = count
      if (b.textContent !== name) b.textContent = name
      return node
    },
    layer(id) {
      let g = groups.get(id)
      if (!g) {
        g = svg(doc, 'g', { 'data-layer': id }, `paper-layer paper-layer-${id}`)
        drawing.append(g)
        groups.set(id, g)
      }
      return g
    },
    dispose() { root.remove(); list.remove() },
  }
}
