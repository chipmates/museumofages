// THE NARROWED CARRY, on scratch worlds: a moved cell a picture's record, its
// casters toward the sun or its mirror reach keeps the entry red; one none of
// them reaches is carried; the render's tree must give the key the record was
// rendered with, and a still reads the clips that stand at it.
//
//   node --test forge/film/narrow.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLOBAL_DEFINITION } from './keys.mjs'
import { KNOWN_CAPTURES, KNOWN_SHADOW_LIGHTS, farBoxOf, lightingAt, lightingOf, litRoomCells, movedCells, narrowPlan, renderedKeys, settingOf } from './narrow.mjs'
import { cellNumber } from './scene.mjs'
import { narrowedHits } from './seen.mjs'
import { cellNumbers, cellSet } from './export.mjs'
import { WING_DIR, createLoader } from './load.mjs'

const CELL = 2
const n = (x, y, z) => cellNumber(x, y, z)
/** a world's cells: every named cell occupied, with its hash */
const cellsOf = (entries, extra = {}) => ({ cell: CELL, hashes: new Map(entries), top: 40, mirror: [], mirrorLevel: undefined, plates: [], ...extra })
// the eye at the origin looking down -z, 60 degrees, wide
const EYE = [1, 1, 1, 0, 0, 0, 1, 60]
const SUN = [0, Math.SQRT1_2, Math.SQRT1_2]
const aspect = 16 / 9

const base = [[n(0, 0, -3), 'wall'], [n(0, 0, -10), 'behind'], [n(0, 2, -1), 'roof'], [n(0, 4, 1), 'caster'], [n(40, 0, -40), 'far'], [n(0, -1, -2), 'water']]

test('a moved cell is hit when the record holds it, when it casts toward a recorded surface, or in a recorded mirror; else not', () => {
  const then = cellsOf(base, { mirror: [n(0, -1, -2)], mirrorLevel: -1 })
  const now = cellsOf(base.map(([c, h]) => [c, `${h}'`]), { mirror: [n(0, -1, -2)], mirrorLevel: -1 })
  const s = settingOf(then, now, SUN)
  assert.equal(s.moved.length, base.length)
  const record = new Set([n(0, 0, -1), n(0, 0, -2), n(0, 0, -3)])
  const opts = { ...s, aspect }
  // the wall is recorded; what stands behind it is not
  assert.deepEqual(narrowedHits(record, [n(0, 0, -3)], [EYE], opts), [{ cell: n(0, 0, -3), why: 'recorded' }])
  assert.deepEqual(narrowedHits(record, [n(0, 0, -10)], [EYE], opts), [])
  // the caster up the sun's ray from the recorded wall's cell, two cells along it
  const wallUp = narrowedHits(new Set([n(0, 2, -1)]), [n(0, 4, 1)], [EYE], opts)
  assert.deepEqual(wallUp.map((h) => h.why), ['shadow ray'])
  // a recorded cell that is no surface casts nothing on: free air receives no shadow
  assert.deepEqual(narrowedHits(new Set([n(0, 3, 4)]), [n(0, 4, 5)], [EYE], { ...opts, occupied: new Set([n(0, 4, 5)]) }), [])
  // the far cell, out of the sun's reach and the record
  assert.deepEqual(narrowedHits(record, [n(40, 0, -40)], [EYE], opts), [])
  // the water recorded: the mirrored frustum of a frame looking down reaches a cell above the plane it cannot see
  const above = n(0, 3, -8)
  const withAbove = settingOf(cellsOf([...base, [above, 'a']], { mirror: [n(0, -1, -2)], mirrorLevel: -1 }), cellsOf([...base, [above, 'a2']], { mirror: [n(0, -1, -2)], mirrorLevel: -1 }), SUN)
  const seenInWater = narrowedHits(new Set([n(0, -1, -2)]), [above], [[1, 1, 1, Math.sin(-Math.PI / 8), 0, 0, Math.cos(-Math.PI / 8), 60]], { ...withAbove, aspect })
  assert.ok(seenInWater.some((h) => h.why === 'mirror'), 'a cell above the water, in the mirrored frustum of a recorded reflection')
  assert.deepEqual(narrowedHits(new Set([n(0, 0, -1)]), [above], [[1, 1, 1, Math.sin(-Math.PI / 8), 0, 0, Math.cos(-Math.PI / 8), 60]], { ...withAbove, aspect }).filter((h) => h.why === 'mirror'), [], 'no reflection recorded, no mirror')
})

test('the cells moved between two worlds: a hash changed, a cell occupied in one of them only', () => {
  const a = cellsOf([[1, 'x'], [2, 'y'], [3, 'z']]), b = cellsOf([[1, 'x'], [2, 'y2'], [4, 'w']])
  assert.deepEqual(movedCells(a, b), [2, 3, 4])
})

