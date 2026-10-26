/** A CLOSER LOOK AT A PLACE: the deep plate with more than one state of the
 * same place, in one pixel frame.
 *
 * The choice of state keeps the spot and the depth, so the eye compares one
 * knot drawn and photographed at the same size. One line says, per state and
 * per depth, what is found and what is ours, and it stands in the host's own
 * words (the desk's band, the phone's rest line), never on the glass. A
 * locator shows where the view stands on the whole once the view has gone in.
 *
 * Nothing here knows a wing: every word, source and place is the caller's.
 */
import css from './closer.css?inline'
import { createDeepPlatePayload, type DeepPlateDepth, type DeepPlateDetail, type DeepPlatePayload, type DeepPlateSource, type DeepPlateTier, type DeepPlateWords } from './deep-plate'
import type { VitrinePayload, VitrinePayloadHost } from './types'

export interface CloserPayloadState {
  id: string
  source: DeepPlateSource
  /** the state's name where both stand side by side */
  word: string
  /** the toggle's word while the other state stands: it names this one */
  turn: string
  /** in the clock's place of the name row */
  date: string
  /** one of the museum's four marks */
  certainty: 'documented' | 'reconstructed' | 'conjectural' | 'unknown'
  lines: Record<DeepPlateDepth, string>
  /** the coarsest picture of the whole, for the locator; null draws none */
  thumb: string | null
  /** the deepest the view goes, in screen pixels per pixel of the source; absent, its own pixels */
  deepest?: number
}

export interface CloserPayload extends VitrinePayload {
  readonly kind: 'deep-plate'
  /** the state standing now */
  state(): string
  /** stand another state, at the same spot and depth */
  choose(id: string): void
  /** frame a place, turned where its words run sideways; the card folds */
  go(place: DeepPlateDetail & { turn?: number }): void
  aspect(): number | null
}

/** the tiles a closer look holds: the worst view of every depth plus a third */
const CAPS = { phone: 80, canvas: 160, webgl: 200 } as const
/** frames a folding card or drawer takes to hand the glass back to the viewer */
const FOLD_FRAMES = 6

