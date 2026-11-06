/* FEATURE 11'S WORDS. Three kinds, kept apart (feature 10's rule):
   - the plate's numbers and names (`labels`): numbers with their unit and single names only; no qualifier stands on
     the plate, the band and the list carry "about"; a no-break space binds a number to its unit;
   - the band's lines, the list's sentences, the step names and the look's own words: the writer's, not yet written,
     listed in `DRAFT_WORDS`; a band line, a list sentence, the title, the door and the close show the word DRAFT;
   - the photograph's credit and its date, printed as its record gives them, in every language.
   The sky's numbers are printed from the computed files (`printed` in sky-data.ts); a test holds every number these
   words carry equal to them, and every number of the edition to "about". */

import { DIARY, PHOTO, SHEKEL_G, litresOf, printed, type Evening, type Good } from './sky-data'

export type SkyLang = 'en' | 'de'
export const STEP_IDS = ['evenings', 'shekel', 'rise'] as const
export type StepId = typeof STEP_IDS[number]

const DRAFT = 'DRAFT'
const NB = '\u00a0'

/** a number as each language writes it */
export function num(lang: SkyLang, n: number, digits = 1): string {
  const s = n.toFixed(digits)
  return lang === 'de' ? s.replace('.', ',') : s
}

export interface SkyWords {
  steps: Record<StepId, string>
  labels: {
    date: Record<'0414' | '0415', string>
    sun: string; west: string; moonset: string
    /** under each lit share, Yallop's class in words: A and B to the eye, C found with optical aid, D only with it,
        E and F not at all */
    sight: { eye: string; hard: string; aid: string; none: string }
    good: Record<Good, string>; litres: string; silver: string
    tablet: string; tabletDate: string; credit: string
    rise: string; riseOld: string; figure: string
  }
  ui: { play: string; pause: string; track: string; between(a: string, b: string): string; title: string; door: string; close: string }
  band: Record<StepId, string>
  list: Record<StepId, string[]>
}

/** THE WRITER'S WORDS STILL TO WRITE, by their place in `SkyWords` */
export const DRAFT_WORDS = ['steps', 'band', 'list', 'labels.sight', 'ui.title', 'ui.door', 'ui.close'] as const

/** the phone sheet shows the title in one row, cut at its edge: about 36 characters fit at 360 px */
export const TITLE_CHARS = 36

/** THE BAND'S LINE AT THE CLOSE LOOK'S LENGTH (STORY-SYSTEM, THE LINE), as feature 10's */
export const LINE_CHARS = 100
export const SENTENCE_WORDS = 14

/** THE BAND'S LINES, one per step, for the writer: what each must carry and its pointer */
export const BAND_KEYS: Record<StepId, { carries: string; pointer: string }> = {
  evenings: {
    carries: 'the month and the year begin with tonight\'s crescent, so the day of the walk was the old year\'s last; both evenings computed (14 April too low and thin, 15 April easy to see), never "seen that evening"; no festival; whether anyone saw it is not known',
    pointer: 'TARGETS-W2B 13.3.1, 13.3.2, 13.3.9, 13.4; HOW-FUSED feature 11 beats; this round\'s STATUS item 2 (14 April), crescent round item 2 (15 April)',
  },
  shekel: {
    carries: 'a watcher\'s diary two years later (VAT 4956, Berlin, year 37, 568/567 BC): what one shekel of silver, about 8.3 g, bought, about 180 litres of barley, about 240 of dates, about 24 of sesame; silver weighed, not coined; the picture is BM 36761 of 331 to 330 BC, never VAT 4956; never "in 570"; kasu not cinnamon',
    pointer: 'TARGETS-W2B feature 11 "The tablet", "Numbers as things to see", "May not claim"; PHOTOS N3; RES section 3',
  },
  rise: {
    carries: 'the same diary: the river rose 3 cubits 8 fingers, about 1.65 m, in one spring (the 1915 edition\'s cubit of 0.495 m); never the level on 15 April 570 BC; the figure is our 1.70 m measure',
    pointer: 'TARGETS-W2B feature 11 "The river", "May not claim"; HOW-FUSED feature 11 ("in one spring", B\'s "seven weeks" stays out)',
  },
}

