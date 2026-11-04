/* FEATURE 7'S WORDS. Three kinds, kept apart:
   - the plate's numbers and names (`labels`): numbers with their unit and
     single names only, the English from the targets (TARGETS-W2A feature 7),
     the German a first form for the writer's check; no qualifier stands on
     the plate, the band carries it;
   - the band's lines, the list's sentences, the step names and the look's own
     words (`band`, `list`, `steps`, the title, the door, the close, the raise):
     the writer's, not yet written, listed in `DRAFT_WORDS`. A band line or a
     door shows the word DRAFT; a step name and the raise do not, since they
     size their own rows;
   - the walk's own control words (`ui.next`, `ui.stepOf`, `ui.book`,
     `ui.lower`), copied as the walk's cards and lobby carry them. */

export type MeasureLang = 'en' | 'de'

export const STEP_IDS = ['not-known', 'h66', 'h90', 'base', 'bricks', 'walls'] as const
export type StepId = typeof STEP_IDS[number]

export interface MeasureWords {
  steps: Record<StepId, string>
  labels: {
    about66: string; about90: string; base: string; figure: string
    million(n: string): string; mud: string; baked: string; walls: string; tower: string
  }
  ui: {
    play: string; pause: string; track: string; between(a: string, b: string): string; close: string; door: string; title: string
    /** the walk's way on, and the clock's count of steps */
    next: string; stepOf(n: number, of: number): string
    /** the phone's sheet: its word up to the steps, its word down, and the book's seat; the desktop's reading row */
    raise: string; lower: string; book: string; more: string
  }
  band: Record<StepId, string>
  list: {
    base: string; core: string; notKnown: string; height(label: string): string; stages: string; figures(n: number): string
    bricks(mud: string, baked: string): string; walls(lo: number, hi: number): string
  }
}

const DRAFT = 'DRAFT'

/** THE WRITER'S WORDS STILL TO WRITE, by their place in `MeasureWords`: every one a DRAFT placeholder, never shipped */
export const DRAFT_WORDS = ['steps', 'band', 'list', 'ui.close', 'ui.door', 'ui.title', 'ui.raise'] as const

/** A BAND LINE STANDS IN TWO ROWS of the desktop's band: twenty words at most, counted as shown, DRAFT included */
export const LINE_WORDS_MOST = 20

/** THE BAND'S LINES, one per step, for the writer: what each must carry and its pointer (TARGETS-W2A, feature 7);
    the shown placeholder is cut to the band's twenty words, the carry keeps the whole fact */
export const BAND_KEYS: Record<StepId, { carries: string; pointer: string }> = {
  'not-known': {
    carries: 'Koldewey, who dug it, says the complete height is not known. What was dug is a base about 90 m a side',
    pointer: 'TARGETS-W2A F7 "How tall" bullet 1 and "The base"; C914 S9-12, S9-13, S9-17; REC bab.tower.base',
  },
  h66: {
    carries: 'about 66 m is one reading, from a 2005 study by Montero Fenollós that we cite and have not read. 39 figures',
    pointer: 'TARGETS-W2A F7 "How tall" bullet 4 and "As things"; C914 S9-17; RULES-W2A F7.1, F7.2',
  },
  h90: {
    carries: 'about 90 m adds up the stages of the Esagila tablet, a later school text copied in 229 BC, stage six restored. 53 figures',
    pointer: 'TARGETS-W2A F7 "How tall" bullet 2; REC bab.tower.stages, bab.tower.height; TARGETS 9 (the walk is built from it)',
  },
  base: {
    carries: 'no reading is the height of the tower, and no span of readings is either. The height is not known',
    pointer: 'TARGETS-W2A F7 "What it may not claim" 1; RULES-W2A F7.1; REC bab.tower.height never',
  },
  bricks: {
    carries: 'in one model, Pedersén\'s, the tower at the end of the reign holds 8.7 million mud bricks and 30.2 million baked',
    pointer: 'TARGETS-W2A F7 "The brick count"; P2021 p. 164 to 165; RULES-W2A F7.4 (never "were used")',
  },
  walls: {
    carries: 'in the same model the city walls held twelve to fifteen times as many, by how the palace walls are counted',
    pointer: 'TARGETS-W2A F7 "The brick count" bullet 2; P2021 p. 165 (the walls at the end of Nabonidus\'s reign); HF 3.7 catch',
  },
}

