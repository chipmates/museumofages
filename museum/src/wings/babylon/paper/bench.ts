/* A STOP'S PAPER BENCH: a stop's held frame, its doors (one press per paper
   feature, together where the frozen designs put the one control), and the
   feature opening over the frame and closing onto it inside the walk's own
   chrome, as feature 7's bench stands it (`measure/measure-bench.ts`, kept as
   it is): on a desktop the close look's band, on a phone the walk's graded
   box with the line alone on its lowest height and the steps one height up.

   The walk's tokens and style sheets are read, never changed; nothing here
   writes a colour. A dev page: the window around the feature stands in for the
   vitrine's own. Addresses:

     ?held=<url with {framing}>  the stop's held frame (framing: desktop or phone); ?ink= its ink still, the same way
     ?lang=de  ?open=1  ?feature=<id>  ?step=<n>  ?rig=1 (the harness's marker, never shown otherwise)

   The rig `window.__look` opens, steps, raises, closes and reads back. */

import css from './bench.css?inline'
import deskCss from '../../desk-chrome.css?inline'
import closeLookCss from '../../desk-closelook.css?inline'
import filmCss from '../../vinci/film-wing.css?inline'
import walkPage from '../../../../index.html?raw'
import { paperStyle } from './tokens'
import { grainTile } from './marks'
import type { VitrinePayloadHost } from '../../vitrine/types'
import type { PaperFeaturePayload } from './feature'

/** THE WALK'S OWN CONTROL WORDS, as its cards and lobby carry them */
const UI = {
  en: { next: 'Next', stepOf: (n: number, of: number) => `step ${n} of ${of}`, raise: 'All steps', lower: 'Close', book: 'Menu', more: 'Read more' },
  de: { next: 'Weiter', stepOf: (n: number, of: number) => `Schritt ${n} von ${of}`, raise: 'Alle Schritte', lower: 'Schließen', book: 'Menü', more: 'Mehr lesen' },
} as const

export interface BenchFeature {
  id: string
  /** the door's words, the look's title and its way back to the stop */
  door: string
  title: string
  close: string
  make(o: { lang: 'en' | 'de'; reducedMotion: boolean; still(key: 'held' | 'ink'): { wide: string; upright: string } | null }): PaperFeaturePayload
}

/** THE DOOR'S HOOK in the stop's plan: where the group of presses stands at rest */
export interface DoorHook { features: string[]; wide: { right: number; bottom: number }; upright: { middle: boolean; bottom: number } }

/** the certainty mark's paint: its fill, or its stroke where the mark is an open ring */
function paintOf(host: Element): string {
  const m = host.querySelector('.desk-mark :is(circle, path)')
  if (!m) return getComputedStyle(host).color
  const cs = getComputedStyle(m)
  return cs.fill !== 'none' ? cs.fill : cs.stroke
}

