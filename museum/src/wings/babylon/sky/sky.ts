/* FEATURE 11, THE EVENING SKY AND THE WATCHER'S TABLET, as a close look's payload on the paper kit (`paper/feature.ts`):
   opened from stop 13's held frame through the stop's ink still, three named steps (the two evenings, one shekel, the
   river's rise), the words in the band, closed onto the frame. The evenings come from their computed files, handed in
   as read; the photograph, the stage's pictures and the ink still come by address. Every word comes from
   `sky-words.ts`. */

import css from './sky.css?inline'
import { createPaperFeature, type PaperFeaturePayload, type PaperFeatureStep } from '../paper/feature'
import type { SkyFile } from '../crescent/sky'
import { EVENING_IDS, eveningOf } from './sky-data'
import { skyScene, type SkyData } from './sky-scene'
import { SKY_WORDS, STEP_IDS, skyText, type SkyLang } from './sky-words'

export { skyText }

export interface SkyOptions {
  lang: SkyLang
  reducedMotion: boolean
  /** the two evenings' computed files: 14 April (`sky-0414.json`) and 15 April (`crescent/sky-570.json`) */
  skies: { '0414': SkyFile; '0415': SkyFile }
  /** BM 36761's photograph; the stage's pictures of the heaps per framing and of the lump */
  photo: string
  heaps: { wide: string; upright: string }
  silver: string
  ink: { wide: string; upright: string } | null
  /** the stop's water as its plan gives it: a linear albedo, 0 to 1 */
  water: readonly [number, number, number]
}

/** the band's mark per step: the evenings are a computation, the tablet a document, the rise its number */
const CERTAINTY = ['documented', 'documented', 'documented'] as const

export function srgbOf(lin: readonly [number, number, number]): string {
  const enc = (c: number): number => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  return `rgb(${lin.map(enc).join(' ')})`
}

export function createSkyPayload(o: SkyOptions): PaperFeaturePayload {
  const W = SKY_WORDS[o.lang]
  const evenings = EVENING_IDS.map((id) => eveningOf(id, o.skies[id]))
  const data: SkyData = { evenings }
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
    vars: { '--sky-water': srgbOf(o.water) },
    images: { photo: o.photo, heaps: o.heaps, silver: o.silver },
    data: data as unknown as Record<string, unknown>,
    scene: (t, framing, w, h, x) => skyScene(t, framing, w, h, { inset: x.inset, data: x.data as unknown as SkyData, lang: o.lang }),
    text: (id) => skyText(o.lang, evenings, id),
    list: (step) => W.list[STEP_IDS[step]!],
  })
}
