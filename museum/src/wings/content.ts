/* The museum's own words. The night has no translation layer of its own,
   so every displayed string carries its German beside it and the page's
   own lang attribute picks. Displayed text follows the house writing
   rules: no em or en dashes, no semicolons, short sentences. */

import type { Catalog, TagSurface } from './lang-catalog'

export type Lang = 'en' | 'de'

/** The page's language is also the language the door hands the library.
    The lobby switch and shared links use the same query parameter. */
export function lang(): Lang {
  const asked = new URLSearchParams(location.search).get('lang')
  if (asked === 'de' || asked === 'en') {
    document.documentElement.lang = asked
    return asked
  }
  return document.documentElement.lang.slice(0, 2) === 'de' ? 'de' : 'en'
}

export interface Bilingual {
  en: string
  de: string
}

/** The languages a page can be read in. The world (marks, release, letters)
    stays in `lang()`, so another language is a page language only. */
export type PageLang = Lang | 'fr' | 'it' | 'es' | 'pt-BR' | 'bg'
const CATALOG_LANGS: readonly PageLang[] = ['fr', 'it', 'es', 'pt-BR', 'bg']

/** The page's language: a catalog language the address names (any case,
    `pt` and `pt-br` read as pt-BR), set on the page as its tag; otherwise
    the world language, untouched. */
export function pageLang(): PageLang {
  const asked = (new URLSearchParams(location.search).get('lang') ?? '').toLowerCase()
  const code = asked === 'pt' || asked === 'pt-br' ? 'pt-BR' : CATALOG_LANGS.find((c) => c === asked)
  if (!code) return lang()
  if (document.documentElement.lang !== code) document.documentElement.lang = code
  return code
}

/** A catalog language's words, set once its files are in. */
let catalog: Catalog | null = null

/** Loads the page language's catalog; English and German load nothing.
    Awaited before the first words, since `say()` cannot wait. */
export async function wordsReady(): Promise<void> {
  const page = pageLang()
  if (page === 'en' || page === 'de' || catalog) return
  const { openCatalog } = await import('./lang-catalog')
  catalog = await openCatalog(page)
}

/** English and German as written; a catalog language from its catalog, else English. */
export const say = (s: Bilingual): string => {
  const page = pageLang()
  if (page === 'en' || page === 'de') return s[page]
  return fromCatalog(s)
}

/** A pair the catalog lacks reads in English; the page keeps a list of them
    (`__naLang.missed`) for the coverage read, and apart from them the pairs
    asked for before the catalog was in (`__naLang.early`). */
function fromCatalog(s: Bilingual): string {
  const said = catalog?.pair(s)
  if (said !== undefined || !s.en) return said ?? s.en
  if (saidInPlace.has(s.en)) return s.en
  const made = fills.get(`${s.en}\u0001${s.de}`)
  if (made) return fill(fromCatalog(made.pattern), made.values)
  const book = (globalThis as { __naLang?: { missed: Map<string, string>; early: Map<string, string> } }).__naLang ??= { missed: new Map(), early: new Map() }
  ;(catalog ? book.missed : book.early).set(s.en, s.de)
  return s.en
}

/** A pair in the language a host hands down: English and German exactly as
    `s[world]`; a catalog language from its catalog, else English. */
export const sayAs = (s: Bilingual, world: Lang): string => {
  const page = pageLang()
  if (page === 'en' || page === 'de') return s[world]
  return fromCatalog(s)
}

/** A string English and German visitors both read in English (a title as
    published, a codex's name): a catalog language files it under the pair
    with an empty German. */
export const sayEnglish = (en: string): string => {
  const page = pageLang()
  if (page === 'en' || page === 'de') return en
  return fromCatalog({ en, de: '' })
}

/** The tag an element's words carry: the world language a host hands down
    on an English or German page, the page's own on a catalog page. */
export const langTag = (world: Lang): string => {
  const page = pageLang()
  return page === 'en' || page === 'de' ? world : page
}

