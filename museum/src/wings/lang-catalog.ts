/* THE CATALOGS OF THE OTHER LANGUAGES. English and German stand in the words
   files; every other language lives in `museum/lang/<tag>/<chunk>.json`, a flat
   object from a pair's content key to its text, outside every file the film's
   keys read. Each chunk is its own dynamic import, and only `wordsReady()`
   loads this module, so an English or German visit fetches none of it. */

import { contentKey, fillPattern, foldNumbers, patternKey } from '../../forge/lang/key.mjs'
import type { Bilingual, PageLang } from './content'

const CHUNKS = import.meta.glob<Record<string, string>>('../../lang/*/*.json', { import: 'default' })

/** Every chunk of a language, merged, and the lookup `say()` uses: the pair's
    own key first, then its pattern with the numbers put back. */
export async function openCatalog(tag: PageLang): Promise<(s: Bilingual) => string | undefined> {
  const folder = `../../lang/${tag}/`
  const chunks = await Promise.all(Object.entries(CHUNKS).filter(([file]) => file.startsWith(folder)).map(([, load]) => load()))
  const entries = new Map<string, string>()
  for (const chunk of chunks) for (const [key, text] of Object.entries(chunk)) if (typeof text === 'string') entries.set(key, text)
  return (s) => {
    const own = entries.get(contentKey(s.en, s.de))
    if (own !== undefined || !/\d/.test(s.en)) return own
    const pattern = entries.get(patternKey(s.en, s.de))
    return pattern === undefined ? undefined : fillPattern(pattern, foldNumbers(s.en).values)
  }
}
