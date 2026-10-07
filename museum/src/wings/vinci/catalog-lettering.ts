/* THE OBJECTS' WORDS IN A CATALOG LANGUAGE. The line's and the grave's
   lettering set English and German in the wing's own letters, and the scene
   reads them, so they stay as they are. A catalog language takes each word
   by its English and German pair and is set here, in the same places by the
   same arithmetic, in the letters of `words/accents.ts`. Fed English or
   German, this sets what the lettering modules set (`words/accents-check.mjs`). */
import type { Bilingual } from '../content'
import { accentAdvance, accentAscent, accentOutline, missingLetter } from './words/accents'
import { lineLettering, ROW_LETTERING, type Certainty, type LineLettering, type LinePiece } from './line/lettering'
import { LINE_STUD_SPACING as STUD_SPACING } from './line/studs'
import { DEATHBED_LABEL, graveDeathbedLettering, graveLettering, type GraveLetters } from './grave/lettering'

/** A pair's words in the page's language. */
export type Words = (pair: Bilingual) => string

/** The page's word, or the English where the letters lack one of its characters. */
function drawable(word: Words, pair: Bilingual): string {
  const text = word(pair)
  if (missingLetter(text) === undefined) return text
  console.warn(`picture words: no letter for ${JSON.stringify(missingLetter(text))} in ${JSON.stringify(text)}`)
  return pair.en
}

function piece(text: string, size: number, maxWidth?: number): LinePiece {
  return { text, size, ...(maxWidth === undefined ? {} : { maxWidth }),
    outline: accentOutline(text, { size, ...(maxWidth === undefined ? {} : { maxWidth }) }), at: [0, 0, 0], stretch: 1, bold: 0 }
}

/** A date's certainty word and cue, as `lineLettering` lays them for the page (not the phone's). */
export function catalogLineLettering(n: number, selected: number, lettering: LineLettering, word: Words): { studId: string; certainty: Certainty; year: LinePiece; word: LinePiece; cue?: LinePiece } {
  const en = lineLettering(n, selected, 'en', false, lettering), de = lineLettering(n, selected, 'de', false, lettering)
  const z = -(n - selected) * STUD_SPACING, row = lettering === 'row', R = ROW_LETTERING
  const wordText = drawable(word, { en: en.word.text, de: de.word.text })
  const cue = en.cue && de.cue ? drawable(word, { en: en.cue.text, de: de.cue.text }) : undefined
  const year = en.year
  const beside = .31 + accentAdvance(year.text, year.size) + R.gap
  const fit = (text: string, size: number) => Math.min(size, size * (R.reach - beside) / accentAdvance(text, size))
  const said = row ? piece(wordText, fit(wordText, cue ? R.paired : R.word)) : piece(wordText, .087, 1.5)
  const event = cue === undefined ? undefined : row ? piece(cue, fit(cue, R.paired)) : piece(cue, .095, 1.48)
  if (row) {
    const top = z - R.depth / 2, stretch = R.depth / year.outline.height
    const baseline = top + accentAscent(year.text, year.outline.size) * stretch, x = .31 + year.outline.width + R.gap
    if (event) {
      const rise = Math.min(R.pairRise, R.pairRise * (R.pairDepth - R.pairGap) / (said.outline.height * R.pairRise / said.outline.size + event.outline.height * R.pairRise / event.outline.size))
      said.stretch = rise / said.outline.size; event.stretch = rise / event.outline.size
      said.at = [x, .0010, z - R.pairDepth / 2]
      event.at = [x, .0010, z + R.pairDepth / 2 - event.outline.height * event.stretch]
      event.bold = R.bold * .5
    } else {
      said.stretch = R.wordRise / said.outline.size
      said.at = [x, .0010, baseline - accentAscent(wordText, said.outline.size) * said.stretch]
    }
    said.bold = R.bold * .5
  } else {
    said.at = [.33, .0010, z - .22]
    if (event) event.at = [.33, .0010, z + .60]
  }
  return { studId: en.studId, certainty: en.certainty, year, word: said, ...(event ? { cue: event } : {}) }
}

/** The grave's plaque, ledge and label in a catalog language: each run where
 * the English stands, at the size its own rule gives the new words. */
export function catalogGraveLettering(word: Words): GraveLetters[] {
  const de = new Map([...graveLettering('de'), ...graveDeathbedLettering('de')].map(run => [run.id, run]))
  return [...graveLettering('en'), ...graveDeathbedLettering('en')].map(en => {
    const twin = de.get(en.id)!
    const text = drawable(word, { en: en.text, de: twin.text })
    const advance = accentAdvance(text, 1)
    let size = en.size
    // the plaque was set for the English line: a longer line keeps its width
    if (en.id === 'grave-presumption' && advance > accentAdvance(en.text, 1)) size = en.size * accentAdvance(en.text, 1) / advance
    // the ledge and the label's title hold one line: a line only ever narrows from the cap
    if (en.id === 'grave-diagram' || en.id === 'grave-diagram-date') size = Math.min(Math.max(en.size, twin.size), en.maxWidth / Math.max(1e-6, advance) * .985)
    if (en.id === 'grave-deathbed-title') size = Math.min(DEATHBED_LABEL.titleSize, DEATHBED_LABEL.width / Math.max(1e-6, advance) * .985)
    return { ...en, text, size, outline: accentOutline(text, { size, maxWidth: en.maxWidth, lineHeight: 1.45 }) }
  })
}
