/* FEATURE 6'S LOOK BENCH (`/src/wings/babylon/clay/look.html`): stop 7's
   held frame, its door, and the look opening over it and closing onto it,
   inside the walk's own chrome as feature 7's bench stands it (the band on a
   desktop, the graded box on a phone). The press stands on the vitrine's
   turntable through the museum's one stack on the canvas under the look; the
   paper steps lie over it. A plain crossfade in and out (no ink still).

     ?held=<url with {framing}>   the stop's held frame (framing: desktop or phone)
     ?photo=<url>                 the Met's school tablet (the store names its file)
     ?lang=de  ?open=1  ?step=<0..4>  ?t=<wedges>  ?rig=1 (the harness's marker, never shown otherwise)

   The rig `window.__claylook` opens, presses, steps, raises, closes and reads back. */

import css from './look-bench.css?inline'
import deskCss from '../../desk-chrome.css?inline'
import closeLookCss from '../../desk-closelook.css?inline'
import filmCss from '../../vinci/film-wing.css?inline'
import walkPage from '../../../../index.html?raw'
import { paperStyle, grainTile } from '../paper/index'
import type { VitrinePayloadHost } from '../../vitrine/types'
import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { setCloseLookBand } from '../../desk-stage'
import { createClayLook } from './clay-look'
import { CLAY_WORDS, STEP_IDS } from './clay-words'
import type { ClaySignFile } from './clay-data'
import signs from './clay-signs.json'

const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const dir = 'ltr' as 'ltr' | 'rtl'
const W = CLAY_WORDS[lang]
const LAST = STEP_IDS.length - 1
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const says = $('says')
says.hidden = q.get('rig') !== '1'
document.documentElement.lang = lang

/** THE WALK'S TOKENS, read from the museum's own page: its root block and the
    block that maps the shell's names onto the interface's inside a wing */
function block(text: string, head: string): string {
  const at = text.indexOf(head)
  if (at < 0) return ''
  let depth = 0
  for (let i = text.indexOf('{', at); i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1)
  }
  return ''
}
const tokens = [block(walkPage, ':root {'), block(walkPage, 'html:has(#wing) :is(#wing, #instruments) {')]
if (tokens.some(t => !t)) console.warn('the walk\'s tokens were not found in its page')
const style = document.createElement('style')
style.textContent = [...tokens, deskCss, closeLookCss, filmCss, css].join('\n')
document.head.append(style)
document.documentElement.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)

const nabu = await fetch(new URL('../nabu/nabu-plan.json', import.meta.url)).then(r => r.json()) as {
  door: { wide: { right: number; bottom: number }; upright: { middle: boolean; bottom: number } }
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const upright = (): boolean => innerHeight > innerWidth * 1.05
/** the phone's form below this width, as the bench's window has always drawn it */
const PHONE_MOST = 700
const phoneForm = (): boolean => innerWidth <= PHONE_MOST
const still = (key: 'held'): string | null => {
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
  const d = nabu.door
  if (upright()) {
    door.style.left = '50%'; door.style.right = ''; door.style.transform = 'translateX(-50%)'
    door.style.bottom = `${Math.round(d.upright.bottom * innerHeight)}px`
  } else {
    door.style.left = ''; door.style.transform = ''
    door.style.right = `${Math.round(d.wide.right * innerWidth)}px`
    door.style.bottom = `${Math.round(d.wide.bottom * innerHeight)}px`
  }
}

/* ---- the walk's chrome, built with its own classes ---- */
const SVG = 'http://www.w3.org/2000/svg'
const STEP_BACK = 'M10 3L5 8l5 5', ARROW_BACK = 'M13 8H3M7 4L3 8l4 4', ARROW_ON = 'M3 8h10M9 4l4 4-4 4', ARROW_UP = 'M8 13V3M4 7l4-4 4 4'
const ARROW_DOWN = 'M8 3v10M4 9l4 4 4-4', MENU = 'M3 3.5h10M3 8h10M3 12.5h10'
function icon(path: string, cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS(SVG, 'path')
  line.setAttribute('d', path)
  svg.append(line)
  return svg
}
function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n
}
function button(cls: string, label?: string): HTMLButtonElement {
  const b = make('button', cls); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b
}
type Certainty = 'documented' | 'reconstructed' | 'conjectural' | 'unknown'
/** the walk's certainty mark (`deskMark`): a full disc, a half disc, an open ring, a broken ring */
function mark(certainty: Certainty): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 18 18'); svg.setAttribute('class', 'desk-mark'); svg.setAttribute('aria-hidden', 'true')
  svg.dataset['certainty'] = certainty
  const ring = document.createElementNS(SVG, 'circle')
  ring.setAttribute('cx', '9'); ring.setAttribute('cy', '9')
  if (certainty === 'documented') { ring.setAttribute('r', '6.2'); ring.setAttribute('class', 'desk-mark-full') }
  else if (certainty === 'reconstructed') {
    ring.setAttribute('r', '6.2'); ring.setAttribute('class', 'desk-mark-ring')
    const half = document.createElementNS(SVG, 'path')
    half.setAttribute('d', 'M9 2.8a6.2 6.2 0 0 0 0 12.4z'); half.setAttribute('class', 'desk-mark-half')
    svg.append(ring, half)
    return svg
  } else { ring.setAttribute('r', '5.8'); ring.setAttribute('class', certainty === 'unknown' ? 'desk-mark-broken' : 'desk-mark-open') }
  svg.append(ring)
  return svg
}