export const MEASURE_WORDS: Record<MeasureLang, MeasureWords> = {
  en: {
    // step 3 is named by what it shows once the readings have left: the base as dug, and nothing above it
    steps: { 'not-known': 'not known', h66: 'about 66\u00a0m', h90: 'about 90\u00a0m', base: 'the base', bricks: 'bricks', walls: 'city walls' },
    labels: {
      about66: 'about 66\u00a0m', about90: 'about 90\u00a0m', base: 'about 90\u00a0m', figure: '1.70\u00a0m',
      million: n => `${n} million`, mud: 'mud bricks', baked: 'baked bricks', walls: 'city walls', tower: 'Etemenanki',
    },
    ui: {
      play: 'Play', pause: 'Pause', track: 'The tower\'s height, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      close: `${DRAFT} Back to the tower`, door: `${DRAFT} Measure the tower`, title: `${DRAFT} The tower you can measure`,
      next: 'Next', stepOf: (n, of) => `step ${n} of ${of}`, raise: 'All steps', lower: 'Close', book: 'Menu', more: 'Read more',
    },
    band: {
      'not-known': `${DRAFT} · Koldewey, who dug it, says the height is not known. He found a base about 90 m wide.`,
      h66: `${DRAFT} · About 66 m is one reading, from Montero Fenollós's 2005 study, which we have not read. 39 figures.`,
      h90: `${DRAFT} · About 90 m: the Esagila tablet's stages, a school copy of 229 BC, stage six restored. 53 figures.`,
      base: `${DRAFT} · No reading is the tower's height, and no span of readings is either. The height is not known.`,
      bricks: `${DRAFT} · In one model, Pedersén's, the tower at the reign's end holds 8.7 million mud bricks and 30.2 million baked.`,
      walls: `${DRAFT} · In that model the city walls held 12 to 15 times as many, by how the palace is counted.`,
    },
    list: {
      base: `${DRAFT} The base as dug, about 90 m a side: in place.`,
      core: `${DRAFT} Inside it the mud-brick core, about 60 m: in place.`,
      notKnown: `${DRAFT} Above the base its sides rise open, with no top: the height is not known.`,
      height: label => `${DRAFT} A dashed line at ${label}: one reading, guessed.`,
      stages: `${DRAFT} The tablet's seven stages, hatched: guessed.`,
      figures: n => (n === 1 ? `${DRAFT} One grey figure of 1.70 m, for scale.` : `${DRAFT} ${n} grey figures of 1.70 m, one on another.`),
      bricks: (mud, baked) => `${DRAFT} In one model: ${mud} mud bricks and ${baked} baked bricks, one square a million.`,
      walls: (lo, hi) => `${DRAFT} The city walls: ${lo} to ${hi} times the tower's bricks, in the same model.`,
    },
  },
  de: {
    steps: { 'not-known': 'nicht bekannt', h66: 'etwa 66\u00a0m', h90: 'etwa 90\u00a0m', base: 'der Sockel', bricks: 'Ziegel', walls: 'Stadt\u00admauern' },
    labels: {
      about66: 'etwa 66\u00a0m', about90: 'etwa 90\u00a0m', base: 'etwa 90\u00a0m', figure: '1,70\u00a0m',
      million: n => `${n} Millionen`, mud: 'Lehmziegel', baked: 'gebrannte Ziegel', walls: 'Stadtmauern', tower: 'Etemenanki',
    },
    ui: {
      play: 'Abspielen', pause: 'Anhalten', track: 'Die Höhe des Turms, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      close: `${DRAFT} Zurück zum Turm`, door: `${DRAFT} Den Turm vermessen`, title: `${DRAFT} Der Turm zum Nachmessen`,
      next: 'Weiter', stepOf: (n, of) => `Schritt ${n} von ${of}`, raise: 'Alle Schritte', lower: 'Schließen', book: 'Menü', more: 'Mehr lesen',
    },
    band: {
      'not-known': `${DRAFT} · Koldewey, der ihn ausgrub, sagt: Die Höhe ist nicht bekannt. Er fand einen Sockel von etwa 90 m.`,
      h66: `${DRAFT} · Etwa 66 m ist eine Lesart aus Montero Fenollós' Studie von 2005, von uns nicht gelesen. 39 Figuren.`,
      h90: `${DRAFT} · Etwa 90 m ergeben die Stufen der Esagila-Tafel, einer Schulabschrift von 229 v. Chr., Stufe sechs ergänzt. 53 Figuren.`,
      base: `${DRAFT} · Keine Lesart ist die Höhe des Turms, auch keine Spanne von Lesarten. Die Höhe ist nicht bekannt.`,
      bricks: `${DRAFT} · In einem Modell, dem Pederséns, hält der Turm am Ende der Regierung 8,7 Millionen Lehmziegel und 30,2 Millionen gebrannte.`,
      walls: `${DRAFT} · Im selben Modell hielten die Stadtmauern zwölf- bis fünfzehnmal so viele, je nachdem, wie man den Palast zählt.`,
    },
    list: {
      base: `${DRAFT} Der Sockel, wie ausgegraben, etwa 90 m im Geviert: erhalten.`,
      core: `${DRAFT} Darin der Kern aus Lehmziegeln, etwa 60 m: erhalten.`,
      notKnown: `${DRAFT} Über dem Sockel steigen die Seiten offen auf, ohne oberen Rand: Die Höhe ist nicht bekannt.`,
      height: label => `${DRAFT} Eine gestrichelte Linie bei ${label}: eine Lesart, vermutet.`,
      stages: `${DRAFT} Die sieben Stufen der Tafel, schraffiert: vermutet.`,
      figures: n => (n === 1 ? `${DRAFT} Eine graue Figur von 1,70 m, als Maßstab.` : `${DRAFT} ${n} graue Figuren von 1,70 m, eine auf der anderen.`),
      bricks: (mud, baked) => `${DRAFT} In einem Modell: ${mud} Lehmziegel und ${baked} gebrannte Ziegel, ein Quadrat je Million.`,
      walls: (lo, hi) => `${DRAFT} Die Stadtmauern: ${lo}- bis ${hi}-mal so viele Ziegel wie der Turm, im selben Modell.`,
    },
  },
}
