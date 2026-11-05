/* FEATURE 6'S PRESS BENCH (dev only): the fresh tablet on the vitrine's turntable, on the close view's own stage, with
   the press's own controls and no other chrome. The window stands in for the host: the glass, a hidden row of
   controls and a hidden caption.
     ?narrow=1         the phone's frame; default by the window
     ?t=<wedges>       the presses held at a clock in wedges (3.5: three pressed, the fourth half in)
     ?lang=de          the words' language
     ?chrome=1         show the controls and the caption (a hand's check, never a still)
   The rig `window.__clay` poses the presses, presses, and reads the frame's box and time for the shooter. */
import { Scene, PerspectiveCamera } from 'three/webgpu'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { createTurntablePayload } from '../../vitrine/turntable'
import { STAGE } from '../../vitrine/stage-close-view'
import type { VitrinePayloadHost } from '../../vitrine/types'
import { CLAY_VIEW } from './clay-view'
import { clayBody } from './clay-body'
import { backFrom, pressFrom, type ClaySignFile } from './clay-data'
import { CLAY_WORDS, PRESS_KEYS, pressKey } from './clay-words'
import signs from './clay-signs.json'


const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const W = CLAY_WORDS[lang]
const says = document.getElementById('says')!
const narrow = q.has('narrow') ? q.get('narrow') === '1' : innerWidth / innerHeight <= 0.9

const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const idle = new Scene()
stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true)

const t0 = performance.now()
const clay = clayBody(signs as unknown as ClaySignFile)
const buildMs = Math.round(performance.now() - t0)
says.textContent = `clay: built in ${buildMs} ms`

const glass = document.getElementById('glass')!
const chrome = document.getElementById('chrome')!
if (q.get('chrome') !== '1') chrome.classList.add('off')
const caption = document.getElementById('caption')!
const controls = document.getElementById('controls')!
const host: VitrinePayloadHost = {
  element: glass, controls, aside: document.getElementById('aside')!, caption, lang, narrow,
  banded: !narrow,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  viewport: () => { const r = glass.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } },
  work: () => null,
  surface: () => {},
  describe: (text) => glass.setAttribute('aria-label', text),
}

// a finished sign is named by a tap: the map the turntable reads grows as signs are finished
const named = new Map<string, string>()
const payload = createTurntablePayload({
  stack, body: clay.body, title: W.ui.title,
  // the clock counts wedges; the run is posed held, and each press plays it to the next wedge
  schedule: { kind: 'loop', period: clay.period },
  steps: clay.steps(PRESS_KEYS.map(k => W.band[k])),
  parents: new Map(),
  viewpoints: [{ id: 'whole', label: 'whole', part: null }],
  // one stage already ended at clock 0: the eye stands over the face from the first frame and never moves
  runViews: [{ from: -1, to: -0.5, view: 'whole', yaw: CLAY_VIEW.yaw, pitch: CLAY_VIEW.pitch }],
  partNames: named,
  words: { play: W.ui.play, pause: W.ui.pause, again: W.ui.again, clock: W.ui.wedges(0, clay.total) },
  light: { key: { azimuth: STAGE.key.turn, elevation: STAGE.key.height, kelvin: STAGE.key.kelvin, lux: STAGE.key.lux }, fill: { color: STAGE.fill.sky, groundColor: STAGE.fill.ground, intensity: STAGE.fill.intensity }, environmentIntensity: STAGE.fill.environment, fitting: { color: '#ffffff', intensity: 0, distance: 0, decay: 2, height: 0 } },
  grade: IDENTITY,
  restore: () => stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true),
})
payload.mount(host)

