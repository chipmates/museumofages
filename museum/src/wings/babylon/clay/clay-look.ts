/* FEATURE 6, WRITE IN CLAY, as a close look's payload: it opens from stop 7's held frame onto the fresh tablet on the
   vitrine's turntable (the press), then crosses to paper for the name in letters folded into signs, a student's steps
   and who could read. One slider walks the five named steps; the press has its own three controls and Space while
   the tablet stands. Nothing presses, plays or closes by itself and nothing makes a sound. Every word comes from
   `clay-words.ts`; the drawing from `clay-paper.ts`. */

import css from './clay-look.css?inline'
import { PerspectiveCamera, Scene } from 'three/webgpu'
import type { Stack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { createTurntablePayload, type TurntablePayload } from '../../vitrine/turntable'
import { STAGE } from '../../vitrine/stage-close-view'
import type { VitrinePayload, VitrinePayloadHost } from '../../vitrine/types'
import {
  createPaperPlate, createPaperSteps, framingOf, grainTile, markLine, markPath, markRect, overlaps, paperStyle, placeElements, svg,
  type PaperFraming, type PaperPlate, type PaperSteps, type Placed, type LabelAsk,
} from '../paper/index'
import { clayBody } from './clay-body'
import { backFrom, pressFrom, type ClaySignFile } from './clay-data'
import { clayPaperScene, type Anchor, type ClayPaperScene, type Say } from './clay-paper'
import { CLAY_WORDS, PRESS_KEYS, STEP_IDS, pressKey, type ClayLang } from './clay-words'
import { CLAY_VIEW } from './clay-view'

export interface ClayLookOptions {
  lang: ClayLang
  stack: Stack
  signs: ClaySignFile
  /** the Met's school tablet, by address (the asset store's record names its file); null draws its frame alone */
  photo: string | null
  reducedMotion: boolean
}

/** THE STEPS' CLASS, as the band's mark says it: the press ours on known signs, the letters and signs known, the
 *  student's steps a type, who could read a scholar's reading */
export const STEP_CLASS = ['reconstructed', 'documented', 'documented', 'conjectural', 'reconstructed'] as const

export interface ClayLookReadout {
  phase: 'opening' | 'open' | 'leaving' | 'gone'
  t: number
  step: number
  framing: PaperFraming
  size: { w: number; h: number }
  paper: number
  press: { clock: number; total: number; lit: number[]; named: string[]; controls: boolean }
  counts: { letters: number; cells: number; signs: number; tablets: number }
  pxPerCm: number
  k: number
  labels: { id: string; text: string; box: { l: number; t: number; r: number; b: number } | null; side: string | null }[]
  overlaps: string[]
  line: string
  list: string[]
  seats: ReturnType<PaperSteps['seats']>
}

export interface ClayLookPayload extends VitrinePayload {
  readonly press: TurntablePayload
  /** the press from where the run stands; back one; play to the whole name (or pause) */
  pressOnce(): void
  back(): void
  play(): void
  go(step: number, how?: 'cut' | 'travel'): void
  at(): number
  names(): readonly string[]
  relayStepNames(): void
  /** true while a press or the whole name's run is under way */
  pressing(): boolean
  /** true once the tablet stands on the turntable: the room's frame may leave */
  standing(): boolean
  leave(): Promise<void>
  /** who draws the stage: the turntable while the press shows, nothing once the paper covers it */
  drawing(): 'own' | 'hold'
  readout(): ClayLookReadout
}

const ease = (x: number): number => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u) }