/** A pattern pair with its slots filled, still a pair for `say`: English and
    German each as written; a catalog page's own words, filled, stand on the
    English side, which `say` hands back since no entry is filed under them. */
export const filled = (pattern: Bilingual, values: readonly string[] | Readonly<Record<string, string>>): Bilingual =>
  catalogPage() ? { en: fill(say(pattern), values), de: '' } : { en: fill(pattern.en, values), de: fill(pattern.de, values) }

/** A pair whose sides may be missing: English and German as `side[world]`; a
    catalog page from its catalog, else the English side. */
export const sayMaybe = <T extends string | null | undefined>(en: T, de: T | string | null | undefined, world: Lang): T | string => {
  const page = pageLang()
  if (page === 'en' || page === 'de') return (world === 'de' ? de : en) as T
  return typeof en !== 'string' ? en : fromCatalog({ en, de: de ?? '' })
}

/** A record kept once per language (`{ en: {...}, de: {...} }`): English and
    German get their own side untouched; a catalog page reads it field by
    field, each string by the pair of its English and German. */
export function sideAs<E, D>(both: { en: E; de: D }, world: Lang): E | D {
  if (!catalogPage()) return both[world]
  const walk = (en: unknown, de: unknown): unknown => {
    if (typeof en === 'string') return say({ en, de: typeof de === 'string' ? de : '' })
    if (Array.isArray(en)) return en.map((item, i) => walk(item, Array.isArray(de) ? de[i] : undefined))
    if (en && typeof en === 'object') return Object.fromEntries(Object.entries(en).map(([k, v]) => [k, walk(v, (de as Record<string, unknown> | undefined)?.[k])]))
    return en
  }
  return walk(both.en, both.de) as E
}

/** A string a module hands over already chosen in one language: English and
    German as the module makes it for `world`; a catalog page asks for both
    and says the pair. */
export const sayBoth = (made: (language: Lang) => string, world: Lang): string =>
  catalogPage() ? say({ en: made('en'), de: made('de') }) : made(world)

/** A tree a module builds already chosen in one language: English and German
    as built for `world`; a catalog page builds both, keeps the English one and
    says each of its texts and names with the German at the same place. A part
    the two builds do not share stays as built. */
export function sayDom<T extends Node>(made: (language: Lang) => T, world: Lang): T {
  if (!catalogPage()) return made(world)
  const en = made('en')
  pairNodes(en, made('de'))
  return en
}

const SAID_NAMES = ['aria-label', 'title', 'alt', 'placeholder'] as const

/** An English tree said in place, each text and name with the German one at the same place of `de`. */
export function pairNodes(en: Node, de: Node): void {
  if (en.nodeType === Node.TEXT_NODE && de.nodeType === Node.TEXT_NODE) {
    const whole = en.textContent ?? '', core = whole.trim()
    if (!/\p{L}/u.test(core)) return
    const at = whole.indexOf(core)
    en.textContent = whole.slice(0, at) + say({ en: core, de: (de.textContent ?? '').trim() }) + whole.slice(at + core.length)
    return
  }
  if (!(en instanceof Element) || !(de instanceof Element) || en.tagName !== de.tagName) return
  for (const name of SAID_NAMES) {
    const words = en.getAttribute(name), other = de.getAttribute(name)
    if (words && other !== null && /\p{L}/u.test(words)) en.setAttribute(name, say({ en: words, de: other }))
  }
  if (en.getAttribute('lang') === 'en' && de.getAttribute('lang') === 'de') en.setAttribute('lang', pageLang())
  const ours = en.childNodes, theirs = de.childNodes
  if (ours.length !== theirs.length) return
  for (let i = 0; i < ours.length; i++) pairNodes(ours[i]!, theirs[i]!)
}

/** A string a module has said already, handed on in a pair's English place: a
    catalog page keeps it as said; English and German get it untouched. */
export const alreadySaid = (text: string): string => {
  if (catalogPage()) saidInPlace.add(text)
  return text
}

