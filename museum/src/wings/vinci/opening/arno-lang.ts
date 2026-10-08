/* THE CARD'S LANGUAGE LINE. One quiet row over the card's sentence, at the
   words' own x: the language the card is read in, by its own name. Pressed,
   it opens the list of every language the build publishes, each by its own
   name and in its own `lang`, the one being read marked.

   · A CHOICE IS AN ADDRESS. Each language links the address the visitor
     stands at with its `lang` set, as the panel's row loads it, so the page
     comes back in that language and the visitor stands on the card again.
   · NOTHING IS KEPT ON THE DEVICE.
   · THE LIST IS LAID OVER THE CARD, never in its flow: above the line where
     the glass has the room, under it otherwise, beside it on a short glass.
   · ESCAPE IS THE CARD'S. A modal answers Escape itself, so the card folds
     the list through `close()` before it reads Escape as its way in. */

import { pageLang, say, type PageLang } from '../../content'
import { OWN_NAMES, publishedLangs } from '../../languages'
import { LOBBY_TEXT } from '../../../content/lobby'

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
/** the list's air to those words and to the glass's edge */
const NEAR = 8
const EDGE = 8

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
export function createArnoLanguages(document_: Document, signal: AbortSignal): ArnoLanguages | undefined {
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
    // the language being read is no journey: its press folds the list
    link.addEventListener('click', event => {
      if (code !== here) return
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
  function place(): void {
    const at = control.getBoundingClientRect()
    const wide = view.innerWidth, tall = view.innerHeight
    const w = list.offsetWidth, h = list.offsetHeight
    const within = (value: number, most: number): number => Math.max(EDGE, Math.min(most - EDGE, value))
    let left = within(at.left, wide - w), top = at.top + INSET - NEAR - h
    if (top < EDGE) top = at.bottom - INSET + NEAR
    if (top + h > tall - EDGE) {
      // a short glass: beside the control, on the side with the room
      top = within(at.top, tall - h)
      if (at.left - NEAR - w >= EDGE) left = at.left - NEAR - w
      else if (at.right - INSET + NEAR + w <= wide - EDGE) left = at.right - INSET + NEAR
    }
    list.style.left = `${Math.round(left)}px`
    list.style.top = `${Math.round(top)}px`
  }
  function open(): void {
    address()
    list.hidden = false
    control.setAttribute('aria-expanded', 'true')
    place()
    ;(links.find(link => link.hasAttribute('aria-current')) ?? links[0])?.focus({ preventScroll: true })
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
     pressed link no focus would fold the list under the press. */
  row.addEventListener('focusout', event => {
    const next = event.relatedTarget
    if (next instanceof Node && !row.contains(next)) fold()
  })
  document_.addEventListener('pointerdown', event => {
    if (!list.hidden && event.target instanceof Node && !row.contains(event.target)) fold()
  }, { capture: true, signal })
  view.addEventListener('resize', () => { fold() }, { signal })

  return { row, close }
}