export function createCloserPayload(options: {
  title: string
  description: string
  states: readonly CloserPayloadState[]
  /** the plate's own words: Whole, Nearer, Further; its ceiling is the state's line */
  words: Omit<DeepPlateWords, 'ceiling' | 'rule'>
  /** said, never drawn, while the toggle stands: `Now showing: {0}` */
  showing: string
  /** the locator's name for a screen reader */
  locator: string
  tier(): DeepPlateTier
  standing?(): boolean
  narrow: boolean
  /** another state stands: the caller's card says its own sentence */
  onState?(state: CloserPayloadState): void
}): CloserPayload {
  // the state chosen, and the state whose picture stands: the words follow the picture
  let at = 0, seen = 0
  /** the glass at the foot the raised card covers, while the plate stands whole above it */
  let lifted = 0
  let host: VitrinePayloadHost | undefined
  let depth: DeepPlateDepth = 'whole'
  let row: HTMLDivElement | undefined, zoomRow: HTMLDivElement | undefined
  let segments: HTMLButtonElement[] = []
  let turn: HTMLButtonElement | undefined, said: HTMLSpanElement | undefined
  let turnWords: HTMLSpanElement[] = []
  let locator: HTMLDivElement | undefined, locatorView: HTMLDivElement | undefined
  let style: HTMLStyleElement | undefined
  const standing = (): CloserPayloadState => options.states[at]!
  const shown = (): CloserPayloadState => options.states[seen]!

  const plate: DeepPlatePayload = createDeepPlatePayload({
    title: options.title,
    description: options.description,
    source: standing().source,
    window: null,
    words: { ...options.words, ceiling: '', rule: [] },
    from: () => null,
    tier: options.tier,
    pxPerCm: null,
    ...(options.standing ? { standing: options.standing } : {}),
    minPixelRatio: 1,
    caps: CAPS,
    state: standing().id,
    ...(standing().deepest ? { deepest: standing().deepest } : {}),
    depth: band => { depth = band; speak() },
    onView: () => paintLocator(),
  })

  /** the name row, the line and the mark follow the state and the depth */
  function speak(): void {
    const now = shown()
    host?.rename?.(options.title, now.lines[depth], now.certainty, { at: 1, of: 1, clock: now.date }, null, null)
    if (said) said.textContent = options.showing.replace('{0}', now.word)
  }

  /** the desk's pressed segment follows the press; the phone's one toggle
   * names the other state of the picture that stands, so it changes with it */
  function paintChoice(): void {
    for (const [index, segment] of segments.entries()) segment.setAttribute('aria-pressed', String(index === at))
    const marked = row ?? turn
    if (marked) {
      marked.dataset['state'] = standing().id
      marked.dataset['shown'] = shown().id
      // a state asked for and still coming: said to a screen reader, never drawn
      marked.setAttribute('aria-busy', String(at !== seen))
    }
    if (!turn) return
    const other = seen === 0 ? 1 : 0
    turn.hidden = !options.states[other]
    for (const [index, words] of turnWords.entries()) words.setAttribute('aria-hidden', String(index !== other))
  }

  /** THE LOCATOR shows where the view stands on the whole, once it has gone
   * in; at Home it keeps its place empty, so nothing beside it moves. */
  function paintLocator(): void {
    if (!locator || !locatorView) return
    const view = plate.view()
    const home = plate.home()
    locator.dataset['home'] = String(home || !view)
    locator.dataset['placed'] = String(plate.placed())
    if (!view || home) return
    let { x, y, w, h } = view
    // a view turned a quarter shows the source's width down the glass
    if (Math.round(view.turn / 90) % 2 !== 0) {
      const cx = x + w / 2, cy = y + h / 2, across = w * width() / height()
      w = h * height() / width(); h = across
      x = cx - w / 2; y = cy - h / 2
    }
    const clamp = (value: number): number => Math.max(0, Math.min(1, value))
    const left = clamp(x), top = clamp(y), right = clamp(x + w), bottom = clamp(y + h)
    Object.assign(locatorView.style, { left: `${left * 100}%`, top: `${top * 100}%`,
      width: `${Math.max(0, right - left) * 100}%`, height: `${Math.max(0, bottom - top) * 100}%` })
  }
  const width = (): number => shown().source.width
  const height = (): number => shown().source.height

  /** A PRESS WHILE A STATE IS STILL COMING IS NOT TAKEN: one swap at a time,
   * so the picture and its words never part */
  function choose(id: string): void {
    const to = options.states.findIndex(state => state.id === id)
    if (to < 0 || to === at || at !== seen) return
    at = to
    const now = standing()
    paintChoice()
    plate.swap({ source: now.source, title: options.title, description: options.description, ...(now.deepest ? { deepest: now.deepest } : {}) }, now.id, () => {
      if (standing() !== now) return
      seen = to
      if (locator) locator.style.backgroundImage = now.thumb ? `url("${now.thumb}")` : ''
      paintChoice()
      speak()
      options.onState?.(now)
    })
  }

  /** THE CARD RAISED OVER HOME ON THE PHONE: the plate stands whole in the
   * glass the card leaves, as a work steps aside when its words open
   * sideways, and folded it stands at Home in the whole glass again. A view
   * the visitor made stays under the card. */
  function lift(): void {
    if (!host?.narrow || host.cinema?.()) return
    const raised = host.peeked?.() === false
    const card = host.element.closest('.vitrine')?.querySelector<HTMLElement>(':scope > .vitrine-card')
    const glass = host.element.getBoundingClientRect()
    const covered = raised && card ? Math.max(0, Math.round(glass.bottom - card.getBoundingClientRect().top)) : 0
    const wanted = covered > 0 && (lifted > 0 || (plate.drawn() && plate.home())) ? covered : 0
    if (wanted === lifted) return
    lifted = wanted
    plate.lift(wanted)
  }

  function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const node = host!.element.ownerDocument.createElement(tag)
    node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }

  const payload: CloserPayload = {
    kind: 'deep-plate',
    ...(options.narrow ? { fill: true } : {}),
    state: () => standing().id,
    choose,
    go(place) {
      // THE CARD FOLDS FIRST and the place is framed in the glass it leaves:
      // a desk's drawer gives the stage back over a few frames
      host?.raise?.(false)
      lift()
      let frames = FOLD_FRAMES
      const step = (): void => { if (--frames > 0) requestAnimationFrame(step); else if (host) plate.go(place, place.turn ?? 0) }
      requestAnimationFrame(step)
    },
    aspect: () => plate.aspect?.() ?? null,
    mount(next) {
      host = next
      depth = 'whole'
      seen = at
      lifted = 0
      style = make('style', '')
      style.textContent = css
      if (next.narrow) {
        // the window's own row, as a painting's: its steps and the toggle are lent from there and leave it empty
        plate.mount(next)
      } else {
        zoomRow = make('div', 'closer-zoom')
        row = make('div', 'closer-states')
        // the plate builds its three steps into the zoom's own row
        plate.mount({ ...next, controls: zoomRow })
      }
      locator = make('div', 'closer-locator')
      locator.setAttribute('role', 'img')
      locator.setAttribute('aria-label', options.locator)
      locator.dataset['home'] = 'true'
      const thumb = standing().thumb
      if (thumb) locator.style.backgroundImage = `url("${thumb}")`
      locatorView = make('div', 'closer-locator-view')
      locator.append(locatorView)
      // a press on the whole moves the view there, on the desk; the phone's is a picture only
      if (!next.narrow) {
        locator.addEventListener('click', event => {
          const box = locator!.getBoundingClientRect()
          if (box.width > 0) plate.centre((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
        })
      }
      segments = []
      if (next.narrow) {
        // ONE TOGGLE NAMES THE OTHER STATE, lent to the foot row as a page's other way is
        turn = make('button', 'vitrine-control reader-turn closer-turn')
        turn.type = 'button'
        turn.dataset['tool'] = 'turn'
        // every state's word in one cell, so the toggle keeps the shape of the longest
        const cell = make('span', 'closer-turn-words')
        turnWords = options.states.map(state => make('span', '', state.turn))
        cell.append(...turnWords)
        turn.append(cell)
        said = make('span', 'reader-turn-said')
        said.id = `${next.element.id || 'vitrine'}-closer-said`
        said.setAttribute('role', 'status')
        turn.setAttribute('aria-describedby', said.id)
        turn.addEventListener('click', () => choose(options.states[at === 0 ? 1 : 0]?.id ?? ''))
        next.controls.append(turn)
        // on the glass, at its top left: the close stands at the top right
        next.element.append(style, locator, said)
      } else {
        row = row!
        row.append(locator)
        for (const state of options.states) {
          const segment = make('button', 'vitrine-control closer-state', state.word)
          segment.type = 'button'
          segment.addEventListener('click', () => choose(state.id))
          segments.push(segment)
          row.append(segment)
        }
        next.element.append(style)
        next.controls.append(zoomRow!, row)
      }
      paintChoice()
      speak()
    },
    update(dt) { plate.update?.(dt) },
    layout() { plate.layout?.(); lift(); paintLocator() },
    key(event) { return plate.key?.(event) ?? false },
    unmount() {
      plate.unmount()
      for (const node of [row, zoomRow, turn, locator, said, style]) node?.remove()
      row = undefined; zoomRow = undefined; locator = undefined; locatorView = undefined
      turn = undefined; said = undefined; style = undefined; segments = []; turnWords = []
      host = undefined
      lifted = 0
    },
  }
  return payload
}
