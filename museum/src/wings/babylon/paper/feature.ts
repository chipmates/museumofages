/* A PAPER FEATURE AS A CLOSE LOOK'S PAYLOAD, for a stop without an ink still:
   it opens over the stop's held frame by a plain crossfade (a cut under
   reduced motion), lays the paper with the feature's pictures and drawing,
   walks its named steps, one band line a step, and closes the same way back
   onto the held frame. The drawing is the feature's scene (`scene.ts`), the
   labels are placed by the kit's rule, the words are the caller's. Feature 7
   keeps its own payload (`measure/measure.ts`); this is the same contract
   with the scene handed in. */

import css from './feature.css?inline'
import type { VitrinePayload, VitrinePayloadHost } from '../../vitrine/types'
import { createPaperPlate, type PaperPlate } from './plate'
import { framingOf, type PaperFraming } from './framing'
import { createPaperSteps, type PaperSteps } from './steps'
import { grainTile, markLine, markPath, markRect, svg } from './marks'
import { overlaps, placeElements, type LabelAsk, type Placed } from './placer'
import { paperStyle } from './tokens'
import { insetFor, type Anchor, type Inset, type PaperScene } from './scene'

export type Certainty = 'documented' | 'reconstructed' | 'conjectural' | 'unknown'
export interface PaperFeatureStep { id: string; name: string; line: string; certainty: Certainty }
export type PaperImage = string | { wide: string; upright: string }

export interface PaperFeatureOptions {
  kind?: string
  lang: string
  dir?: 'ltr' | 'rtl'
  reducedMotion: boolean
  title: string
  words: { play: string; pause: string; track: string; between(a: string, b: string): string }
  steps: readonly PaperFeatureStep[]
  /** the drawing at a point of the slider, in the plate's pixels */
  scene(t: number, framing: PaperFraming, w: number, h: number, o: { dpr: number; inset: Inset; data: Record<string, unknown> }): PaperScene
  /** a label's words: one line, or a count over its name */
  text(id: string, scene: PaperScene): string | readonly [string, string]
  /** the sentences beside the drawing at a settled step: what a reader without the drawing reads */
  list(step: number, scene: PaperScene): string[]
  /** pictures by key, one per framing where the framing changes the picture */
  images?: Record<string, PaperImage>
  /** data the scene needs that the page fetches (today's coasts): handed to every scene call */
  data?: Record<string, unknown>
  /** extra style for the feature's own marks (no colour value: the kit's tokens only) */
  css?: string
}

export interface PaperFeatureReadout {
  phase: Phase
  t: number
  step: number
  framing: PaperFraming
  size: { w: number; h: number }
  inset: Inset
  labels: { id: string; text: string; box: { l: number; t: number; r: number; b: number } | null; side: string | null }[]
  overlaps: string[]
  line: string
  list: string[]
  facts: Record<string, unknown>
  /** every drawn part's id, kind and mark, and its box where it shows */
  drawn: { id: string; type: string; mark?: string; alpha: number; box: { l: number; t: number; r: number; b: number } | null }[]
  seats: ReturnType<PaperSteps['seats']>
}

export interface PaperFeaturePayload extends VitrinePayload {
  leave(): Promise<void>
  go(step: number, how?: 'cut' | 'travel'): void
  readout(): PaperFeatureReadout
  open(): boolean
  at(): number
  names(): readonly string[]
  /** every step's band line, for the host that fits one type to all of them */
  lines(): readonly string[]
  relayStepNames(): void
}

type Phase = 'paper' | 'open' | 'leaving' | 'gone'
/** the paper coming up over the held frame, and going back */
const IN_S = 0.8, OUT_S = 0.6

