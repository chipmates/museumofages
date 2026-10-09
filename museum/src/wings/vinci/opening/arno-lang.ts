/* THE CARD'S LANGUAGE LINE. One quiet row over the card's sentence, at the
   words' own x: the language the card is read in, by its own name. Pressed,
   it opens the list of every language the build publishes, each by its own
   name and in its own `lang`, the one being read marked.

   · A CHOICE IS AN ADDRESS. Each language links the address the visitor
     stands at with its `lang` set, as the panel's row loads it, so the page
     comes back in that language and the visitor stands on the card again.
   · A CHOICE IS KEPT ON THE DEVICE (browser-lang.ts), so a later visit by
     an address that names no language opens in it.
   · THE LIST IS LAID OVER THE CARD, never in its flow, and never on the
     gold way in. It takes a place that covers no words where the glass has
     one (over the night above the desktop's band, over the drawing on a
     phone), in two columns where one is too tall. On a long upright card no
     such place is left: there it covers the words' whole column down to the
     gold, so no word stands cut beside or under it.
   · ESCAPE IS THE CARD'S. A modal answers Escape itself, so the card folds
     the list through `close()` before it reads Escape as its way in. */

import { pageLang, say, type PageLang } from '../../content'
import { keepLanguage } from '../../browser-lang'
import { OWN_NAMES, publishedLangs } from '../../languages'
import { LOBBY_TEXT } from '../../../content/lobby'

/** What the list is placed by: the card's form and its parts as they stand. */
export interface ArnoGround {
  form(): 'desk' | 'upright' | 'cinema'
  /** the drawing's sheet, the band of words, the sentence and the gold way in */
  readonly sheet: HTMLElement
  readonly band: HTMLElement
  readonly line: HTMLElement
  readonly start: HTMLElement
}

export interface ArnoLanguages {
  /** the row: the control and its list */
  readonly row: HTMLElement
  /** folds the list and hands the focus back to its control; whether it stood open */
  close(): boolean
}

const SVG = 'http://www.w3.org/2000/svg'
const CHEVRON_DOWN = 'M4 6l4 4 4-4'
const CHECK = 'M3.5 8.5l3 3L12.5 5'
/** the control's words stand this far inside its target (arno-card.css) */
const INSET = 12
/** the list's air to those words, to the gold way in and to the glass's edge */
const NEAR = 8
const EDGE = 8
/** the phone's list starts on the drawing's edge, this far left of the words; its names keep their place */
const OUTSET = 4

function mark(document_: Document, path: string, cls: string): SVGSVGElement {
  const svg = document_.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  const line = document_.createElementNS(SVG, 'path')
  line.setAttribute('d', path)
  svg.append(line)
  return svg
}

