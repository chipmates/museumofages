/* FEATURE 10, THE RIVER THEN AND NOW, as a close look's payload on the paper kit (`paper/feature.ts`): opened from
   stop 13's held frame through the stop's ink still, four named steps (570 BC, the dig, today, the photograph), the
   words in the band, closed onto the frame. The river's colour of 570 BC is the stop's own water (`bridge-plan.json`
   water.body), handed in, never typed; the photograph and the ink still come by address. Every word comes from
   `river-words.ts`. */

import css from './river.css?inline'
import { createPaperFeature, type PaperFeaturePayload, type PaperFeatureStep } from '../paper/feature'
import { riverScene } from './river-scene'
import { RIVER_WORDS, STEP_IDS, riverLabel, type RiverLang } from './river-words'

export interface RiverOptions {
  lang: RiverLang
  reducedMotion: boolean
  /** Gadmer's 1927 autochrome (A53931S) */
  photo: string
  /** the stop's ink still in each framing; null crosses by a plain crossfade */
  ink: { wide: string; upright: string } | null
  /** the stop's water as its plan gives it: a linear albedo, 0 to 1 */
  water: readonly [number, number, number]
}

/** the band's mark per step: the 570 state is a reconstruction on the record, the dig, today and 1927 are documents */
const CERTAINTY = ['reconstructed', 'documented', 'documented', 'documented'] as const

/** a linear albedo as sRGB, the way the film's own frame writes it */
export function srgbOf(lin: readonly [number, number, number]): string {
  const enc = (c: number): number => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  return `rgb(${lin.map(enc).join(' ')})`
}

export function createRiverPayload(o: RiverOptions): PaperFeaturePayload {
  const W = RIVER_WORDS[o.lang]
  const steps: PaperFeatureStep[] = STEP_IDS.map((id, i) => ({ id, name: W.steps[id], line: W.band[id], certainty: CERTAINTY[i]! }))
  return createPaperFeature({
    kind: 'paper',
    lang: o.lang,
    reducedMotion: o.reducedMotion,
    title: W.ui.title,
    words: { play: W.ui.play, pause: W.ui.pause, track: W.ui.track, between: W.ui.between },
    steps,
    css,
    ink: o.ink,
    vars: { '--river-570': srgbOf(o.water) },
    images: { photo: o.photo },
    scene: (t, framing, w, h, x) => riverScene(t, framing, w, h, { inset: x.inset }),
    text: (id) => riverLabel(o.lang, id),
    list: (step) => W.list[STEP_IDS[step]!],
  })
}
