/* FEATURE 10'S WORDS. Three kinds, kept apart:
   - the plate's numbers and names (`labels`): numbers with their unit and single names only; no qualifier stands on
     the plate, the band carries it; a no-break space binds a number to its unit;
   - the band's lines, the list's sentences, the step names and the look's own words: the writer's, not yet written,
     listed in `DRAFT_WORDS`; a band line, a list sentence, the title, the door and the close show the word DRAFT;
   - the credit, printed as the photograph's record gives it, in every language. */

import { PHOTO } from './river-data'
import { STEP_IDS, type StepId } from './river-scene'

export type RiverLang = 'en' | 'de'
export { STEP_IDS, type StepId }

const DRAFT = 'DRAFT'
const NB = ' '

export interface RiverWords {
  steps: Record<StepId, string>
  labels: { river: string; width: string; pier: string; channel: string; road: string; north: string; year: string; credit: string }
  ui: { play: string; pause: string; track: string; between(a: string, b: string): string; title: string; door: string; close: string }
  band: Record<StepId, string>
  list: Record<StepId, string[]>
}

/** THE WRITER'S WORDS STILL TO WRITE, by their place in `RiverWords` */
export const DRAFT_WORDS = ['steps', 'band', 'list', 'ui.title', 'ui.door', 'ui.close'] as const

/** THE BAND'S LINE AT THE CLOSE LOOK'S LENGTH (STORY-SYSTEM, THE LINE): about 90 characters, no sentence over 14 words,
    at most three rows on the narrowest phone in German (tested on the page's own read-back) */
export const LINE_CHARS = 100
export const SENTENCE_WORDS = 14

/** THE BAND'S LINES, one per step, for the writer: what each must carry and its pointer */
export const BAND_KEYS: Record<StepId, { carries: string; pointer: string }> = {
  then: {
    carries: 'the river at the bridge 123 to 126 m wide (the plate\'s number); the piers in place, the deck guessed; the bridge "about 120 m" only in words, never one length to the metre',
    pointer: 'TARGETS-W2B F10 "Numbers as things to see" (SET B6, SET G14), "May not claim"; RULES-W2B F10.1, 12.1 to 12.9; REC bab.bridge.piers, bab.bridge.deck',
  },
  dig: {
    carries: 'the piers were dug in 1910 to 1911 (August 1910 to February 1911), on dry ground; each pier 21 by 9 m (the plate\'s number); no deck, no gate',
    pointer: 'TARGETS-W2B F10 "The dig" (S13-01, S13-02), "What its words must carry"; RULES-W2B F10.2',
  },
  today: {
    carries: 'the river has moved west and its old bed is dry today, a road in it; no distance of the move, ever; the later clearing (1978 to 1979) only as a finding',
    pointer: 'TARGETS-W2B F10 "Today" (P2021 p. 23 via RIVR 1.1), "What its words must carry" (C914 rule 1); RULES-W2B F10.3 to F10.5',
  },
  photo: {
    carries: 'the Shatt al-Hillah, a branch of the Euphrates near the site, in April 1927 (the plate\'s 1927): a type of the water and banks, never 570 BC',
    pointer: 'TARGETS-W2B photo row B1 (Gadmer 1927, CC BY-SA 4.0), F10 "Today" (PHS section 11); the credit file beside the photograph',
  },
}