/** Pattern pairs filled before any page language is known, by the pair they made. */
const fills = new Map<string, { pattern: Bilingual; values: Readonly<Record<string, string>> }>()

/** A pattern pair filled for English and German alike, as a module computes it
    once; a catalog page's `say` finds the pattern again and fills its own words. */
export function fillPair(pattern: Bilingual, values: Readonly<Record<string, string>>): Bilingual {
  const pair = { en: fill(pattern.en, values), de: fill(pattern.de, values) }
  fills.set(`${pair.en}\u0001${pair.de}`, { pattern, values })
  return pair
}

/** Strings data already holds in the page's words, and the data said so. */
const saidInPlace = new Set<string>()
const dataSaid = new WeakSet<object>()

/** Shared data a module reads in English where no caller can hand it the
    page's words, said in place once on a catalog page: every `{ en, de }`
    pair, every `x_en` beside an `x_de`, every string of an `en` record beside
    its `de` one. Only for data no check compares against its source. */
export function sayDataInPlace(root: unknown): void {
  if (!catalogPage()) return
  const put = (holder: Record<string, unknown>, key: string, de: unknown): void => {
    const en = holder[key]
    if (typeof en !== 'string' || typeof de !== 'string') return
    const said = say({ en, de })
    if (said === en) return
    holder[key] = said
    saidInPlace.add(said)
  }
  const pair = (en: unknown, de: unknown): void => {
    if (!en || typeof en !== 'object' || !de || typeof de !== 'object' || Object.isFrozen(en)) return
    for (const key of Object.keys(en)) {
      const own = (en as Record<string, unknown>)[key], other = (de as Record<string, unknown>)[key]
      if (typeof own === 'string') put(en as Record<string, unknown>, key, other)
      else pair(own, other)
    }
  }
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || dataSaid.has(node) || Object.isFrozen(node)) return
    dataSaid.add(node)
    if (Array.isArray(node)) { node.forEach(walk); return }
    const record = node as Record<string, unknown>
    if (typeof record['en'] === 'string') put(record, 'en', record['de'])
    else pair(record['en'], record['de'])
    for (const [key, value] of Object.entries(record)) {
      if (key.endsWith('_en')) put(record, key, record[`${key.slice(0, -3)}_de`])
      else if (key !== 'en' && key !== 'de') walk(value)
    }
  }
  walk(root)
}

/** A pair out of two parallel records, each language's own field. */
export const pairOf = <E, D>(both: { en: E; de: D }, field: (side: E | D) => string): Bilingual => ({ en: field(both.en), de: field(both.de) })

/** A pair's words where the catalog holds them, and nothing (no English, no miss) where it does not. */
export const sayIfKnown = (s: Bilingual): string | undefined => (catalogPage() ? catalog?.pair(s) : undefined)

/** A word a catalog files under its own name (`lang.tag`); none on an English or German page. */
export const sayNamed = (key: string): string | undefined => catalog?.named(key)

/** Whether a surface still owes its reader the line that no person has read
    its words yet: on a catalog page until the surface is read by a person. */
export const tagged = (surface: TagSurface): boolean => catalogPage() && catalog?.status(surface) !== 'native'

/** Whether the page reads a catalog language. */
export const catalogPage = (): boolean => {
  const page = pageLang()
  return page !== 'en' && page !== 'de'
}

/** A pattern's slots, `{0}` or `{name}`, filled; a slot with no value stays as written. */
export const fill = (pattern: string, values: readonly string[] | Readonly<Record<string, string>>): string =>
  pattern.replace(/\{(\w+)\}/g, (whole, slot: string) => (values as Record<string, string>)[slot] ?? whole)

/** A runtime number: English and German as the caller writes it; a catalog
    language in its own form (a year without grouping). */
export const figure = (n: number, written: string = String(n), options: Intl.NumberFormatOptions = {}): string => {
  const page = pageLang()
  if (page === 'en' || page === 'de') return written
  return new Intl.NumberFormat(page, options).format(n)
}
export const YEAR: Intl.NumberFormatOptions = { useGrouping: false }

