/* THE LANGUAGE OF AN ADDRESS THAT NAMES NONE. Such an address is a shared or
   typed link: the language the visitor chose by hand on an earlier visit, or
   else the first of the browser's languages, is written into the address
   before the first words, so every reader of the address (`lang()`,
   `pageLang()`, the tag's links, the panel's row) finds it named, and so does
   a link shared from the page.

   · A NAMED LANGUAGE ALWAYS WINS, whatever it names, an empty one too.
   · NO MATCH LEAVES THE ADDRESS AS IT IS, which reads English.
   · A DRIVEN BROWSER IS LEFT ALONE, so a rig's address means what it meant.
   · ONE KEY ON THE DEVICE, like the pace: the language chosen by hand. The
     browser's own languages are read and never kept.

   No `import.meta` and no page at load: the forge reads this file under node. */

import type { PageLang } from './content'

const KEPT = 'na-language'

/** Called where a visitor picks a language by hand. A refused store forgets,
    and the address still carries the choice for this visit. */
export function keepLanguage(code: PageLang): void {
  try { localStorage.setItem(KEPT, code) } catch { /* nothing is kept */ }
}

/** A visitor's languages in order: the one chosen by hand, then the browser's. */
export function visitorLanguages(kept: string | null | undefined, browser: readonly string[]): string[] {
  return kept ? [kept, ...browser] : [...browser]
}

/** The first of a visitor's languages that the build publishes: `pt` and
    `pt-*` read as pt-BR, a region tag (`fr-CA`) as its language. */
export function browserLanguage(preferred: readonly string[], published: readonly PageLang[]): PageLang | undefined {
  const base = (tag: string): string => tag.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  for (const tag of preferred) {
    const code = published.find(own => base(own) === base(tag))
    if (code) return code
  }
  return undefined
}

/** The address with the visitor's language named; nothing where it stays as it is. */
export function addressInBrowserLanguage(href: string, preferred: readonly string[], published: readonly PageLang[]): string | undefined {
  const address = new URL(href)
  if (address.searchParams.has('lang')) return undefined
  const code = browserLanguage(preferred, published)
  if (!code) return undefined
  address.searchParams.set('lang', code)
  return address.href
}

/** Called once, before the first read of the page's language. */
export function adoptBrowserLanguage(published: readonly PageLang[]): void {
  if (typeof navigator === 'undefined' || typeof history === 'undefined' || navigator.webdriver) return
  const browser = (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(tag => typeof tag === 'string')
  let kept: string | null = null
  try { kept = localStorage.getItem(KEPT) } catch { /* a closed store keeps nothing */ }
  const address = addressInBrowserLanguage(location.href, visitorLanguages(kept, browser), published)
  if (!address) return
  // an address the page may not rewrite (a sandboxed frame) stays as it is
  try { history.replaceState(history.state, '', address) } catch { /* reads English, as before */ }
}