export function createPaperFeature(o: PaperFeatureOptions): PaperFeaturePayload {
  const dir = o.dir ?? 'ltr'
  const last = o.steps.length - 1
  let host: VitrinePayloadHost | undefined
  let root: HTMLDivElement | undefined, ground: HTMLDivElement | undefined, pictures: HTMLDivElement | undefined
  let plate: PaperPlate | undefined, steps: PaperSteps | undefined
  let phase: Phase = 'paper', clock = 0, t = 0, drawnAt = NaN, drawnSize = '', framing: PaperFraming = 'wide'
  let scene: PaperScene | undefined, placed: Placed[] = [], asked: LabelAsk[] = [], inset: Inset = insetFor('wide')
  let lineStep = -1
  let leaving: (() => void) | null = null
  const imgs = new Map<string, HTMLImageElement>()

  const textOf = (id: string): string => { const v = o.text(id, scene!); return typeof v === 'string' ? v : `${v[0]} ${v[1]}` }

  function node(a: Anchor): HTMLSpanElement {
    const v = o.text(a.id, scene!)
    // a count over its name is its own element: the same mark may carry its name alone at another step
    if (typeof v !== 'string') return plate!.labelPair(`${a.id}:pair`, v[0], v[1])
    const n = plate!.label(a.id, v, a.kind === 'credit' ? 'quiet' : (a.kind as 'ink'))
    n.classList.toggle('paper-credit', a.kind === 'credit')
    n.style.width = a.kind === 'credit' && a.width ? `${Math.floor(a.width)}px` : ''
    return n
  }

  /** the safe area's top, as the page's own CSS reads it */
  function safeTop(): number {
    const doc = host!.element.ownerDocument
    const probe = doc.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;padding-top:env(safe-area-inset-top, 0px);visibility:hidden'
    doc.body.append(probe)
    const v = parseFloat(getComputedStyle(probe).paddingTop) || 0
    probe.remove()
    return v
  }

  function imageFor(key: string): string {
    const src = o.images?.[key]
    if (!src) return ''
    return typeof src === 'string' ? src : src[framing]
  }

  function draw(force = false): void {
    if (!host || !plate) return
    const r = host.element.getBoundingClientRect()
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`
    if (!force && t === drawnAt && key === drawnSize) return
    if (key !== drawnSize) {
      plate.resize(r.width, r.height)
      framing = framingOf(r.width, r.height)
      plate.root.dataset['framing'] = framing
      inset = insetFor(framing, safeTop())
      drawnSize = key
    }
    drawnAt = t
    const { w, h } = plate.size()
    const doc = host.element.ownerDocument
    const sc = o.scene(t, framing, w, h, { dpr: doc.defaultView?.devicePixelRatio ?? 1, inset, data: o.data ?? {} })
    scene = sc
    const g = plate.layer('drawing')
    g.replaceChildren()
    const seen = new Set<string>()
    for (const p of sc.prims) {
      if (p.type === 'image') {
        let img = imgs.get(p.id)
        if (!img) {
          img = doc.createElement('img'); img.alt = ''; img.decoding = 'async'; img.className = 'paper-picture'
          img.dataset['id'] = p.id
          pictures!.append(img); imgs.set(p.id, img)
        }
        const src = imageFor(p.key)
        if (src && img.getAttribute('src') !== src) img.src = src
        img.hidden = !src
        img.style.left = `${p.x}px`; img.style.top = `${p.y}px`; img.style.width = `${p.w}px`; img.style.height = `${p.h}px`
        img.style.objectFit = p.fit === 'cover' ? 'cover' : 'fill'
        img.style.objectPosition = p.focus ? `${p.focus[0] * 100}% ${p.focus[1] * 100}%` : '50% 50%'
        img.style.opacity = String(p.alpha ?? 1)
        seen.add(p.id)
        continue
      }
      let n: SVGElement
      if (p.type === 'rect') n = p.mark === 'pencil' ? svg(doc, 'rect', { x: p.x, y: p.y, width: p.w, height: p.h }, `paper-pencil ${p.cls ?? ''}`.trim()) : markRect(doc, p.mark, plate.ids, p, p.cls)
      else if (p.type === 'line') n = markLine(doc, p.mark === 'pencil' ? 'measure' : p.mark, plate.ids, { x: p.ax, y: p.ay }, { x: p.bx, y: p.by }, p.cls)
      else if (p.mark === 'pencil') n = p.width ? svg(doc, 'path', { d: p.d, 'stroke-width': p.width }, `paper-pencil-line ${p.cls ?? ''}`.trim()) : svg(doc, 'path', { d: p.d }, `paper-pencil ${p.cls ?? ''}`.trim())
      else n = markPath(doc, p.mark, plate.ids, p.d, p.cls)
      if (p.type === 'line' && p.width) n.setAttribute('stroke-width', String(p.width))
      // an open mark keeps its dash and drops the hatch the mark lays as a style
      if (p.cls?.split(' ').includes('paper-open')) n.style.removeProperty('fill')
      n.dataset['id'] = p.id
      if (p.alpha !== undefined && p.alpha < 1) n.setAttribute('opacity', p.alpha.toFixed(3))
      g.append(n)
    }
    for (const [id, img] of imgs) if (!seen.has(id)) img.hidden = true
    // THE LABELS of a settled step, placed by the rule; between steps there are none
    const asks = sc.anchors.map((a) => ({ id: a.id, x: a.x, y: a.y, sides: a.sides, gap: a.gap, over: a.over, reach: a.reach, node: node(a) }))
    const live = new Set(asks.map((a) => a.node))
    for (const n of Array.from(plate.labels.children) as HTMLElement[]) if (!live.has(n as HTMLSpanElement)) n.hidden = true
    const res = placeElements(plate.labels, asks, { taken: sc.taken, walls: sc.walls, bounds: sc.bounds, clear: 3 })
    placed = res.placed
    asked = res.asks
    // THE LINE AND THE LIST follow the step the slider stands nearest
    const step = Math.max(0, Math.min(last, Math.round(t)))
    if (Math.abs(t - step) < 1e-3 && step !== lineStep) {
      lineStep = step
      host.caption.textContent = o.steps[step]!.line
      host.caption.lang = o.lang
      plate.list.replaceChildren(...o.list(step, sc).map((text) => { const li = doc.createElement('li'); li.textContent = text; return li }))
      host.step?.(step, o.steps.length)
      // the band's mark says the step's class: the plate never says it in words
      host.rename?.(o.title, undefined, o.steps[step]!.certainty)
    }
  }

  function setPhase(next: Phase): void {
    phase = next
    clock = 0
    if (root) root.dataset['phase'] = next
  }

  function alpha(): void {
    if (!ground || !plate || !pictures) return
    const ease = (x: number): number => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u) }
    let a = 1
    if (phase === 'paper') a = ease(clock / IN_S)
    else if (phase === 'leaving') a = 1 - ease(clock / OUT_S)
    else if (phase === 'gone') a = 0
    for (const n of [ground, pictures, plate.root]) n.style.opacity = a.toFixed(3)
  }

  function advance(dt: number): void {
    clock += dt
    if (phase === 'paper' && (o.reducedMotion || clock >= IN_S)) setPhase('open')
    if (phase === 'leaving' && (o.reducedMotion || clock >= OUT_S)) { setPhase('gone'); leaving?.(); leaving = null }
    alpha()
  }

  return {
    kind: o.kind ?? 'paper',
    fill: true,
    mount(next) {
      host = next
      const doc = next.element.ownerDocument
      root = doc.createElement('div')
      root.className = 'paper-look'
      root.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)
      const style = doc.createElement('style')
      style.textContent = `${css}\n${o.css ?? ''}`
      ground = doc.createElement('div')
      ground.className = 'paper-look-ground'
      pictures = doc.createElement('div')
      pictures.className = 'paper-pictures'
      root.append(style, ground)
      next.element.append(root, pictures)
      plate = createPaperPlate(doc, { lang: o.lang, dir, name: o.title })
      plate.root.classList.add('paper-look-plate')
      next.element.append(plate.root)
      next.aside.append(plate.list)
      steps = createPaperSteps({
        doc, dir, reducedMotion: next.reducedMotion || o.reducedMotion,
        steps: o.steps.map((s) => ({ id: s.id, name: s.name })),
        words: o.words,
        onMove: (at) => { t = at; draw() },
      })
      next.controls.append(steps.element)
      next.describe(o.title)
      next.surface('hold')
      t = 0; lineStep = -1; drawnSize = ''
      setPhase(next.reducedMotion || o.reducedMotion ? 'open' : 'paper')
      alpha()
      draw(true)
    },
    update(dt) {
      if (!host) return
      advance(dt)
      steps?.update(dt)
      draw()
    },
    layout() { if (host) draw(true) },
    key(event) {
      if (!steps || phase !== 'open') return false
      if (steps.element.contains(event.target as Node)) return false
      return steps.key(event)
    },
    unmount() {
      steps?.dispose(); plate?.dispose(); root?.remove(); pictures?.remove()
      if (host) host.caption.textContent = ''
      imgs.clear()
      steps = undefined; plate = undefined; root = undefined; ground = undefined; pictures = undefined; host = undefined
      leaving?.(); leaving = null
    },
    aspect: () => null,
    leave() {
      if (!host || phase === 'gone') return Promise.resolve()
      steps?.go(Math.round(steps.at()), 'cut')
      setPhase('leaving')
      if (o.reducedMotion || host.reducedMotion) { setPhase('gone'); alpha(); return Promise.resolve() }
      return new Promise<void>((resolve) => { leaving = resolve })
    },
    go(step, how = 'cut') { steps?.go(step, how) },
    open: () => phase === 'open',
    at: () => steps?.at() ?? 0,
    names: () => o.steps.map((s) => s.name),
    lines: () => o.steps.map((s) => s.line),
    relayStepNames: () => steps?.layout(),
    readout(): PaperFeatureReadout {
      const size = plate?.size() ?? { w: 0, h: 0 }
      const labels = placed.map((p) => ({ id: p.id, text: scene ? textOf(p.id) : '', box: p.box, side: p.side }))
      const drawn = (scene?.prims ?? []).filter((p) => (p.alpha ?? 1) > 0.05).map((p) => ({
        id: p.id, type: p.type, mark: 'mark' in p ? p.mark : undefined, alpha: Math.round((p.alpha ?? 1) * 1000) / 1000,
        box: p.type === 'path' ? null : p.type === 'line' ? { l: Math.min(p.ax, p.bx), t: Math.min(p.ay, p.by), r: Math.max(p.ax, p.bx), b: Math.max(p.ay, p.by) } : { l: p.x, t: p.y, r: p.x + p.w, b: p.y + p.h },
      }))
      return {
        phase, t, step: Math.round(t), framing, size, inset, labels,
        overlaps: scene ? overlaps(placed, scene.taken, scene.walls, asked) : [],
        line: host?.caption.textContent ?? '',
        list: Array.from(plate?.list.children ?? []).map((li) => li.textContent ?? ''),
        facts: scene?.facts ?? {}, drawn,
        seats: steps?.seats() ?? [],
      }
    },
  }
}
