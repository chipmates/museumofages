/* FEATURE 7, THE TOWER YOU CAN MEASURE, as a close look's payload: it opens
   over the stop's held frame, turns the frame to ink (its ink still, about a
   second; a cut under reduced motion), lays the paper over it and draws the
   tower side-on. The slider walks its named steps; the words stand in the
   band, one line a step. Closing runs the same way back onto the held frame.
   Nothing starts by itself and nothing makes a sound. Every word comes from
   `measure-words.ts`. */

import css from './measure.css?inline'
import type { VitrinePayload, VitrinePayloadHost } from '../../vitrine/types'
import {
  createPaperPlate, createPaperSteps, framingOf, markLine, markPath, markRect, millions, overlaps, paperStyle, grainTile, placeElements, svg,
  type PaperFraming, type PaperPlate, type PaperSteps, type Placed, type LabelAsk,
} from '../paper/index'
import { measureScene, type Anchor, type LabelKey, type MeasureScene } from './measure-scene'
import { BRICKS } from './measure-data'
import { MEASURE_WORDS, STEP_IDS, type MeasureLang } from './measure-words'

export interface MeasureOptions {
  lang: MeasureLang
  dir?: 'ltr' | 'rtl'
  /** the stop's ink still in each framing; null crosses to the paper directly */
  ink: { wide: string; upright: string } | null
  reducedMotion: boolean
}

export interface MeasureReadout {
  phase: Phase
  t: number
  step: number
  framing: PaperFraming
  size: { w: number; h: number }
  scale: number
  figures: number
  stages: number
  units: { mud: number; baked: number }
  marks: number
  labels: { id: string; text: string; box: { l: number; t: number; r: number; b: number } | null; side: string | null }[]
  overlaps: string[]
  line: string
  list: string[]
}

export interface MeasurePayload extends VitrinePayload {
  /** the way back onto the held frame: paper, ink, then the frame; resolves when the frame stands bare */
  leave(): Promise<void>
  go(step: number, how?: 'cut' | 'travel'): void
  readout(): MeasureReadout
  /** true once the paper stands and the tower is drawn */
  open(): boolean
}

type Phase = 'ink' | 'paper' | 'open' | 'leaving' | 'gone'
/** the frame turning to ink, the paper laid over it, and the way back */
const INK_S = 1.0, PAPER_S = 0.55, BACK_PAPER_S = 0.4, BACK_INK_S = 0.8

