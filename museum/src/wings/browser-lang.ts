/* A FIRST VISIT READS IN THE BROWSER'S LANGUAGE. An address that names no
   `lang` is a shared or typed link: the first of the browser's languages the
   build publishes is written into the address before the first words, so
   every reader of the address (`lang()`, `pageLang()`, the tag's links, the
   panel's row) finds it named, and so does a link shared from the page.

   · A NAMED LANGUAGE ALWAYS WINS, whatever it names, an empty one too.
   · NO MATCH LEAVES THE ADDRESS AS IT IS, which reads English.
   · A DRIVEN BROWSER IS LEFT ALONE, so a rig's address means what it meant.
   · NOTHING IS KEPT ON THE DEVICE. The choice lives in the address.

   No `import.meta` and no page at load: the forge reads this file under node. */

import type { PageLang } from './content'

/** The first of a browser's languages that the build publishes: `pt` and
    `pt-*` read as pt-BR, a region tag (`fr-CA`) as its language. */
export function browserLanguage(preferred: readonly string[], published: readonly PageLang[]): PageLang | undefined {
  const base = (tag: string): string => tag.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  for (const tag of preferred) {
    const code = published.find(own => base(own) === base(tag))
    if (code) return code
  }
  return undefined
}

/** The address with the browser's language named; nothing where it stays as it is. */
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
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  const address = addressInBrowserLanguage(location.href, preferred.filter(tag => typeof tag === 'string'), published)
  if (!address) return
  // an address the page may not rewrite (a sandboxed frame) stays as it is
  try { history.replaceState(history.state, '', address) } catch { /* reads English, as before */ }
}
