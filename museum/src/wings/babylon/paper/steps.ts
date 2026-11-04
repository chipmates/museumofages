/* NOTCHES AND NAMED STEPS: how a paper feature moves. One track, drawn as the
   vitrine draws its clock (`vitrine/slider.ts`), with a notch at each named
   state and the names under it as presses of their own. The arrow keys walk
   notch to notch, a drag scrubs between them and settles on the nearest,
   play walks the rest of the way and stops at the end. Nothing starts by
   itself and nothing closes on a timer; under reduced motion every move is a
   cut from still to still. Every word is the caller's.

   EACH NAME STANDS UNDER ITS OWN TICK at every width: as near centred on it as
   its neighbours let it, wrapped at its spaces only where the row needs the
   room, kept inside the rail. Where the row still cannot hold them, every
   second name steps to a second row with a hairline up to its tick, so a name
   is never read as another step's. */

import { paintSlider } from '../../vitrine/slider'

export interface PaperStep { id: string; name: string }

export interface PaperStepsOptions {
  doc: Document
  steps: readonly PaperStep[]
  words: { play: string; pause: string; track: string; between(a: string, b: string): string }
  reducedMotion: boolean
  dir?: 'ltr' | 'rtl'
  /** the position, 0 to the last step, fractional while it moves */
  onMove(t: number): void
  /** seconds a step's travel takes while playing, and the hold at each step */
  travel?: number
  hold?: number
}

/** a step's tick and its name, in the page's pixels, for a check that reads the row back */
export interface PaperStepSeat { id: string; name: string; tick: number; box: { l: number; t: number; r: number; b: number }; row: number; px: number }

export interface PaperSteps {
  readonly element: HTMLElement
  at(): number
  /** the names laid under their ticks again: the row changed width or a face arrived */
  layout(): void
  seats(): PaperStepSeat[]
  /** to a position: a cut, or a travel at the play pace */
  go(t: number, how?: 'cut' | 'travel'): void
  playing(): boolean
  toggle(): void
  key(event: KeyboardEvent): boolean
  update(dt: number): void
  dispose(): void
}

/** the track's resolution: a notch every hundred */
const PER = 100
/** the thumb's width (paper.css): its centre runs from half of it to the track's end less half of it */
const THUMB = 8
/** the least air between two names on one row, and a second row's drop under the first */
const NAME_AIR = 8, ROW_DROP = 6
/** a tick stands at least this far inside its name's box: over the name's words, not its padding */
const TICK_IN = 8
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)