export function createMeasurePayload(o: MeasureOptions): MeasurePayload {
  const W = MEASURE_WORDS[o.lang]
  const dir = o.dir ?? 'ltr'
  let host: VitrinePayloadHost | undefined
  let root: HTMLDivElement | undefined, ground: HTMLDivElement | undefined, ink: HTMLImageElement | undefined
  let plate: PaperPlate | undefined, steps: PaperSteps | undefined
  let phase: Phase = 'ink', clock = 0, t = 0, drawnAt = NaN, drawnSize = '', framing: PaperFraming = 'wide'
  let scene: MeasureScene | undefined, placed: Placed[] = [], asked: LabelAsk[] = []
  let lineStep = -1
  let leaving: (() => void) | null = null
  let listening = new AbortController()

  const label = (id: LabelKey): string => {
    const L = W.labels
    switch (id) {
      case 'base': return L.base
      case 'notKnown': return L.notKnown
      case 'about66': return L.about66
      case 'about90': return L.about90
      case 'figure': return L.figure
      case 'count': return new Intl.NumberFormat(o.lang).format(scene?.figures ?? 0)
      case 'oneModel': return L.oneModel
      case 'mudPair': return `${L.million(millions(BRICKS.mud, o.lang))} ${L.mud}`
      case 'bakedPair': return `${L.million(millions(BRICKS.baked, o.lang))} ${L.baked}`
      case 'tower': return L.tower
      case 'walls': return L.walls
      case 'lo': return new Intl.NumberFormat(o.lang).format(BRICKS.walls[0])
      case 'hi': return new Intl.NumberFormat(o.lang).format(BRICKS.walls[1])
    }
  }

  /** a count with the name it counts, on one line */
  function pair(id: LabelKey): HTMLSpanElement {
    const L = W.labels
    const n = id === 'mudPair' ? BRICKS.mud : BRICKS.baked
    return plate!.labelPair(id, L.million(millions(n, o.lang)), id === 'mudPair' ? L.mud : L.baked)
  }

  function listFor(step: number, sc: MeasureScene): string[] {
    const L = W.list
    const out = [L.base, L.core]
    if (step === 1) out.push(L.height(W.labels.about66), L.figures(sc.figures))
    else if (step === 2) out.push(L.stages, L.height(W.labels.about90), L.figures(sc.figures))
    else out.push(L.notKnown, L.figures(1))
    if (step === 4) out.push(L.bricks(W.labels.million(millions(BRICKS.mud, o.lang)), W.labels.million(millions(BRICKS.baked, o.lang))))
    if (step === 5) out.push(L.walls(BRICKS.walls[0], BRICKS.walls[1]))
    return out
  }

  /** the plate's box inside the viewport, in the viewport's pixels */
  function box(): { x: number; y: number; w: number; h: number } {
    const r = host!.element.getBoundingClientRect()
    return { x: 0, y: 0, w: r.width, h: r.height }
  }

  function draw(force = false): void {
    if (!host || !plate) return
    const b = box()
    const key = `${Math.round(b.w)}x${Math.round(b.h)}`
    if (!force && t === drawnAt && key === drawnSize) return
    if (key !== drawnSize) {
      plate.resize(b.w, b.h)
      framing = framingOf(b.w, b.h)
      plate.root.dataset['framing'] = framing
      drawnSize = key
    }
    drawnAt = t
    const { w, h } = plate.size()
    const sc = measureScene(t, framing, w, h)
    scene = sc
    const doc = host.element.ownerDocument
    const g = plate.layer('drawing')
    g.replaceChildren()
    if (dir === 'rtl') g.setAttribute('transform', `matrix(-1 0 0 1 ${w} 0)`)
    else g.removeAttribute('transform')
    for (const p of sc.prims) {
      let node: SVGElement
      if (p.type === 'rect') node = p.mark === 'pencil' ? svg(doc, 'rect', { x: p.x, y: p.y, width: p.w, height: p.h }, 'paper-pencil') : markRect(doc, p.mark, plate.ids, p, p.cls)
      else if (p.type === 'line') node = markLine(doc, p.mark === 'pencil' ? 'measure' : p.mark, plate.ids, { x: p.ax, y: p.ay }, { x: p.bx, y: p.by }, p.cls)
      else if (p.mark === 'pencil') node = p.width ? svg(doc, 'path', { d: p.d, 'stroke-width': p.width }, 'paper-pencil-line') : svg(doc, 'path', { d: p.d }, 'paper-pencil')
      else node = markPath(doc, p.mark, plate.ids, p.d, p.cls)
      node.dataset['id'] = p.id
      if (p.alpha !== undefined && p.alpha < 1) node.setAttribute('opacity', p.alpha.toFixed(3))
      g.append(node)
    }
    // THE LABELS of a settled step, placed by the rule; between steps there are none
    const mirror = dir === 'rtl'
    const mx = (x: number): number => (mirror ? w - x : x)
    const asks = sc.anchors.map((a: Anchor) => ({
      id: a.id, x: mx(a.x), y: a.y, sides: a.sides, gap: a.gap, over: a.over,
      node: a.kind === 'pair' ? pair(a.id) : plate!.label(a.id, label(a.id), a.kind),
    }))
    const live = new Set(sc.anchors.map(a => a.id as string))
    for (const node of Array.from(plate.labels.children) as HTMLElement[]) if (!live.has(node.dataset['label'] ?? '')) node.hidden = true
    const taken = mirror ? sc.taken.map(b => ({ ...b, l: w - b.r, r: w - b.l })) : sc.taken
    const walls = mirror ? sc.walls.map(s => ({ ax: w - s.ax, ay: s.ay, bx: w - s.bx, by: s.by })) : sc.walls
    const res = placeElements(plate.labels, asks, { taken, walls, bounds: sc.bounds, mirror, clear: 3 })
    placed = res.placed
    asked = res.asks
    // THE LINE AND THE LIST follow the step the slider stands nearest
    const step = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(t)))
    if (Math.abs(t - step) < 1e-3 && step !== lineStep) {
      lineStep = step
      host.caption.textContent = W.band[STEP_IDS[step]!]
      host.caption.lang = o.lang
      plate.list.replaceChildren(...listFor(step, sc).map(text => { const li = doc.createElement('li'); li.textContent = text; return li }))
      host.step?.(step, STEP_IDS.length)
    }
  }

  function setPhase(next: Phase): void {
    phase = next
    clock = 0
    if (root) root.dataset['phase'] = next
  }

  function frameAlpha(): void {
    if (!ink || !ground || !plate) return
    const ease = (x: number): number => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u) }
    let inkA = 1, paperA = 1
    if (phase === 'ink') { inkA = ease(clock / INK_S); paperA = 0 }
    else if (phase === 'paper') paperA = ease(clock / PAPER_S)
    else if (phase === 'leaving') {
      paperA = 1 - ease(clock / BACK_PAPER_S)
      inkA = 1 - ease((clock - BACK_PAPER_S) / BACK_INK_S)
    } else if (phase === 'gone') { inkA = 0; paperA = 0 }
    if (!o.ink) inkA = Math.min(inkA, paperA)
    ink.style.opacity = inkA.toFixed(3)
    ground.style.opacity = paperA.toFixed(3)
    plate.root.style.opacity = paperA.toFixed(3)
  }

  function advance(dt: number): void {
    clock += dt
    if (phase === 'ink' && (o.reducedMotion || clock >= INK_S)) setPhase('paper')
    if (phase === 'paper' && (o.reducedMotion || clock >= PAPER_S)) setPhase('open')
    if (phase === 'leaving' && (o.reducedMotion || clock >= BACK_PAPER_S + BACK_INK_S)) { setPhase('gone'); leaving?.(); leaving = null }
    frameAlpha()
  }

  return {
    kind: 'paper',
    fill: true,
    mount(next) {
      host = next
      listening = new AbortController()
      const doc = next.element.ownerDocument
      root = doc.createElement('div')
      root.className = 'measure-look'
      root.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)
      const style = doc.createElement('style')
      style.textContent = css
      ink = doc.createElement('img')
      ink.className = 'measure-ink'
      ink.alt = ''
      ink.decoding = 'async'
      ground = doc.createElement('div')
      ground.className = 'measure-ground'
      root.append(style, ink, ground)
      next.element.append(root)
      plate = createPaperPlate(doc, { lang: o.lang, dir, name: W.ui.title })
      plate.root.classList.add('measure-plate')
      next.element.append(plate.root)
      next.aside.append(plate.list)
      steps = createPaperSteps({
        doc, dir, reducedMotion: next.reducedMotion || o.reducedMotion,
        steps: STEP_IDS.map(id => ({ id, name: W.steps[id] })),
        words: { play: W.ui.play, pause: W.ui.pause, track: W.ui.track, between: W.ui.between },
        onMove: (at) => { t = at; draw() },
      })
      next.controls.append(steps.element)
      next.describe(W.ui.title)
      // the room holds its frame: the ink still and the paper stand over it
      next.surface('hold')
      t = 0; lineStep = -1; drawnSize = ''
      layoutInk()
      setPhase(next.reducedMotion || o.reducedMotion ? 'open' : 'ink')
      frameAlpha()
      draw(true)
    },
    update(dt) {
      if (!host) return
      advance(dt)
      steps?.update(dt)
      draw()
    },
    layout() {
      if (!host) return
      layoutInk()
      draw(true)
    },
    key(event) {
      if (!steps || phase !== 'open') return false
      if (steps.element.contains(event.target as Node)) return false
      return steps.key(event)
    },
    unmount() {
      listening.abort()
      steps?.dispose(); plate?.dispose(); root?.remove()
      if (host) { host.caption.textContent = '' }
      steps = undefined; plate = undefined; root = undefined; ink = undefined; ground = undefined; host = undefined
      leaving?.(); leaving = null
    },
    aspect: () => null,
    leave() {
      if (!host || phase === 'gone') return Promise.resolve()
      steps?.go(Math.round(steps.at()), 'cut')
      setPhase('leaving')
      if (o.reducedMotion || host.reducedMotion) { setPhase('gone'); frameAlpha(); return Promise.resolve() }
      return new Promise<void>(resolve => { leaving = resolve })
    },
    go(step, how = 'cut') { steps?.go(step, how) },
    open: () => phase === 'open',
    readout(): MeasureReadout {
      const size = plate?.size() ?? { w: 0, h: 0 }
      const labels = placed.map(p => ({ id: p.id, text: label(p.id as LabelKey), box: p.box, side: p.side }))
      return {
        phase, t, step: Math.round(t), framing, size, scale: scene?.s ?? 0, figures: scene?.figures ?? 0, stages: scene?.stages ?? 0,
        units: scene?.units ?? { mud: 0, baked: 0 }, marks: scene?.marks ?? 0, labels,
        overlaps: scene ? overlaps(placed, dir === 'rtl' ? scene.taken.map(b => ({ ...b, l: size.w - b.r, r: size.w - b.l })) : scene.taken,
          dir === 'rtl' ? scene.walls.map(s => ({ ax: size.w - s.ax, ay: s.ay, bx: size.w - s.bx, by: s.by })) : scene.walls, asked) : [],
        line: host?.caption.textContent ?? '',
        list: Array.from(plate?.list.children ?? []).map(li => li.textContent ?? ''),
      }
    },
  }

  /** the ink still covers the stage exactly as the held frame does */
  function layoutInk(): void {
    if (!ink || !host) return
    const view = host.element.ownerDocument.defaultView!
    const wanted: PaperFraming = framingOf(view.innerWidth, view.innerHeight)
    const src = o.ink ? o.ink[wanted] : ''
    if (src && ink.getAttribute('src') !== src) ink.src = src
    ink.hidden = !src
  }
}