const wing = $('wing'), look = $('look'), view = $('view')
wing.dataset['desk'] = 'type14 words ways stage closelook'
wing.dataset['film'] = 'upright'
look.dir = dir

/* the three parts the payload writes into, one each, moved into whichever form stands */
const caption = make('p', '')
caption.setAttribute('aria-live', 'polite')
const tools = make('div', 'measure-tools clay-tools')
const aside = make('div', 'measure-aside')

/* THE DESKTOP: the close look's band */
const band = make('div', 'desk-clb')
band.tabIndex = -1
band.setAttribute('role', 'group')
band.setAttribute('aria-label', W.ui.title)
const room = button('desk-clb-step')
room.append(icon(STEP_BACK, 'desk-ic'), document.createTextNode(W.ui.close))
const deskName = make('div', 'desk-name')
const deskTitle = make('span', 'desk-chapter', W.ui.title)
const deskClock = make('span', 'desk-clock')
const deskCap = make('div', 'desk-clb-cap')
const drawer = make('div', 'desk-clb-drawer')
drawer.id = 'clay-drawer'
drawer.hidden = true
drawer.setAttribute('role', 'region')
drawer.setAttribute('aria-label', W.ui.title)
const drawerWords = make('div', 'desk-clb-words')
drawer.append(drawerWords)
deskCap.append(deskName, drawer)
const more = button('desk-word-control desk-clb-more')
more.setAttribute('aria-controls', drawer.id)
const deskFoot = make('div', 'desk-foot desk-clb-foot')
deskFoot.append(more)
const left = make('div', 'desk-clb-left')
left.append(deskCap, deskFoot)
const right = make('div', 'desk-clb-right')
const inst = make('div', 'desk-clb-inst')
const ways = make('div', 'desk-clb-ways')
const prev = button('desk-back desk-clb-back')
prev.append(icon(ARROW_BACK, 'desk-ic'))
const on = button('desk-on desk-clb-on')
const onKicker = make('span', 'desk-on-kicker'), onTitle = make('span', 'desk-on-title')
const onWords = make('span', 'desk-on-words')
onWords.append(onKicker, onTitle)
const onArrow = make('span', 'desk-on-arrow')
on.append(onWords, onArrow)
ways.append(prev, on)
right.append(inst, ways)
band.append(room, left, right)

