// The walk's key and tip rules (src/wings/walk-rules.mjs): Escape backs out one
// level and never moves the eye on or up; while the eye walks, Escape and Space
// hold it where it is; the tips come one a walk, each once, four at most.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIPS, TIPS_MOST, nextTip, walkKey } from '../src/wings/walk-rules.mjs'

const key = (k, at = {}) => walkKey({ key: k, layer: 'none', walk: 'rest', ...at })

test('Escape shuts the layer that stands, first the close look, then a drawer', () => {
  for (const walk of ['rest', 'moving', 'held']) {
    assert.equal(key('Escape', { layer: 'look', walk }), 'look-back')
    assert.equal(key('Escape', { layer: 'drawer', walk }), 'drawer-close')
  }
})

test('Escape never moves the eye: at rest and while held it does nothing', () => {
  assert.equal(key('Escape'), 'none')
  assert.equal(key('Escape', { walk: 'held' }), 'none')
  assert.equal(key('Escape', { walk: 'held', repeat: true }), 'none')
})

test('Escape holds a moving walk, but a key held down since the welcome does not', () => {
  assert.equal(key('Escape', { walk: 'moving' }), 'pause')
  assert.equal(key('Escape', { walk: 'moving', repeat: true }), 'none')
})

test('Space holds and frees a walk as a video does, and is the way on at rest', () => {
  assert.equal(key(' ', { walk: 'moving' }), 'pause')
  assert.equal(key(' ', { walk: 'held' }), 'resume')
  assert.equal(key('Spacebar', { walk: 'moving' }), 'pause')
  assert.equal(key(' ', { walk: 'moving', repeat: true }), 'none')
  assert.equal(key(' ', { walk: 'held', repeat: true }), 'none')
  // at rest the band's own way on answers, as before
  assert.equal(key(' '), 'pass')
})

test('Space on a control is the control\'s, and over a layer the layer\'s', () => {
  for (const walk of ['rest', 'moving', 'held']) {
    assert.equal(key(' ', { walk, onControl: true }), 'pass')
    assert.equal(key(' ', { walk, layer: 'look' }), 'pass')
  }
})

test('the arrows: held, right walks on and left goes back; moving, right walks faster', () => {
  assert.equal(key('ArrowRight', { walk: 'held' }), 'resume')
  assert.equal(key('ArrowDown', { walk: 'held' }), 'resume')
  assert.equal(key('ArrowLeft', { walk: 'held' }), 'back')
  assert.equal(key('ArrowUp', { walk: 'held' }), 'back')
  assert.equal(key('ArrowRight', { walk: 'moving' }), 'hurry')
  assert.equal(key('ArrowLeft', { walk: 'moving' }), 'pass')
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) assert.equal(key(k), 'pass')
})

test('W, A, S and D are told what the walk answers instead, never over a layer', () => {
  for (const k of ['w', 'a', 's', 'd', 'W', 'D']) {
    for (const walk of ['rest', 'moving', 'held']) assert.equal(key(k, { walk }), 'hint')
    assert.equal(key(k, { layer: 'look' }), 'pass')
  }
  for (const k of ['q', 'x', 'Enter', 'Tab']) assert.equal(key(k), 'pass')
})

test('the tips: the keys first, then sideways on an upright phone, the plan, a close look while none was opened', () => {
  assert.deepEqual([...TIPS], ['keys', 'sideways', 'plan', 'look'])
  const run = (upright, looked) => {
    const shown = []
    for (let walk = 0; walk < 8; walk++) {
      const tip = nextTip({ shown, upright, looked })
      if (tip) shown.push(tip)
    }
    return shown
  }
  assert.deepEqual(run(false, false), ['keys', 'plan', 'look'])
  assert.deepEqual(run(true, false), ['keys', 'sideways', 'plan', 'look'])
  assert.deepEqual(run(true, true), ['keys', 'sideways', 'plan'])
  assert.deepEqual(run(false, true), ['keys', 'plan'])
})

test('each tip once a visit and four at most, carried over a reload', () => {
  assert.equal(nextTip({ shown: ['keys', 'sideways', 'plan', 'look'], upright: true, looked: false }), null)
  assert.equal(TIPS_MOST, 4)
  // a reload in the same tab meets the tip after the last one shown
  assert.equal(nextTip({ shown: ['keys'], upright: false, looked: false }), 'plan')
  assert.equal(nextTip({ shown: ['keys', 'plan'], upright: true, looked: true }), 'sideways')
})
