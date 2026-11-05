/* FEATURE 3, GARDENS IN WORDS OF THEIR TIME, as a close look's payload on the
   paper kit (`paper/feature.ts`): the stop's colour beside paper, four named
   steps, opened from stop 4's held frame by a plain crossfade and closed onto
   it. The colour is the held frame itself, handed in by address and centred
   where the stop's door hook says (`gardens-plan.json` door.colour), so the
   stop's next camera moves it with one key. Every word comes from
   `garden-words-words.ts`. */

import css from './garden-words.css?inline'
import { createPaperFeature, type PaperFeaturePayload, type PaperFeatureStep } from '../paper/feature'
import { gardenWordsScene, type WordsLabel } from './garden-words-scene'
import { GARDEN_WORDS, STEP_IDS, type WordsLang } from './garden-words-words'

export interface GardenWordsOptions {
  lang: WordsLang
  reducedMotion: boolean
  /** the stop's held frame per framing: the colour beside the paper */
  colour: { wide: string; upright: string } | null
  /** where the colour is centred, per framing (fractions of the frame) */
  focus?: { wide: readonly [number, number]; upright: readonly [number, number]; zoom?: { wide: number; upright: number } }
}

/** the terraces' colour is the stop's own guess, and every sketch on the paper is Guessed */
const CERTAINTY = ['conjectural', 'conjectural', 'conjectural', 'conjectural'] as const

export function createGardenWordsPayload(o: GardenWordsOptions): PaperFeaturePayload {
  const W = GARDEN_WORDS[o.lang]
  const steps: PaperFeatureStep[] = STEP_IDS.map((id, i) => ({ id, name: W.steps[id], line: W.band[id], certainty: CERTAINTY[i]! }))
  return createPaperFeature({
    kind: 'paper',
    lang: o.lang,
    reducedMotion: o.reducedMotion,
    title: W.ui.title,
    words: { play: W.ui.play, pause: W.ui.pause, track: W.ui.track, between: W.ui.between },
    steps,
    css,
    images: o.colour ? { colour: o.colour } : {},
    scene: (t, framing, w, h, x) => gardenWordsScene(t, framing, w, h, { inset: x.inset, focus: o.focus?.[framing], zoom: o.focus?.zoom?.[framing], stage: x.stage }),
    text: (id) => W.labels[id as WordsLabel],
    list: (step) => W.list[STEP_IDS[step]!],
  })
}