export function createPaperBench(o: { lang: 'en' | 'de'; features: BenchFeature[]; first: string; hook: DoorHook }): void {
  const q = new URLSearchParams(location.search)
  const lang = o.lang
  const U = UI[lang]
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
  const says = $('says')
  says.hidden = q.get('rig') !== '1'
  document.documentElement.lang = lang

  /* the walk's tokens, read from the museum's own page: its root block and the wing's mapping of the shell's names */
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
  if (tokens.some((t) => !t)) console.warn('the walk\'s tokens were not found in its page')
  const style = document.createElement('style')
  style.textContent = [...tokens, deskCss, closeLookCss, filmCss, css].join('\n')
  document.head.append(style)
  document.documentElement.setAttribute('style', `${paperStyle()}; --paper-grain: ${grainTile()}`)

  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const upright = (): boolean => innerHeight > innerWidth * 1.05
  /** the phone's form below this width, as feature 7's bench draws it */
  const PHONE_MOST = 700
  const phoneForm = (): boolean => innerWidth <= PHONE_MOST
  const stillAt = (key: 'held'): string | null => { const at = q.get(key); return at ? at.replace('{framing}', upright() ? 'phone' : 'desktop') : null }
  const stillBoth = (key: 'held' | 'ink'): { wide: string; upright: string } | null => {
    const at = q.get(key)
    return at ? { wide: at.replace('{framing}', 'desktop'), upright: at.replace('{framing}', 'phone') } : null
  }

  /* THE STOP AT REST: its held frame and the doors, one group where the stop's plan puts the one control */
  const held = $<HTMLImageElement>('held')
  const doors = $('doors')
  doors.setAttribute('role', 'group')
  const byId = new Map(o.features.map((f) => [f.id, f]))
  const order = o.hook.features.filter((id) => byId.has(id))
  const doorOf = new Map<string, HTMLButtonElement>()
  for (const id of order) {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'look-door'; b.dataset['feature'] = id
    b.textContent = byId.get(id)!.door
    b.addEventListener('click', () => open(id))
    doors.append(b); doorOf.set(id, b)
  }
  function rest(): void {
    const src = stillAt('held')
    if (src && held.getAttribute('src') !== src) held.src = src
    held.hidden = !src
    const d = o.hook
    doors.dataset['form'] = upright() ? 'upright' : 'wide'
    if (upright()) {
      doors.style.left = '16px'; doors.style.right = '16px'
      doors.style.bottom = `${Math.round(d.upright.bottom * innerHeight)}px`
    } else {
      doors.style.left = ''
      doors.style.right = `${Math.round(d.wide.right * innerWidth)}px`
      doors.style.bottom = `${Math.round(d.wide.bottom * innerHeight)}px`
    }
  }

  /* ---- the walk's chrome, built with its own classes ---- */
  const SVG = 'http://www.w3.org/2000/svg'
  const STEP_BACK = 'M10 3L5 8l5 5', ARROW_BACK = 'M13 8H3M7 4L3 8l4 4', ARROW_ON = 'M3 8h10M9 4l4 4-4 4', ARROW_UP = 'M8 13V3M4 7l4-4 4 4'
  const ARROW_DOWN = 'M8 3v10M4 9l4 4 4-4', MENU = 'M3 3.5h10M3 8h10M3 12.5h10'
  function icon(path: string, cls: string): SVGSVGElement {
    const s = document.createElementNS(SVG, 'svg')
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true')
    const line = document.createElementNS(SVG, 'path')
    line.setAttribute('d', path)
    s.append(line)
    return s
  }
  function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n
  }
  function button(cls: string, label?: string): HTMLButtonElement {
    const b = make('button', cls); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b
  }
  type Certainty = 'documented' | 'reconstructed' | 'conjectural' | 'unknown'
  /** the walk's certainty mark (`deskMark`): a full disc, a half disc, an open ring, a broken ring; drawn in the band's text tone */
  function mark(certainty: Certainty): SVGSVGElement {
    const s = document.createElementNS(SVG, 'svg')
    s.setAttribute('viewBox', '0 0 18 18'); s.setAttribute('class', 'desk-mark look-mark'); s.setAttribute('aria-hidden', 'true')
    s.dataset['certainty'] = certainty
    const ring = document.createElementNS(SVG, 'circle')
    ring.setAttribute('cx', '9'); ring.setAttribute('cy', '9')
    if (certainty === 'documented') { ring.setAttribute('r', '6.2'); ring.setAttribute('class', 'desk-mark-full') }
    else if (certainty === 'reconstructed') {
      ring.setAttribute('r', '6.2'); ring.setAttribute('class', 'desk-mark-ring')
      const half = document.createElementNS(SVG, 'path')
      half.setAttribute('d', 'M9 2.8a6.2 6.2 0 0 0 0 12.4z'); half.setAttribute('class', 'desk-mark-half')
      s.append(ring, half)
      return s
    } else { ring.setAttribute('r', '5.8'); ring.setAttribute('class', certainty === 'unknown' ? 'desk-mark-broken' : 'desk-mark-open') }
    s.append(ring)
    return s
  }

  const wing = $('wing'), look = $('look'), view = $('view')
  wing.dataset['desk'] = 'type14 words ways stage closelook'
  wing.dataset['film'] = 'upright'

  const caption = make('p', '')
  caption.setAttribute('aria-live', 'polite')
  const tools = make('div', 'look-tools')
  const aside = make('div', 'look-aside')

  /* THE DESKTOP: the close look's band */
  const band = make('div', 'desk-clb')
  band.tabIndex = -1
  band.setAttribute('role', 'group')
  const room = button('desk-clb-step')
  const roomWords = document.createTextNode('')
  room.append(icon(STEP_BACK, 'desk-ic'), roomWords)
  const deskName = make('div', 'desk-name')
  const deskTitle = make('span', 'desk-chapter')
  const deskClock = make('span', 'desk-clock')
  const deskCap = make('div', 'desk-clb-cap')
  const drawer = make('div', 'desk-clb-drawer')
  drawer.id = 'look-drawer'
  drawer.hidden = true
  drawer.setAttribute('role', 'region')
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
  sheet.dataset['look'] = 'true'
  const phoneName = make('div', 'film-name')
  const phoneTitle = make('span', 'film-chapter')
  const phoneClock = make('span', 'film-clock')
  const phoneSteps = make('div', 'look-sheet-steps')
  const keys = make('div', 'film-keys')
  const raiseKey = button('film-key film-more')
  raiseKey.setAttribute('aria-expanded', 'false')
  keys.append(raiseKey)
  const foot = make('div', 'film-foot')
  const back = button('film-down')
  back.append(icon(ARROW_DOWN, 'film-ic'))
  const book = button('film-book', U.book)
  book.append(icon(MENU, 'film-ic film-ic-menu'))
  const gold = button('film-gold')
  const goldName = make('span', 'film-gold-name')
  const goldArrow = make('span', 'film-gold-arrow')
  gold.append(goldName, goldArrow)
  foot.append(back, book, gold)
  sheet.append(phoneName, phoneSteps, keys, foot)
  look.append(band, sheet)

  let current: BenchFeature = byId.get(o.first) ?? o.features[0]!
  let form: 'desk' | 'phone' = phoneForm() ? 'phone' : 'desk'
  let raised = false
  let drawerOpen = false
  let certainty: Certainty = 'unknown'
  let settled = 0

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
    paint()
  }

  /** the name row, the clock, the ways and the keys, for the step the slider settled on */
  function paint(): void {
    const n = settled
    const names = payload?.names() ?? []
    const lastStep = Math.max(0, names.length - 1)
    deskTitle.textContent = phoneTitle.textContent = current.title
    roomWords.textContent = current.close
    band.setAttribute('aria-label', current.title); sheet.setAttribute('aria-label', current.title); drawer.setAttribute('aria-label', current.title)
    for (const row of [deskName, phoneName]) row.replaceChildren(mark(certainty), row === deskName ? deskTitle : phoneTitle, row === deskName ? deskClock : phoneClock)
    deskClock.textContent = phoneClock.textContent = U.stepOf(n + 1, lastStep + 1)
    const to = n < lastStep ? names[n + 1]! : null
    // gold names the next step; at the last it leads back to the stop, the way the walk goes on
    onKicker.textContent = to ? U.next : current.close
    onTitle.textContent = to ?? ''
    onTitle.hidden = !to
    onArrow.replaceChildren(icon(to ? ARROW_ON : ARROW_UP, 'desk-ic'))
    on.setAttribute('aria-label', to ? `${U.next} · ${to}` : current.close)
    prev.disabled = n === 0
    prev.setAttribute('aria-label', n > 0 ? names[n - 1]! : (names[0] ?? ''))
    goldName.textContent = to ?? current.close
    goldArrow.replaceChildren(icon(to ? ARROW_ON : ARROW_UP, 'film-ic'))
    gold.setAttribute('aria-label', to ? `${U.next} · ${to}` : current.close)
    gold.dataset['end'] = String(!to)
    more.replaceChildren(document.createTextNode(drawerOpen ? U.lower : U.more))
    if (drawerOpen) more.append(make('span', 'desk-key', 'Esc'))
    more.setAttribute('aria-expanded', String(drawerOpen))
    raiseKey.replaceChildren(document.createTextNode(raised ? U.lower : U.raise), icon(raised ? ARROW_DOWN : ARROW_UP, 'film-ic'))
    raiseKey.setAttribute('aria-expanded', String(raised))
    back.setAttribute('aria-label', raised ? U.lower : current.close)
  }

  function setDrawer(open: boolean): void {
    drawerOpen = open && aside.childElementCount > 0
    drawer.hidden = !drawerOpen
    if (drawerOpen) band.dataset['drawer'] = 'open'
    else delete band.dataset['drawer']
    paint()
  }
  function setRaised(open: boolean): void {
    raised = open
    sheet.dataset['raised'] = String(raised)
    paint()
    requestAnimationFrame(() => { fitView(); payload?.layout?.(); payload?.relayStepNames() })
  }

  /* THE LINE'S BOX: on the desktop the lines take one type, the largest at which every one stands in two rows of the
     band; on the phone the plate stands where the tallest line leaves it, so the drawing never moves between steps */
  const DESK_FITS = ['26', '24', '22'] as const
  let fittedFor = ''
  let lineMost = 0
  function rowsOf(el: HTMLElement): number {
    return Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 30))
  }
  function fitLine(): void {
    const key = `${current.id}|${form}|${innerWidth}x${innerHeight}|${lang}`
    if (key === fittedFor || !caption.isConnected || !payload) return
    const shown = caption.textContent
    const lines = payload.lines()
    caption.style.minHeight = ''
    if (form === 'desk') {
      caption.style.minHeight = '0px'
      for (const fit of DESK_FITS) {
        caption.dataset['fit'] = fit
        if (lines.every((l) => { caption.textContent = l; return rowsOf(caption) <= 2 })) break
      }
      caption.style.minHeight = ''
    } else {
      delete caption.dataset['fit']
      lineMost = 0
      for (const l of lines) { caption.textContent = l; lineMost = Math.max(lineMost, caption.getBoundingClientRect().height) }
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
  }

  let payload: PaperFeaturePayload | null = null
  const host: VitrinePayloadHost = {
    element: view, controls: tools, aside, caption, lang, narrow: phoneForm(),
    get reducedMotion() { return reduced.matches },
    viewport: () => { const r = view.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } },
    work: () => null,
    surface: () => undefined,
    describe: (text: string) => view.setAttribute('aria-label', text),
    step: (at: number) => { settled = at; paint() },
    rename: (_title: string, _head?: string | null, said?: string | null) => { if (said) certainty = said as Certainty; paint() },
    raise: (open: boolean) => setRaised(open),
    peeked: () => !raised,
  }

  let closing = false
  function open(id: string = current.id): void {
    if (payload) return
    current = byId.get(id) ?? current
    look.hidden = false
    look.dataset['open'] = 'false'
    doors.hidden = true
    raised = false
    sheet.dataset['raised'] = 'false'
    settled = 0
    fittedFor = ''
    payload = current.make({ lang, reducedMotion: reduced.matches, still: stillBoth })
    seat()
    setDrawer(false)
    fitView()
    payload.mount(host)
    fitView()
    payload.layout?.()
    ;(form === 'desk' ? band : sheet).focus({ preventScroll: true })
  }
  async function close(): Promise<void> {
    if (!payload || closing) return
    closing = true
    look.dataset['open'] = 'false'
    await payload.leave()
    payload.unmount()
    payload = null
    look.hidden = true
    doors.hidden = false
    closing = false
    doorOf.get(current.id)?.focus()
  }
  function stepBy(by: number): void {
    if (!payload) return
    const goal = Math.round(payload.at()) + by
    if (goal > payload.names().length - 1) { void close(); return }
    if (goal < 0) return
    payload.go(goal, reduced.matches ? 'cut' : 'travel')
  }

  room.addEventListener('click', () => { void close() })
  back.addEventListener('click', () => { if (raised) setRaised(false); else void close() })
  on.addEventListener('click', () => stepBy(1))
  gold.addEventListener('click', () => stepBy(1))
  prev.addEventListener('click', () => stepBy(-1))
  more.addEventListener('click', () => setDrawer(!drawerOpen))
  raiseKey.addEventListener('click', () => setRaised(!raised))
  book.addEventListener('click', () => document.getElementById('rail-instruments')?.click())
  /* a swipe up raises the steps, a swipe down or a tap on the plate lowers them: each has its worded key beside it */
  let from: { x: number; y: number } | null = null
  sheet.addEventListener('pointerdown', (e) => { from = { x: e.clientX, y: e.clientY } })
  sheet.addEventListener('pointerup', (e) => {
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
  for (const n of [look, band, sheet]) new ResizeObserver(() => {
    if (!payload || closing) return
    const before = view.style.height
    fitView()
    if (view.style.height !== before) payload.layout?.()
  }).observe(n)

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

  /* THE CHROME'S NUMBERS, read in the page: the guard's numbers before frames */
  type Rect = { x: number; y: number; w: number; h: number }
  const rect = (n: Element): Rect => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  function target(n: HTMLElement): Rect {
    const r = n.getBoundingClientRect(), a = getComputedStyle(n, '::after')
    let { left: l, top: t, right: rr, bottom: b } = r
    if (a.content !== 'none' && a.position === 'absolute') {
      const px = (v: string): number => (v.endsWith('px') ? parseFloat(v) : 0)
      l = Math.min(l, r.left + px(a.left)); t = Math.min(t, r.top + px(a.top))
      rr = Math.max(rr, r.right - px(a.right)); b = Math.max(b, r.bottom - px(a.bottom))
    }
    return { x: Math.round(l), y: Math.round(t), w: Math.round(rr - l), h: Math.round(b - t) }
  }
  const shown = (n: HTMLElement): boolean => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'
  const controls = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('button, input')).filter((n) => shown(n) && !n.closest('[hidden]'))
  function chrome(): Record<string, unknown> {
    const stage = { w: innerWidth, h: innerHeight }
    const plate = rect(view)
    const all = controls().map((n) => { const r = n.getBoundingClientRect(); return { what: n.id || n.className.split(' ')[0] || n.tagName.toLowerCase(), text: (n.textContent ?? '').trim().slice(0, 30), ...rect(n), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) } })
    const lineBox = caption.getBoundingClientRect()
    const out: Record<string, unknown> = {
      form, stage, plate, plateShare: +(plate.h / stage.h).toFixed(3),
      line: { rows: rowsOf(caption), px: parseFloat(getComputedStyle(caption).fontSize), lead: parseFloat(getComputedStyle(caption).lineHeight), x: Math.round(lineBox.left), w: Math.round(lineBox.width), words: (caption.textContent ?? '').split(/\s+/).filter((w) => w && w !== '·').length, chars: (caption.textContent ?? '').length },
      controls: all, topmost: all.reduce((m, c) => Math.min(m, c.cy), Infinity),
      mark: { certainty, colour: paintOf(deskName), phoneColour: paintOf(phoneName) },
    }
    if (form === 'desk') {
      const xs = [room, deskName, caption, deskFoot].filter((n) => n.getClientRects().length > 0).map((n) => {
        const r = n.getBoundingClientRect(), cs = getComputedStyle(n)
        return Math.round(r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth))
      })
      out['band'] = { ...rect(band), share: +(band.getBoundingClientRect().height / stage.h).toFixed(3) }
      out['measure'] = parseFloat(getComputedStyle(band).getPropertyValue('--desk-clb-read')) || null
      out['wordsX'] = xs
      out['gold'] = { ...rect(on), right: Math.round(stage.w - on.getBoundingClientRect().right), bottom: Math.round(stage.h - on.getBoundingClientRect().bottom) }
    } else {
      out['sheet'] = { ...rect(sheet), share: +(sheet.getBoundingClientRect().height / stage.h).toFixed(3), raised }
      out['reach'] = Math.round(stage.h * 0.4)
      out['seats'] = [back, book, gold].map((n) => { const r = n.getBoundingClientRect(); return { what: n.className.split(' ')[0], ...rect(n), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) } })
      out['words'] = [phoneName, caption, keys].map((n) => Math.round(n.getBoundingClientRect().left + parseFloat(getComputedStyle(n).paddingLeft)))
    }
    return out
  }
  /** the doors at rest: each one's box, the group's box, and the picture's share left free */
  function rested(): Record<string, unknown> {
    const stage = { w: innerWidth, h: innerHeight }
    const each = Array.from(doorOf.values()).map((b) => ({ feature: b.dataset['feature'], text: b.textContent, ...rect(b), cy: Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2) }))
    const g = rect(doors)
    const area = each.reduce((s, d) => s + d.w * d.h, 0)
    return { form: upright() ? 'upright' : 'wide', stage, doors: each, group: g, pictureShare: +(1 - area / (stage.w * stage.h)).toFixed(4), reach: Math.round(stage.h * 0.4) }
  }

  const rig = {
    ready: false,
    state: () => ({ backend: 'dom', architecture: 'svg', lang, dir: 'ltr', open: Boolean(payload), feature: current.id, features: order, steps: payload?.names().length ?? 0, form }),
    open: (id?: string) => open(id),
    close: () => close(),
    go: (step: number) => payload?.go(step, 'cut'),
    at: (t: number) => payload?.go(t, 'cut'),
    raise: (up: boolean) => setRaised(up),
    drawer: (up: boolean) => setDrawer(up),
    phase: () => payload?.readout().phase ?? 'rest',
    readout: () => payload?.readout() ?? null,
    chrome,
    rest: rested,
    targets: () => controls().map((n) => { const t = target(n); return { what: n.id || n.className, w: t.w, h: t.h, text: (n.textContent ?? '').trim().slice(0, 30) } }),
  }
  ;(window as unknown as { __look: typeof rig }).__look = rig

  rest()
  doors.hidden = false
  void (async () => {
    await document.fonts.ready
    if (q.get('open') === '1') { open(q.get('feature') ?? o.first); const s = Number(q.get('step') ?? 0); if (s) payload!.go(s, 'cut') }
    if (!held.hidden && !held.complete) await new Promise<void>((r) => { held.onload = () => r(); held.onerror = () => r() })
    says.textContent = `ready: ${lang}, held ${held.hidden ? 'none' : 'shown'}`
    rig.ready = true
  })()
}
