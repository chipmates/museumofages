/* FEATURE 6'S WORDS. The sign readings are single names on their signs, the edition's own (KÁ, DINGIR, RA, KI); every
   qualifier stands in the band. The band's lines, the title, the door and the step names are the writer's, not yet
   written: each shows the word DRAFT, and `BAND_KEYS` says what it must carry. The control words are plain. */

export type ClayLang = 'en' | 'de'

export const STEP_IDS = ['press', 'letters', 'students', 'readers'] as const
export type StepId = typeof STEP_IDS[number]
/** the band's lines inside the press step: the fresh tablet, then each sign as it is finished */
export const PRESS_KEYS = ['press.rest', 'press.ka', 'press.dingir', 'press.ra', 'press.ki'] as const
export type BandKey = typeof PRESS_KEYS[number] | Exclude<StepId, 'press'>

export interface ClayWords {
  readings: readonly [string, string, string, string]
  ui: { title: string; door: string; press: string; back: string; play: string; pause: string; again: string; wedges(n: number, of: number): string }
  steps: Record<StepId, string>
  band: Record<BandKey, string>
}

const DRAFT = 'DRAFT'
export const DRAFT_WORDS = ['ui.title', 'ui.door', 'steps', 'band'] as const

/** THE BAND'S LINES for the writer: what each carries and where it comes from (TARGETS-W2A 7.5; RULES-W2A F6) */
export const BAND_KEYS: Record<BandKey, { carries: string; pointer: string }> = {
  'press.rest': { carries: 'a fresh tablet of wet clay and a stylus, both ours; press to write the city\'s name the way its scribes did', pointer: 'HF 3.6 Beats; SIGNS 6 (the stylus ours); TARGETS-W2A 7.5 "How Babylon wrote"' },
  'press.ka': { carries: 'the first sign, KÁ, finished; the order of the wedges is ours', pointer: 'SIGNS 4 (the reading); BRIEF "The wedge order is ours and said so"' },
  'press.dingir': { carries: 'DINGIR, the second sign; never a meaning for it', pointer: 'REC bab.cityname; SIGNS 4' },
  'press.ra': { carries: 'RA, the third sign, written for its sound', pointer: 'SIGNS 4; RULES-W2A F6.1' },
  'press.ki': { carries: 'KI ends the name unspoken, a marker that a place is meant (the edition\'s braces); four signs, one name', pointer: 'SIGNS 4 "KI is a determinative"; RIBo Nebuchadnezzar II 035 ii 6' },
  letters: { carries: 'seven letters in our alphabet, four signs in theirs: cuneiform writes syllables and words, not letters', pointer: 'TARGETS-W2A 7.5; RULES-W2A F6.1; SEL' },
  students: { carries: 'over 1,500 students\' tablets lay under this temple\'s floor; the steps are a type, the photo one school tablet from a later century', pointer: 'TARGETS-W2A 7.5 "A student\'s steps"; WANTED 2; RULES-W2A F6.3, F6.4' },
  readers: { carries: 'most people could not read; priests, scribes, officials and the big families could; Aramaic was rising, in ink on materials that perished', pointer: 'TARGETS-W2A 7.5 "Who could read", "In which scripts"; RULES-W2A F6.2, F6.6; no share for the city' },
}

const band = Object.fromEntries(Object.keys(BAND_KEYS).map(k => [k, `${DRAFT} clay.${k}`])) as Record<BandKey, string>

export const CLAY_WORDS: Record<ClayLang, ClayWords> = {
  en: {
    readings: ['KÁ', 'DINGIR', 'RA', 'KI'],
    ui: { title: `${DRAFT} clay.title`, door: `${DRAFT} clay.door`, press: 'Press a wedge', back: 'Back one wedge', play: 'Play', pause: 'Pause', again: 'Fresh clay',
      wedges: (n, of) => `${n} of ${of} wedges` },
    steps: { press: `${DRAFT} press`, letters: `${DRAFT} letters`, students: `${DRAFT} students`, readers: `${DRAFT} readers` },
    band,
  },
  de: {
    readings: ['KÁ', 'DINGIR', 'RA', 'KI'],
    ui: { title: `${DRAFT} clay.title`, door: `${DRAFT} clay.door`, press: 'Keil eindrücken', back: 'Einen Keil zurück', play: 'Abspielen', pause: 'Pause', again: 'Frischer Ton',
      wedges: (n, of) => `${n} von ${of} Keilen` },
    steps: { press: `${DRAFT} press`, letters: `${DRAFT} letters`, students: `${DRAFT} students`, readers: `${DRAFT} readers` },
    band,
  },
}

/** the band's key at a count of pressed wedges: the fresh tablet, then the last sign finished */
export function pressKey(signsDone: number): typeof PRESS_KEYS[number] {
  return PRESS_KEYS[Math.max(0, Math.min(4, signsDone))]!
}