export function createPaperSteps(o: PaperStepsOptions): PaperSteps {
  const { doc, steps } = o
  const last = steps.length - 1
  const travelS = o.travel ?? 2.4, holdS = o.hold ?? 2.2
  const listening = new AbortController()
  const { signal } = listening
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const n = doc.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n
  }

  const element = make('div', 'paper-steps')
  element.dir = o.dir ?? 'ltr'
  /* PLAY IS DRAWN, ITS WORD IS ITS NAME: a German word does not fit a 44 px
     seat, and a glyph from a font differs between engines */
  const play = make('button', 'paper-play')
  play.type = 'button'
  play.setAttribute('aria-pressed', 'false')
  const glyph = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  glyph.setAttribute('viewBox', '0 0 16 16'); glyph.setAttribute('width', '16'); glyph.setAttribute('height', '16'); glyph.setAttribute('aria-hidden', 'true')
  const shape = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('fill', 'currentColor')
  glyph.append(shape)
  play.append(glyph)
  const track = make('div', 'paper-track')
  const slider = make('input', 'paper-slider')
  slider.type = 'range'
  slider.min = '0'; slider.max = String(last * PER); slider.step = '1'; slider.value = '0'
  slider.setAttribute('aria-label', o.words.track)
  slider.dir = element.dir
  track.style.setProperty('--paper-steps', String(steps.length))
  track.append(slider)
  for (let i = 0; i <= last; i++) {
    const notch = make('span', 'paper-notch')
    notch.style.setProperty('--at', String(i / Math.max(1, last)))
    notch.setAttribute('aria-hidden', 'true')
    track.append(notch)
  }
  const names = make('div', 'paper-names')
  names.style.setProperty('--paper-steps', String(steps.length))
  const presses = steps.map((step, i) => {
    const b = make('button', 'paper-name', step.name)
    b.type = 'button'
    b.dataset['step'] = step.id
    b.addEventListener('click', () => { stop(); go(i, o.reducedMotion ? 'cut' : 'travel') }, { signal })
    names.append(b)
    return b
  })
  const rail = make('div', 'paper-rail')
  rail.append(track, names)
  element.append(play, rail)

  /* THE NAMES UNDER THEIR TICKS, measured in the page */
  let laidRows = 1
  function tickAt(i: number): number {
    const w = track.clientWidth
    // a right-to-left range runs from the right: step 0's tick is the rightmost
    const k = element.dir === 'rtl' ? last - i : i
    return track.offsetLeft + THUMB / 2 + (k / Math.max(1, last)) * (w - THUMB)
  }
  /* one row's names, in the order of their ticks: each as near centred on its tick as the one before lets it, then
     pulled back inside its room and clear of the one after. Built so, no two meet; the row holds them when each
     still covers its own tick and stays in its room (the rail, or on the first of two rows the span between the ticks
     whose hairlines rise past it). */
  function place(row: number[], xs: number[], ws: number[], ls: number[], lo: number[], hi: number[]): boolean {
    const order = [...row].sort((a, b) => xs[a]! - xs[b]!)
    let edge = -Infinity
    for (const i of order) {
      ls[i] = Math.max(Math.min(hi[i]! - ws[i]!, Math.max(lo[i]!, xs[i]! - ws[i]! / 2)), edge + NAME_AIR)
      edge = ls[i]! + ws[i]!
    }
    let wall = Infinity
    for (const i of [...order].reverse()) {
      ls[i] = Math.min(ls[i]!, wall - NAME_AIR - ws[i]!, hi[i]! - ws[i]!)
      wall = ls[i]!
    }
    return order.every(i => ls[i]! >= lo[i]! - 0.5 && ls[i]! + TICK_IN <= xs[i]! && xs[i]! <= ls[i]! + ws[i]! - TICK_IN)
  }
  /* each name stands on one line where its row holds it so; where it does not, the widest name still on one line
     wraps at its spaces, and so on until the row holds them all or every name is wrapped. Then every second name
     steps to a second row, where the room between ticks doubles. */
  function lay(rows: number): boolean {
    const w = rail.clientWidth
    const xs = presses.map((_, i) => tickAt(i))
    const rowOf = (i: number): number => (rows > 1 ? i % 2 : 0)
    const one: number[] = [], least: number[] = []
    for (const b of presses) {
      b.style.maxWidth = ''
      b.style.left = '0px'
      // measured in the pressed name's weight, so a name never wraps anew when it is pressed
      b.style.fontWeight = '700'
      b.style.width = 'max-content'; one.push(Math.ceil(b.getBoundingClientRect().width) + 1)
      b.style.width = 'min-content'; least.push(Math.ceil(b.getBoundingClientRect().width) + 1)
      b.style.fontWeight = ''
    }
    // a name on the first of two rows keeps clear of the next ticks, whose names' hairlines rise past it
    const lo = presses.map((_, i) => rows > 1 && rowOf(i) === 0 ? Math.max(0, ...xs.filter((x, j) => rowOf(j) !== 0 && x < xs[i]!).map(x => x + 4)) : 0)
    const hi = presses.map((_, i) => rows > 1 && rowOf(i) === 0 ? Math.min(w, ...xs.filter((x, j) => rowOf(j) !== 0 && x > xs[i]!).map(x => x - 4)) : w)
    const ws = [...one], ls = presses.map(() => 0)
    let fits = false
    for (;;) {
      fits = true
      for (let r = 0; r < rows; r++) if (!place(presses.map((_, i) => i).filter(i => rowOf(i) === r), xs, ws, ls, lo, hi)) fits = false
      if (fits) break
      let pick = -1
      ws.forEach((bw, i) => { if (bw > least[i]! && (pick < 0 || bw > ws[pick]!)) pick = i })
      if (pick < 0) break
      ws[pick] = least[pick]!
    }
    const boxes = presses.map((b, i) => {
      b.style.width = `${ws[i]}px`
      b.style.left = `${Math.round(ls[i]!)}px`
      b.dataset['row'] = String(rowOf(i))
      // the hairline of a name on the second row runs up to its own tick
      b.style.setProperty('--paper-tick', `${Math.round(xs[i]! - Math.round(ls[i]!))}px`)
      return { row: rowOf(i), h: b.offsetHeight }
    })
    const rowH = [0, 1].map(r => Math.max(0, ...boxes.filter(b => b.row === r).map(b => b.h)))
    presses.forEach((b, i) => {
      b.style.top = rowOf(i) ? `${rowH[0]! + ROW_DROP}px` : '0px'
      b.style.setProperty('--paper-lift', `${rowH[0]! + ROW_DROP}px`)
    })
    names.style.height = `${rowH[0]! + (rows > 1 ? ROW_DROP + rowH[1]! : 0)}px`
    return fits
  }
  function layout(): void {
    if (!rail.isConnected || rail.clientWidth < 1) return
    laidRows = lay(1) ? 1 : 2
    if (laidRows === 2) lay(2)
    element.dataset['rows'] = String(laidRows)
  }
  const resized = new ResizeObserver(() => layout())
  resized.observe(rail)
  signal.addEventListener('abort', () => resized.disconnect())
  void doc.fonts?.ready.then(() => { if (!signal.aborted) layout() })

  let t = 0, from = 0, to = 0, moving = 0, moveFor = 0, playing = false, holding = 0, dragging = false

  function show(): void {
    if (!dragging) slider.value = String(Math.round(t * PER))
    paintSlider(slider)
    const near = Math.round(t)
    const on = Math.abs(t - near) < 1e-3
    slider.setAttribute('aria-valuetext', on ? steps[near]!.name : o.words.between(steps[Math.floor(t)]!.name, steps[Math.min(last, Math.ceil(t))]!.name))
    presses.forEach((b, i) => b.setAttribute('aria-pressed', String(on && i === near)))
    const word = playing ? o.words.pause : o.words.play
    if (play.getAttribute('aria-label') !== word) { play.setAttribute('aria-label', word); play.title = word }
    shape.setAttribute('d', playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : (element.dir === 'rtl' ? 'M12 3v10L4 8z' : 'M4 3v10l8-5z'))
    play.setAttribute('aria-pressed', String(playing))
    o.onMove(t)
  }
  function go(target: number, how: 'cut' | 'travel' = 'travel'): void {
    const goal = Math.max(0, Math.min(last, target))
    if (how === 'cut' || o.reducedMotion || Math.abs(goal - t) < 1e-4) { t = goal; moving = 0; show(); return }
    from = t; to = goal; moving = 1e-6; moveFor = travelS * Math.max(0.35, Math.min(1, Math.abs(goal - t)))
  }
  function stop(): void { playing = false; holding = 0; show() }
  function toggle(): void {
    if (playing) { stop(); return }
    // at the end, play starts over from the first step
    if (t >= last - 1e-3) go(0, 'cut')
    playing = true
    holding = moving ? 0 : holdS * 0.4
    show()
  }

  play.addEventListener('click', toggle, { signal })
  slider.addEventListener('input', () => {
    dragging = true
    if (playing) playing = false
    moving = 0
    const v = Number(slider.value) / PER
    // under reduced motion a drag shows only the stills at the notches
    t = o.reducedMotion ? Math.round(v) : v
    paintSlider(slider)
    show()
  }, { signal })
  slider.addEventListener('change', () => { dragging = false; go(Math.round(t), 'travel') }, { signal })
  slider.addEventListener('keydown', (event) => { if (key(event)) event.preventDefault() }, { signal })

  function key(event: KeyboardEvent): boolean {
    const back = element.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft', on = element.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const here = moving ? to : t
    let goal: number | null = null
    if (event.key === on || event.key === 'ArrowUp') goal = Math.floor(here + 1e-3) + 1
    else if (event.key === back || event.key === 'ArrowDown') goal = Math.ceil(here - 1e-3) - 1
    else if (event.key === 'Home') goal = 0
    else if (event.key === 'End') goal = last
    else if (event.key === ' ' && event.target !== play && !(event.target instanceof HTMLButtonElement)) { toggle(); return true }
    if (goal === null) return false
    playing = false
    go(goal, 'travel')
    show()
    return true
  }

  function update(dt: number): void {
    if (moving > 0) {
      moving = Math.min(1, moving + dt / moveFor)
      t = from + (to - from) * ease(moving)
      if (moving >= 1) { moving = 0; t = to; holding = 0 }
      show()
      return
    }
    if (!playing) return
    holding += dt
    if (holding < holdS) return
    if (t >= last - 1e-3) { stop(); return }
    go(Math.floor(t + 1e-3) + 1, o.reducedMotion ? 'cut' : 'travel')
    holding = 0
    if (o.reducedMotion) show()
  }

  show()
  return {
    element,
    at: () => t,
    layout,
    seats: () => {
      const r = rail.getBoundingClientRect()
      return presses.map((b, i) => {
        const box = b.getBoundingClientRect()
        return { id: steps[i]!.id, name: b.textContent ?? '', tick: r.left + tickAt(i), box: { l: box.left, t: box.top, r: box.right, b: box.bottom },
          row: Number(b.dataset['row'] ?? 0), px: parseFloat(getComputedStyle(b).fontSize) }
      })
    },
    go,
    playing: () => playing,
    toggle,
    key,
    update,
    dispose() { listening.abort(); element.remove() },
  }
}
