/* FEATURE 6'S WORDS. Three kinds, kept apart:
   - the plate's names and numbers (`readings`, `name`, `labels`): single names and numbers with their unit only, the
     sign readings the edition's own (KÁ, DINGIR, RA, KI); no qualifier stands on the plate or the clay, the band
     carries it;
   - the band's lines, the list's sentences, the title, the door and the close: the writer's, not yet written, listed
     in `DRAFT_WORDS`; each shows the word DRAFT, at about the close look's length so its rows can be checked;
   - the controls' plain words, and the walk's own (`ui.next`, `ui.stepOf`, `ui.book`, `ui.lower`). */

export type ClayLang = 'en' | 'de'

/** THE LOOK'S STEPS: the press on the turntable, then paper: the name in letters, folded into signs, a student's steps,
 *  who could read */
export const STEP_IDS = ['press', 'letters', 'signs', 'students', 'readers'] as const
export type StepId = typeof STEP_IDS[number]
/** the band's lines inside the press step: the fresh tablet, then each sign as it is finished */
export const PRESS_KEYS = ['press.rest', 'press.ka', 'press.dingir', 'press.ra', 'press.ki'] as const
export type BandKey = typeof PRESS_KEYS[number] | Exclude<StepId, 'press'>

/** A STUDENT'S STEPS, a type (Gesche 2000 as Still summarises it; TARGETS-W2A 7.5): each drawn Guessed for these tablets */
export const STUDENT_STEPS = ['stylus', 'lists', 'extracts', 'letters', 'literary'] as const
export type StudentStep = typeof STUDENT_STEPS[number]

export interface ClayWords {
  readings: readonly [string, string, string, string]
  /** the city's name in our alphabet, one box a letter */
  name: string
  labels: { steps: Record<StudentStep, string>; ruler: string; credit: string; later: string }
  ui: {
    title: string; door: string; close: string; press: string; back: string; all: string
    /** the press row's names as a screen reader says them, where the row's own word is short */
    said: { press: string; back: string; all: string }
    play: string; pause: string; again: string
    wedges(n: number, of: number): string
    track: string; between(a: string, b: string): string
    next: string; stepOf(n: number, of: number): string; raise: string; lower: string; book: string; more: string
  }
  steps: Record<StepId, string>
  band: Record<BandKey, string>
  list: Record<Exclude<StepId, 'press'>, readonly string[]>
}

const DRAFT = 'DRAFT'
/** THE WRITER'S WORDS STILL TO WRITE, by their place in `ClayWords`: every one a DRAFT placeholder, never shipped */
export const DRAFT_WORDS = ['band', 'list', 'ui.title', 'ui.door', 'ui.close'] as const

/** A BAND LINE: about ninety characters, no sentence over fourteen words (STORY-SYSTEM "THE LINE"), DRAFT included */
export const LINE_CHARS = 90, SENTENCE_WORDS_MOST = 14, LINE_WORDS_MOST = 20

