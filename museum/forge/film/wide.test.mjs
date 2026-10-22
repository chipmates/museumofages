// THE WIDE STAND-IN, on scratch worlds: a frame that meets a lit room reads
// every cell; a caster whose shadow line passes through a frustum is read
// whether its receiver is in the node world or not and however far from the
// eye; a hidden light's casters ride with its receivers, a scene light's line
// with the frames its range meets; the picture key reads the shadow flags.
//
//   node --test forge/film/wide.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { pictureKey, wholeDigest } from './keys.mjs'
import { cellCoords, cellNumber } from './scene.mjs'
import { SEEN_DEFINITION, buildIndex, seenSet, wideSetting } from './seen.mjs'
import { lightingOf } from './lit.mjs'

const CELL = 2
const n = (x, y, z) => cellNumber(x, y, z)
// the sun up and behind the eye: a shadow line runs away from it, down and along -z
const SUN = [0, .5, Math.sqrt(.75)]
const aspect = 16 / 9
// the eye at (1, 1, 1) looking down -z, 60 degrees
const EYE = [1, 1, 1, 0, 0, 0, 1, 60]
// the same eye turned round, looking down +z
const BACK = [1, 1, 1, 0, 1, 0, 0, 60]
const LIT_NONE = { lit: new Set(), unpinned: [] }
/** a world of the named cells; `cast` the cells that hold a body casting a shadow (every one by default) */
function worldOf(entries, { cast = entries.map(([c]) => c), hidden = [], lights = [], mirror = [], mirrorLevel } = {}) {
  return {
    sun: SUN, hidden, lights,
    cells: { cell: CELL, hashes: new Map(entries), flags: new Map(entries.map(([c]) => [c, 'f'])), castMask: new Map(cast.map((c) => [c, 1])), top: 40, mirror, mirrorLevel },
  }
}
const seenOf = (world, samples, lighting = LIT_NONE, wide = true) => seenSet(buildIndex(world.cells), samples,
  { aspect, sun: world.sun, mirror: world.cells.mirror, mirrorLevel: world.cells.mirrorLevel, wide: wide ? wideSetting(world, lighting) : null })
const has = (cells, c) => [...cells].includes(c)

test('a caster behind the eye whose shadow falls into the frame through a floor the node world does not hold (hole 4)', () => {
  // the caster 6 m up and 6 m behind the eye; its line reaches the eye's height about 10 m ahead, where nothing is occupied
  const caster = n(0, 5, 3), wall = n(0, 0, -20)
  const world = worldOf([[caster, 'c'], [wall, 'w']])
  assert.ok(!has(seenOf(world, [EYE], LIT_NONE, false), caster), 'the first stand-in casts from occupied cells alone')
  const wide = seenOf(world, [EYE])
  assert.equal(wide.definition, SEEN_DEFINITION)
  assert.ok(has(wide, caster), 'the wide stand-in takes it')
  assert.ok(!has(seenOf(world, [BACK]), wall), 'the wall behind a turned eye is not seen')
})

test('a receiver beyond 100 m of the eye takes its caster (hole 3)', () => {
  // a narrow lens: the caster 31 m up at 141 m stands over the frustum, its line meets the frame near 190 m out
  const eye = [1, 1, 1, 0, 0, 0, 1, 20]
  const caster = n(0, 15, -70), ground = n(0, 0, -96)
  const world = worldOf([[caster, 'c'], [ground, 'g']])
  assert.ok(!has(seenOf(world, [eye], LIT_NONE, false), caster), 'out of the first stand-in\'s reach')
  assert.ok(has(seenOf(world, [eye]), caster))
})

test('a cell with no body that casts is no caster; one that starts to cast joins the set and moves the key', () => {
  const caster = n(0, 5, 3), ground = n(40, -1, 40)
  const quiet = worldOf([[caster, 'c'], [ground, 'g']], { cast: [] }), casting = worldOf([[caster, 'c'], [ground, 'g']], { cast: [caster] })
  assert.ok(!has(seenOf(quiet, [EYE]), caster))
  assert.ok(has(seenOf(casting, [EYE]), caster))
  const key = (w) => pictureKey(seenOf(w, [EYE]), w.cells.hashes, [1, 1], { flags: w.cells.flags })
  assert.notEqual(key(quiet), key(casting))
})

