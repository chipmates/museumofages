// A MACHINE CYCLE IS KEYED BY WHAT ITS ISLAND DRAWS FROM: a copy or chrome
// edit moves no cycle, a machine's own module moves its cycle alone, and the
// island's stage, the payload it is handed and the wiring move every cycle.
// Each edit is planted over the tree (the loader's overlay), never written.
//
//   node --test forge/film/cycle-key.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CYCLE_DEFINITION, blankJsonDisplay, closure, cycleKey, dataSlices, isInterface, machineSlugs, reachedFrom } from './keys.mjs'
import { APP_ROOT, WING_DIR, createLoader } from './load.mjs'

const read = (file) => readFileSync(path.join(APP_ROOT, file), 'utf8')
/** One text replaced once in one file, as an overlay. */
function plant(file, from, to, base = {}) {
  const text = base[file] ?? read(file)
  assert.equal(text.split(from).length, 2, `${file} holds the planted text exactly once`)
  return { ...base, [file]: text.replace(from, to) }
}
const keysAt = async (overlay = {}) => {
  const loader = await createLoader({ overlay })
  return Object.fromEntries(machineSlugs(loader).map((s) => [s, cycleKey(loader, s).key]))
}
const moved = (a, b) => Object.keys(a).filter((s) => a[s] !== b[s]).sort()
const clean = await keysAt()
const TURNTABLE = 'src/wings/vitrine/turntable.ts'
/** the machines the island builds today; a machine joining it changes this count */
const ISLAND = 18

test('the machines the island builds, each keyed apart', async () => {
  assert.equal(Object.keys(clean).length, ISLAND)
  assert.ok(Object.keys(clean).includes('aerial-screw') && Object.keys(clean).includes('mechanical-lion'))
  assert.equal(new Set(Object.values(clean)).size, ISLAND, 'no two machines share a key')
})

test('(1) a copy edit in the interface words or the disclosures leaves every cycle key', async () => {
  // both reached the old key through the close look's closure
  const old = closure(await createLoader(), `${WING_DIR}/film-look.ts`, 'src/')
  for (const file of ['src/wings/content.ts', 'src/content/disclosures.ts']) {
    assert.ok(old.includes(file), `${file} was in the old island closure`)
    const overlay = { [file]: `${read(file)}\n// planted copy edit\nexport const PLANTED_LINE = { en: 'A door to learn', de: 'Eine Tür zum Lernen' }\n` }
    assert.deepEqual(moved(clean, await keysAt(overlay)), [], `${file}: no cycle moved`)
  }
})

test('(2) a phone-form or film-wing edit leaves every cycle key, even imported by a drawing module', async () => {
  const PHONE = `${WING_DIR}/phone-form.ts`, FILM_WING = `${WING_DIR}/film-wing.ts`
  // the phone form written and reached from the island's stage, the film wing reached from the print
  let base = { [PHONE]: "export const PHONE_FORM = { rows: 2 }\n" }
  base = plant(TURNTABLE, "import { createBenchBackdrop } from '../vinci/machines/bench/backdrop'\n",
    "import { createBenchBackdrop } from '../vinci/machines/bench/backdrop'\nimport { PHONE_FORM } from '../vinci/phone-form'\n", base)
  const printFile = `${WING_DIR}/print.ts`
  base = { ...base, [printFile]: `import { createWing } from './film-wing'\n${read(printFile)}` }
  assert.ok(isInterface(PHONE) && isInterface(FILM_WING))
  const planted = await keysAt(base)
  assert.equal(moved(clean, planted).length, ISLAND, 'the planted imports themselves are edits of drawing modules')
  assert.deepEqual(moved(planted, await keysAt({ ...base, [PHONE]: "export const PHONE_FORM = { rows: 3 }\n" })), [], 'a phone-form edit moves no cycle')
  assert.deepEqual(moved(planted, await keysAt(plant(FILM_WING, 'export function createWing', '/* planted */\nexport function createWing', base))), [], 'a film-wing edit moves no cycle')
})

