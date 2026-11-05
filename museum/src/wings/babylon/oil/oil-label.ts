/* THE PLATE'S WORDS for feature 2, apart from the page so node checks them:
   a row's count over its name only where the band names the count. */

import { COUNTED, type OilLabel } from './oil-scene'
import { HALVES, ROWS } from './oil-data'
import { OIL_WORDS, type OilLang } from './oil-words'

/** a sila count as the page's language writes it: 10, 2½, ½ */
export function silaText(n: number, lang: string): string {
  const whole = Math.floor(n), half = n - whole > 0.25
  return `${whole ? new Intl.NumberFormat(lang).format(whole) : ''}${half ? '½' : ''}`
}

/** a label's words: a row's count stands over its name only where the step's band line names the count */
export function oilLabel(lang: OilLang, id: OilLabel, step: number): string | readonly [string, string] {
  const L = OIL_WORDS[lang].labels
  if (id === 'ruler') return L.cm(10)
  if (id === 'credit') return L.credit
  if (id.startsWith('land-')) return L.lands[id.slice(5) as keyof typeof L.lands]
  const row = id.slice(4)
  const counted = (COUNTED[step] ?? []).includes(row)
  if (row === 'halves') return L.halves(HALVES, L.sila(silaText(0.5, lang)))
  const sila = ROWS.find((r) => r.id === row)!.sila
  const name = L[row as 'king' | 'sons' | 'men' | 'carpenter']
  return counted ? [L.sila(silaText(sila, lang)), name] : name
}

