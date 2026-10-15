/* THE LANGUAGE ROW of the museum's panel, once a build publishes more than
   English and German or the page reads another language. One row names the
   language the page is read in, by its own name; pressed, it opens the list
   of every language under it, each by its own name and in its own `lang`,
   the one being read marked (the welcome card's row is the model,
   vinci/opening/arno-lang.ts). The panel's other rows keep their height, so
   the wing's rows over it and the plan stand where they can be seen.

   · A CHOICE IS AN ADDRESS: each language links the address the visitor
     stands at with its `lang` set (the address keeps its `#s=`), and is kept
     on the device, so a later visit that names no language opens in it.
   · THE PAGE'S OWN LANGUAGE stands in the list even where the build does not
     list it, so a visitor sees what they are reading. While no person has
     read the page's words, the long note stands under the row.
   · ESCAPE FOLDS THE LIST before it closes the panel: one level at a time.

   Loaded only for such a page: a build of English and German alone keeps the
   panel's two-letter switch and never fetches this file. */

import { pageLang, say, sayNamed, tagged, type PageLang } from './content'
import { keepLanguage } from './browser-lang'
import { OWN_NAMES } from './languages'
import { LOBBY_TEXT } from '../content/lobby'
import './lang-row.css'

const SVG = 'http://www.w3.org/2000/svg'
const CHEVRON_DOWN = 'M4 6l4 4 4-4'
const CHECK = 'M3.5 8.5l3 3L12.5 5'

function mark(path: string, cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS(SVG, 'path')
  line.setAttribute('d', path)
  svg.append(line)
  return svg
}

/** the address the visitor stands at, in another language */
function addressIn(code: PageLang): string {
  const at = new URL(location.href)
  at.searchParams.set('lang', code)
  return at.href
}

export function paintLanguageRow(setting: HTMLFieldSetElement, published: readonly PageLang[]): void {
  const options = setting.querySelector<HTMLElement>('.inst-options')
  if (!options) return
  const here = pageLang()
  const codes = published.includes(here) ? published : [...published, here]
  const word = say(LOBBY_TEXT.language)
  setting.classList.add('inst-languages')

  const control = document.createElement('button')
  control.type = 'button'
  control.className = 'inst-lang-now'
  control.setAttribute('aria-expanded', 'false')
  control.setAttribute('aria-controls', 'inst-lang-list')
  control.setAttribute('aria-label', `${word}: ${OWN_NAMES[here]}`)
  const label = document.createElement('span')
  label.className = 'inst-lang-word'
  label.textContent = word
  const name = document.createElement('span')
  name.className = 'inst-lang-name'
  name.lang = here
  name.textContent = OWN_NAMES[here]
  control.append(label, name, mark(CHEVRON_DOWN, 'inst-lang-mark'))

  const list = document.createElement('ul')
  list.className = 'inst-lang-list'
  list.id = 'inst-lang-list'
  list.setAttribute('aria-label', word)
  list.hidden = true
  const links = codes.map(code => {
    const link = document.createElement('a')
    link.dataset['langChoice'] = code
    link.lang = code
    link.hreflang = code
    link.textContent = OWN_NAMES[code]
    if (code === here) {
      link.setAttribute('aria-current', 'true')
      link.append(mark(CHECK, 'inst-lang-here'))
    }
    // another language is kept and the link goes there; the one being read is no journey: its press folds the list
    link.addEventListener('click', event => {
      if (code !== here) { link.href = addressIn(code); keepLanguage(code); return }
      event.preventDefault()
      close()
    })
    const item = document.createElement('li')
    item.append(link)
    list.append(item)
    return link
  })
  options.replaceWith(control, list)

  function open(): void {
    for (const link of links) link.href = addressIn(link.dataset['langChoice'] as PageLang)
    list.hidden = false
    control.setAttribute('aria-expanded', 'true')
    links.find(link => link.hasAttribute('aria-current'))?.focus({ preventScroll: true })
    list.scrollIntoView({ block: 'nearest' })
  }
  function close(): boolean {
    if (list.hidden) return false
    list.hidden = true
    control.setAttribute('aria-expanded', 'false')
    control.focus({ preventScroll: true })
    return true
  }
  control.addEventListener('click', () => { if (list.hidden) open(); else close() })
  setting.addEventListener('keydown', event => {
    if (event.key === 'Escape' && close()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (list.hidden) return
    const at = links.indexOf(document.activeElement as HTMLAnchorElement)
    const to = event.key === 'ArrowDown' ? (at + 1) % links.length
      : event.key === 'ArrowUp' ? (Math.max(at, 0) + links.length - 1) % links.length : -1
    if (to < 0) return
    event.preventDefault()
    links[to]?.focus({ preventScroll: true })
  })
  // the panel closing folds the list, so it opens again on its one row
  new MutationObserver(() => {
    const panel = setting.closest<HTMLElement>('[role="dialog"]')
    if (panel?.hidden && !list.hidden) { list.hidden = true; control.setAttribute('aria-expanded', 'false') }
  }).observe(setting.closest('[role="dialog"]') ?? setting, { attributes: true, attributeFilter: ['hidden'] })

  const note = tagged('walk') ? sayNamed('lang.tag_note') : undefined
  if (note && !setting.querySelector('.inst-lang-note')) {
    const line = document.createElement('p')
    line.className = 'inst-lang-note'
    line.textContent = note
    setting.append(line)
  }
}