test("(3) an edit to a machine's own module or dossier moves that machine's cycle, and only it", async () => {
  const screw = `${WING_DIR}/machines/aerial-screw.ts`
  assert.deepEqual(moved(clean, await keysAt(plant(screw, "const machine = makeMachine(stack, record)",
    "const planted = record\n  const machine = makeMachine(stack, planted)"))), ['aerial-screw'])
  const crane = `${WING_DIR}/machines/data/revolving-crane.json`
  const dossier = JSON.parse(read(crane))
  assert.deepEqual(moved(clean, await keysAt({ [crane]: JSON.stringify({ ...dossier, planted: true }, null, 2) })), ['revolving-crane'])
})

test("the island's stage, the payload it is handed and the wiring still move every cycle", async () => {
  const all = Object.keys(clean).sort()
  const cases = [
    [TURNTABLE, 'import { islandFit } from \'./fit\'\n', 'import { islandFit } from \'./fit\'\nconst PLANTED_STAGE = 1\n'],
    [`${WING_DIR}/machines/runtime.ts`, 'export function makeMachine', '/* planted */\nexport function makeMachine'],
    [`${WING_DIR}/collection/close-look.ts`, 'export function createVinciMachinePayload(options: {', 'export function createVinciMachinePayload(options: {\n  planted?: boolean'],
    [`${WING_DIR}/film-look.ts`, 'const makeLive = () => {', 'const makeLive = () => {\n        void 0'],
  ]
  for (const [file, from, to] of cases) assert.deepEqual(moved(clean, await keysAt(plant(file, from, to))), all, `${file}: every cycle moves`)
  // a close-look edit outside the machine's payload is the interface's
  const look = `${WING_DIR}/collection/close-look.ts`
  assert.deepEqual(moved(clean, await keysAt({ [look]: `${read(look)}\nexport const PLANTED_CARD_WORD = 'planted'\n` })), [], 'a new word beside the payload moves no cycle')
})

/* ---- the display-blank definition (from cycle-display-v2) ---- */
const keysUnder = async (definition, overlay = {}) => {
  const loader = await createLoader({ overlay })
  return Object.fromEntries(machineSlugs(loader).map((s) => [s, cycleKey(loader, s, definition).key]))
}
const CARDS = `${WING_DIR}/data/cards.json`, STEPS = `${WING_DIR}/data/steps.json`, RECORDS = `${WING_DIR}/machines/data/records.json`
const jsonPlant = (file, edit) => { const doc = JSON.parse(read(file)); edit(doc); return { [file]: JSON.stringify(doc, null, 2) } }

test('the definition now is the display-blank one; cycle-v1 still reads every file whole', async () => {
  assert.equal(CYCLE_DEFINITION, 'cycle-display-v2')
  const v1 = await keysUnder('cycle-v1')
  const card = jsonPlant(CARDS, (d) => { d.controls.machine.play.en = `${d.controls.machine.play.en} (planted)` })
  assert.equal(moved(v1, await keysUnder('cycle-v1', card)).length, ISLAND, 'under cycle-v1 a card word moves every cycle')
  assert.notDeepEqual(v1, clean, 'the two definitions never share a key')
})

test("a word of the payload's cards, steps or part names, or of a machine record's prose, moves no cycle", async () => {
  const cases = [
    jsonPlant(CARDS, (d) => { d.controls.machine.play.en = `${d.controls.machine.play.en} (planted)` }),
    jsonPlant(CARDS, (d) => { d.models = { ...d.models, planted: 'a register note the payload never reads' } }),
    jsonPlant(CARDS, (d) => { d.rule_labels = [...d.rule_labels, { en: '2 m', de: '2 m' }] }),
    jsonPlant(STEPS, (d) => { const [slug] = Object.keys(d.steps); d.steps[slug][0].en = `${d.steps[slug][0].en} planted` }),
    jsonPlant(RECORDS, (d) => { const [slug] = Object.keys(d.complete); d.complete[slug].sections.en[0].body += ' Planted.'; d.complete[slug].gaps.push('A planted gap.') }),
  ]
  for (const overlay of cases) assert.deepEqual(moved(clean, await keysUnder(CYCLE_DEFINITION, overlay)), [], Object.keys(overlay)[0])
})