test('the shadow line test misses no caster: casters at random against random frames, by brute force', () => {
  let seed = 7
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const cells = []
  for (let i = 0; i < 400; i++) cells.push([n(Math.floor(rand() * 40) - 20, Math.floor(rand() * 12) - 2, Math.floor(rand() * 40) - 20), `c${i}`])
  const world = worldOf(cells)
  const camera = new THREE.PerspectiveCamera(), frustum = new THREE.Frustum(), m = new THREE.Matrix4(), p = new THREE.Vector3()
  const bottom = (Math.min(...cells.map(([c]) => cellCoords(c)[1])) - 1) * CELL
  let checked = 0
  for (let f = 0; f < 12; f++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .7) * 1.2, rand() * 6.28, 0))
    const sample = [rand() * 20 - 10, rand() * 6, rand() * 20 - 10, q.x, q.y, q.z, q.w, 30 + rand() * 50]
    const seen = new Set(seenOf(world, [sample]))
    camera.position.set(sample[0], sample[1], sample[2]); camera.quaternion.copy(q); camera.fov = sample[7]; camera.aspect = aspect
    camera.near = .25; camera.far = 4000; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (const [c] of cells) {
      if (seen.has(c)) continue
      const [x, y, z] = cellCoords(c)
      // points of the cell's box carried down the line away from the sun: none may be in the frame
      for (let k = 0; k < 40; k++) {
        const o = [x + rand(), y + rand(), z + rand()].map((v) => v * CELL)
        const depth = (o[1] - bottom) / SUN[1]
        for (let s = 0; s <= 60; s++) {
          const t = depth * s / 60
          p.set(o[0] - t * SUN[0], o[1] - t * SUN[1], o[2] - t * SUN[2])
          assert.ok(!frustum.containsPoint(p), `cell ${[x, y, z]} casts into frame ${f} at ${p.toArray().map((v) => v.toFixed(1))}`)
          checked++
        }
      }
    }
  }
  assert.ok(checked > 100000)
})

test('a frame that meets a lit room reads every cell, through the water\'s mirror too; one turned from it does not (holes 1 and 2)', () => {
  const room = n(0, 0, -6), far = n(30, 10, 40)
  const world = worldOf([[room, 'r'], [far, 'f']])
  const lighting = { lit: new Set([room, n(0, -1, -6)]), unpinned: [] }
  const inside = seenOf(world, [EYE], lighting)
  assert.equal(inside.whole, 'a frame meets a lit room')
  assert.equal(inside.length, 2)
  assert.ok(!seenOf(world, [BACK], lighting).whole)
  // an unoccupied lit cell is met as well: the room's surfaces are not in the node world
  assert.equal(seenOf(world, [EYE], { lit: new Set([n(0, 3, -12)]), unpinned: [] }).whole, 'a frame meets a lit room')
  // the eye looks down at the water; the lit room stands above it, behind the frustum's top
  const down = [1, 1, 1, Math.sin(-Math.PI / 6), 0, 0, Math.cos(-Math.PI / 6), 40]
  const water = n(0, -1, -2), high = n(0, 6, -9)
  const wet = worldOf([[water, 'w'], [high, 'h']], { mirror: [water], mirrorLevel: -1 })
  const highRoom = { lit: new Set([high]), unpinned: [] }
  assert.ok(!seenOf(worldOf([[n(0, -1, -2), 'w'], [high, 'h']]), [down], highRoom).whole, 'no water, no mirror')
  assert.equal(seenOf(wet, [down], highRoom).whole, 'a frame meets a lit room')
  // a module the pin does not place lights everything
  assert.match(seenOf(world, [BACK], { lit: new Set(), unpinned: ['gate/lamp.ts'] }).whole, /gate\/lamp\.ts/)
})