/* ---- the plan ---- */
const D = 'd'.repeat(32), G = 'g'.repeat(32)
const clipE = { id: 'clip a>b wide', kind: 'clip', framing: 'wide', edge: 'a>b', from: 'a', to: 'b', keys: { motion: 'm', picture: 'p-now', delivery: D } }
const stillE = { id: 'still a wide', kind: 'still', framing: 'wide', node: 'a', keys: { motion: 'ms', picture: 's-now' } }
const job = { created: 'now', keys: { definition: GLOBAL_DEFINITION, global: G, delivery: D }, entries: [clipE, stillE] }
const worldThen = cellsOf(base), worldNow = cellsOf(base.map(([c, h]) => [c, c === n(0, 0, -10) ? 'moved behind' : h]))
const LIGHT_NONE = { lit: new Set(), captures: [], lights: [], unknown: [] }
const treeOf = (world, clipPicture, stillPicture, exposure = [1, 1], lighting = LIGHT_NONE) => ({
  global: { key: G }, world: { cells: world, sun: SUN }, lighting,
  clips: new Map([['a>b wide', { motion: 'm', picture: clipPicture, exposure, samples: [EYE, EYE], cells: [n(0, 0, -3), n(0, 0, -10)] }]]),
  stills: new Map([['a wide', { motion: 'ms', picture: stillPicture, exposure: 1, sample: EYE, cells: [n(0, 0, -3), n(0, 0, -10)] }]]),
})
const now = treeOf(worldNow, 'p-now', 's-now')
const row = (e, picture, over = {}) => ({ id: e.id, status: 'done', head: 'h0', keys: { motion: e.keys.motion, picture, global: G, delivery: e.keys.delivery ?? D }, seenFormat: 2, ...over })
const behindWall = new Set([n(0, 0, -1), n(0, 0, -2), n(0, 0, -3)])

test('a picture moved behind the wall alone is carried, clip and still; through the record it stays red', () => {
  const records = new Map([[clipE.id, row(clipE, 'p-then')], [stillE.id, row(stillE, 's-then')]])
  const heads = new Map([['h0', treeOf(worldThen, 'p-then', 's-then')]])
  const plan = narrowPlan(job, records, now, heads, () => behindWall)
  assert.deepEqual(plan.carried.map((c) => c.e.id).sort(), [clipE.id, stillE.id].sort())
  assert.equal(plan.carried[0].narrowed.cellsMoved, 1)
  // the record is the export's, already dilated by a cell: it reaches a moved cell by holding it
  assert.equal(narrowPlan(job, records, now, heads, () => new Set([...behindWall, n(0, 0, -9)])).carried.length, 2, 'a recorded neighbour is not the cell')
  const seeing = narrowPlan(job, records, now, heads, () => new Set([...behindWall, n(0, 0, -10)]))
  assert.equal(seeing.carried.length, 0, 'the record holds the moved cell')
  assert.ok(seeing.stale.every((s) => /moved cell/.test(s.why)))
})

test('refused: the render tree gives another key, the motion or the exposure moved, no record of format 2, a still with no clip of its tree', () => {
  const records = new Map([[clipE.id, row(clipE, 'p-then')], [stillE.id, row(stillE, 's-then')]])
  const wrong = narrowPlan(job, records, now, new Map([['h0', treeOf(worldThen, 'p-other', 's-other')]]), () => behindWall)
  assert.equal(wrong.carried.length, 0)
  assert.ok(wrong.stale.every((s) => /another picture key/.test(s.why)))
  const motion = narrowPlan(job, new Map([[clipE.id, row(clipE, 'p-then', { keys: { motion: 'm-old', picture: 'p-then', global: G, delivery: D } })]]), now, new Map([['h0', treeOf(worldThen, 'p-then', 's-then')]]), () => behindWall)
  assert.deepEqual(motion.stale, [{ id: clipE.id, why: 'moved: motion, picture' }])
  const exposed = narrowPlan(job, records, now, new Map([['h0', treeOf(worldThen, 'p-then', 's-then', [1, 2])]]), () => behindWall)
  assert.ok(exposed.stale.some((s) => s.id === clipE.id && /exposure/.test(s.why)))
  const none = narrowPlan(job, records, now, new Map([['h0', treeOf(worldThen, 'p-then', 's-then')]]), () => null)
  assert.equal(none.carried.length, 0)
  const otherTree = new Map([[clipE.id, row(clipE, 'p-then', { head: 'h1' })], [stillE.id, row(stillE, 's-then')]])
  const lone = narrowPlan(job, otherTree, now, new Map([['h0', treeOf(worldThen, 'p-then', 's-then')], ['h1', treeOf(worldThen, 'p-then', 's-then')]]), () => behindWall)
  assert.deepEqual(lone.carried.map((c) => c.e.id), [clipE.id])
  assert.deepEqual(lone.stale, [{ id: stillE.id, why: 'no seen record of format 2 from the tree it was rendered from' }])
  assert.equal(narrowPlan(job, records, now, new Map([['h0', null]]), () => behindWall).carried.length, 0, 'an unreadable tree carries nothing')
})

