/* FEATURE 2, THE OIL LIST AND ITS PEOPLES, as a close look's payload on the
   paper kit (`paper/feature.ts`): opened from stop 4's held frame by a plain
   crossfade, six named steps, the words in the band, closed onto the frame.
   The photograph and today's coasts are handed in by address: neither lives
   in the repository. Every word comes from `oil-words.ts`. */

import css from './oil.css?inline'
import { createPaperFeature, type PaperFeaturePayload, type PaperFeatureStep } from '../paper/feature'
import { oilScene, type OilLabel } from './oil-scene'
import { type Coasts } from './oil-data'
import { oilLabel } from './oil-label'
import { OIL_WORDS, STEP_IDS, type OilLang } from './oil-words'

export interface OilOptions {
  lang: OilLang
  reducedMotion: boolean
  /** the holder's photograph of VAT 16378 */
  photo: string
  /** today's coasts and rivers, already fetched (absent: the dots stand on bare paper) */
  coasts?: Coasts | null
}

/** the step's certainty for the band's mark: the photograph and the lists' lines are documented */
const CERTAINTY = ['documented', 'documented', 'documented', 'documented', 'documented', 'documented'] as const

export function createOilPayload(o: OilOptions): PaperFeaturePayload {
  const W = OIL_WORDS[o.lang]
  const steps: PaperFeatureStep[] = STEP_IDS.map((id, i) => ({ id, name: W.steps[id], line: W.band[id], certainty: CERTAINTY[i]! }))
  return createPaperFeature({
    kind: 'paper',
    lang: o.lang,
    reducedMotion: o.reducedMotion,
    title: W.ui.title,
    words: { play: W.ui.play, pause: W.ui.pause, track: W.ui.track, between: W.ui.between },
    steps,
    css,
    images: { photo: o.photo },
    data: { coasts: o.coasts ?? undefined },
    scene: (t, framing, w, h, x) => oilScene(t, framing, w, h, { inset: x.inset, data: x.data as { coasts?: Coasts } }),
    text: (id, sc) => oilLabel(o.lang, id as OilLabel, Math.round(Number((sc.facts as { step?: number }).step ?? -1))),
    list: (step) => W.list[STEP_IDS[step]!],
  })
}