test('a hidden light\'s casters ride with its receivers; a scene light\'s line with the frames its range meets (hole 5)', () => {
  // the model beside the eye, in neither frame and casting on its own camera's layer alone
  const plate = n(0, 0, -3), model = n(10, 0, 0), elsewhere = n(-30, 0, 0)
  const hidden = [{ line: 'grave|reads|DirectionalLight|diagram', receivers: [plate], mask: 1 << 12 }]
  const base = [[plate, 'p'], [model, 'm'], [elsewhere, 'e']]
  const world = { ...worldOf(base, { cast: [], hidden }) }
  world.cells.castMask = new Map([[model, 1 << 12]])
  assert.ok(has(seenOf(world, [EYE]), model), 'the plate is seen: the model that casts on it is read')
  assert.ok(!has(seenOf(world, [BACK]), model), 'the plate is not seen')
  const lamp = { line: 'court|light|PointLight|lamp', box: [[-4, -4, -14], [4, 4, -6]], mask: 1 }
  const sky = { line: 'court|light|DirectionalLight|sky', box: null, mask: null }
  const lit = worldOf(base, { lights: [lamp, sky], cast: [elsewhere] })
  const ahead = seenOf(lit, [EYE]), behind = seenOf(lit, [BACK])
  assert.deepEqual(ahead.lights, [lamp.line, sky.line])
  assert.deepEqual(behind.lights, [sky.line])
  assert.ok(has(ahead, elsewhere) && !has(behind, elsewhere), 'the lamp\'s casters, by its camera\'s layers, where it lights')
  const key = (cells, w) => pictureKey(cells, w.cells.hashes, [1, 1], { flags: w.cells.flags })
  const dimmer = worldOf(base, { lights: [{ ...lamp, line: `${lamp.line} dimmer` }, sky], cast: [elsewhere] })
  assert.notEqual(key(seenOf(dimmer, [EYE]), dimmer), key(ahead, lit), 'the lamp moved: the frame it lights moves')
  assert.equal(key(seenOf(dimmer, [BACK]), dimmer), key(behind, lit), 'the frame it cannot light holds')
})

test('the picture key reads a seen cell\'s shadow flags; a seen set of every cell, the world\'s digest; the first stand-in keys as before', () => {
  const a = n(0, 0, -3)
  const world = worldOf([[a, 'a']])
  const cells = seenOf(world, [EYE])
  const key = (flags) => pictureKey(cells, world.cells.hashes, [1, 1], { flags })
  assert.notEqual(key(new Map([[a, 'cast']])), key(new Map([[a, 'none']])))
  const old = Float64Array.from([a])
  assert.equal(pictureKey(old, world.cells.hashes, [1, 1], { flags: new Map([[a, 'x']]) }), pictureKey(old, world.cells.hashes, [1, 1]), 'flags are the wide stand-in\'s')
  const all = seenOf(world, [EYE], { lit: new Set([a]), unpinned: [] })
  assert.throws(() => pictureKey(all, world.cells.hashes, [1, 1]), /digest/)
  const moved = worldOf([[a, 'a']]); moved.cells.flags.set(a, 'g')
  assert.notEqual(wholeDigest(world), wholeDigest(moved))
  assert.notEqual(pictureKey(all, world.cells.hashes, [1, 1], { whole: wholeDigest(world) }), pictureKey(all, world.cells.hashes, [1, 1], { whole: wholeDigest(moved) }))
})

test('the pin knows a light or a capture made under a namespace or as a class of its own', () => {
  const found = lightingOf([['a.ts', 'const l = new THREE.SpotLight(1); l.castShadow = true'], ['b.ts', 'class Washer extends SpotLight {}; w.shadow.mapSize'],
    ['c.ts', 'const probe = new THREE.CubeCamera (.1, 99, t)'], ['d.ts', 'const l = new THREE.PointLight(1)']])
  assert.deepEqual(found.unknown, ['a.ts', 'b.ts', 'c.ts'], 'a light with no shadow is the scene list\'s, not the pin\'s')
})
