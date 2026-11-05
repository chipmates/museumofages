/* FEATURE 3'S WORDS. Kept apart as feature 7's and feature 2's are:
   - the plate's single names (`labels`): the texts' nouns and the places'
     names, the English from the targets (TARGETS-W2A feature 3: CAD's
     "orchard, the garden (with) canals and vegetable beds"; Jeremiah 29:5's
     "houses" and "gardens"), the German a first form for the writer's check;
   - the band's lines, the list's sentences, the step names and the look's own
     words: the writer's, not yet written, listed in `DRAFT_WORDS`. */

export type WordsLang = 'en' | 'de'
export const STEP_IDS = ['terraces', 'ea', 'jeremiah', 'where'] as const
export type StepId = typeof STEP_IDS[number]

const DRAFT = 'DRAFT'
const NB = ' '

export interface GardenWords {
  steps: Record<StepId, string>
  labels: { orchard: string; canals: string; beds: string; house: string; garden: string; esagila: string; ekarzaginna: string; river: string; palace: string }
  ui: { play: string; pause: string; track: string; between(a: string, b: string): string; title: string; door: string; close: string }
  band: Record<StepId, string>
  list: Record<StepId, string[]>
}

export const DRAFT_WORDS = ['steps', 'band', 'list', 'ui.title', 'ui.door', 'ui.close'] as const

/** THE BAND'S LINES, one per step, for the writer: what each must carry and its pointer (TARGETS-W2A feature 3) */
export const BAND_KEYS: Record<StepId, { carries: string; pointer: string }> = {
  terraces: {
    carries: 'the stop\'s terraces in colour, whole at this step, are our guess; the paper that follows draws gardens that texts of their time name; none of them is the Hanging Gardens',
    pointer: 'TARGETS-W2A F3 "What it may not claim" 1; RULES-W2A F3.3; REC bab.gardens.northpalace',
  },
  ea: {
    carries: 'Esarhaddon\'s text, about 680 to 669 BC, about a century before the walk, names the orchard, the garden with canals and the vegetable beds of Ea\'s temple; no plan is known; the sketch is Guessed',
    pointer: 'TARGETS-W2A F3 "Three texts" 1; REC bab.green.ekarzaginna; RULES-W2A F3.1, F3.2; CAD K p. 414',
  },
  jeremiah: {
    carries: 'Jeremiah 29:5, a letter from Jerusalem to the people taken in 597 (sent 597 to 587 or 586 BC): build houses, plant gardens; words to the exiles, not by them; the sketch is Guessed',
    pointer: 'TARGETS-W2A F3 "Three texts" 2; CS5 J4-03; RULES-W2A F3.1, F3.4; D-058',
  },
  where: {
    carries: 'Ea\'s temple lay in the Esagila complex on the river bank (Tintir), far from this stop; where in it is not known; the exiles lived in villages by the canals, not in the city',
    pointer: 'TARGETS-W2A F3 "Three texts" 1 (P2021 p. 166), "What it may not claim" 1, 5; RULES-W2A F3.5',
  },
}

