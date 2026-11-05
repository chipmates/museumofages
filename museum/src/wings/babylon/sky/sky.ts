/* FEATURE 11, THE EVENING SKY AND THE WATCHER'S TABLET, as a close look's payload on the paper kit (`paper/feature.ts`):
   opened from stop 13's held frame through the stop's ink still, three named steps (the two evenings, one shekel, the
   river's rise), the words in the band, closed onto the frame. The evenings come from their computed files, handed in
   as read; the photograph, the stage's pictures and the ink still come by address. Every word comes from
   `sky-words.ts`. */

import css from './sky.css?inline'
import { createPaperFeature, type PaperFeaturePayload, type PaperFeatureStep } from '../paper/feature'
import type { SkyFile } from '../crescent/sky'
import { EVENING_IDS, eveningOf, heaps, litresOf, printed, SHEKEL_G, type Evening } from './sky-data'
import { skyScene, type SkyData } from './sky-scene'
import { SKY_WORDS, STEP_IDS, num, skyLabel, type SkyLang } from './sky-words'

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

/** a label's words: the sky's numbers from the computation, the heaps' from the edition, the rest from the words */
export function skyText(lang: SkyLang, evenings: readonly Evening[], id: string): string | readonly [string, string] {
  const W = SKY_WORDS[lang], L = W.labels, NB = ' '
  const m = /^(height|lit|moonset|sun|west|date)-(\d{4})$/.exec(id)
  if (m) {
    const e = evenings.find((x) => x.id === m[2])!
    const p = printed(e)
    if (m[1] === 'height') return `${num(lang, p.height)}°`
    if (m[1] === 'lit') return `${num(lang, p.lit)}${NB}%`
    if (m[1] === 'moonset') return [`+${p.lag}${NB}min`, L.moonset]
    if (m[1] === 'sun') return L.sun
    if (m[1] === 'west') return L.west
    return L.date[e.id]
  }
  const g = /^good-(\w+)$/.exec(id)
  if (g) return [`${Math.round(litresOf(g[1] as 'barley'))}${NB}${L.litres}`, L.good[g[1] as 'barley']]
  if (id === 'silver') return [`${num(lang, SHEKEL_G)}${NB}g`, L.silver]
  if (id === 'tablet') return [L.tablet, L.tabletDate]
  if (id === 'rise') return [L.rise, L.riseOld]
  return skyLabel(lang, id)
}

export function createSkyPayload(o: SkyOptions): PaperFeaturePayload {
  const W = SKY_WORDS[o.lang]
  const evenings = EVENING_IDS.map((id) => eveningOf(id, o.skies[id]))
  const data: SkyData = { evenings }
  const steps: PaperFeatureStep[] = STEP_IDS.map((id, i) => ({ id, name: W.steps[id], line: W.band[id], certainty: CERTAINTY[i]! }))
  void heaps
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
