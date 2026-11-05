// Feature 10, the river then and now (stop 13, the bridge). Pure checks on the data, the scene and the words;
// PAPER_READOUTS=<folder> also reads the browser's own read-back (paper-shoot.mjs --page river).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`), import.meta.url)

const B = join(APP, 'src/wings/babylon')
const load = (p) => import(pathToFileURL(join(B, p)).href)
const kit = await load('paper/scene.ts')
const data = await load('river/river-data.ts')
const scene = await load('river/river-scene.ts')
const words = await load('river/river-words.ts')
const mapPlan = JSON.parse(readFileSync(join(B, 'map/map-plan.json'), 'utf8'))
const bridgePlan = JSON.parse(readFileSync(join(B, 'bridge/bridge-plan.json'), 'utf8'))

const LANGS = ['en', 'de']
const SIZES = { wide: [[1600, 648], [1440, 648]], upright: [[390, 605], [390, 425], [360, 391]] }
const STEPS = scene.STEP_IDS.length
const at = (t, framing, w, h) => scene.riverScene(t, framing, w, h, { inset: kit.insetFor(framing, 0) })
const QUALIFIER = /\b(about|circa|ca\.|etwa|rund|guess|guessed|vermutet|restored|ergänzt|perhaps|vielleicht|maybe|unknown|unbekannt|probably|wohl|dug|ausgegraben|today|heute)\b|\?/i
const DASH = /[–—;]/
const numbersIn = (s) => (s.replace(/ /g, ' ').match(/\d+(?:[.,]\d+)?/g) ?? [])

test('the data are the plans\' own numbers', () => {
  const br = mapPlan.bridge
  assert.deepEqual(data.BRIDGE.axis, br.axis)
  for (const k of ['count', 'along', 'across', 'gap', 'first']) assert.equal(data.BRIDGE.piers[k], br.piers[k], k)
  assert.deepEqual(data.BRIDGE.outline, br.piers.outline)
  for (const side of ['east', 'west']) for (const k of ['from', 'to', 'across']) assert.equal(data.BRIDGE.abutments[side][k], br.abutments[side][k], `${side} ${k}`)
  const wall = (id) => mapPlan.walls.find((w) => w.id === id).line
  assert.deepEqual(data.QUAY.north, wall('arahtu-quay'))
  assert.deepEqual(data.QUAY.south, [...wall('arahtu-quay-2'), ...wall('river-wall-south').slice(1)])
  assert.equal(data.QUAY.thick, bridgePlan.quay.thick)
  assert.equal(data.DECK_W, bridgePlan.deck.w)
  assert.deepEqual(data.RIVER_570.poly, mapPlan.water.find((w) => w.id === 'euphrates').poly)
  assert.deepEqual(data.RIVER_570.poly[data.RIVER_570.westFrom], [446100, 3598300], 'the west side starts after the southmost turn')
  assert.equal(data.RIVER_570.westBank.from, bridgePlan.westBank.from)
  assert.equal(data.RIVER_570.westBank.to, bridgePlan.westBank.to)
  // the door's hook names this feature
  assert.deepEqual(bridgePlan.door.features, ['river'])
})

test('the piers stand at one place in every state, in every framing and size', () => {
  let seen = 0
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    const where = new Map()
    for (let s = 0; s < STEPS - 1; s++) for (const p of at(s, framing, w, h).facts.piers) {
      seen++
      if (!where.has(p.id)) where.set(p.id, p.box)
      else assert.deepEqual(p.box, where.get(p.id), `${framing} ${w}x${h} step ${s}: ${p.id} moved`)
    }
    assert.equal(where.size, 8, 'six river piers and two land piers')
  }
  assert.ok(seen > 0)
})