/* THE PHONE: the walk's graded box */
const sheet = make('div', 'film-box')
sheet.tabIndex = -1
sheet.setAttribute('role', 'group')
sheet.setAttribute('aria-label', W.ui.title)
sheet.dataset['look'] = 'true'
const phoneName = make('div', 'film-name')
const phoneTitle = make('span', 'film-chapter', W.ui.title)
const phoneClock = make('span', 'film-clock')
const phoneSteps = make('div', 'measure-sheet-steps')
const keys = make('div', 'film-keys')
const raiseKey = button('film-key film-more')
raiseKey.setAttribute('aria-expanded', 'false')
keys.append(raiseKey)
const foot = make('div', 'film-foot')
// the walk's first seat in a close look: round, one height down, and at the lowest height the look's close
const back = button('film-down', W.ui.close)
back.append(icon(ARROW_DOWN, 'film-ic'))
const book = button('film-book', W.ui.book)
book.append(icon(MENU, 'film-ic film-ic-menu'))
const gold = button('film-gold')
const goldName = make('span', 'film-gold-name')
const goldArrow = make('span', 'film-gold-arrow')
gold.append(goldName, goldArrow)
foot.append(back, book, gold)
sheet.append(phoneName, phoneSteps, keys, foot)
look.append(band, sheet)

let form: 'desk' | 'phone' = phoneForm() ? 'phone' : 'desk'
let raised = false
let drawerOpen = false
let certainty: Certainty = 'unknown'
let settled = 0

/** THE PRESS'S ROW stands at rest on both forms: in the instrument column on a desktop, and on a phone over the key
    row, above the foot, where the thumb reaches it without raising the sheet */
function placePress(): void {
  const row = document.querySelector<HTMLElement>('.clay-press-row')
  if (!row) return
  if (form === 'phone') { if (row.parentElement !== sheet) sheet.insertBefore(row, keys) }
  else if (row.parentElement !== tools) tools.prepend(row)
}
/** the line, the tools and the list stand in the form that stands */
function seat(): void {
  form = phoneForm() ? 'phone' : 'desk'
  look.dataset['form'] = form
  if (form === 'desk') {
    caption.className = 'desk-line desk-clb-line'
    deskCap.insertBefore(caption, drawer)
    inst.append(tools)
    drawerWords.append(aside)
    aside.classList.remove('unseen')
  } else {
    caption.className = 'film-line'
    sheet.insertBefore(caption, phoneSteps)
    phoneSteps.append(tools)
    sheet.append(aside)
    aside.classList.add('unseen')
  }
  placePress()
  paint()
}

/** the name row, the clock, the ways and the keys, for the step the slider settled on */
function paint(): void {
  const n = settled
  for (const row of [deskName, phoneName]) {
    row.replaceChildren(mark(certainty), row === deskName ? deskTitle : phoneTitle, row === deskName ? deskClock : phoneClock)
  }
  deskClock.textContent = phoneClock.textContent = W.ui.stepOf(n + 1, LAST + 1)
  const names = payload?.names() ?? STEP_IDS.map(id => W.steps[id])
  const to = n < LAST ? names[n + 1]! : null
  // gold names the next step; at the last it leads back to the temple, the way the walk goes on
  onKicker.textContent = to ? W.ui.next : W.ui.close
  onTitle.textContent = to ?? ''
  onTitle.hidden = !to
  onArrow.replaceChildren(icon(to ? ARROW_ON : ARROW_UP, 'desk-ic'))
  on.setAttribute('aria-label', to ? `${W.ui.next} · ${to}` : W.ui.close)
  prev.disabled = n === 0
  prev.setAttribute('aria-label', n > 0 ? names[n - 1]! : W.steps[STEP_IDS[0]])
  goldName.textContent = to ?? W.ui.close
  goldArrow.replaceChildren(icon(to ? ARROW_ON : ARROW_UP, 'film-ic'))
  gold.setAttribute('aria-label', to ? `${W.ui.next} · ${to}` : W.ui.close)
  gold.dataset['end'] = String(!to)
  more.replaceChildren(document.createTextNode(drawerOpen ? W.ui.lower : W.ui.more))
  if (drawerOpen) more.append(make('span', 'desk-key', 'Esc'))
  more.setAttribute('aria-expanded', String(drawerOpen))
  raiseKey.replaceChildren(document.createTextNode(raised ? W.ui.lower : W.ui.raise), icon(raised ? ARROW_DOWN : ARROW_UP, 'film-ic'))
  raiseKey.setAttribute('aria-expanded', String(raised))
  // the seat says what its next press does, in the words of the key that does the same
  back.setAttribute('aria-label', raised ? W.ui.lower : W.ui.close)
}

