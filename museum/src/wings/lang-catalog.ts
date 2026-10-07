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
  return {
    pair(s) {
      const own = entries.get(contentKey(s.en, s.de))
      if (own !== undefined || !/\d/.test(s.en)) return own
      const pattern = entries.get(patternKey(s.en, s.de))
      return pattern === undefined ? undefined : fillPattern(pattern, foldNumbers(s.en).values)
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
