/* FEATURE 2'S WORDS. Three kinds, kept apart:
   - the plate's numbers and names (`labels`): numbers with their unit and
     single names only, the English from the targets (TARGETS-W2A feature 2),
     the German a first form for the writer's check; no qualifier stands on
     the plate, the band carries it; a no-break space binds a number to its unit;
   - the band's lines, the list's sentences, the step names and the look's own
     words: the writer's, not yet written, listed in `DRAFT_WORDS`; a band line,
     a list sentence, the title, the door and the close show the word DRAFT;
   - the credit, printed as the holder's record gives it, in every language. */

import { PHOTO } from './oil-data'

export type OilLang = 'en' | 'de'
export const STEP_IDS = ['tablet', 'king', 'sons', 'men', 'carpenter', 'lands'] as const
export type StepId = typeof STEP_IDS[number]

const DRAFT = 'DRAFT'
const NB = ' '

export interface OilWords {
  steps: Record<StepId, string>
  labels: {
    cm(n: number): string; sila(n: string): string; halves(n: number, each: string): string; credit: string
    king: string; sons: string; men: string; carpenter: string
    lands: Record<'judah' | 'tyre' | 'byblos' | 'arvad' | 'lydia' | 'egypt' | 'babylon', string>
  }
  ui: { play: string; pause: string; track: string; between(a: string, b: string): string; title: string; door: string; close: string }
  band: Record<StepId, string>
  list: Record<StepId, string[]>
}

/** THE WRITER'S WORDS STILL TO WRITE, by their place in `OilWords` */
export const DRAFT_WORDS = ['steps', 'band', 'list', 'ui.title', 'ui.door', 'ui.close'] as const

/** THE BAND'S LINE AT THE CLOSE LOOK'S LENGTH (STORY-SYSTEM, THE LINE): about 90 characters, no sentence over 14 words,
    at most three rows on the narrowest phone in German (tested on the page's own read-back) */
export const LINE_CHARS = 100
export const SENTENCE_WORDS = 14

/** THE BAND'S LINES, one per step, for the writer: what each must carry and its pointer (TARGETS-W2A feature 2) */
export const BAND_KEYS: Record<StepId, { carries: string; pointer: string }> = {
  tablet: {
    carries: 'VAT 16378, one of the palace\'s oil lists (never "this list names"), 9.8 by 10.6 cm by the holder, shown by a 10 cm ruler at the photograph\'s scale',
    pointer: 'TARGETS-W2A F2 "The object"; CS5 J2-05; REC bab.rationtablets; PHS 3 (the credit)',
  },
  king: {
    carries: 'the list names 10 sila for Ya\'u-kin, king of Judah; the palace\'s scribes wrote it down (never "the king fed"); one square a sila, ours',
    pointer: 'TARGETS-W2A F2 "The numbers" 1, "What its words must carry"; RULES-W2A F2.2, F2.5; CS5 J2-03, J2-04',
  },
  sons: {
    carries: '2½ sila for his five sons together, one total, a quarter of his share ("five sons" restored in list 2, whole in list 3)',
    pointer: 'TARGETS-W2A F2 "The numbers" 2 and "As things"; HF 3.2 new catch; STATUS-W2A disagreement 14',
  },
  men: {
    carries: '4 sila for eight men from Judah; the lists hold captives and craftsmen at once, not all captive',
    pointer: 'TARGETS-W2A F2 "The numbers" 3, "What it may not claim" 6; CS5 J2-04 TRANSFER',
  },
  carpenter: {
    carries: '½ sila each for carpenters from Arvad; twenty such halves make the king\'s 10 sila (our arithmetic on the text\'s numbers)',
    pointer: 'TARGETS-W2A F2 "The numbers" 4 and "As things"; RULES-W2A F2.2',
  },
  lands: {
    carries: 'the lists name people from Judah, Tyre, Arvad, Byblos, Lydia (restored) and Egypt; dots only, no route or date; the coasts are today\'s',
    pointer: 'TARGETS-W2A F2 "The map\'s lands", "What it may not claim" 7; RULES-W2A F2.3, F2.4; coasts.json.credit.txt',
  },
}