test('a plate cell the record reaches outside the cells its picture key read refuses the carry', () => {
  const plate = n(0, 0, -2)
  const withPlate = (w) => ({ ...w, plates: [plate] })
  const nowP = { ...now, world: { ...now.world, cells: withPlate(worldNow) } }
  const records = new Map([[clipE.id, row(clipE, 'p-then')]])
  const thenP = treeOf(withPlate(worldThen), 'p-then', 's-then')
  const plan = narrowPlan({ ...job, entries: [clipE] }, records, nowP, new Map([['h0', thenP]]), () => behindWall)
  assert.deepEqual(plan.stale, [{ id: clipE.id, why: 'it can show a plate cell its picture key did not read' }])
  thenP.clips.get('a>b wide').cells.push(plate)
  assert.equal(narrowPlan({ ...job, entries: [clipE] }, records, nowP, new Map([['h0', thenP]]), () => behindWall).carried.length, 1, 'read by the key, its hash was checked')
})

test('the keys a record was rendered with, through a carry', () => {
  assert.deepEqual(renderedKeys({ keys: { picture: 'a' } }), { picture: 'a' })
  assert.deepEqual(renderedKeys({ keys: { picture: 'b' }, carried: { from: { picture: 'a' } } }), { picture: 'a' })
  assert.deepEqual(renderedKeys({ keys: { picture: 'c' }, carried: { from: { picture: 'b' }, rendered: { keys: { picture: 'a' } } } }), { picture: 'a' })
})