/** THE BAND'S LINES for the writer: what each carries and where it comes from (TARGETS-W2A 7.5; RULES-W2A F6) */
export const BAND_KEYS: Record<BandKey, { carries: string; pointer: string }> = {
  'press.rest': { carries: 'a fresh tablet of wet clay and a stylus, both ours; press to write the city\'s name the way its scribes did', pointer: 'HF 3.6 Beats; SIGNS 6 (the stylus ours); TARGETS-W2A 7.5 "How Babylon wrote"' },
  'press.ka': { carries: 'the first sign, KÁ, finished; the order of the wedges is ours', pointer: 'SIGNS 4 (the reading); BRIEF "The wedge order is ours and said so"' },
  'press.dingir': { carries: 'DINGIR, the second sign; never a meaning for it', pointer: 'REC bab.cityname; SIGNS 4' },
  'press.ra': { carries: 'RA, the third sign', pointer: 'SIGNS 4; RULES-W2A F6.1' },
  'press.ki': { carries: 'KI ends the name unspoken, a marker that a place is meant (the edition\'s braces); four signs, one name', pointer: 'SIGNS 4 "KI is a determinative"; RIBo Nebuchadnezzar II 035 ii 6' },
  letters: { carries: 'in our alphabet the name takes seven letters', pointer: 'TARGETS-W2A 7.5; HF 3.6 (A\'s slide)' },
  signs: { carries: 'in cuneiform it takes four signs: cuneiform writes syllables and words, not letters; the signs after editions', pointer: 'TARGETS-W2A 7.5; RULES-W2A F6.1; SEL; SIGNS 5 "For the words"' },
  students: { carries: 'over 1,500 students\' tablets lay in the fill under this temple\'s raised floor; the steps are a type, the photo one school tablet from a later century', pointer: 'TARGETS-W2A 7.5 "A student\'s steps"; WANTED 2; RULES-W2A F6.3, F6.4' },
  readers: { carries: 'most people could not read; priests, scribes, officials and the big families could; Aramaic was rising beside it, in ink on materials that perished', pointer: 'TARGETS-W2A 7.5 "Who could read", "In which scripts"; RULES-W2A F6.2, F6.6; no share for the city' },
}

