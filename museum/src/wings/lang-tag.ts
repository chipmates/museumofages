/* THE TAG OF AN UNREAD TRANSLATION, where a visitor first meets the wing
   (the Arno card, the welcome): the catalog's line that no person has read
   the words yet, and the originals named and linked to the same address in
   English and in German. None on an English or German page, and none once a
   person has read the walk's words. */

import { sayNamed, tagged, type Lang } from './content'
import { keepLanguage } from './browser-lang'

export interface TagWords {
  line: string
  link?: string | undefined
  originals?: readonly { word: string; href: string; lang: Lang }[]
}

export function tagWords(): TagWords | undefined {
  const line = tagged('walk') ? sayNamed('lang.tag') : undefined
  if (!line) return undefined
  const at = (code: 'en' | 'de'): string => {
    const address = new URL(location.href)
    address.searchParams.set('lang', code)
    return `${address.pathname}${address.search}${address.hash}`
  }
  return { line, link: sayNamed('lang.tag_link'),
    originals: [{ word: 'English', href: at('en'), lang: 'en' }, { word: 'Deutsch', href: at('de'), lang: 'de' }] }
}

/** the line and, where the catalog writes one, the line of originals, each
    original a link, and a press on one a choice of language like any other */
export function tagNodes(tag: TagWords, document_: Document, className: string): HTMLElement[] {
  const line = document_.createElement('p')
  line.className = className
  line.textContent = tag.line
  if (!tag.link) return [line]
  const link = document_.createElement('p')
  link.className = `${className}-link`
  let rest = tag.link
  for (const original of tag.originals ?? []) {
    const at = rest.indexOf(original.word)
    if (at < 0) continue
    const a = document_.createElement('a')
    a.textContent = original.word
    a.href = original.href; a.lang = original.lang; a.hreflang = original.lang
    a.addEventListener('click', () => keepLanguage(original.lang))
    link.append(rest.slice(0, at), a)
    rest = rest.slice(at + original.word.length)
  }
  link.append(rest)
  return [line, link]
}