test('each state draws what its rules ask and nothing of another state', () => {
  for (const [framing, [[w, h]]] of Object.entries(SIZES)) {
    // a line cut by the frame is drawn in runs: id-0, id-1
    const ids = (s) => { const all = at(s, framing, w, h).prims.map((p) => p.id); return Object.assign(all, { includes: (x) => all.some((i) => i === x || i.startsWith(`${x}-`)) }) }
    const then = ids(0), dig = ids(1), today = ids(2), photo = ids(3)
    // F10.1: 570 BC, the water in the stop's colour, the deck hatched, the west bank dashed; no today
    assert.ok(then.includes('water-570') && then.includes('deck') && then.includes('bank-570'), framing)
    assert.ok(!then.includes('channel-today') && !then.includes('road'), framing)
    // F10.2: the dig, the piers on dry ground: no water, no deck
    assert.ok(dig.includes('trench') && !dig.includes('water-570') && !dig.includes('deck'), framing)
    // F10.4: today, the channel and the road in the old bed; no water of 570, no deck
    assert.ok(today.includes('channel-today') && today.includes('road') && !today.includes('water-570') && !today.includes('deck'), framing)
    // the photograph alone
    assert.deepEqual([...photo], ['photo'], framing)
    // the marks: piers in place, deck and banks guessed, the quay known
    const marks = Object.fromEntries(at(0, framing, w, h).prims.map((p) => [p.id, p.mark]))
    assert.equal(marks['pier-p1'], 'place'); assert.equal(marks['deck'], 'guessed'); assert.equal(marks['quay-north'], 'known')
    assert.ok(Object.entries(marks).some(([k, m]) => k.startsWith('bank-570') && m === 'guessed'))
  }
})

test('today\'s channel runs west of the 570 quay and of the bridge\'s west end, the old bed east of it bare (F10.4)', () => {
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    const f = at(2, framing, w, h).facts.bridgeLine
    assert.ok(f.today !== null && f.quay !== null, `${framing} ${w}x${h}: the bridge's line does not meet both`)
    assert.ok(f.today < f.westEnd && f.westEnd < f.quay, `${framing} ${w}x${h}: ${JSON.stringify(f)}`)
  }
})

test('the states jump, never morph: at every point of the slider every part stands whole', () => {
  for (const t of [0.25, 0.49, 0.51, 1.5, 2.5, 2.75]) {
    const sc = at(t, 'wide', 1600, 648)
    assert.ok(sc.prims.every((p) => (p.alpha ?? 1) === 1), `t ${t}`)
    assert.equal(sc.anchors.length, 0, `t ${t}: labels between steps`)
  }
  assert.equal(at(0.49, 'wide', 1600, 648).facts.state, 'then')
  assert.equal(at(0.51, 'wide', 1600, 648).facts.state, 'dig')
})

const plateLabels = (lang, s, framing = 'wide', w = 1600, h = 648) => at(s, framing, w, h).anchors.map((a) => [a.id, words.riverLabel(lang, a.id)])

test('the plate carries numbers with their units and single names, no qualifier (the credit aside)', () => {
  let seen = 0
  for (const lang of LANGS) for (let s = 0; s < STEPS; s++) for (const [id, text] of plateLabels(lang, s)) {
    if (id === 'credit') continue
    seen++
    assert.ok(!QUALIFIER.test(text), `${lang} step ${s} ${id}: "${text}"`)
    assert.ok(!DASH.test(text), `${lang} ${id}: a dash`)
    assert.ok(text.split(/[\s ]+/).length <= 4, `${lang} ${id}: "${text}" is more than a name or a number`)
    if (/\d/.test(text) && id !== 'year') assert.match(text, / m$/, `${lang} ${id}: a number without its unit`)
  }
  assert.ok(seen > 0)
})

test('every number the plate carries is named in its step\'s band line', () => {
  let seen = 0
  for (const lang of LANGS) for (let s = 0; s < STEPS; s++) {
    const band = words.RIVER_WORDS[lang].band[scene.STEP_IDS[s]]
    for (const [id, text] of plateLabels(lang, s)) {
      if (id === 'credit') continue
      for (const n of numbersIn(text)) { seen++; assert.ok(numbersIn(band).includes(n), `${lang} step ${s}: ${n} (${id}) not in "${band}"`) }
    }
  }
  assert.ok(seen >= 6)
})

test('no word gives the river\'s move a distance (F10.5), and the dig\'s dates stand on the step\'s name', () => {
  const MOVE = /\b(west|westward|moved|move|wanderte|zog|gewandert|Westen|westlich)\b/i
  const DIST = /\d[\d.,  ]*(m|km|metres?|meters?|Meter|Kilometer)\b/
  for (const lang of LANGS) {
    const W = words.RIVER_WORDS[lang]
    const texts = [...Object.values(W.band), ...Object.values(W.list).flat(), ...Object.values(W.steps), ...Object.values(W.labels), W.ui.title, W.ui.door]
    for (const t of texts) for (const sentence of t.split(/(?<=[.!?:])\s+/)) assert.ok(!(MOVE.test(sentence) && DIST.test(sentence)), `${lang}: "${sentence}"`)
    assert.ok(!DIST.test(W.band.today) && !W.list.today.some((x) => DIST.test(x)), `${lang}: a distance in the today step`)
    assert.match(W.steps.dig, /1910.*1911/)
  }
})