function setDrawer(open: boolean): void {
  drawerOpen = open && aside.childElementCount > 0
  drawer.hidden = !drawerOpen
  if (drawerOpen) band.dataset['drawer'] = 'open'
  else delete band.dataset['drawer']
  paint()
}
/** THE SHEET'S NEXT HEIGHT holds the steps; the lowest holds the line alone */
function setRaised(open: boolean): void {
  raised = open
  sheet.dataset['raised'] = String(raised)
  paint()
  requestAnimationFrame(() => { fitView(); payload?.layout?.(); payload?.relayStepNames() })
}

/* THE LINE'S BOX: on the desktop the six lines take one type, the largest at
   which every one of them stands in two rows of the band; on the phone the
   line hangs from the key row and the sheet grows upward with it, as the
   walk's does, while the plate stands where the tallest line leaves it, so
   the drawing never moves between steps */
const DESK_FITS = ['26', '24', '22'] as const
/** A HEAVY GERMAN LINE AT THE WORD CAP, never shown: twenty words, about the longest tenth of the museum's German, as
 * a final line may run. The read-back fits it as the six are fitted and says how many rows it takes */
const PROOF_LINE = 'DRAFT · Nach Pederséns Modell enthielten Sockel, Mantel und Kern zusammen mehrere Millionen gebrannter Ziegel, gestempelt mit Nebukadnezars Namen und Titeln.'
let fittedFor = ''
/** the phone's tallest line of the nine, in pixels */
let lineMost = 0
function rowsOf(el: HTMLElement): number {
  return Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 30))
}
function fitLine(): void {
  const key = `${form}|${innerWidth}x${innerHeight}|${lang}`
  if (key === fittedFor || !caption.isConnected) return
  const shown = caption.textContent
  caption.style.minHeight = ''
  if (form === 'desk') {
    caption.style.minHeight = '0px'
    for (const fit of DESK_FITS) {
      caption.dataset['fit'] = fit
      if (Object.values(W.band).every(line => { caption.textContent = line; return rowsOf(caption) <= 2 })) break
    }
    caption.style.minHeight = ''
  } else {
    delete caption.dataset['fit']
    lineMost = 0
    for (const line of Object.values(W.band)) { caption.textContent = line; lineMost = Math.max(lineMost, caption.getBoundingClientRect().height) }
  }
  caption.textContent = shown
  fittedFor = key
}

function chromeTop(): number {
  if (form === 'desk') return band.getBoundingClientRect().top
  return sheet.getBoundingClientRect().top - Math.max(0, lineMost - caption.getBoundingClientRect().height)
}
function fitView(): void {
  fitLine()
  const top = chromeTop()
  view.style.top = '0px'
  view.style.height = `${Math.max(120, Math.round(top))}px`
  // the press's stage ends where the chrome begins, as the close view's does over the walk
  setCloseLookBand(form === 'desk' ? Math.max(0, innerHeight - Math.max(120, Math.round(top))) : null)
}

/* THE PRESS'S STAGE: the museum's one stack on the canvas under the look; it draws only while the press shows */
const canvas = $<HTMLCanvasElement>('press')
const stack = await createStack({ canvas })
const idle = new Scene()
stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true)
let payload: ReturnType<typeof createClayLook> | null = null
const host: VitrinePayloadHost = {
  element: view, controls: tools, aside, caption, lang, narrow: phoneForm(),
  get reducedMotion() { return reduced.matches },
  viewport: () => { const r = view.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } },
  work: () => null,
  surface: () => undefined,
  banded: !phoneForm(),
  describe: (text: string) => view.setAttribute('aria-label', text),
  step: (at: number) => { settled = at; paint() },
  rename: (_title: string, _head?: string | null, said?: string | null) => { if (said) certainty = said as Certainty; paint() },
  raise: (open: boolean) => setRaised(open),
  peeked: () => !raised,
}

