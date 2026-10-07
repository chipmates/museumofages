/* The museum's own words. The night has no translation layer of its own,
   so every displayed string carries its German beside it and the page's
   own lang attribute picks. Displayed text follows the house writing
   rules: no em or en dashes, no semicolons, short sentences. */

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

/** A catalog's lookup, set once its chunks are in. */
let catalog: ((s: Bilingual) => string | undefined) | null = null

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
  return catalog?.(s) ?? s.en
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