/** The row for a card; nothing where the build publishes no second language. */
export function createArnoLanguages(document_: Document, signal: AbortSignal, ground: ArnoGround): ArnoLanguages | undefined {
  const here = pageLang()
  const published = publishedLangs(import.meta.env['VITE_NA_LANGS'])
  // the page's own language stands in the list even where the build does not name it
  const codes: readonly PageLang[] = published.includes(here) ? published : [...published, here]
  if (codes.length < 2) return undefined
  const view = document_.defaultView ?? window
  const word = say(LOBBY_TEXT.language)

  const row = document_.createElement('div')
  row.className = 'arno-lang-row'
  const control = document_.createElement('button')
  control.type = 'button'
  control.className = 'arno-lang'
  control.setAttribute('aria-expanded', 'false')
  control.setAttribute('aria-controls', 'arno-card-languages')
  // the name a visitor sees stays inside the name a screen reader says
  control.setAttribute('aria-label', `${word}: ${OWN_NAMES[here]}`)
  const name = document_.createElement('span')
  name.className = 'arno-lang-name'
  name.lang = here
  name.textContent = OWN_NAMES[here]
  // the words and their mark in one box: the focus is drawn round them, not round the 44 px target
  const face = document_.createElement('span')
  face.className = 'arno-lang-face'
  face.append(name, mark(document_, CHEVRON_DOWN, 'arno-lang-mark'))
  control.append(face)

  const list = document_.createElement('ul')
  list.className = 'arno-lang-list'
  list.id = 'arno-card-languages'
  list.setAttribute('aria-label', word)
  list.hidden = true
  const links = codes.map(code => {
    const link = document_.createElement('a')
    link.dataset['language'] = code
    link.lang = code
    link.hreflang = code
    link.textContent = OWN_NAMES[code]
    if (code === here) {
      link.setAttribute('aria-current', 'true')
      link.append(mark(document_, CHECK, 'arno-lang-here'))
    }
    // another language is kept and the link goes there; the one being read is no journey: its press folds the list
    link.addEventListener('click', event => {
      if (code !== here) { keepLanguage(code); return }
      event.preventDefault()
      close()
    })
    const item = document_.createElement('li')
    item.append(link)
    list.append(item)
    return link
  })
  row.append(control, list)

  /** each language at the address the visitor stands at now */
  function address(): void {
    for (const link of links) {
      const at = new URL(view.location.href)
      at.searchParams.set('lang', link.dataset['language']!)
      link.href = at.href
    }
  }
  /** the list's own height in one column or in two */
  function tall(columns: 1 | 2): number {
    if (columns === 2) list.dataset['columns'] = '2'
    else delete list.dataset['columns']
    return list.offsetHeight
  }
  function place(): void {
    const at = control.getBoundingClientRect()
    const glass = { w: view.innerWidth, h: view.innerHeight }
    const form = ground.form()
    for (const name of ['width', 'height', 'max-height', '--arno-lang-inset']) list.style.removeProperty(name)
    let left = at.left, top = EDGE, where = 'over'
    if (form === 'desk') {
      // over the night above the band, its foot on the band's hairline
      const foot = ground.band.getBoundingClientRect().top + 1
      list.style.maxHeight = `${Math.floor(foot - EDGE)}px`
      top = foot - tall(1)
    } else if (form === 'cinema') {
      // over the drawing's side from its top corner, clear of the words' column, as tall as the glass allows
      const sheet = ground.sheet.getBoundingClientRect()
      list.style.maxHeight = `${glass.h - EDGE * 2}px`
      const one = tall(1)
      left = sheet.right - list.offsetWidth
      top = Math.min(glass.h - EDGE - one, sheet.top)
      where = 'beside'
    } else {
      const words = at.top + INSET
      const over = words - NEAR - EDGE
      const sentence = ground.line.getBoundingClientRect().top
      const under = ground.start.getBoundingClientRect().top - NEAR - sentence
      left = at.left - OUTSET
      list.style.setProperty('--arno-lang-inset', `${16 + OUTSET}px`)
      const whole = `${Math.round(glass.w - left * 2)}px`
      const one = tall(1)
      if (one <= over) top = words - NEAR - one
      else {
        // every other place spans the glass from the drawing's one edge to the other
        list.style.width = whole
        const two = tall(2)
        if (two <= over) top = words - NEAR - two
        else if (Math.min(one, two) <= under) {
          // no room over the words: their whole column down to the gold, so nothing stands cut
          tall(one <= under ? 1 : 2)
          list.style.height = `${Math.floor(under)}px`
          top = sentence
          where = 'under'
        } else {
          // a glass too short for either: over the words, as tall as the room is
          list.style.maxHeight = `${Math.floor(over)}px`
          top = words - NEAR - tall(1)
          where = 'fitted'
        }
      }
    }
    list.dataset['where'] = where
    list.style.left = `${Math.round(Math.max(EDGE, Math.min(glass.w - EDGE - list.offsetWidth, left)))}px`
    list.style.top = `${Math.round(Math.max(EDGE, top))}px`
  }
  function open(): void {
    address()
    list.hidden = false
    control.setAttribute('aria-expanded', 'true')
    place()
    const here = links.find(link => link.hasAttribute('aria-current')) ?? links[0]
    here?.focus({ preventScroll: true })
    // a list cut to the glass shows the language being read
    if (here && list.scrollHeight > list.clientHeight) list.scrollTop = here.offsetTop - (list.clientHeight - here.offsetHeight) / 2
  }
  function fold(): boolean {
    if (list.hidden) return false
    list.hidden = true
    control.setAttribute('aria-expanded', 'false')
    return true
  }
  function close(): boolean {
    const stood = fold()
    if (stood) control.focus({ preventScroll: true })
    return stood
  }

  control.addEventListener('click', () => { if (list.hidden) open(); else close() })
  list.addEventListener('keydown', event => {
    const at = links.indexOf(document_.activeElement as HTMLAnchorElement)
    const to = event.key === 'ArrowDown' ? (at + 1) % links.length
      : event.key === 'ArrowUp' ? (Math.max(at, 0) + links.length - 1) % links.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : -1
    if (to < 0) return
    event.preventDefault()
    links[to]?.focus({ preventScroll: true })
  })
  control.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' || !list.hidden) return
    event.preventDefault()
    open()
  })
  /* the focus walking on, or a press anywhere else, folds the list where it
     stands. A focus that goes nowhere folds nothing: a browser that gives a
     pressed link no focus would fold the list under the press. Nowhere is
     no next focus at all, or what the row stands in: Safari hands a pressed
     link's focus to the card. */
  row.addEventListener('focusout', event => {
    const next = event.relatedTarget
    if (next instanceof Node && !row.contains(next) && !next.contains(row)) fold()
  })
  document_.addEventListener('pointerdown', event => {
    if (!list.hidden && event.target instanceof Node && !row.contains(event.target)) fold()
  }, { capture: true, signal })
  view.addEventListener('resize', () => { fold() }, { signal })

  return { row, close }
}