let closing = false
function open(): void {
  if (payload) return
  look.hidden = false
  look.dataset['open'] = 'false'
  door.hidden = true
  raised = false
  sheet.dataset['raised'] = 'false'
  setDrawer(false)
  seat()
  payload = createClayLook({ lang, stack, signs: signs as unknown as ClaySignFile, photo: q.get('photo'), reducedMotion: reduced.matches })
  fade = { from: 1, to: 0, at: 0 }
  fitView()
  payload.mount(host)
  placePress()
  // the payload's own row now stands in the chrome: the plate ends where the chrome begins
  fitView()
  payload.layout?.()
  // the look itself takes the hand, as a sheet does when it opens: the next Tab is its first control
  ;(form === 'desk' ? band : sheet).focus({ preventScroll: true })
}
async function close(): Promise<void> {
  if (!payload || closing) return
  closing = true
  look.dataset['open'] = 'false'
  await payload.leave()
  // the held frame comes back over the look, then the look leaves under it
  await new Promise<void>(resolve => { fade = { from: 0, to: 1, at: 0 }; fadeDone = resolve })
  payload.unmount()
  payload = null
  stack.setScene(idle, new PerspectiveCamera(), IDENTITY, true)
  delete look.dataset['paper']
  look.hidden = true
  door.hidden = false
  closing = false
  door.focus()
}
function stepBy(by: number): void {
  if (!payload) return
  const goal = Math.round(payload.at()) + by
  if (goal > LAST) { void close(); return }
  if (goal < 0) return
  payload.go(goal, reduced.matches ? 'cut' : 'travel')
}

door.addEventListener('click', open)
room.addEventListener('click', () => { void close() })
back.addEventListener('click', () => { if (raised) setRaised(false); else void close() })
on.addEventListener('click', () => stepBy(1))
gold.addEventListener('click', () => stepBy(1))
prev.addEventListener('click', () => stepBy(-1))
more.addEventListener('click', () => setDrawer(!drawerOpen))
raiseKey.addEventListener('click', () => setRaised(!raised))
// the walk's book opens the walk's own Menu; the bench has none, so the seat stands and answers nothing
book.addEventListener('click', () => document.getElementById('rail-instruments')?.click())
/* a swipe up raises the steps, a swipe down or a tap on the plate lowers them: each has its worded key beside it */
let from: { x: number; y: number } | null = null
sheet.addEventListener('pointerdown', e => { from = { x: e.clientX, y: e.clientY } })
sheet.addEventListener('pointerup', e => {
  const was = from
  from = null
  if (!was || (e.target as Element).closest('.paper-steps')) return
  const dy = e.clientY - was.y, dx = e.clientX - was.x
  if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(dx) * 1.5) return
  if (dy < 0 && !raised) setRaised(true)
  else if (dy > 0 && raised) setRaised(false)
})
view.addEventListener('click', () => { if (raised) setRaised(false) })
addEventListener('keydown', (event) => {
  if (!payload) return
  if (event.key === 'Escape') {
    event.preventDefault()
    // one layer back, exactly one: the drawer or the raised steps first, then the look
    if (drawerOpen) { setDrawer(false); more.focus({ preventScroll: true }); return }
    if (raised) { setRaised(false); raiseKey.focus({ preventScroll: true }); return }
    void close()
    return
  }
  if (payload.key?.(event)) event.preventDefault()
})
addEventListener('resize', () => {
  fittedFor = ''
  rest()
  if (!payload) return
  if ((phoneForm() ? 'phone' : 'desk') !== form) seat()
  fitView(); payload.layout?.()
})
new ResizeObserver(() => {
  if (!payload || closing) return
  const before = view.style.height
  fitView()
  if (view.style.height !== before) payload.layout?.()
}).observe(look)
for (const node of [band, sheet]) new ResizeObserver(() => {
  if (!payload || closing) return
  const before = view.style.height
  fitView()
  if (view.style.height !== before) payload.layout?.()
}).observe(node)