/** The pair a count picks: English and German by `n === 1` as the words were
    written; a catalog language by its own plural rules (French takes the one
    form for 0 as well). */
export const sayCount = (n: number, one: Bilingual, other: Bilingual): string => say(isOne(n) ? one : other)
/** Whether a count takes the one form: `n === 1` in English and German; a catalog language's own rule. */
export const isOne = (n: number): boolean => {
  const page = pageLang()
  return page === 'en' || page === 'de' ? n === 1 : new Intl.PluralRules(page).select(n) === 'one'
}

/** The lobby's own plate: how much of the museum stands today. */
export function wingCount(open: number, preparing: number): string {
  const plural = (n: number, one: Bilingual, many: Bilingual): string =>
    say(n === 1 ? one : many)
  const o = plural(
    open,
    { en: `${open} wing open`, de: `${open} Flügel offen` },
    { en: `${open} wings open`, de: `${open} Flügel offen` }
  )
  const p = plural(
    preparing,
    { en: `${preparing} in preparation`, de: `${preparing} in Vorbereitung` },
    { en: `${preparing} in preparation`, de: `${preparing} in Vorbereitung` }
  )
  return `${o} · ${p}`
}

export const WING_TEXT = {
  /** the plate a wing shows before it is built */
  preparing: {
    en: 'In preparation',
    de: 'In Vorbereitung',
  },
  preparingLine: {
    en: 'This wing is being researched and built. Its rooms open when the evidence does.',
    de: 'Dieser Flügel wird recherchiert und gebaut. Seine Räume öffnen, wenn die Belege es tun.',
  },
  /** the reading table's bench page door (the walk carries no station door) */
  door: {
    en: 'Ask the Echo about this',
    de: 'Frag das Echo danach',
  },
  /** the no-signup case, in the app's own words for its daily free messages */
  doorNote: {
    en: 'Opens the library in a new tab. 30 free messages a day. No signup needed.',
    de: 'Öffnet die Bibliothek in einem neuen Tab. 30 kostenlose Nachrichten pro Tag. Ohne Anmeldung.',
  },
  /* THE PLATE IN FRONT OF THE LIBRARY. A first time visitor has never heard
     of the library, so the plate says what it leads to before it opens; its
     heading and its way in are the wing's own words. What an Echo is comes
     from the disclosure canon and is never written twice. */
  /** one row on the desktop's band, German included */
  doorLead: {
    en: 'Behind this door is the Agora Cosmica library: learn from thirty lives, in chapters and conversations.',
    de: 'Die Tür führt zur Bibliothek Agora Cosmica: Lerne aus dreißig Leben, in Kapiteln und Gesprächen.',
  },
  doorTerms: {
    en: 'Nonprofit and Open Source. Opens in a new tab. 30 free messages a day. No signup needed.',
    de: 'Non-Profit und Open Source. Öffnet sich in einem neuen Tab. 30 kostenlose Nachrichten pro Tag. Ohne Anmeldung.',
  },
  doorStay: {
    en: 'Stay in the museum',
    de: 'Im Museum bleiben',
  },
  /** the wing's way out on the way; the key keeps the name of where it first led */
  lobby: {
    en: 'Exit to the website',
    de: 'Ausgang zur Webseite',
  },
  /** the same way out at the desktop's first stop: one short word before the way back, room for five letters in capitals */
  firstWayOut: {
    en: 'Exit',
    de: 'Ausgang',
  },
  /** the rail's own label, read by assistive technology */
  rail: {
    en: 'Stations of this wing',
    de: 'Stationen dieses Flügels',
  },
  station: {
    en: 'Station',
    de: 'Station',
  },
  /** the grabber of a station card that opens as a sheet on the phone */
  sheet: {
    en: 'More about this place',
    de: 'Mehr über diesen Ort',
  },
} satisfies Record<string, Bilingual>