// THE PRESS'S OWN CONTROLS: press, back, play and pause, each a button of 44 px; Space presses. A press plays the
// run from where it stands until the next wedge is in; play runs on to the whole name and stops there.
let stop: { at: number; land: number } | null = null
function press(): void {
  const p = pressFrom(clay.clock(), clay.total)
  if (!p) return
  stop = { at: p.stop, land: p.land }
  payload.film.pose(p.from, { playing: true, lit: true })
}
function back(): void { stop = null; payload.film.pose(backFrom(clay.clock(), clay.total), { playing: false, lit: true }) }
function play(): void {
  if (stop?.land === clay.total) { stop = null; payload.film.pose(clay.clock(), { playing: false, lit: true }); return }
  const p = pressFrom(clay.clock(), clay.total)
  if (!p) return
  stop = { at: clay.total, land: clay.total }
  payload.film.pose(p.from, { playing: true, lit: true })
}
const row = document.createElement('div')
row.className = 'clay-controls'
const button = (text: string, act: () => void): HTMLButtonElement => {
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'clay-control'; b.textContent = text
  b.addEventListener('click', act)
  row.append(b)
  return b
}
const pressButton = button(W.ui.press, press)
button(W.ui.back, back)
const playButton = button(W.ui.play, play)
controls.append(row)
addEventListener('keydown', (event) => {
  if (event.key === ' ' && !(event.target as Element).closest?.('button')) { event.preventDefault(); press() }
})

let lastKey = '', before = 0
function words(): void {
  const c = clay.clock()
  // a run played past the whole name, by any hand, stops on it
  if (stop && c >= stop.at - 1e-6) { const land = stop.land; stop = null; payload.film.pose(land, { playing: false, lit: true }) }
  else if (before < clay.total && c > clay.total + 0.02) payload.film.pose(clay.total, { playing: false, lit: true })
  before = clay.clock()
  const signs = clay.finishedSigns()
  named.clear()
  for (const s of signs) named.set(clay.signParts[s]!, W.readings[s]!)
  const key = pressKey(signs.length)
  if (key !== lastKey) { caption.textContent = W.band[key]; caption.lang = lang; lastKey = key }
  pressButton.disabled = !pressFrom(c, clay.total)
  playButton.textContent = stop?.land === clay.total ? W.ui.pause : W.ui.play
}


let last = performance.now()
const times: number[] = []
function frame(now: number): void {
  // the first frame's stamp can precede the clock read when the page set up: a negative step would carry the eye back
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
  last = now
  payload.update?.(dt)
  words()
  stack.render(dt)
  times.push(dt * 1000)
  if (times.length > 900) times.shift()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

const settle = async (frames: number): Promise<void> => { for (let i = 0; i < frames; i++) await new Promise(r => requestAnimationFrame(r)) }
for (let i = 0; i < 600 && !payload.film.measure(); i++) await settle(1)
// nothing presses by itself: the run waits on fresh clay (or the asked clock) until a hand presses
payload.film.pose(q.has('t') ? Number(q.get('t')) : 0, { playing: false, lit: true })
await settle(8)
says.classList.add('off')

const rig = {
  ready: true,
  state: () => ({ backend: stack.backend, architecture: stack.architecture, narrow, lang, buildMs, wedges: clay.total, period: clay.period,
    clock: clay.clock(), lit: clay.lit(), named: [...named.values()], caption: caption.textContent }),
  /** hold the presses at a clock in wedges, then a few frames to settle */
  async pose(o: { t: number; frames?: number }) {
    stop = null
    payload.film.pose(o.t, { playing: false, lit: true })
    await settle(o.frames ?? 30)
    return { t: o.t, measure: payload.film.measure(), clock: clay.clock(), lit: clay.lit(), named: [...named.values()] }
  },
  /** press once from where it stands and wait until the wedge is in */
  async press() {
    const from = clay.clock()
    press()
    for (let i = 0; i < 200 && stop; i++) await settle(1)
    await settle(4)
    return { from, clock: clay.clock(), lit: clay.lit(), worked: clay.worked() }
  },
  /** play the presses through from fresh clay and read the frame times (ms): median, 95th, worst */
  async frameTime(o: { seconds: number }) {
    payload.film.pose(0, { playing: false, lit: true })
    play()
    times.length = 0
    await new Promise(r => setTimeout(r, o.seconds * 1000))
    const sorted = [...times].sort((a, b) => a - b)
    const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
    const pressed = clay.clock()
    stop = null
    payload.film.pose(0, { playing: false, lit: true })
    return { frames: sorted.length, median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1], pressed }
  },
}
;(window as unknown as { __clay: typeof rig }).__clay = rig