export const SKY_WORDS: Record<SkyLang, SkyWords> = {
  en: {
    steps: { evenings: 'Two evenings', shekel: 'One shekel', rise: 'The river rose' },
    labels: {
      date: { '0414': '14 April', '0415': '15 April' },
      sun: 'sun', west: 'W', moonset: 'moonset',
      sight: { eye: 'easy to see', hard: 'hard to see', aid: 'too thin to see', none: 'not to be seen' },
      good: { barley: 'barley', dates: 'dates', sesame: 'sesame' }, litres: 'litres', silver: 'silver',
      tablet: PHOTO.name, tabletDate: PHOTO.date.en, credit: PHOTO.credit,
      rise: `1.65${NB}m`, riseOld: `3 cubits 8 fingers`, figure: `1.70${NB}m`,
    },
    ui: {
      play: 'Play', pause: 'Pause', track: 'The evening and the tablet, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      title: `${DRAFT} The evening sky, the tablet`, door: `${DRAFT} See the first crescent`, close: `${DRAFT} Back to the bridge`,
    },
    band: {
      evenings: `${DRAFT} · Computed: on 14 April too thin to see, on 15 April easy. With it the new year began.`,
      shekel: `${DRAFT} · Two years later a watcher noted what one shekel of silver bought. About this much.`,
      rise: `${DRAFT} · The same diary: in one spring the river rose about 1.65${NB}m. Almost the figure.`,
    },
    list: {
      evenings: [
        `${DRAFT} The month began when the new crescent was first seen at sunset. This evening began the king's 35th year.`,
        `${DRAFT} 14 April 570${NB}BC, at sunset: the crescent 6.4° up and 0.7${NB}% lit. It set 36 minutes after the sun. Too thin to see.`,
        `${DRAFT} 15 April 570${NB}BC, at sunset: 19.1° up in the west and 3.7${NB}% lit. It set 99 minutes after the sun. Easy to see.`,
        `${DRAFT} So the day of the walk was the old year's last.`,
        `${DRAFT} Both skies are computed (JPL Horizons and Yallop's test). Whether anyone saw the crescent is not known.`,
        `${DRAFT} Each disc beside the sky is drawn larger: its lit part is to scale.`,
      ],
      shekel: [
        `${DRAFT} The diary ${DIARY.name} (Berlin) is of the king's 37th year, ${DIARY.year}${NB}BC, two years after the walk.`,
        `${DRAFT} One shekel of silver, about 8.3${NB}g, bought about 180 litres of barley, about 240 of dates or about 24 of sesame.`,
        `${DRAFT} Silver was weighed, not coined. The numbers are read in the 1915 edition.`,
        `${DRAFT} It also prices kasû, most likely a plant used to season date beer.`,
        `${DRAFT} The picture shows another diary of the same kind, ${PHOTO.name}, from ${PHOTO.date.en}. No open photograph of the Berlin tablet was found.`,
        `${DRAFT} The heaps are made to the edition's numbers at one slope of ours, beside our 1.70${NB}m figure.`,
      ],
      rise: [
        `${DRAFT} The same diary: from the 8th of the extra month Addaru to the 29th of Nisannu, the river rose 3 cubits 8 fingers.`,
        `${DRAFT} With the 1915 edition's cubit of 0.495${NB}m, that is about 1.65${NB}m in one spring.`,
        `${DRAFT} How high the river stood on the walk's day is not known.`,
        `${DRAFT} The gauge and the 1.70${NB}m figure are our measures.`,
      ],
    },
  },
  de: {
    steps: { evenings: 'Zwei Abende', shekel: 'Ein Schekel', rise: 'Der Fluss stieg' },
    labels: {
      date: { '0414': '14. April', '0415': '15. April' },
      sun: 'Sonne', west: 'W', moonset: 'Monduntergang',
      sight: { eye: 'gut sichtbar', hard: 'schwer zu sehen', aid: 'zu schmal fürs Auge', none: 'nicht zu sehen' },
      good: { barley: 'Gerste', dates: 'Datteln', sesame: 'Sesam' }, litres: 'Liter', silver: 'Silber',
      tablet: PHOTO.name, tabletDate: PHOTO.date.de, credit: PHOTO.credit,
      rise: `1,65${NB}m`, riseOld: `3 Ellen 8 Finger`, figure: `1,70${NB}m`,
    },
    ui: {
      play: 'Abspielen', pause: 'Anhalten', track: 'Der Abend und die Tafel, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      title: `${DRAFT} Der Abendhimmel, die Tafel`, door: `${DRAFT} Die erste Sichel sehen`, close: `${DRAFT} Zurück zur Brücke`,
    },
    band: {
      evenings: `${DRAFT} · Berechnet: am 14. zu schmal, am 15. April gut sichtbar. Mit ihr begann das neue Jahr.`,
      shekel: `${DRAFT} · Zwei Jahre später notierte ein Beobachter, was ein Schekel kaufte. Etwa so viel.`,
      rise: `${DRAFT} · Dieselbe Tafel: In einem Frühjahr stieg der Fluss um etwa 1,65${NB}m. Fast die Größe der Figur.`,
    },
    list: {
      evenings: [
        `${DRAFT} Der Monat begann, wenn die neue Sichel zum ersten Mal bei Sonnenuntergang zu sehen war. Dieser Abend begann das 35. Jahr des Königs.`,
        `${DRAFT} 14. April 570${NB}v.${NB}Chr., bei Sonnenuntergang: die Sichel 6,4° hoch und zu 0,7${NB}% beleuchtet. Sie ging 36 Minuten nach der Sonne unter. Zu schmal zum Sehen.`,
        `${DRAFT} 15. April 570${NB}v.${NB}Chr., bei Sonnenuntergang: 19,1° hoch im Westen und zu 3,7${NB}% beleuchtet. Sie ging 99 Minuten nach der Sonne unter. Gut zu sehen.`,
        `${DRAFT} Der Tag des Rundgangs war also der letzte des alten Jahres.`,
        `${DRAFT} Beide Himmel sind berechnet (JPL Horizons und Yallops Test). Ob jemand die Sichel sah, ist nicht bekannt.`,
        `${DRAFT} Jede Scheibe neben dem Himmel ist größer gezeichnet: Ihr beleuchteter Teil ist maßstäblich.`,
      ],
      shekel: [
        `${DRAFT} Die Tafel ${DIARY.name} (Berlin) stammt aus dem 37. Jahr des Königs, ${DIARY.year}${NB}v.${NB}Chr., zwei Jahre nach dem Rundgang.`,
        `${DRAFT} Ein Schekel Silber, etwa 8,3${NB}g, kaufte etwa 180 Liter Gerste, etwa 240 Liter Datteln oder etwa 24 Liter Sesam.`,
        `${DRAFT} Silber wurde gewogen, nicht geprägt. Die Zahlen sind in der Ausgabe von 1915 gelesen.`,
        `${DRAFT} Sie nennt auch einen Preis für kasû, wohl eine Pflanze zum Würzen von Dattelbier.`,
        `${DRAFT} Das Bild zeigt eine andere Tafel derselben Art, ${PHOTO.name}, aus ${PHOTO.date.de}. Ein freies Foto der Berliner Tafel fand sich nicht.`,
        `${DRAFT} Die Haufen folgen den Zahlen der Ausgabe, mit einem Böschungswinkel von uns, neben unserer Figur von 1,70${NB}m.`,
      ],
      rise: [
        `${DRAFT} Dieselbe Tafel: Vom 8. des Schaltmonats Addaru bis zum 29. Nisannu stieg der Fluss um 3 Ellen 8 Finger.`,
        `${DRAFT} Mit der Elle von 0,495${NB}m aus der Ausgabe von 1915 sind das etwa 1,65${NB}m in einem Frühjahr.`,
        `${DRAFT} Wie hoch der Fluss am Tag des Rundgangs stand, ist nicht bekannt.`,
        `${DRAFT} Der Pegel und die Figur von 1,70${NB}m sind unsere Maße.`,
      ],
    },
  },
}

