/* THE HIDDEN WORDS BENCH (dev only): one of feature 1's three things on the vitrine's turntable, on the close view's
   own stage, with no feature chrome. The window of the feature's own round stands in for the host here: the glass,
   a hidden row of controls and a hidden caption.
     ?object=brick|limestone|breccia   the thing (brick)
     ?narrow=1                          the phone's frame and its run (the crop on the signs); default by the window
     ?t=<s>                             the clock held at a second of the run, paused; without it the run waits at 0
     ?chrome=1                          show the turntable's own controls (a hand's check, never a still)
   The rig `window.__objects` poses the clock and reads the frame's box and time for the shooter. */
import { Scene, PerspectiveCamera } from 'three/webgpu'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { createTurntablePayload, type TurntableViewpoint } from '../../vitrine/turntable'
import { STAGE } from '../../vitrine/stage-close-view'
import type { VitrinePayloadHost } from '../../vitrine/types'
import { BEAT_STEPS, hiddenObject, type ObjectId } from './objects'

const q = new URLSearchParams(location.search)
const says = document.getElementById('says')!
const say = (text: string): void => { says.textContent = text }
const id = (['brick', 'limestone', 'breccia'] as const).find(k => k === q.get('object')) ?? 'brick' as ObjectId
const narrow = q.has('narrow') ? q.get('narrow') === '1' : innerWidth / innerHeight <= 0.9

const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const idle = new Scene()
stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true)

const t0 = performance.now()
const thing = hiddenObject(id)
const buildMs = Math.round(performance.now() - t0)
say(`${id}: built in ${buildMs} ms`)

const glass = document.getElementById('glass')!
const chrome = document.getElementById('chrome')!
if (q.get('chrome') !== '1') chrome.classList.add('off')
const host: VitrinePayloadHost = {
  element: glass,
  controls: document.getElementById('controls')!,
  aside: document.getElementById('aside')!,
  caption: document.getElementById('caption')!,
  lang: 'en',
  narrow,
  // the desktop's close look stands over the label band (design B): the run is fitted whole above it
  banded: !narrow,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  viewport: () => { const r = glass.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } },
  work: () => null,
  surface: () => {},
  describe: (text) => glass.setAttribute('aria-label', text),
}

const views: { id: TurntableViewpoint; label: string; part: string | null }[] = [
  { id: 'whole', label: 'whole', part: null },
  { id: 'working-part', label: 'signs', part: thing.signsPart },
]
const payload = createTurntablePayload({
  stack, body: thing.body, title: id,
  schedule: { kind: 'loop', period: thing.period },
  // the beats carry keys: the band's words are the feature's own round's
  steps: BEAT_STEPS(thing, key => key),
  parents: new Map(),
  viewpoints: views,
  words: { play: 'play', pause: 'pause', again: 'again', clock: 'clock' },
  light: { key: { azimuth: STAGE.key.turn, elevation: STAGE.key.height, kelvin: STAGE.key.kelvin, lux: STAGE.key.lux }, fill: { color: STAGE.fill.sky, groundColor: STAGE.fill.ground, intensity: STAGE.fill.intensity }, environmentIntensity: STAGE.fill.environment, fitting: { color: '#ffffff', intensity: 0, distance: 0, decay: 2, height: 0 } },
  grade: IDENTITY,
  runViews: narrow ? thing.runViews.phone : thing.runViews.desk,
  restore: () => stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true),
})
payload.mount(host)

let last = performance.now()
const times: number[] = []
let held = q.has('t') ? Number(q.get('t')) : 0
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  payload.update?.(dt)
  stack.render(dt)
  times.push(dt * 1000)
  if (times.length > 600) times.shift()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// nothing starts by itself: the run waits at its first moment (or the asked second) until a hand presses play
const settle = async (frames: number): Promise<void> => { for (let i = 0; i < frames; i++) await new Promise(r => requestAnimationFrame(r)) }
async function standing(): Promise<void> {
  for (let i = 0; i < 600 && !payload.film.measure(); i++) await settle(1)
}
await standing()
payload.film.pose(held, { playing: false, lit: false })
await settle(8)
says.classList.add('off')

const rig = {
  ready: true,
  state: () => ({ backend: stack.backend, architecture: stack.architecture, object: id, narrow, period: thing.period, buildMs, beats: thing.beats, credits: thing.credits, record: thing.record }),
  /** hold the clock at a second of the run, the eye where the run carries it there, then a few frames to settle */
  async pose(o: { t: number; frames?: number }) {
    held = o.t
    // the run's eye is carried by the clock: walk it there in small steps, so the eased follow arrives
    payload.film.pose(o.t, { playing: false, lit: false })
    await settle(o.frames ?? 40)
    return { t: o.t, measure: payload.film.measure() }
  },
  /** play the run for a while and read the frame times (ms): median, 95th, worst */
  async frameTime(o: { seconds: number }) {
    payload.film.pose(0, { playing: true, lit: false })
    times.length = 0
    await new Promise(r => setTimeout(r, o.seconds * 1000))
    const sorted = [...times].sort((a, b) => a - b)
    const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
    payload.film.pose(held, { playing: false, lit: false })
    return { frames: sorted.length, median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] }
  },
}
;(window as unknown as { __objects: typeof rig }).__objects = rig
