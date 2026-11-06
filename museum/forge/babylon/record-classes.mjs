// THE CLASS FILE FROM THE RECORD: each record row's shown class (in place, known, reconstructed on the known side;
// typical, guessed on the guessed side; blank) and nothing else, for
// the pages' class view and the evidence switch (src/wings/babylon/record.ts reads it). The record stays outside this
// repository; no source, note or path of it is written here.
//
//   node forge/babylon/record-classes.mjs --record <EVIDENCE.tsv> [--out <json>]   (default src/wings/babylon/record-classes.json)
//
// The record is read by plain tab split (fields may hold quotation marks). A row's class is the weaker of its stored
// `shown` and the ceiling its place and form give (the evidence check's rule), so a stale row can only show less; the
// check, not this file, refuses a known-side word over a guessed-side ceiling.
// Exit 1 when the record is not the standard's shape or a row's class is no class.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP } from './pages.mjs'

export const RANK = { blank: 0, guessed: 1, typical: 2, reconstructed: 3, known: 4, 'in place': 5 }
export const SIDE = { 'in place': 'known', known: 'known', reconstructed: 'known', typical: 'guessed', guessed: 'guessed', blank: 'none' }
const RUNG = { here: 5, moved: 4, trace: 3, rec: 2, type: 1, ours: 0 }

/** the evidence standard's ceiling from the weaker of place and form: blank if the form is lost; in place if both are
    here; known if the weaker is here, moved or trace; reconstructed if rec; typical if type, or a place of ours under a
    form of type or stronger (the kind attested, where and how many ours); guessed if the form is ours */
export function shownBy(place, form) {
  if (form === 'lost') return 'blank'
  if (place === 'here' && form === 'here') return 'in place'
  if (form === 'ours' || !Object.hasOwn(RUNG, place) || !Object.hasOwn(RUNG, form)) return 'guessed'
  if (place === 'ours') return 'typical'
  const w = Math.min(RUNG[place], RUNG[form])
  return w >= RUNG.trace ? 'known' : w === RUNG.rec ? 'reconstructed' : 'typical'
}

/** the record's text to { classes, lowered, problems }: lowered names the rows whose stored class claimed more */
export function classesFrom(text) {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const head = lines[0].split('\t')
  const at = Object.fromEntries(head.map((c, i) => [c, i]))
  const problems = []
  for (const c of ['piece', 'place', 'form', 'shown']) if (!(c in at)) problems.push(`the record has no column "${c}"`)
  if (problems.length) return { classes: {}, lowered: [], problems }
  const classes = {}, lowered = []
  lines.slice(1).forEach((line, k) => {
    const f = line.split('\t')
    if (f.length !== head.length) { problems.push(`line ${k + 2}: ${f.length} fields, not ${head.length}`); return }
    const id = f[at.piece].trim()
    if (!id) { problems.push(`line ${k + 2}: no piece id`); return }
    if (id in classes) { problems.push(`line ${k + 2}: ${id} has two rows`); return }
    const stored = f[at.shown].trim(), rule = shownBy(f[at.place].trim(), f[at.form].trim())
    if (!(stored in RANK)) { problems.push(`line ${k + 2}: ${id} shown "${stored}" is no class`); return }
    const cls = RANK[stored] <= RANK[rule] ? stored : rule
    if (cls !== stored) lowered.push(`${id}: stored "${stored}", its place and form give "${rule}"`)
    classes[id] = cls
  })
  return { classes, lowered, problems }
}

/** the class file's whole text: the classes sorted by row id, one a line */
export function classFileText(classes) {
  const ids = Object.keys(classes).sort()
  const body = ids.map((id, i) => `  ${JSON.stringify(id)}: ${JSON.stringify(classes[id])}${i < ids.length - 1 ? ',' : ''}`).join('\n')
  const about = 'Each row of the Babylon evidence record with its shown class (in place, known, reconstructed, typical, guessed, blank), the weaker of the class the row states and the one its place and form give; nothing else from the record. Written by forge/babylon/record-classes.mjs; the pages and the evidence switch read it through src/wings/babylon/record.ts.'
  return `{\n "about": ${JSON.stringify(about)},\n "classes": {\n${body}\n }\n}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  const RECORD = opt('--record', null)
  if (!RECORD) { console.error('--record <EVIDENCE.tsv>'); process.exit(2) }
  const OUT = opt('--out', join(APP, 'src/wings/babylon/record-classes.json'))
  const { classes, lowered, problems } = classesFrom(readFileSync(RECORD, 'utf8'))
  for (const p of problems) console.log(`ERROR ${p}`)
  if (problems.length) process.exit(1)
  for (const l of lowered) console.log(`LOWERED ${l}`)
  writeFileSync(OUT, classFileText(classes))
  const counts = {}
  for (const c of Object.values(classes)) counts[c] = (counts[c] ?? 0) + 1
  console.log(`${Object.keys(classes).length} rows: ${Object.entries(counts).sort((a, b) => RANK[b[0]] - RANK[a[0]]).map(([c, n]) => `${c} ${n}`).join(', ')}; ${lowered.length} lowered`)
}
