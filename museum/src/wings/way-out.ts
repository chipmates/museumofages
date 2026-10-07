/* WHERE A WING LEADS BACK TO. On the museum's site every wing has a page of
   its own per language, with its own slug, so the addresses are settings a
   build carries and never a pattern: VITE_NA_WING_PAGE_<SLUG>_<LANG> for a
   wing, VITE_NA_SITE_PAGE_<LANG> for an address that names no wing (`PT_BR`
   for Brazilian Portuguese). A build that carries none keeps the lobby.

   No import with a value: the build's own step reads this file too. */

import type { PageLang } from './content'

export type Settings = Readonly<Record<string, unknown>>

const WING_PAGE = 'VITE_NA_WING_PAGE_'
const SITE_PAGE = 'VITE_NA_SITE_PAGE_'
const LANGS: readonly PageLang[] = ['en', 'de', 'fr', 'it', 'es', 'pt-BR', 'bg']

/** the fragment of a page for a visitor who has finished the walk */
export const FINISHED = '#more'

const suffix = (language: PageLang): string => language.replace('-', '_').toUpperCase()

export const wingPageKey = (slug: string, language: PageLang): string =>
  `${WING_PAGE}${slug.replaceAll('-', '_').toUpperCase()}_${suffix(language)}`

export const sitePageKey = (language: PageLang): string => `${SITE_PAGE}${suffix(language)}`

/** A path on this site, or nothing: a setting never names another origin,
    and never one of the app's own addresses, which would lead back in. */
export function sitePath(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\/(?![/\\])[^\s\\#]*$/.test(value)) return null
  return /^\/(w|bench)(\/|$)/.test(value) ? null : value
}

const other = (language: 'en' | 'de'): 'en' | 'de' => (language === 'de' ? 'en' : 'de')

/** the pages a language reads in order: its own, then English and German
    for another language, the other of the two for English and German */
const inOrder = (language: PageLang): PageLang[] =>
  language === 'en' || language === 'de' ? [language, other(language)] : [language, 'en', 'de']

/** The wing's page in the visitor's language; where that one is not named,
    the next in order, so a wing with a page never opens a lobby. */
export function wingPage(settings: Settings, slug: string, language: PageLang): string | null {
  if (!slug) return null
  for (const each of inOrder(language)) {
    const page = sitePath(settings[wingPageKey(slug, each)])
    if (page) return page
  }
  return null
}

/** Where an address that names no wing leads: the site's front page. */
export function sitePage(settings: Settings, language: PageLang): string | null {
  for (const each of inOrder(language)) {
    const page = sitePath(settings[sitePageKey(each)])
    if (page) return page
  }
  return null
}

/** The way out of a wing: its page, with the fragment once the walk is finished. */
export function wayOut(settings: Settings, slug: string, language: PageLang, finished: boolean): string | null {
  const page = wingPage(settings, slug, language)
  return page === null ? null : finished ? `${page}${FINISHED}` : page
}

/** the language a setting's name ends in, the longest ending first (`PT_BR` before a bare `BR`) */
function languageOf(name: string): { language: PageLang; at: number } | null {
  const found = LANGS.filter(l => name.endsWith(`_${suffix(l)}`)).sort((a, b) => suffix(b).length - suffix(a).length)[0]
  return found ? { language: found, at: name.length - suffix(found).length - 1 } : null
}

/** What a build's settings say, for the build's own step: every wing named
    with its English and German pages and the other languages' it has, and
    every setting that cannot be used. */
export function readSettings(settings: Settings): {
  wings: { key: string; en: string; de: string; pages: Partial<Record<PageLang, string>> }[]
  refused: string[]
} {
  const refused: string[] = []
  const found = new Map<string, Partial<Record<PageLang, string>>>()
  for (const [name, value] of Object.entries(settings)) {
    const site = name.startsWith(SITE_PAGE), wing = name.startsWith(WING_PAGE)
    // an empty setting is a setting left out
    if ((!site && !wing) || value === '') continue
    const end = languageOf(name)
    const path = sitePath(value)
    const named = end !== null && (site ? end.at === SITE_PAGE.length - 1 : end.at > WING_PAGE.length)
    if (!end || !path || !named) { refused.push(`${name}=${String(value)}`); continue }
    if (site) continue
    const key = name.slice(WING_PAGE.length, end.at)
    found.set(key, { ...found.get(key), [end.language]: path })
  }
  const wings: { key: string; en: string; de: string; pages: Partial<Record<PageLang, string>> }[] = []
  for (const [key, pages] of found) {
    if (pages.en && pages.de) wings.push({ key, en: pages.en, de: pages.de, pages })
    else refused.push(`${WING_PAGE}${key}_${pages.en ? 'DE' : 'EN'} is not set`)
  }
  for (const language of ['en', 'de'] as const)
    if (sitePath(settings[sitePageKey(language)]) && !sitePath(settings[sitePageKey(other(language))]))
      refused.push(`${sitePageKey(other(language))} is not set`)
  return { wings, refused: [...new Set(refused)] }
}