export const CLAY_WORDS: Record<ClayLang, ClayWords> = {
  en: {
    readings: ['KÁ', 'DINGIR', 'RA', 'KI'],
    name: 'BABYLON',
    labels: {
      steps: { stylus: 'stylus and clay', lists: 'sign and word lists', extracts: 'extracts', letters: 'letters and contracts', literary: 'literary texts' },
      ruler: '10 cm', credit: 'The Met 86.11.361, CC0', later: 'from a later century',
    },
    ui: {
      title: `${DRAFT} Write in clay`, door: `${DRAFT} Write the city's name`, close: `${DRAFT} Back to the temple`,
      press: 'Press', back: 'Back', all: 'Press all', said: { press: 'Press a wedge', back: 'Take the last wedge out', all: 'Press the whole name' }, play: 'Play', pause: 'Pause', again: 'Fresh clay',
      wedges: (n, of) => `${n} of ${of} wedges`,
      track: 'Write in clay, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      next: 'Next', stepOf: (n, of) => `step ${n} of ${of}`, raise: 'All steps', lower: 'Close', book: 'Menu', more: 'Read more',
    },
    steps: { press: 'the name', letters: 'letters', signs: 'signs', students: 'students', readers: 'readers' },
    band: {
      'press.rest': `${DRAFT} · A fresh tablet of wet clay and a stylus, both ours. Press to write the name.`,
      'press.ka': `${DRAFT} · The first sign, KÁ, is done. The order of its wedges is ours.`,
      'press.dingir': `${DRAFT} · The second sign, DINGIR. Every wedge is one press of the stylus.`,
      'press.ra': `${DRAFT} · The third sign, RA. Two more to go before the name stands.`,
      'press.ki': `${DRAFT} · KI ends the name unspoken. It marks that a place is meant.`,
      letters: `${DRAFT} · In our alphabet the city's name takes seven letters.`,
      signs: `${DRAFT} · In cuneiform it takes four signs. They write syllables and words, not letters.`,
      students: `${DRAFT} · Over 1,500 students' tablets lay under this floor. The photo is from a later century.`,
      readers: `${DRAFT} · Most people could not read. Aramaic rose beside it, in ink on things that perished.`,
    },
    list: {
      letters: [`${DRAFT} The name in our alphabet: seven letters, one box each, in pencil.`],
      signs: [`${DRAFT} The same name in cuneiform: four signs in ink, KÁ, DINGIR, RA and KI.`, `${DRAFT} KI is not spoken.`],
      students: [`${DRAFT} Five steps of a student's training, dashed: a type, guessed for these tablets.`, `${DRAFT} One school tablet from a later century, 9.9 by 9.7 cm, beside a 10 cm ruler.`],
      readers: [`${DRAFT} Most people could not read. No share for the city is known.`],
    },
  },
  de: {
    readings: ['KÁ', 'DINGIR', 'RA', 'KI'],
    name: 'BABYLON',
    labels: {
      steps: { stylus: 'Griffel und Ton', lists: 'Zeichen- und Wortlisten', extracts: 'Auszüge', letters: 'Briefe und Verträge', literary: 'literarische Texte' },
      ruler: '10 cm', credit: 'The Met 86.11.361, CC0', later: 'aus einem späteren Jahrhundert',
    },
    ui: {
      title: `${DRAFT} In Ton schreiben`, door: `${DRAFT} Den Namen der Stadt schreiben`, close: `${DRAFT} Zurück zum Tempel`,
      press: 'Drücken', back: 'Zurück', all: 'Alle drücken', said: { press: 'Einen Keil eindrücken', back: 'Den letzten Keil herausnehmen', all: 'Den ganzen Namen eindrücken' }, play: 'Abspielen', pause: 'Pause', again: 'Frischer Ton',
      wedges: (n, of) => `${n} von ${of} Keilen`,
      track: 'In Ton schreiben, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      next: 'Weiter', stepOf: (n, of) => `Schritt ${n} von ${of}`, raise: 'Alle Schritte', lower: 'Schließen', book: 'Menü', more: 'Mehr lesen',
    },
    steps: { press: 'der Name', letters: 'Buchstaben', signs: 'Zeichen', students: 'Lernende', readers: 'Lesende' },
    band: {
      'press.rest': `${DRAFT} · Eine frische Tafel aus feuchtem Ton und ein Griffel, beide von uns. Drück, um den Namen zu schreiben.`,
      'press.ka': `${DRAFT} · Das erste Zeichen, KÁ, steht. Die Reihenfolge seiner Keile ist unsere.`,
      'press.dingir': `${DRAFT} · Das zweite Zeichen, DINGIR. Jeder Keil ist ein Druck des Griffels.`,
      'press.ra': `${DRAFT} · Das dritte Zeichen, RA. Noch eines, dann steht der Name.`,
      'press.ki': `${DRAFT} · KI beendet den Namen, ohne gesprochen zu werden. Es zeigt an, dass ein Ort gemeint ist.`,
      letters: `${DRAFT} · In unserem Alphabet braucht der Name der Stadt sieben Buchstaben.`,
      signs: `${DRAFT} · In Keilschrift braucht er vier Zeichen. Sie schreiben Silben und Wörter, keine Buchstaben.`,
      students: `${DRAFT} · Über 1.500 Tafeln von Lernenden lagen unter diesem Boden. Das Foto ist aus einem späteren Jahrhundert.`,
      readers: `${DRAFT} · Die meisten Menschen konnten nicht lesen. Aramäisch kam auf, mit Tinte auf Vergänglichem.`,
    },
    list: {
      letters: [`${DRAFT} Der Name in unserem Alphabet: sieben Buchstaben, je ein Kästchen, in Bleistift.`],
      signs: [`${DRAFT} Derselbe Name in Keilschrift: vier Zeichen in Tinte, KÁ, DINGIR, RA und KI.`, `${DRAFT} KI wird nicht gesprochen.`],
      students: [`${DRAFT} Fünf Schritte der Ausbildung, gestrichelt: ein Typ, für diese Tafeln vermutet.`, `${DRAFT} Eine Schultafel aus einem späteren Jahrhundert, 9,9 mal 9,7 cm, neben einem 10-cm-Lineal.`],
      readers: [`${DRAFT} Die meisten Menschen konnten nicht lesen. Ein Anteil für die Stadt ist nicht bekannt.`],
    },
  },
}

/** the band's key at a count of finished signs: the fresh tablet, then the last sign finished */
export function pressKey(signsDone: number): typeof PRESS_KEYS[number] {
  return PRESS_KEYS[Math.max(0, Math.min(4, signsDone))]!
}