/** a label's words on the plate; the sky's numbers come from the computation, formatted per language */
export function skyLabel(lang: SkyLang, id: string): string {
  const L = SKY_WORDS[lang].labels
  const flat: Record<string, string> = {
    sun: L.sun, west: L.west, silver: L.silver, tablet: L.tablet, tabletDate: L.tabletDate, credit: L.credit,
    rise: L.rise, riseOld: L.riseOld, figure: L.figure, ...Object.fromEntries(Object.entries(L.good).map(([k, v]) => [`good-${k}`, v])),
    'date-0414': L.date['0414'], 'date-0415': L.date['0415'],
  }
  return flat[id] ?? id
}

const SIGHT = { A: 'eye', B: 'eye', C: 'hard', D: 'aid', E: 'none', F: 'none' } as const

/** a label's words: the sky's numbers from the computation, the heaps' from the edition, the rest from the words */
export function skyText(lang: SkyLang, evenings: readonly Evening[], id: string): string | readonly [string, string] {
  const W = SKY_WORDS[lang], L = W.labels, NB = '\u00a0'
  const m = /^(height|lit|share|sight|moonset|sun|west|date)-(\d{4})$/.exec(id)
  if (m) {
    const e = evenings.find((x) => x.id === m[2])!
    const p = printed(e)
    if (m[1] === 'height') return `${num(lang, p.height)}°`
    if (m[1] === 'lit') return [`${num(lang, p.lit)}${NB}%`, L.sight[SIGHT[e.cls]]]
    if (m[1] === 'share') return `${num(lang, p.lit)}${NB}%`
    if (m[1] === 'sight') return L.sight[SIGHT[e.cls]]
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
