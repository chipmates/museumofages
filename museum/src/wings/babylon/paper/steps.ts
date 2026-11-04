/* NOTCHES AND NAMED STEPS: how a paper feature moves. One track, drawn as the
   vitrine draws its clock (`vitrine/slider.ts`), with a notch at each named
   state and the names under it as presses of their own. The arrow keys walk
   notch to notch, a drag scrubs between them and settles on the nearest,
   play walks the rest of the way and stops at the end. Nothing starts by
   itself and nothing closes on a timer; under reduced motion every move is a
   cut from still to still. Every word is the caller's. */

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

export interface PaperSteps {
  readonly element: HTMLElement
  at(): number
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
    go,
    playing: () => playing,
    toggle,
    key,
    update,
    dispose() { listening.abort(); element.remove() },
  }
}