export const GARDEN_WORDS: Record<WordsLang, GardenWords> = {
  en: {
    steps: { terraces: 'the terraces', ea: 'Ea\'s garden', jeremiah: 'Jeremiah\'s letter', where: 'where it lay' },
    labels: {
      orchard: 'orchard', canals: 'garden with canals', beds: 'vegetable beds', house: 'house', garden: 'garden',
      esagila: 'Esagila', ekarzaginna: 'Ekarzaginna', river: 'Euphrates', palace: 'South Palace',
    },
    ui: {
      play: 'Play', pause: 'Pause', track: 'The gardens in words, step by step', between: (a, b) => `between the steps ${a} and ${b}`,
      title: `${DRAFT} Gardens in words of their time`, door: `${DRAFT} Gardens in words`, close: `${DRAFT} Back to the gardens`,
    },
    band: {
      terraces: `${DRAFT} · In colour, the terraces as we guess them. Then, on paper, gardens texts of their time name.`,
      ea: `${DRAFT} · Esarhaddon, about 680 to 669${NB}BC, names Ea's temple garden. Our sketch is a guess.`,
      jeremiah: `${DRAFT} · From Jerusalem, Jeremiah wrote to the exiles: plant gardens. Our sketch is a guess.`,
      where: `${DRAFT} · Ea's temple lay in the Esagila complex by the river, far from here. Its spot is a guess.`,
    },
    list: {
      terraces: [
        `${DRAFT} The stop's terraces in colour: the garden on them is our guess.`,
        `${DRAFT} None of the gardens on the paper is the Hanging Gardens.`,
      ],
      ea: [
        `${DRAFT} In Esarhaddon's text the gods enter the orchard, the garden with canals and the vegetable beds of Ekarzaginna, Ea's temple.`,
        `${DRAFT} The text is about a century before the walk. Its plan and its trees are not known: the sketch draws its words, dashed and hatched.`,
        `${DRAFT} It is the one garden a Babylonian text names in the city.`,
      ],
      jeremiah: [
        `${DRAFT} Jeremiah 29:5, a letter from Jerusalem to the people taken in 597${NB}BC: build houses, plant gardens and eat their fruit.`,
        `${DRAFT} Words to the exiles, not by them. The exiles lived in villages by the canals, not in the city.`,
        `${DRAFT} One house and one bed: our sketch of the letter's words.`,
      ],
      where: [
        `${DRAFT} Ea's temple lay in the Esagila complex on the river bank, as the city text Tintir says.`,
        `${DRAFT} Where in it is not known: the hatched patch is a guess. The ring is this stop, by the South Palace.`,
      ],
    },
  },
  de: {
    steps: { terraces: 'die Terrassen', ea: 'Eas Garten', jeremiah: 'Jeremias Brief', where: 'wo er lag' },
    labels: {
      orchard: 'Obstgarten', canals: 'Garten mit Kanälen', beds: 'Gemüsebeete', house: 'Haus', garden: 'Garten',
      esagila: 'Esagila', ekarzaginna: 'Ekarzaginna', river: 'Euphrat', palace: 'Südpalast',
    },
    ui: {
      play: 'Abspielen', pause: 'Anhalten', track: 'Die Gärten in Worten, Schritt für Schritt', between: (a, b) => `zwischen den Schritten ${a} und ${b}`,
      title: `${DRAFT} Gärten in Worten ihrer Zeit`, door: `${DRAFT} Gärten in Worten`, close: `${DRAFT} Zurück zu den Gärten`,
    },
    band: {
      terraces: `${DRAFT} · In Farbe die Terrassen, wie wir sie vermuten. Dann auf Papier Gärten aus Texten ihrer Zeit.`,
      ea: `${DRAFT} · Asarhaddon nennt um 680 bis 669${NB}v.${NB}Chr. Eas Tempelgarten. Unsere Skizze ist vermutet.`,
      jeremiah: `${DRAFT} · Aus Jerusalem schrieb Jeremia den Verbannten: Legt Gärten an. Die Skizze ist vermutet.`,
      where: `${DRAFT} · Eas Tempel lag im Bezirk Esagila am Fluss, fern von hier. Der Ort ist vermutet.`,
    },
    list: {
      terraces: [
        `${DRAFT} Die Terrassen der Station in Farbe: Der Garten darauf ist unsere Vermutung.`,
        `${DRAFT} Keiner der Gärten auf dem Papier gehört zu den Hängenden Gärten.`,
      ],
      ea: [
        `${DRAFT} In Asarhaddons Text betreten die Götter den Obstgarten, den Garten mit Kanälen und die Gemüsebeete von Ekarzaginna, Eas Tempel.`,
        `${DRAFT} Der Text ist etwa ein Jahrhundert älter als der Gang. Sein Plan und seine Bäume sind nicht bekannt: Die Skizze zeichnet seine Wörter, gestrichelt und schraffiert.`,
        `${DRAFT} Es ist der eine Garten, den ein babylonischer Text in der Stadt nennt.`,
      ],
      jeremiah: [
        `${DRAFT} Jeremia 29,5, ein Brief aus Jerusalem an die 597${NB}v.${NB}Chr. Verschleppten: Baut Häuser, legt Gärten an und esst ihre Früchte.`,
        `${DRAFT} Worte an die Verbannten, nicht von ihnen. Die Verbannten lebten in Dörfern an den Kanälen, nicht in der Stadt.`,
        `${DRAFT} Ein Haus und ein Beet: unsere Skizze der Worte des Briefs.`,
      ],
      where: [
        `${DRAFT} Eas Tempel lag im Bezirk von Esagila am Flussufer, so sagt es der Stadttext Tintir.`,
        `${DRAFT} Wo darin, ist nicht bekannt: Die schraffierte Fläche ist vermutet. Der Ring ist diese Station am Südpalast.`,
      ],
    },
  },
}
