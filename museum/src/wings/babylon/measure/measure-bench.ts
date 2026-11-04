/* FEATURE 7'S BENCH (`/src/wings/babylon/measure/measure.html`): the tower
   stop's held frame, its door, and the feature opening over it and closing
   onto it. A dev page; the window around the feature is a stand-in for the
   close look's own. The stills are the stop's, handed in by address:

     ?held=<url with {framing}>   the stop's held frame (framing: desktop or phone)
     ?ink=<url with {framing}>    its ink still; without one the frame crosses straight to paper
     ?lang=de  ?dir=rtl  ?open=1  ?step=<0..5>

   The rig `window.__measure` opens, steps, closes and reads the plate back. */

import css from './measure-bench.css?inline'
import { paperStyle } from '../paper/index'
import type { VitrinePayloadHost } from '../../vitrine/types'
import { createMeasurePayload } from './measure'
import { MEASURE_WORDS, STEP_IDS } from './measure-words'

const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const dir = q.get('dir') === 'rtl' ? 'rtl' : 'ltr'
const W = MEASURE_WORDS[lang]
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const says = $('says')
document.documentElement.lang = lang
document.documentElement.setAttribute('style', paperStyle())
const style = document.createElement('style')
style.textContent = css
document.head.append(style)

const tower = await fetch(new URL('../tower/tower-plan.json', import.meta.url)).then(r => r.json()) as {
  door: { wide: { right: number; bottom: number }; upright: { middle: boolean; bottom: number } }
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const upright = (): boolean => innerHeight > innerWidth * 1.05
const still = (key: 'held' | 'ink'): string | null => {
  const at = q.get(key)
  return at ? at.replace('{framing}', upright() ? 'phone' : 'desktop') : null
}

/* the stop at rest: its held frame and the one press, where the stop's plan puts it */
const held = $<HTMLImageElement>('held')
const door = $<HTMLButtonElement>('door')
door.textContent = W.ui.door
function rest(): void {
  const src = still('held')
  if (src && held.getAttribute('src') !== src) held.src = src
  held.hidden = !src
  const d = tower.door
  if (upright()) {
    door.style.left = '50%'; door.style.right = ''; door.style.transform = 'translateX(-50%)'
    door.style.bottom = `${Math.round(d.upright.bottom * innerHeight)}px`
  } else {
    door.style.left = ''; door.style.transform = ''
    door.style.right = `${Math.round(d.wide.right * innerWidth)}px`
    door.style.bottom = `${Math.round(d.wide.bottom * innerHeight)}px`
  }
}

/* the close look: a viewport over the frame and a band at its foot */
const look = $('look'), view = $('view'), band = $('band'), line = $('line'), aside = $('aside'), controls = $('controls')
const name = $('name'), back = $<HTMLButtonElement>('back'), shut = $<HTMLButtonElement>('shut')
name.textContent = W.ui.title
back.textContent = W.ui.close
shut.setAttribute('aria-label', W.ui.close)
look.dir = dir

/** THE LINE'S BOX IS THE LONGEST LINE'S, measured once per width and language, so the plate never moves when a line gives way to the next */
let measuredFor = ''
function holdLine(): void {
  const key = `${innerWidth}|${lang}`
  if (key === measuredFor) return
  const shown = line.textContent
  line.style.minHeight = ''
  let most = 0
  for (const id of STEP_IDS) { line.textContent = W.band[id]; most = Math.max(most, line.getBoundingClientRect().height) }
  line.textContent = shown
  line.style.minHeight = `${Math.ceil(most)}px`
  measuredFor = key
}

function fitView(): void {
  holdLine()
  const top = band.getBoundingClientRect().top
  // the phone keeps the shut mark's row clear above the plate
  const head = upright() ? 60 : 0
  view.style.top = `${head}px`
  view.style.height = `${Math.max(120, top - head)}px`
}

const host: VitrinePayloadHost = {
  element: view, controls, aside, caption: line, lang, narrow: innerWidth <= 700,
  get reducedMotion() { return reduced.matches },
  viewport: () => { const r = view.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } },
  work: () => null,
  surface: () => undefined,
  describe: (text: string) => view.setAttribute('aria-label', text),
}

let payload: ReturnType<typeof createMeasurePayload> | null = null
let closing = false
function open(): void {
  if (payload) return
  look.hidden = false
  look.dataset['open'] = 'false'
  door.hidden = true
  payload = createMeasurePayload({ lang, dir, reducedMotion: reduced.matches, ink: q.get('ink') ? { wide: still('ink')!, upright: still('ink')! } : null })
  fitView()
  payload.mount(host)
  // the payload's own row now stands in the band: the plate ends where the band begins
  fitView()
  payload.layout?.()
  name.focus()
}
async function close(): Promise<void> {
  if (!payload || closing) return
  closing = true
  look.dataset['open'] = 'false'
  await payload.leave()
  payload.unmount()
  payload = null
  look.hidden = true
  door.hidden = false
  closing = false
  door.focus()
}
door.addEventListener('click', open)
back.addEventListener('click', () => { void close() })
shut.addEventListener('click', () => { void close() })
addEventListener('keydown', (event) => {
  if (!payload) return
  if (event.key === 'Escape') { event.preventDefault(); void close(); return }
  if (payload.key?.(event)) event.preventDefault()
})
addEventListener('resize', () => { measuredFor = ''; rest(); if (payload) { fitView(); payload.layout?.() } })
new ResizeObserver(() => { if (payload && !closing) { const before = view.style.height; fitView(); if (view.style.height !== before) payload.layout?.() } }).observe(band)

let last = 0
function frame(now: number): void {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
  last = now
  if (payload) {
    payload.update?.(dt)
    if (payload.open() && look.dataset['open'] !== 'true') look.dataset['open'] = 'true'
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

const rig = {
  ready: false,
  state: () => ({ backend: 'dom', architecture: 'svg', lang, dir, open: Boolean(payload), steps: STEP_IDS.length }),
  open,
  close: () => close(),
  /** a step as a still: the slider cut to it */
  go: (step: number) => payload?.go(step, 'cut'),
  /** a point of the slider between steps, for the motion frames */
  at: (t: number) => payload?.go(t, 'cut'),
  phase: () => payload?.readout().phase ?? 'rest',
  readout: () => payload?.readout() ?? null,
  /** every box the page shows, for the 44 px check */
  targets: () => Array.from(document.querySelectorAll<HTMLElement>('button, input')).filter(n => n.offsetParent !== null || n === door && !door.hidden)
    .map(n => { const r = n.getBoundingClientRect(); return { what: n.id || n.className, w: Math.round(r.width), h: Math.round(r.height), text: (n.textContent ?? '').trim().slice(0, 30) } }),
}
;(window as unknown as { __measure: typeof rig }).__measure = rig

rest()
door.hidden = false
await document.fonts.ready
if (q.get('open') === '1') { open(); const s = Number(q.get('step') ?? 0); if (s) payload!.go(s, 'cut') }
const waitFor = (img: HTMLImageElement): Promise<void> => (img.hidden || img.complete ? Promise.resolve() : new Promise(r => { img.onload = () => r(); img.onerror = () => r() }))
await waitFor(held)
says.textContent = `ready: ${lang} ${dir}, held ${held.hidden ? 'none' : 'shown'}`
rig.ready = true
