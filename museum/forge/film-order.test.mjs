// The film walks the order its release was rendered along (src/wings/vinci/film-order.ts): the
// life's stops stand in the order their nodes stand in the release's `story`, a stop the release
// does not name rides behind the stop before it, and a release without `story` keeps the story
// file's own order. `FILM_ORDER_RELEASE=<film.json>` checks a release on disk as well.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { load } from '../src/wings/vinci/build-in-node.mjs'

const { lifeStops, releaseOrder } = load('src/wings/vinci/film-order.ts')

/** the story of the release `job` (6 Oct), the order its legs were rendered along */
const JOB_STORY = ['stop:picture-room', 'stop:picture-room-lisa', 'stop:picture-room-west', 'stop:flight', 'stop:works',
  'stop:reading-table', 'stop:body', 'stop:body-valve', 'stop:line-early', 'stop:supper-wall', 'stop:arrival',
  'stop:courtyard', 'stop:hall', 'stop:oratory', 'stop:study', 'stop:chamber', 'stop:grave']

// the wing's modules run in their own realm (build-in-node.mjs): its arrays are read into this one
const ids = (stops) => Array.from(stops, (s) => s.id)
const named = (story) => story.filter((n) => n.startsWith('stop:')).map((n) => n.slice(5))
const without = (story, id) => story.filter((n) => n !== `stop:${id}`)
function releases() {
  const out = [['job', JOB_STORY]]
  const file = process.env.FILM_ORDER_RELEASE
  if (file) out.push([file, JSON.parse(readFileSync(file, 'utf8')).story])
  return out
}

test('the life walks the release story: the anatomy pair after the reading table, the valve before the early line', () => {
  const today = ids(lifeStops())
  for (const [name, story] of releases()) {
    assert.ok(Array.isArray(story) && story.length, `${name} carries a story list`)
    const order = ids(releaseOrder(lifeStops(), story))
    assert.deepEqual(order, named(story).filter((id) => today.includes(id)), name)
    assert.deepEqual([...order].sort(), [...today].sort(), `${name}: every stop once`)
    assert.equal(order[order.indexOf('reading-table') + 1], 'body', name)
    assert.equal(order[order.indexOf('body') + 1], 'body-valve', name)
    assert.ok(order.indexOf('body-valve') < order.indexOf('line-early'), name)
  }
})

test('a release without a story keeps the story file\'s own order, its stops untouched', () => {
  const today = lifeStops()
  for (const story of [undefined, null, []]) {
    const order = releaseOrder(today, story)
    assert.deepEqual(ids(order), ids(today), String(story))
    order.forEach((stop, i) => assert.equal(stop, today[i]))
  }
})

test('a stop the release does not name keeps its place behind its story neighbour', () => {
  const job = named(JOB_STORY)
  // the valve rides with the body wall
  assert.deepEqual(ids(releaseOrder(lifeStops(), without(JOB_STORY, 'body-valve'))), job)
  // the early line follows the reading table it follows in the story file, ahead of the anatomy pair
  assert.deepEqual(ids(releaseOrder(lifeStops(), without(JOB_STORY, 'line-early'))),
    ['picture-room', 'picture-room-lisa', 'picture-room-west', 'flight', 'works', 'reading-table', 'line-early', 'body',
      'body-valve', 'supper-wall', 'arrival', 'courtyard', 'hall', 'oratory', 'study', 'chamber', 'grave'])
  // the hall stays behind the courtyard
  const hall = ids(releaseOrder(lifeStops(), without(JOB_STORY, 'hall')))
  assert.equal(hall[hall.indexOf('courtyard') + 1], 'hall')
  // the first stop stays first
  assert.equal(ids(releaseOrder(lifeStops(), without(JOB_STORY, 'picture-room')))[0], 'picture-room')
  // a node the wing does not build adds nothing
  assert.deepEqual(ids(releaseOrder(lifeStops(), ['stop:castle', ...JOB_STORY, 'start:stair-head'])), job)
})

test('the stops keep their names and rooms through the release order', () => {
  const today = lifeStops()
  const byId = new Map(today.map((s) => [s.id, s]))
  for (const stop of releaseOrder(today, JOB_STORY)) assert.equal(stop, byId.get(stop.id))
  // the page orders a fresh module by a release it already loaded, then by that release again
  assert.deepEqual(ids(releaseOrder(releaseOrder(today, JOB_STORY), JOB_STORY)), ids(releaseOrder(today, JOB_STORY)))
  const valve = today.find((s) => s.id === 'body-valve')
  assert.equal(valve?.station, 'body')
})