export function createClayLook(o: ClayLookOptions): ClayLookPayload {
  const W = CLAY_WORDS[o.lang]
  const clay = clayBody(o.signs)
  let host: VitrinePayloadHost | undefined
  let root: HTMLDivElement | undefined, ground: HTMLDivElement | undefined, glass: HTMLDivElement | undefined
  let plate: PaperPlate | undefined, steps: PaperSteps | undefined
  let row: HTMLDivElement | undefined, pressButton: HTMLButtonElement | undefined, playButton: HTMLButtonElement | undefined
  let photo: SVGImageElement | undefined, clipRect: SVGRectElement | undefined
  let phase: ClayLookReadout['phase'] = 'opening'
  let t = 0, drawnAt = NaN, drawnSize = '', framing: PaperFraming = 'wide'
  let scene: ClayPaperScene | undefined, placed: Placed[] = [], asked: LabelAsk[] = []
  let lineKey = '', settled = -1, surface: 'own' | 'hold' = 'own'
  let stop: { at: number; land: number } | null = null, before = 0
  const named = new Map<string, string>()
  const idle = new Scene()

  // the turntable writes into its own quiet parts: the look's band carries the line, the press row its controls
  const doc0 = document
  const quiet = (tag: 'div' | 'p'): HTMLElement => { const n = doc0.createElement(tag); n.className = 'clay-quiet'; return n }
  const sub = { controls: quiet('div'), aside: quiet('div'), caption: quiet('p') }
  const press = createTurntablePayload({
    stack: o.stack, body: clay.body, title: W.ui.title,
    schedule: { kind: 'loop', period: clay.period },
    steps: clay.steps(PRESS_KEYS.map(k => W.band[k])),
    parents: new Map(),
    viewpoints: [{ id: 'whole', label: 'whole', part: null }],
    runViews: [{ from: -1, to: -0.5, view: 'whole', yaw: CLAY_VIEW.yaw, pitch: CLAY_VIEW.pitch }],
    partNames: named,
    words: { play: W.ui.play, pause: W.ui.pause, again: W.ui.again, clock: W.ui.wedges(0, clay.total) },
    light: { key: { azimuth: STAGE.key.turn, elevation: STAGE.key.height, kelvin: STAGE.key.kelvin, lux: STAGE.key.lux }, fill: { color: STAGE.fill.sky, groundColor: STAGE.fill.ground, intensity: STAGE.fill.intensity }, environmentIntensity: STAGE.fill.environment, fitting: { color: '#ffffff', intensity: 0, distance: 0, decay: 2, height: 0 } },
    grade: IDENTITY,
    restore: () => o.stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true),
  })

  const say = (s: Say): string => s.what === 'letter' ? W.name[s.i] ?? '' : s.what === 'reading' ? W.readings[s.i] ?? ''
    : s.what === 'step' ? W.labels.steps[s.step] : s.what === 'ruler' ? W.labels.ruler : s.what === 'later' ? W.labels.later : W.labels.credit

  function pressOnce(): void {
    if (Math.round(t) !== 0 || t > 0.02) return
    const p = pressFrom(clay.clock(), clay.total)
    if (!p) return
    stop = { at: p.stop, land: p.land }
    press.film.pose(p.from, { playing: true, lit: true })
  }
  function back(): void {
    if (t > 0.02) return
    stop = null
    press.film.pose(backFrom(clay.clock(), clay.total), { playing: false, lit: true })
  }
  function play(): void {
    if (t > 0.02) return
    if (stop?.land === clay.total) { stop = null; press.film.pose(clay.clock(), { playing: false, lit: true }); return }
    const p = pressFrom(clay.clock(), clay.total)
    if (!p) return
    stop = { at: clay.total, land: clay.total }
    press.film.pose(p.from, { playing: true, lit: true })
  }

  /** the press's own run: a played run stops on its wedge, the name's end holds; the band's line follows the signs */
  function pressWords(): void {
    if (!host) return
    const c = clay.clock()
    if (stop && c >= stop.at - 1e-6) { const land = stop.land; stop = null; press.film.pose(land, { playing: false, lit: true }) }
    else if (before < clay.total && c > clay.total + 0.02) press.film.pose(clay.clock() > clay.total ? clay.total : clay.clock(), { playing: false, lit: true })
    before = clay.clock()
    const signs = clay.finishedSigns()
    named.clear()
    for (const s of signs) named.set(clay.signParts[s]!, W.readings[s]!)
    if (pressButton) pressButton.disabled = !pressFrom(c, clay.total)
    if (playButton) { const on = stop?.land === clay.total; playButton.textContent = on ? W.ui.pause : W.ui.all; playButton.setAttribute('aria-label', on ? W.ui.pause : W.ui.said.all) }
    if (settled === 0) {
      const key = pressKey(signs.length)
      if (key !== lineKey) { host.caption.textContent = W.band[key]; host.caption.lang = o.lang; lineKey = key }
    }
  }

  function draw(force = false): void {
    if (!host || !plate || !ground || !root) return
    const r = host.element.getBoundingClientRect()
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`
    if (!force && t === drawnAt && key === drawnSize) return
    if (key !== drawnSize) {
      plate.resize(r.width, r.height)
      framing = framingOf(r.width, r.height)
      plate.root.dataset['framing'] = framing
      drawnSize = key
    }
    drawnAt = t
    const paperA = ease(t)
    ground.style.opacity = paperA.toFixed(3)
    plate.root.style.opacity = paperA.toFixed(3)
    plate.root.hidden = paperA < 0.001
    if (row) row.hidden = t > 0.02
    root.dataset['paper'] = String(t >= 0.5)
    const { w, h } = plate.size()
    const sc = clayPaperScene(Math.max(1, t), framing, w, h, o.signs, W.name.length)
    scene = sc
    const doc = host.element.ownerDocument
    const g = plate.layer('drawing')
    g.replaceChildren()
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
    // THE PHOTO at the strip's scale, cropped to the tablet and a little of its ground
    if (photo && clipRect) {
      const ph = sc.photo
      photo.toggleAttribute('hidden', !ph || !o.photo)
      if (ph) {
        for (const [k, v] of [['x', ph.x], ['y', ph.y], ['width', ph.w], ['height', ph.h]] as const) photo.setAttribute(k, v.toFixed(2))
        for (const [k, v] of [['x', ph.clip.l], ['y', ph.clip.t], ['width', ph.clip.r - ph.clip.l], ['height', ph.clip.b - ph.clip.t]] as const) clipRect.setAttribute(k, v.toFixed(2))
        photo.setAttribute('opacity', ph.alpha.toFixed(3))
      }
    }
    // THE LABELS of a settled step, placed by the rule
    const asks = sc.anchors.map((a: Anchor) => ({ id: a.id, x: a.x, y: a.y, sides: a.sides, gap: a.gap, reach: a.reach, over: a.over, node: plate!.label(a.id, say(a.say), a.kind) }))
    const live = new Set(sc.anchors.map(a => a.id))
    for (const node of Array.from(plate.labels.children) as HTMLElement[]) if (!live.has(node.dataset['label'] ?? '')) node.hidden = true
    const res = placeElements(plate.labels, asks, { taken: sc.taken, walls: sc.walls, bounds: sc.bounds, clear: 3 })
    placed = res.placed
    asked = res.asks
    // THE LINE AND THE LIST follow the step the slider settled on
    const step = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(t)))
    if (Math.abs(t - step) < 1e-3 && step !== settled) {
      settled = step
      const id = STEP_IDS[step]!
      lineKey = ''
      if (id !== 'press') {
        host.caption.textContent = W.band[id]
        host.caption.lang = o.lang
        plate.list.replaceChildren(...W.list[id].map(text => { const li = doc.createElement('li'); li.textContent = text; return li }))
      } else plate.list.replaceChildren()
      host.step?.(step, STEP_IDS.length)
      host.rename?.(W.ui.title, undefined, STEP_CLASS[step])
    }
  }

  function setSurface(next: 'own' | 'hold'): void {
    if (surface === next || !host) return
    surface = next
    host.surface(next)
  }

  function control(text: string, said: string, act: () => void, cls: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'; b.className = `clay-control ${cls}`; b.textContent = text; b.setAttribute('aria-label', said)
    b.addEventListener('click', act)
    row!.append(b)
    return b
  }

  let leaving: (() => void) | null = null
  return {
    kind: 'clay',
    fill: true,
    raiseWords: { up: W.ui.raise, down: W.ui.lower },
    press,
    mount(next) {
      host = next
      const doc = next.element.ownerDocument
      root = doc.createElement('div')
      root.className = 'clay-look'
      root.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)
      const style = doc.createElement('style')
      style.textContent = css
      glass = doc.createElement('div')
      glass.className = 'clay-glass'
      ground = doc.createElement('div')
      ground.className = 'clay-ground'
      root.append(style, glass, ground)
      next.element.append(root)
      plate = createPaperPlate(doc, { lang: o.lang, name: W.ui.title })
      plate.root.classList.add('clay-plate')
      // the photo's own layer under the drawing's: its frame is drawn over it
      const shot = plate.layer('photo')
      const clip = svg(doc, 'clipPath', { id: `${plate.ids.hatch}-photo` })
      clipRect = svg(doc, 'rect', {})
      clip.append(clipRect)
      photo = svg(doc, 'image', { preserveAspectRatio: 'none', 'clip-path': `url(#${plate.ids.hatch}-photo)` }, 'clay-photo')
      if (o.photo) photo.setAttribute('href', o.photo)
      shot.append(clip, photo)
      plate.layer('drawing')
      next.element.append(plate.root)
      next.aside.append(plate.list)
      // THE PRESS'S OWN ROW: press, back, play, each 44 px, over the steps
      row = doc.createElement('div')
      row.className = 'clay-press-row'
      pressButton = control(W.ui.press, W.ui.said.press, pressOnce, 'clay-press')
      control(W.ui.back, W.ui.said.back, back, 'clay-back')
      playButton = control(W.ui.all, W.ui.said.all, play, 'clay-play')
      next.controls.append(row)
      steps = createPaperSteps({
        doc, reducedMotion: next.reducedMotion || o.reducedMotion,
        steps: STEP_IDS.map(id => ({ id, name: W.steps[id] })),
        words: { play: W.ui.play, pause: W.ui.pause, track: W.ui.track, between: W.ui.between },
        onMove: (at) => {
          // a run under way stops where it stands before the tablet leaves
          if (at > 0 && t === 0 && stop) { stop = null; press.film.pose(clay.clock(), { playing: false, lit: true }) }
          t = at; draw()
        },
      })
      next.controls.append(steps.element)
      next.describe(W.ui.title)
      press.mount({
        ...next, element: glass, controls: sub.controls, aside: sub.aside, caption: sub.caption,
        describe: () => {}, step: undefined, rename: undefined, raise: undefined,
        surface: (kind) => { if (kind === 'own') { surface = 'own'; next.surface('own') } },
        viewport: () => next.viewport(),
      })
      t = 0; settled = -1; lineKey = ''; drawnSize = ''
      phase = 'opening'
      draw(true)
    },
    update(dt) {
      if (!host) return
      steps?.update(dt)
      if (t < 1) {
        press.update?.(dt)
        if (phase === 'opening' && press.film.measure()) {
          // nothing presses by itself: the run waits on fresh clay until a hand presses
          press.film.pose(0, { playing: false, lit: true })
          phase = 'open'
        }
        pressWords()
      }
      setSurface(t >= 1 - 1e-3 ? 'hold' : 'own')
      draw()
    },
    layout() {
      if (!host) return
      press.layout?.()
      draw(true)
    },
    key(event) {
      if (!steps || phase !== 'open') return false
      if (event.key === ' ' && t <= 0.02 && !(event.target as Element | null)?.closest?.('button, input')) { pressOnce(); return true }
      if (steps.element.contains(event.target as Node)) return false
      return steps.key(event)
    },
    unmount() {
      press.unmount()
      steps?.dispose(); plate?.dispose(); root?.remove(); row?.remove()
      if (host) host.caption.textContent = ''
      steps = undefined; plate = undefined; root = undefined; ground = undefined; glass = undefined; host = undefined
      leaving?.(); leaving = null
      phase = 'gone'
    },
    aspect: () => null,
    pressOnce, back, play,
    go(step, how = 'cut') { steps?.go(step, how) },
    at: () => steps?.at() ?? 0,
    names: () => STEP_IDS.map(id => W.steps[id]),
    relayStepNames: () => steps?.layout(),
    standing: () => phase === 'open',
    pressing: () => stop !== null,
    drawing: () => surface,
    leave() {
      if (!host || phase === 'gone') return Promise.resolve()
      stop = null
      phase = 'leaving'
      return Promise.resolve()
    },
    readout(): ClayLookReadout {
      const size = plate?.size() ?? { w: 0, h: 0 }
      return {
        phase, t, step: Math.round(t), framing, size, paper: ease(t),
        press: { clock: clay.clock(), total: clay.total, lit: clay.finishedSigns(), named: [...named.values()], controls: !(row?.hidden ?? true) },
        counts: { letters: scene?.letters ?? 0, cells: scene?.cells ?? 0, signs: scene?.signs ?? 0, tablets: scene?.tablets ?? 0 },
        pxPerCm: scene?.pxPerCm ?? 0, k: scene?.k ?? 0,
        labels: placed.map(p => ({ id: p.id, text: plate?.labels.querySelector<HTMLElement>(`[data-label="${p.id}"]`)?.textContent ?? '', box: p.box, side: p.side })),
        overlaps: scene ? overlaps(placed, scene.taken, scene.walls, asked) : [],
        line: host?.caption.textContent ?? '',
        list: Array.from(plate?.list.children ?? []).map(li => li.textContent ?? ''),
        seats: steps?.seats() ?? [],
      }
    },
  }
}
