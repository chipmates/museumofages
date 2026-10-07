/* THE CATALOGS OF THE OTHER LANGUAGES. English and German stand in the words
   files; every other language lives in `museum/lang/<tag>/<chunk>.json`, a flat
   object from a pair's content key (or a named key, `lang.tag`) to its text,
   outside every file the film's keys read, and `tag.json` beside it says how
   far a person has read each surface. Each file is its own dynamic import, and
   only `wordsReady()` loads this module, so an English or German visit fetches
   none of it, nor the letters and rules of `lang.css`. */

import { contentKey, fillPattern, foldNumbers, patternKey } from '../../forge/lang/key.mjs'
import type { Bilingual, PageLang } from './content'
import './lang.css'

const CHUNKS = import.meta.glob<Record<string, unknown>>(['../../lang/*/*.json', '!../../lang/*/tag.json'], { import: 'default' })
const TAGS = import.meta.glob<Record<string, unknown>>('../../lang/*/tag.json', { import: 'default' })

/** How far a surface's words are read: written by a model, checked by a second, or read by a person. */
export type TagStatus = 'ai' | 'checked' | 'native'
export type TagSurface = 'walk' | 'records' | 'codex' | 'pictures'

export interface Catalog {
  /** a pair's words: its own key first, then its pattern with the numbers put back */
  pair(s: Bilingual): string | undefined
  /** a word the catalog files under a name of its own */
  named(key: string): string | undefined
  /** a surface's status, written as a word or as the flag that the tag stands; a surface the file does not name counts as unread */
  status(surface: TagSurface): TagStatus
}

export async function openCatalog(tag: PageLang): Promise<Catalog> {
  const folder = `../../lang/${tag}/`
  const mine = <T>(files: Record<string, () => Promise<T>>): Promise<T[]> =>
    Promise.all(Object.entries(files).filter(([file]) => file.startsWith(folder)).map(([, load]) => load()))
  const [chunks, tags] = await Promise.all([mine(CHUNKS), mine(TAGS)])
  const entries = new Map<string, string>()
  for (const chunk of chunks) for (const [key, text] of Object.entries(chunk)) if (typeof text === 'string') entries.set(key, text)
  const read = tags[0] ?? {}
  const own = (s: Bilingual): string | undefined => {
    const found = entries.get(contentKey(s.en, s.de))
    if (found !== undefined || !/\d/.test(s.en)) return found
    const pattern = entries.get(patternKey(s.en, s.de))
    return pattern === undefined ? undefined : fillPattern(pattern, foldNumbers(s.en).values)
  }
  /* A PAIR JOINED FROM PAIRS: a record the words put together from two
     statements, a space between them, reads as its parts, cut at a sentence's
     end on both sides where each half is a pair of its own. */
  const ends = (text: string): number[] => [...text.matchAll(/[.!?…]["”’)]?\s/g)].map(m => m.index + m[0].length)
  const joined = (s: Bilingual, depth = 0): string | undefined => {
    if (depth > 8) return undefined
    for (const i of ends(s.en)) for (const j of ends(s.de)) {
      const head = own({ en: s.en.slice(0, i).trimEnd(), de: s.de.slice(0, j).trimEnd() })
      if (head === undefined) continue
      const rest = { en: s.en.slice(i), de: s.de.slice(j) }
      const tail = own(rest) ?? joined(rest, depth + 1)
      if (tail !== undefined) return `${head} ${tail}`
    }
    return undefined
  }
  const asked = new Map<string, string | null>()
  return {
    pair(s) {
      const found = own(s)
      if (found !== undefined || !s.de) return found
      const key = `${s.en}\u0001${s.de}`
      if (!asked.has(key)) asked.set(key, joined(s) ?? null)
      return asked.get(key) ?? undefined
    },
    named: (key) => entries.get(key),
    status(surface) {
      const said = read[surface]
      // a flag says whether the tag still stands: false once a person has read every string there
      if (typeof said === 'boolean') return said ? 'ai' : 'native'
      return said === 'checked' || said === 'native' ? said : 'ai'
    },
  }
}