let last = 0
/* THE CROSSFADE: the held frame leaves once the tablet stands, and comes back before the look leaves */
const FADE_S = 0.6
let fade: { from: number; to: number; at: number } | null = null
let fadeDone: (() => void) | null = null
const stageEl = $('stage')
const times: number[] = []
function frame(now: number): void {
  const dt = last ? Math.max(0, Math.min(0.1, (now - last) / 1000)) : 0
  last = now
  if (payload) {
    payload.update?.(dt)
    if (payload.standing() && !closing && look.dataset['open'] !== 'true') look.dataset['open'] = 'true'
    if (payload.drawing() === 'own') { stack.render(dt); times.push(dt * 1000); if (times.length > 900) times.shift() }
    look.dataset['paper'] = String(payload.at() >= 0.999)
  }
  if (fade && (closing || payload?.standing())) {
    fade.at += reduced.matches ? FADE_S : dt
    const u = Math.min(1, fade.at / FADE_S), e = u * u * (3 - 2 * u)
    stageEl.style.opacity = (fade.from + (fade.to - fade.from) * e).toFixed(3)
    if (u >= 1) { const done = fadeDone; fade = null; fadeDone = null; done?.() }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

/* THE CHROME'S NUMBERS, read in the page: the guard's numbers before frames */
type Rect = { x: number; y: number; w: number; h: number }
const rect = (n: Element): Rect => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
/** a control's target, with the hit area its ::after lays round it (the walk's key row and seats do) */
function target(n: HTMLElement): Rect {
  const r = n.getBoundingClientRect(), a = getComputedStyle(n, '::after')
  let { left, top, right, bottom } = r
  if (a.content !== 'none' && a.position === 'absolute') {
    const px = (v: string): number => (v.endsWith('px') ? parseFloat(v) : 0)
    left = Math.min(left, r.left + px(a.left)); top = Math.min(top, r.top + px(a.top))
    right = Math.max(right, r.right - px(a.right)); bottom = Math.max(bottom, r.bottom - px(a.bottom))
  }
  return { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) }
}
const shown = (n: HTMLElement): boolean => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'
function controls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button, input')).filter(n => shown(n) && !n.closest('[hidden]'))
}
function chrome(): Record<string, unknown> {
  const stage = { w: innerWidth, h: innerHeight }
  const plate = rect(view)
  const all = controls().map(n => ({ what: n.id || n.className.split(' ')[0] || n.tagName.toLowerCase(), text: (n.textContent ?? '').trim().slice(0, 30), ...rect(n), cx: Math.round(n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2), cy: Math.round(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2) }))
  const lineBox = caption.getBoundingClientRect()
  const out: Record<string, unknown> = {
    form, stage, plate, plateShare: +(plate.h / stage.h).toFixed(3),
    line: { rows: rowsOf(caption), px: parseFloat(getComputedStyle(caption).fontSize), lead: parseFloat(getComputedStyle(caption).lineHeight), x: Math.round(lineBox.left), w: Math.round(lineBox.width), words: (caption.textContent ?? '').split(/\s+/).filter(w => w && w !== '·').length },
    controls: all, topmost: all.reduce((m, c) => Math.min(m, c.cy), Infinity),
  }
  if (form === 'desk') {
    // where each one's words start, from the line's own start edge: its box less its own padding (the step back's box
    // reaches 2 px out for its focus ring)
    const rtl = dir === 'rtl'
    const xs = [room, deskName, caption, deskFoot].filter(n => n.getClientRects().length > 0).map(n => {
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n)
      return Math.round(rtl ? innerWidth - r.right + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) : r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth))
    })
    out['dir'] = dir
    out['band'] = { ...rect(band), share: +(band.getBoundingClientRect().height / stage.h).toFixed(3) }
    out['measure'] = parseFloat(getComputedStyle(band).getPropertyValue('--desk-clb-read')) || null
    out['wordsX'] = xs
    // gold's distance from the band's end corner: the right one, or the left one on a right-to-left page
    out['gold'] = { ...rect(on), right: Math.round(dir === 'rtl' ? on.getBoundingClientRect().left : stage.w - on.getBoundingClientRect().right), bottom: Math.round(stage.h - on.getBoundingClientRect().bottom) }
    // the heavy German line at the cap, fitted in the band's own box as the six are (from their type down), then the
    // step's line and type put back
    const said = caption.textContent, fitted = caption.dataset['fit'] ?? '26'
    caption.textContent = PROOF_LINE
    let proofFit: string = fitted
    for (const fit of DESK_FITS.slice(DESK_FITS.indexOf(fitted as typeof DESK_FITS[number]))) { proofFit = fit; caption.dataset['fit'] = fit; if (rowsOf(caption) <= 2) break }
    out['proof'] = { words: PROOF_LINE.split(/\s+/).filter(w => w && w !== '·').length, chars: PROOF_LINE.length, rows: rowsOf(caption), fit: proofFit }
    caption.dataset['fit'] = fitted
    caption.textContent = said
  } else {
    out['sheet'] = { ...rect(sheet), share: +(sheet.getBoundingClientRect().height / stage.h).toFixed(3), raised }
    out['reach'] = Math.round(stage.h * 0.4)
    out['seats'] = [back, book, gold].map(n => ({ what: n.className.split(' ')[0], ...rect(n), cx: Math.round(n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2), cy: Math.round(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2) }))
    out['words'] = [phoneName, caption, keys].map(n => Math.round(n.getBoundingClientRect().left + parseFloat(getComputedStyle(n).paddingLeft)))
  }
  return out
}

