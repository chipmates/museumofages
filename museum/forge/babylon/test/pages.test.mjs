// node --test forge/babylon/test/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP, PAGES, STOPS, checkPort, devicePixels, parseSize, resolveStop } from '../pages.mjs'
import { writableIn } from '../serve.mjs'

test('every stop of the map film is in the kit, by number and id, in order', () => {
  const cams = JSON.parse(readFileSync(join(APP, 'src/wings/babylon/map/map-cams.json'), 'utf8'))
  assert.deepEqual(STOPS.map((s) => [s.stop, s.id]), cams.stops.map((s) => [String(s.n), s.id]))
  for (const s of STOPS) assert.ok(PAGES[s.page], `stop ${s.stop} names a page the kit knows`)
})

test('a stop resolves by number, id, page prefix and page name', () => {
  assert.equal(resolveStop('3').page, 'gate')
  assert.equal(resolveStop('forecourt').stop, '3')
  assert.equal(resolveStop('map:3').page, 'map')
  assert.equal(resolveStop('map:3').owner, 'gate')
  assert.equal(resolveStop('3').owner, 'gate')
  assert.equal(resolveStop('9').page, 'map')
  assert.equal(resolveStop('open').page, 'open')
  assert.throws(() => resolveStop('15'), /no stop/)
  assert.throws(() => resolveStop('gate:9'), /not on the gate page/)
  assert.throws(() => resolveStop('nowhere:1'), /no Babylon page/)
})

test('device pixels are the CSS size times the ratio', () => {
  assert.deepEqual(parseSize('1600x900@2'), { css: [1600, 900], ratio: 2 })
  assert.deepEqual(devicePixels(parseSize('390x844@3')), [1170, 2532])
  assert.deepEqual(devicePixels(parseSize('1600x900@1.2')), [1920, 1080])
  assert.throws(() => parseSize('1600*900'))
})

test('the kit keeps to its ports', () => {
  assert.equal(checkPort(5214), 5214)
  for (const p of [5199, 5400, 5209, 5220]) assert.throws(() => checkPort(p))
})

test('the writer takes files inside its folder only', () => {
  const w = writableIn('/a/out')
  assert.equal(w('/a/out/x.png'), '/a/out/x.png')
  assert.equal(w('/a/out/sub/x.json'), '/a/out/sub/x.json')
  assert.equal(w('/a/outside/x.png'), null)
  assert.equal(w('/a/out/../x.png'), null)
  assert.equal(w('x.png'), null)
})