test('the band\'s lines: about 90 characters, no sentence over 14 words, every line DRAFT until the writer\'s', () => {
  for (const lang of LANGS) for (const id of scene.STEP_IDS) {
    const line = words.RIVER_WORDS[lang].band[id]
    assert.ok(line.startsWith('DRAFT'), `${lang} ${id}`)
    assert.ok(line.length <= words.LINE_CHARS, `${lang} ${id}: ${line.length} characters`)
    for (const s of line.replace(/^DRAFT · /, '').split(/(?<=[.!?:])\s+/)) assert.ok(s.split(/\s+/).length <= words.SENTENCE_WORDS, `${lang} ${id}: "${s}"`)
    assert.ok(!DASH.test(line), `${lang} ${id}: a dash`)
    assert.ok(words.BAND_KEYS[id].carries && words.BAND_KEYS[id].pointer, id)
  }
})

test('the photograph: the 1927 autochrome, dated on the plate, its credit as its record gives it', () => {
  // the record's fields as its credit file gives them (the file lives with the stills, outside the repository;
  // RIVER_CREDIT=<file> holds the printed credit against it)
  const fields = process.env.RIVER_CREDIT
    ? Object.fromEntries(readFileSync(process.env.RIVER_CREDIT, 'utf8').split('\n').filter((l) => /^(author|date|licence):/.test(l)).map((l) => [l.split(':')[0], l.slice(l.indexOf(':') + 1).trim()]))
    : { author: 'Gadmer Frédéric', date: '18 April 1927', licence: 'CC BY-SA 4.0' }
  for (const part of Object.values(fields)) assert.ok(data.PHOTO.credit.includes(part), part)
  assert.equal(data.PHOTO.year, 1927)
  for (const lang of LANGS) {
    const L = Object.fromEntries(plateLabels(lang, 3))
    assert.equal(L.year, '1927'); assert.equal(L.credit, data.PHOTO.credit)
  }
})

test('today\'s course: the reader passes its own self-test', () => {
  const r = spawnSync(process.env.BABYLON_PY ?? 'python3', ['-I', join(APP, 'forge/babylon/river-today.py'), '--self-test'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /self-test: ok/)
})

/* THE BROWSER'S OWN READ-BACK */
function readbacks() {
  return readdirSync(process.env.PAPER_READOUTS).filter((x) => /^readout-river-/.test(x)).map((f) => ({ f, r: JSON.parse(readFileSync(join(process.env.PAPER_READOUTS, f), 'utf8')) }))
}
const R = { skip: !process.env.PAPER_READOUTS }

test('read-back: no label on anything and none left off, at every step shot, EN and DE, desktop and phone', R, () => {
  const tags = new Set()
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    tags.add(`${r.lang}-${r.size}`)
    assert.deepEqual(ro.overlaps, [], `${f} ${k}`)
    for (const l of ro.labels) assert.ok(l.box, `${f} ${k}: ${l.id} left off`)
  }
  for (const t of ['en-desktop', 'de-desktop', 'en-phone', 'de-phone']) assert.ok(tags.has(t), `no read-back for ${t}`)
})

test('read-back: the band in two rows on the desktop, at most three on every phone; the photo\'s credit printed', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, c] of Object.entries(r.chrome ?? {})) {
    seen++
    if (c.form === 'desk') assert.ok(c.line.rows <= 2, `${f} ${k}: ${c.line.rows} rows`)
    else assert.ok(c.line.rows <= 3, `${f} ${k}: ${c.line.rows} rows`)
  }
  for (const { f, r } of readbacks()) {
    const ro = r.readouts?.step3
    if (!ro) continue
    const credit = ro.labels.find((l) => l.id === 'credit')
    assert.ok(credit?.box, `${f}: no credit`)
    assert.ok(ro.drawn.some((d) => d.id === 'photo' && d.box), `${f}: no photograph`)
  }
  assert.ok(seen > 0)
})

test('read-back: the door at rest, 44 px or more, and no frame carries the harness\'s marker', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) {
    for (const [k, m] of Object.entries(r.marked ?? {})) assert.equal(m, false, `${f} ${k}`)
    if (!r.rest) continue
    seen++
    assert.equal(r.rest.doors.length, 1, f)
    for (const d of r.rest.doors) assert.ok(d.w >= 44 && d.h >= 44, `${f}: ${d.w}x${d.h}`)
    assert.ok(r.rest.pictureShare >= 2 / 3, f)
  }
  assert.ok(seen > 0, 'no rest in the read-back')
})