const rig = {
  ready: false,
  state: () => ({ backend: stack.backend, architecture: stack.architecture, lang, dir, open: Boolean(payload), steps: STEP_IDS.length, form,
    standing: payload?.standing() ?? false, held: +(stageEl.style.opacity || 1) }),
  open,
  close: () => close(),
  /** a step as a still: the slider cut to it */
  go: (step: number) => payload?.go(step, 'cut'),
  /** a point of the slider between steps, for the motion frames */
  at: (t: number) => payload?.go(t, 'cut'),
  /** the phone's sheet one height up (the steps) or down (the line) */
  raise: (up: boolean) => setRaised(up),
  drawer: (up: boolean) => setDrawer(up),
  phase: () => payload?.readout().phase ?? 'rest',
  /** the press's own controls, as a hand presses them; each waits until the wedge is in */
  async press() { payload?.pressOnce(); for (let i = 0; i < 600 && payload?.pressing(); i++) await settle(1); await settle(4) },
  async back() { payload?.back(); await settle(6) },
  play: () => payload?.play(),
  /** hold the presses at a clock in wedges */
  async pose(t: number) { payload?.press.film.pose(t, { playing: false, lit: true }); await settle(30) },
  /** wait until the tablet stands and the held frame has left */
  async standing() { for (let i = 0; i < 900 && !(payload?.standing() && !fade); i++) await settle(1); return payload?.standing() ?? false },
  /** play the presses through from fresh clay and read the frame times (ms): median, 95th, worst */
  async frameTime(seconds: number) {
    payload?.press.film.pose(0, { playing: false, lit: true }); await settle(4)
    payload?.play(); times.length = 0
    await new Promise(r => setTimeout(r, seconds * 1000))
    const sorted = [...times].sort((a, b) => a - b)
    const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
    const pressed = payload?.readout().press.clock ?? 0
    payload?.press.film.pose(0, { playing: false, lit: true })
    return { frames: sorted.length, median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] ?? 0, pressed }
  },
  readout: () => payload?.readout() ?? null,
  chrome,
  /** every box the page shows, for the 44 px check: the target as the hand meets it */
  targets: () => controls().map(n => { const t = target(n); return { what: n.id || n.className, w: t.w, h: t.h, text: (n.textContent ?? '').trim().slice(0, 30) } }),
}
;(window as unknown as { __claylook: typeof rig }).__claylook = rig
async function settle(frames: number): Promise<void> { for (let i = 0; i < frames; i++) await new Promise(r => requestAnimationFrame(r)) }

rest()
door.hidden = false
await document.fonts.ready
if (q.get('open') === '1') {
  open()
  await rig.standing()
  if (q.has('t')) await rig.pose(Number(q.get('t')))
  const s = Number(q.get('step') ?? 0); if (s) payload!.go(s, 'cut')
}
const waitFor = (img: HTMLImageElement): Promise<void> => (img.hidden || img.complete ? Promise.resolve() : new Promise(r => { img.onload = () => r(); img.onerror = () => r() }))
await waitFor(held)
says.textContent = `ready: ${lang} ${dir}, held ${held.hidden ? 'none' : 'shown'}`
rig.ready = true
