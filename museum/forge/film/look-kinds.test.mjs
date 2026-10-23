// Every mark the film carries opens a close look. The film's close look
// (`film-look.ts`) answers a mark by its kind (`film-look-kinds.ts`); this
// holds that every exhibit the live wing can mark has a kind, that each kind's
// own record resolves, and that the ids the kinds module writes out are the
// live wing's own. A read marks file adds its ids: FILM_MARKS=<marks json>.
//
//   node --test forge/film/look-kinds.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createLoader } from './load.mjs'

// the store's address is the bundler's: these records are read, never fetched
const stand = { 'src/stack/materials.ts': { assetAddress: () => '', assetPyramidBase: () => '' }, 'src/manifest/index.ts': { loadManifest: async () => ({ all: [], byId: new Map() }), displayable: () => true } }
const loader = await createLoader({ stand })
const kinds = loader.load('src/wings/vinci/film-look-kinds.ts')
const approaches = loader.load('src/wings/vinci/collection/approaches.ts')
const shelf = loader.load('src/wings/vinci/table/codex-shelf.ts')
const register = loader.load('src/wings/vinci/pictures/register.ts')
const catalog = loader.load('src/wings/vinci/machines/catalog.ts')
const grave = loader.load('src/wings/vinci/grave/index.ts')
const bench = loader.load('src/wings/vinci/line/bench/assets.ts')
const closer = loader.load('src/wings/vinci/closer.ts')

/** every id a mark of the live wing can carry: each exhibit with a view, the floor and the book on the table */
const liveIds = [...approaches.vinciExhibitRecords().map((r) => r.id), approaches.LINE_FLOOR_PICK, shelf.EDITION_EXHIBIT]
const marksFile = process.env.FILM_MARKS
const readIds = []
if (marksFile && existsSync(marksFile)) {
  const marks = JSON.parse(readFileSync(marksFile, 'utf8'))
  for (const per of Object.values(marks.nodes ?? {})) for (const framing of Object.values(per)) for (const list of Object.values(framing)) for (const m of list) readIds.push(m.id)
}

/** the record each kind opens from, which must exist for the look to stand */
function resolves(id, kind) {
  if (kind === 'picture') { const [, work] = id.split('/'); return Boolean(register.getWork(work)) }
  if (kind === 'machine') return Boolean(catalog.machineCatalog[id.slice('machine/'.length)])
  if (kind === 'place') return id === kinds.FILM_DEATHBED || Boolean(id === 'grave' ? grave.GRAVE_WORDS.slab : grave.GRAVE_WORDS.diagram.en)
  if (kind === 'sheet') return /^sheet\/rcin-\d+$/.test(id)
  return true
}

test('the ids the kinds module writes out are the live wing\'s own', () => {
  assert.equal(kinds.FILM_LINE_FLOOR, approaches.LINE_FLOOR_PICK)
  assert.equal(kinds.FILM_STUDY_LEAF, approaches.VINCI_STUDY_LEAF)
  assert.equal(kinds.FILM_STUDY_SHEET, approaches.VINCI_STUDY_SHEET)
  assert.equal(kinds.FILM_EDITION, shelf.EDITION_EXHIBIT)
  assert.equal(kinds.FILM_DEATHBED, approaches.vinciPlateExhibitId('deathbed-painting', 'front'))
  assert.equal(kinds.FILM_DEATHBED_PLATE, bench.PLATES.ingres)
})

test('every exhibit the live wing can mark opens a film look', () => {
  const ids = [...new Set([...liveIds, ...readIds])]
  const none = ids.filter((id) => kinds.filmLookKind(id) === null)
  assert.deepEqual(none, [], `no look answers ${none.join(', ')}`)
  const broken = ids.filter((id) => !resolves(id, kinds.filmLookKind(id)))
  assert.deepEqual(broken, [], `no record stands behind ${broken.join(', ')}`)
  // the five kinds that opened nothing before
  for (const [id, kind] of [['grave', 'place'], ['grave-diagram', 'place'], ['line/floor', 'life'], ['study-sheet/deluge', 'study-leaf'], ['sheet/rcin-919006', 'sheet']])
    assert.equal(kinds.filmLookKind(id), kind, id)
  if (marksFile) assert.ok(readIds.length > 0, `the marks file ${marksFile} carries marks`)
})

test('a stop\'s closer look opens its own kind, and its record stands whole', () => {
  const looks = closer.closerLooks()
  assert.ok(looks.length > 0, 'the wing carries a closer look')
  const said = (value) => typeof value?.en === 'string' && value.en.length > 0 && typeof value?.de === 'string' && value.de.length > 0
  for (const look of looks) {
    assert.equal(kinds.filmLookKind(look.id), 'closer', look.id)
    assert.equal(closer.closerById(look.id), look)
    assert.equal(closer.closerAtStop(look.stop), look)
    // no mark carries a closer look: it opens from its own word at the stop
    assert.ok(!liveIds.includes(look.id), `${look.id} is not a mark`)
    for (const key of ['room', 'name', 'more', 'describe', 'placesHead', 'readingHead']) assert.ok(said(look[key]), `${look.id} ${key}`)
    assert.ok(look.states.length === 2, `${look.id} has the two states the toggle names`)
    for (const state of look.states) {
      assert.match(state.plate, /^vinci\/room-plate\//, state.plate)
      assert.match(state.tiles, /^vinci\/room-tiles\//, state.tiles)
      for (const key of ['word', 'turn', 'date', 'sentence']) assert.ok(said(state[key]), `${look.id} ${state.id} ${key}`)
      for (const band of ['whole', 'near', 'ceiling']) assert.ok(said(state.lines[band]), `${look.id} ${state.id} ${band}`)
      assert.ok(['documented', 'reconstructed', 'conjectural', 'unknown'].includes(state.certainty), state.certainty)
    }
    assert.equal(look.card.filter((line) => line === null).length, 1, 'one sentence is the standing state\'s')
    for (const line of look.card) if (line) assert.ok(said(line))
    for (const place of look.places) {
      assert.ok(said(place.name), place.id)
      for (const v of [place.x, place.y, place.x + place.w, place.y + place.h]) assert.ok(v >= 0 && v <= 1, `${place.id} inside the plate`)
    }
    for (const read of look.reading) {
      assert.ok(said(read.label) && /^https:\/\//.test(read.href) && read.lang, 'further reading names its language')
    }
  }
})