test('a job not planned on the tree is refused', () => {
  assert.throws(() => narrowPlan({ ...job, keys: { ...job.keys, global: 'x' } }, new Map(), now, new Map(), () => null), /plan it again/)
  assert.throws(() => narrowPlan({ ...job, entries: [{ ...clipE, keys: { ...clipE.keys, picture: 'zz' } }] }, new Map(), now, new Map(), () => null), /not the tree's/)
})

test('a record that enters a lit room is reached by every moved cell; one beside it is not', () => {
  const s = settingOf(cellsOf(base), cellsOf(base.map(([c, h]) => [c, `${h}'`])), SUN, new Set([n(5, 0, 5)]))
  const opts = { ...s, aspect }
  const far = [n(40, 0, -40)]
  assert.deepEqual(narrowedHits(new Set([n(5, 0, 5)]), far, [EYE], opts), [{ cell: far[0], why: 'lit room' }])
  assert.deepEqual(narrowedHits(new Set([n(5, 0, 6)]), far, [EYE], opts), [])
  const lit = { ...LIGHT_NONE, lit: new Set([n(0, 0, -1)]) }
  const records = new Map([[clipE.id, row(clipE, 'p-then')]])
  const plan = narrowPlan({ ...job, entries: [clipE] }, records, { ...now, lighting: lit }, new Map([['h0', treeOf(worldThen, 'p-then', 's-then')]]), () => behindWall)
  assert.deepEqual(plan.stale, [{ id: clipE.id, why: 'it can show 1 moved cell (lit room)' }])
})

test('the shadow receivers are the cells a ray ended on a body in, where the record names them', () => {
  const s = settingOf(cellsOf(base), cellsOf(base.map(([c, h]) => [c, `${h}'`])), SUN)
  const opts = { ...s, aspect }
  // a surface the node world does not hold (an interior's floor) still receives the caster's shadow
  const floor = n(0, 2, -1)
  const unheld = { ...opts, occupied: new Set([...opts.occupied].filter((c) => c !== floor)) }
  assert.deepEqual(narrowedHits(new Set([floor]), [n(0, 4, 1)], [EYE], unheld), [], 'without struck cells the unheld floor is free air')
  const struck = Object.assign(new Set([floor]), { struck: new Set([floor]) })
  assert.deepEqual(narrowedHits(struck, [n(0, 4, 1)], [EYE], unheld).map((h) => h.why), ['shadow ray'])
  // air the rays crossed receives no shadow
  const air = Object.assign(new Set([floor]), { struck: new Set() })
  assert.deepEqual(narrowedHits(air, [n(0, 4, 1)], [EYE], opts), [])
  // a plate casts none
  assert.deepEqual(narrowedHits(struck, [n(0, 4, 1)], [EYE], { ...unheld, shadows: false }), [])
})

test('the struck cells ride the record as a flag, dilated with it', () => {
  const cells = cellSet()
  cells.add(0, 0, 0)
  cells.add(3, 0, 0, 2)
  const { bits, count } = cells.dilated()
  assert.equal(count, 27 * 2)
  const all = cellNumbers(bits), struck = cellNumbers(bits, 2)
  assert.equal(all.length, 54)
  assert.equal(struck.length, 27)
  assert.ok(struck.includes(cellNumber(4, 1, 1)) && !struck.includes(cellNumber(1, 0, 0)))
})

test('a module that lights the scene outside the pin refuses every carry', () => {
  const known = lightingOf([['collection/picture-room.ts', 'new CubeCamera(.05, 2400, t); const l = new DirectionalLight(); l.shadow.mapSize'], ['water.ts', 'createReflector(']])
  assert.deepEqual(known.unknown, [])
  const extra = lightingOf([['court-lamp.ts', 'const l = new SpotLight(1); l.castShadow = true'], ['gate/mirror.ts', 'stack.reflector(plane)']])
  assert.deepEqual(extra.unknown, ['court-lamp.ts', 'gate/mirror.ts'])
  const records = new Map([[clipE.id, row(clipE, 'p-then')]])
  const plan = narrowPlan({ ...job, entries: [clipE] }, records, { ...now, lighting: { ...LIGHT_NONE, unknown: extra.unknown } }, new Map([['h0', treeOf(worldThen, 'p-then', 's-then')]]), () => behindWall)
  assert.deepEqual(plan.stale, [{ id: clipE.id, why: 'a module lights the scene the narrowed test does not know: court-lamp.ts, gate/mirror.ts' }])
})

test('the working tree: the pin is whole, and every room probe stands in a lit cell', async () => {
  const lighting = await lightingAt()
  assert.deepEqual(lighting.unknown, [], 'every capture and shadowing light of the wing is pinned')
  assert.deepEqual(lighting.captures, [...KNOWN_CAPTURES].sort())
  assert.deepEqual(lighting.lights, [...KNOWN_SHADOW_LIGHTS].sort())
  assert.deepEqual(lighting.far, { half: 90, light: 80, near: .5, far: 160 }, 'the far cascade as the wing stands it')
  const { load } = await createLoader()
  const lit = litRoomCells(load)
  const { FLOOR } = load(`${WING_DIR}/collection/layout.ts`)
  const probes = [
    load(`${WING_DIR}/collection/body-wall-plan.ts`).PROBE_AT, load(`${WING_DIR}/collection/line-gallery-plan.ts`).PROBE_AT,
    load(`${WING_DIR}/collection/picture-room-plan.ts`).PROBE_AT, load(`${WING_DIR}/collection/supper-room-plan.ts`).PROBE_AT,
    load(`${WING_DIR}/collection/supper-room-plan.ts`).NAVE_PROBE_AT,
    // the hall light's own, a module constant (`hall-light.ts`)
    [-50.3, -52.85, FLOOR + 2.1],
  ]
  for (const [east, north, up] of probes) assert.ok(lit.has(cellNumber(Math.floor(east / 2), Math.floor(up / 2), Math.floor(-north / 2))), `the probe at ${east}, ${north}, ${up}`)
})

test('a receiver beyond the eyes\' reach but inside the far cascade takes the caster\'s shadow', () => {
  // the eye 80 m west of the origin, a receiver 140 m east of it and its caster two cells up the sun's way
  const eye = [-80, 1, 1, 0, 0, 0, 1, 60]
  const receiver = n(30, 0, 0), caster = n(30, 2, 2)
  const world = cellsOf([[receiver, 'r'], [caster, 'c']])
  const s = settingOf(world, cellsOf([[receiver, 'r'], [caster, 'c2']]), SUN)
  const record = Object.assign(new Set([receiver]), { struck: new Set([receiver]) })
  assert.deepEqual(narrowedHits(record, [caster], [eye], { ...s, aspect }), [], 'outside the eyes\' 100 m')
  const farBox = farBoxOf({ half: 90, light: 80, near: .5, far: 160 }, SUN)
  assert.deepEqual(farBox.map((c) => Math.round(c[0])), [-90, 90], 'the light\'s own x is the world\'s under this sun')
  assert.deepEqual(narrowedHits(record, [caster], [eye], { ...s, aspect, farBox }).map((h) => h.why), ['shadow ray'])
})