test("what the island reads of them still moves every cycle: a step's part or time, a viewpoint, a record's folio", async () => {
  const all = Object.keys(clean).sort()
  const step = jsonPlant(STEPS, (d) => { const [slug] = Object.keys(d.steps); d.steps[slug][0].at = d.steps[slug][0].at + 0.01 })
  const [slug] = Object.keys(JSON.parse(read(STEPS)).steps)
  assert.ok(moved(clean, await keysUnder(CYCLE_DEFINITION, step)).length >= 1, 'a step time moves the cycles')
  const view = jsonPlant(CARDS, (d) => { d.controls.machine.viewpoints = [...d.controls.machine.viewpoints, { id: 'planted', en: 'x', de: 'x' }] })
  assert.deepEqual(moved(clean, await keysUnder(CYCLE_DEFINITION, view)), all, 'a viewpoint added')
  const folio = jsonPlant(RECORDS, (d) => { const [s] = Object.keys(d.complete); d.complete[s].folio = [] })
  assert.deepEqual(moved(clean, await keysUnder(CYCLE_DEFINITION, folio)), all, 'a folio taken away')
  assert.ok(slug)
})

test('a data file the set imports, or one the payload reads whole, is read whole with its display blanked', async () => {
  const loader = await createLoader()
  const payload = reachedFrom(loader, `${WING_DIR}/collection/close-look.ts`, ['createVinciMachinePayload'])
  const slices = dataSlices(loader, `${WING_DIR}/collection/close-look.ts`, [...payload.texts.values()])
  assert.deepEqual([...slices.get(CARDS)], ['controls'])
  assert.deepEqual([...slices.get(STEPS)], ['steps'])
  // a declaration that hands the parsed file on whole reads it whole
  const whole = dataSlices(loader, `${WING_DIR}/collection/close-look.ts`, ['const ALL = JSON.parse(cardsRaw)', 'const X = (JSON.parse(stepsRaw) as T).steps'])
  assert.equal(whole.get(CARDS), 'whole')
  assert.deepEqual([...whole.get(STEPS)], ['steps'])
  assert.equal(blankJsonDisplay('{"a":{"en":"x","id":"y"},"body":"z"}'), '{"a":{"en":"·","id":"y"},"body":"z"}')
  assert.equal(blankJsonDisplay('{"a":{"en":"x","id":"y"},"body":"z"}', ['body']), '{"a":{"en":"·","id":"y"},"body":"·"}')
  assert.equal(blankJsonDisplay('{"gaps":["a","b"],"en":["c","d"]}', ['gaps']), '{"gaps":"·","en":["·","·"]}', 'a prose field is blanked whole, a display one string by string')
})

test('a module of the set that can draw a text reads every data file whole again', async () => {
  const card = jsonPlant(CARDS, (d) => { d.controls.machine.play.en = `${d.controls.machine.play.en} (planted)` })
  const lettered = plant(TURNTABLE, "import { islandFit } from './fit'\n", "import { islandFit } from './fit'\nconst PLANTED_TEXT = (c: CanvasRenderingContext2D) => c.fillText('x', 0, 0)\n")
  const before = await keysUnder(CYCLE_DEFINITION, lettered)
  assert.equal(moved(before, await keysUnder(CYCLE_DEFINITION, { ...lettered, ...card })).length, ISLAND)
  const loader = await createLoader({ overlay: lettered })
  assert.equal(cycleKey(loader, 'lathe').blanked, false)
})