export const OIL_WORDS: Record<OilLang, OilWords> = {
  en: {
    steps: { tablet: 'the tablet', king: 'the king', sons: 'five sons', men: 'eight men', carpenter: 'a carpenter', lands: 'the lands' },
    labels: {
      cm: (n) => `${n}${NB}cm`, sila: (n) => `${n}${NB}sila`, halves: (n, each) => `${n}${NB}×${NB}${each}`, credit: PHOTO.credit,
      king: 'king of Judah', sons: 'five sons', men: 'eight men from Judah', carpenter: 'carpenter from Arvad',
      lands: { judah: 'Judah', tyre: 'Tyre', byblos: 'Byblos', arvad: 'Arvad', lydia: 'Lydia', egypt: 'Egypt', babylon: 'Babylon' },
    },
    ui: {
      play: 'Play', pause: 'Pause', track: 'The oil list, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      title: `${DRAFT} The oil list and its peoples`, door: `${DRAFT} Count the oil`, close: `${DRAFT} Back to the gardens`,
    },
    band: {
      tablet: `${DRAFT} · One of the palace's oil lists, VAT 16378: 9.8 by 10.6${NB}cm, by a 10${NB}cm ruler.`,
      king: `${DRAFT} · The palace's scribes list 10${NB}sila of oil for the king of Judah. A square is a sila.`,
      sons: `${DRAFT} · 2½${NB}sila for his five sons together, a quarter of his. The list does not split it.`,
      men: `${DRAFT} · 4${NB}sila for eight men from Judah. The lists name captives and craftsmen alike.`,
      carpenter: `${DRAFT} · ½${NB}sila for one carpenter from Arvad. 20 such halves fill the king's 10${NB}sila.`,
      lands: `${DRAFT} · The lists name people from these lands. Lydia is restored. The coasts are today's.`,
    },
    list: {
      tablet: [
        `${DRAFT} VAT 16378, 9.8 by 10.6${NB}cm, in the holder's photograph, a 10${NB}cm ruler at the photograph's scale.`,
        `${DRAFT} Which of the palace's oil lists it is, and whether it is the one dated to 592/591${NB}BC, is not known.`,
      ],
      king: [
        `${DRAFT} 10${NB}sila for Ya'u-kin, king of Judah: ten squares, one sila each. The square is ours, never a jar.`,
        `${DRAFT} The captive king kept his title in the palace's own accounts. How freely he lived there is read two ways.`,
      ],
      sons: [`${DRAFT} 2½${NB}sila for his five sons together: the list gives one total, never a share each.`],
      men: [`${DRAFT} 4${NB}sila for eight men from Judah.`],
      carpenter: [`${DRAFT} ½${NB}sila for a carpenter from Arvad. 20 such halves stand in a row as long as the king's 10${NB}sila.`],
      lands: [
        `${DRAFT} A dot for each land the lists name: Judah, Tyre, Arvad, Byblos, Lydia and Egypt. And Babylon, where they were written.`,
        `${DRAFT} Lydia is an open dashed ring: the name is restored on the tablet.`,
        `${DRAFT} The lists say where people came from, never a route or a date. Coasts and rivers are today's (Natural Earth).`,
      ],
    },
  },
  de: {
    steps: { tablet: 'die Tafel', king: 'der König', sons: 'fünf Söhne', men: 'acht Männer', carpenter: 'ein Zimmermann', lands: 'die Länder' },
    labels: {
      cm: (n) => `${n}${NB}cm`, sila: (n) => `${n}${NB}Sila`, halves: (n, each) => `${n}${NB}×${NB}${each}`, credit: PHOTO.credit,
      king: 'König von Juda', sons: 'fünf Söhne', men: 'acht Männer aus Juda', carpenter: 'Zimmermann aus Arwad',
      lands: { judah: 'Juda', tyre: 'Tyros', byblos: 'Byblos', arvad: 'Arwad', lydia: 'Lydien', egypt: 'Ägypten', babylon: 'Babylon' },
    },
    ui: {
      play: 'Abspielen', pause: 'Anhalten', track: 'Die Ölliste, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      title: `${DRAFT} Die Ölliste und ihre Völker`, door: `${DRAFT} Das Öl zählen`, close: `${DRAFT} Zurück zu den Gärten`,
    },
    band: {
      tablet: `${DRAFT} · Eine der Öllisten des Palasts, VAT 16378: 9,8 mal 10,6${NB}cm, am 10-cm-Lineal.`,
      king: `${DRAFT} · Palastschreiber notieren 10${NB}Sila Öl für den König von Juda. Ein Quadrat je Sila.`,
      sons: `${DRAFT} · 2½${NB}Sila für seine fünf Söhne zusammen, ein Viertel. Die Liste teilt es nicht.`,
      men: `${DRAFT} · 4${NB}Sila für acht Männer aus Juda. Die Listen nennen Gefangene und Handwerker.`,
      carpenter: `${DRAFT} · ½${NB}Sila für einen Zimmermann aus Arwad. 20 Hälften füllen die 10${NB}Sila des Königs.`,
      lands: `${DRAFT} · Die Listen nennen Menschen aus diesen Ländern. Lydien ist ergänzt. Küsten von heute.`,
    },
    list: {
      tablet: [
        `${DRAFT} VAT 16378, 9,8 mal 10,6${NB}cm, im Foto des Museums, ein 10-cm-Lineal im Maßstab des Fotos.`,
        `${DRAFT} Welche der Öllisten des Palasts sie ist und ob sie die auf 592/591${NB}v.${NB}Chr. datierte ist, ist nicht bekannt.`,
      ],
      king: [
        `${DRAFT} 10${NB}Sila für Ja'u-kin, König von Juda: zehn Quadrate, je ein Sila. Das Quadrat ist unseres, nie ein Krug.`,
        `${DRAFT} Der gefangene König behielt in den Abrechnungen des Palasts seinen Titel. Wie frei er dort lebte, wird zweifach gelesen.`,
      ],
      sons: [`${DRAFT} 2½${NB}Sila für seine fünf Söhne zusammen: Die Liste nennt eine Summe, keinen Anteil je Sohn.`],
      men: [`${DRAFT} 4${NB}Sila für acht Männer aus Juda.`],
      carpenter: [`${DRAFT} ½${NB}Sila für einen Zimmermann aus Arwad. 20 solche Hälften stehen in einer Reihe so lang wie die 10${NB}Sila des Königs.`],
      lands: [
        `${DRAFT} Ein Punkt für jedes Land, das die Listen nennen: Juda, Tyros, Arwad, Byblos, Lydien und Ägypten. Dazu Babylon, wo sie geschrieben wurden.`,
        `${DRAFT} Lydien ist ein offener, gestrichelter Ring: Der Name ist auf der Tafel ergänzt.`,
        `${DRAFT} Die Listen sagen, woher Menschen kamen, nie einen Weg oder ein Datum. Küsten und Flüsse sind die von heute (Natural Earth).`,
      ],
    },
  },
}
