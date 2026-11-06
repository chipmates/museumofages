/* THE RECORD'S CLASSES ON THE BABYLON PAGES: each body a page builds is named to its record rows by the wing's rules
   (pieces.json) and shows those rows' classes from the class file (record-classes.json, written from the record by
   forge/babylon/record-classes.mjs). A body's plan row shows in the band at its foot, its body row above it; a rule
   without a plan row shows its body row to the foot. The plans' letters speak only for a row the class file lacks,
   at the lower rung, since a letter cannot say whether the part survives on site or rests on finds or a text for
   this place: M known; R, G and T guessed. A row a rule holds at some stops only (the street's) names the stretch
   that stop looks at, and a page cannot tell that stretch from the rest of the body, so each part of such a body
   shows the lower of the row and its own letters at the lower rung: a far stretch never takes a near one's row.
   The pages and the evidence switch (forge/babylon/switch.mjs) both take their classes here, so a page and the
   check give one answer. Two sides: known (in place, known, reconstructed) and guessed (typical, guessed); each class
   keeps its own name. The pages' shared material (map/mass.ts) paints three tones, a class its side's (TONE); the
   switch's own materials (gate/gate-mat.ts) paint five, one per class (CLASS_TONE). Pure: the callers load the two
   files. */

export type Shown = 'in place' | 'known' | 'reconstructed' | 'typical' | 'guessed' | 'blank'
export type Letter = 'M' | 'R' | 'G' | 'T'

export const RANK: Record<Shown, number> = { blank: 0, guessed: 1, typical: 2, reconstructed: 3, known: 4, 'in place': 5 }
/** a plan letter where no row speaks, in doubt the lower rung */
export const FROM_LETTER: Record<Letter, Shown> = { M: 'known', R: 'guessed', G: 'guessed', T: 'guessed' }
/** the tone a class paints, as the pages index their three tones (0 the M tone, 1 the R tone, 2 the G tone);
    blank has no tone, so a body drawn on a blank row paints the lowest and the check refuses it */
export const TONE: Record<Shown, number> = { 'in place': 0, known: 1, reconstructed: 1, typical: 2, guessed: 2, blank: 2 }
/** the letter a page's tone index carries, to read a body's own letters back from its attributes */
export const LETTER_OF_TONE: readonly Letter[] = ['M', 'R', 'G']
/** the class index the switch's own materials paint, one per class; 0 to 2 keep the three tones' meaning (M, R, G), so
    a material's default index still names its side; blank paints guessed and the check refuses it */
export const CLASS_TONE: Record<Shown, number> = { 'in place': 0, reconstructed: 1, guessed: 2, known: 3, typical: 4, blank: 2 }
/** the side of each class index: true on the known side */
export const KNOWN_OF_CLASS: readonly boolean[] = [true, true, false, true, false]

export const weaker = (a: Shown, b: Shown): Shown => (RANK[a] <= RANK[b] ? a : b)
export const isLetter = (s: unknown): s is Letter => s === 'M' || s === 'R' || s === 'G' || s === 'T'

export interface Rule { match: string; part: string; piece: string; plan?: string; strips?: string[]; stops?: string[]; surface?: boolean; needs?: string; note?: string }
export interface Pieces { rules: Rule[] }
export interface ClassFile { classes: Record<string, Shown> }

export interface BodyClasses {
  rule: Rule | null
  /** the row its foot band shows, '' when its rule names none */
  plan: string
  /** the row the rest of its form shows, '' when no rule names one */
  piece: string
  foot: Shown
  above: Shown
  /** a paving's strips, the middle first: each strip's row and class */
  strips: Array<{ row: string; shown: Shown }>
  /** the rows its rule names that the class file lacks, or why it has no row; its classes then come from its letters */
  missing: string[]
}

/** a body's (or one part's) classes from its name and its own letters [plan, height]; no letters is the lowest rung */
export type Namer = (body: string, letters?: readonly [Letter, Letter] | null) => BodyClasses

/** the classes of every body at one stop of the walk: the first rule that matches the body and holds at the stop */
export function recordNamer(pieces: Pieces, file: ClassFile, stop: string): Namer {
  const rules = pieces.rules.filter((r) => !r.stops || r.stops.includes(stop)).map((r) => ({ r, re: new RegExp(r.match) }))
  const row = (id: string): Shown | null => (Object.hasOwn(file.classes, id) ? file.classes[id]! : null)
  return (body, letters = null) => {
    const r = rules.find((x) => x.re.test(body))?.r ?? null
    const missing: string[] = []
    // no letters at all is the lowest rung
    const byFoot: Shown = letters ? FROM_LETTER[letters[0]] : 'guessed'
    const byBody: Shown = letters ? weaker(FROM_LETTER[letters[0]], FROM_LETTER[letters[1]]) : 'guessed'
    const take = (id: string, fallback: Shown): Shown => {
      const s = row(id)
      if (s) return s
      missing.push(id)
      return fallback
    }
    if (!r || !r.piece) {
      missing.push(r ? `no row yet: ${r.needs ?? r.part}` : 'no rule names this body')
      return { rule: r, plan: '', piece: '', foot: byFoot, above: byBody, strips: [], missing }
    }
    const held = !!r.stops
    const cap = (s: Shown, by: Shown): Shown => (held ? weaker(s, by) : s)
    const above = cap(take(r.piece, byBody), byBody)
    const foot = r.plan ? cap(take(r.plan, byFoot), byFoot) : cap(above, byFoot)
    const strips = (r.strips ?? []).map((id) => ({ row: id, shown: cap(take(id, byBody), byBody) }))
    return { rule: r, plan: r.plan ?? '', piece: r.piece, foot, above, strips, missing }
  }
}
