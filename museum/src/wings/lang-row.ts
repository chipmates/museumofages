/* THE LANGUAGE ROW of the museum's panel, once a build publishes more than
   English and German or the page reads another language. Each language
   stands by its own name and in its own `lang`; a choice reloads the page in
   that language at the stop it stands at (the address keeps its `#s=`).
   The page's own language stands in the row even where the build does not
   list it, so a visitor sees what they are reading. While no person has read
   the page's words, the long note stands under the row.

   Loaded only for such a page: a build of English and German alone keeps the
   panel's two-letter switch and never fetches this file. */

import { pageLang, sayNamed, tagged, type PageLang } from './content'
import { OWN_NAMES } from './languages'
import './lang-row.css'

export function paintLanguageRow(setting: HTMLFieldSetElement, published: readonly PageLang[]): void {
  const options = setting.querySelector<HTMLElement>('.inst-options')
  if (!options) return
  const here = pageLang()
  const list = published.includes(here) ? published : [...published, here]
  setting.classList.add('inst-languages')
  options.replaceChildren(...list.map(code => {
    const choice = document.createElement('button')
    choice.type = 'button'
    choice.dataset['language'] = code
    choice.lang = code
    choice.textContent = OWN_NAMES[code]
    choice.setAttribute('aria-pressed', String(code === here))
    choice.addEventListener('click', () => {
      if (code === pageLang()) return
      const address = new URL(location.href)
      address.searchParams.set('lang', code)
      location.assign(address.href)
    })
    return choice
  }))
  const note = tagged('walk') ? sayNamed('lang.tag_note') : undefined
  if (note && !setting.querySelector('.inst-lang-note')) {
    const line = document.createElement('p')
    line.className = 'inst-lang-note'
    line.textContent = note
    setting.append(line)
  }
}