export const RIVER_WORDS: Record<RiverLang, RiverWords> = {
  en: {
    steps: { then: `570${NB}BC`, dig: '1910 to 1911', today: 'today', photo: '1927' },
    labels: {
      river: 'Euphrates', width: `123${NB}to 126${NB}m`, pier: `21${NB}×${NB}9${NB}m`, channel: 'Shatt al-Hillah', road: 'road', north: 'N',
      year: String(PHOTO.year), credit: PHOTO.credit,
    },
    ui: {
      play: 'Play', pause: 'Pause', track: 'The river, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      title: `${DRAFT} The river, then and now`, door: `${DRAFT} See the river move`, close: `${DRAFT} Back to the bridge`,
    },
    band: {
      then: `${DRAFT} · The river was 123 to 126${NB}m wide here. The deck is our guess.`,
      dig: `${DRAFT} · Each pier 21 by 9${NB}m. They were dug out in 1910 and 1911, on dry ground.`,
      today: `${DRAFT} · The river has moved west. Its old bed is dry today, and a road runs in it.`,
      photo: `${DRAFT} · The Shatt al-Hillah in April 1927: its water and banks, not those of 570${NB}BC.`,
    },
    list: {
      then: [
        `${DRAFT} Six river piers and two land piers carried the bridge. Heavy ink: they still stand.`,
        `${DRAFT} The deck is hatched: its form is guessed. The west bank is dashed: drawn, never dug.`,
      ],
      dig: [
        `${DRAFT} The bridge was dug from August 1910 to February 1911: seven piers, on dry ground.`,
        `${DRAFT} The trench's dashed outline is ours.`,
      ],
      today: [
        `${DRAFT} Today the river runs west of the old quay, through west Babylon. How far it moved is not measured.`,
        `${DRAFT} Its course is drawn from a satellite picture of 20 October 2004.`,
        `${DRAFT} The piers were cleared again in 1978 and 1979. How they look today is not shown here.`,
      ],
      photo: [
        `${DRAFT} A branch of the Euphrates near Hilla, in colour, 18 April 1927.`,
        `${DRAFT} A type of the river's water and banks, never the river at the bridge in 570${NB}BC.`,
      ],
    },
  },
  de: {
    steps: { then: `570${NB}v.${NB}Chr.`, dig: '1910 bis 1911', today: 'heute', photo: '1927' },
    labels: {
      river: 'Euphrat', width: `123${NB}bis 126${NB}m`, pier: `21${NB}×${NB}9${NB}m`, channel: 'Schatt al-Hilla', road: 'Straße', north: 'N',
      year: String(PHOTO.year), credit: PHOTO.credit,
    },
    ui: {
      play: 'Abspielen', pause: 'Anhalten', track: 'Der Fluss, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      title: `${DRAFT} Der Fluss, damals und heute`, door: `${DRAFT} Den Fluss wandern sehen`, close: `${DRAFT} Zurück zur Brücke`,
    },
    band: {
      then: `${DRAFT} · Hier war der Fluss 123 bis 126${NB}m breit. Die Fahrbahn ist vermutet.`,
      dig: `${DRAFT} · Jeder Pfeiler 21 mal 9${NB}m. Ausgegraben 1910 und 1911, auf trockenem Grund.`,
      today: `${DRAFT} · Der Fluss zog nach Westen. Sein altes Bett ist heute trocken, darin eine Straße.`,
      photo: `${DRAFT} · Der Schatt al-Hilla im April 1927: sein Wasser und seine Ufer, nicht die von 570${NB}v.${NB}Chr.`,
    },
    list: {
      then: [
        `${DRAFT} Sechs Flusspfeiler und zwei Landpfeiler trugen die Brücke. Kräftige Tusche: Sie stehen noch.`,
        `${DRAFT} Die Fahrbahn ist schraffiert: Ihre Form ist vermutet. Das Westufer ist gestrichelt: gezeichnet, nie ausgegraben.`,
      ],
      dig: [
        `${DRAFT} Die Brücke wurde von August 1910 bis Februar 1911 ausgegraben: sieben Pfeiler auf trockenem Grund.`,
        `${DRAFT} Der gestrichelte Umriss des Grabens ist unserer.`,
      ],
      today: [
        `${DRAFT} Heute fließt der Fluss westlich des alten Kais, durch das westliche Babylon. Wie weit er wanderte, ist nicht gemessen.`,
        `${DRAFT} Sein Lauf ist nach einem Satellitenbild vom 20. Oktober 2004 gezeichnet.`,
        `${DRAFT} Die Pfeiler wurden 1978 und 1979 erneut freigelegt. Wie sie heute aussehen, zeigt dieses Blatt nicht.`,
      ],
      photo: [
        `${DRAFT} Ein Arm des Euphrat bei Hilla, in Farbe, am 18. April 1927.`,
        `${DRAFT} Ein Typus von Wasser und Ufern des Flusses, nie der Fluss an der Brücke 570${NB}v.${NB}Chr.`,
      ],
    },
  },
}

/** a label's words on the plate */
export function riverLabel(lang: RiverLang, id: string): string {
  const L = RIVER_WORDS[lang].labels
  return (L as Record<string, string>)[id] ?? id
}
