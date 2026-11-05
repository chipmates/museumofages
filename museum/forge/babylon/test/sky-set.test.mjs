// The shade light's sky directions (open/sky-set.ts): a fixed set over the upper hemisphere, the same every load,
// even in solid angle; the multi-bounce give-back never takes light away and never passes the open sky.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
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

const S = await import(pathToFileURL(join(APP, 'src/wings/babylon/open/sky-set.ts')).href)

test('128 directions, unit length, all above the horizon, the same on a second call', () => {
  const a = S.skyDirections(128), b = S.skyDirections(128)
  assert.equal(a.length, 128)
  assert.deepEqual(a, b)
  for (const [x, y, z] of a) {
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-12)
    assert.ok(y > 0 && y < 1)
  }
})

test('the solid angles sum to 2 pi, and the cosine-weighted sum to pi (the irradiance of a unit sky on a floor)', () => {
  for (const n of [64, 128]) {
    const d = S.skyDirections(n), w = S.solidAngle(n)
    assert.ok(Math.abs(w * n - 2 * Math.PI) < 1e-12)
    const cos = d.reduce((a, [, y]) => a + y * w, 0)
    assert.ok(Math.abs(cos - Math.PI) < 1e-3, `cosine sum ${cos}`)
  }
})

// one sub-frame reads a quarter; a still averages all four, so a quarter's spread is noise between sub-frames, not
// bias in the still (measured: a floor within 2.4 %, a wall by bearing within 13 %)
test('each quarter of the set (k mod 4, one sub-frame) covers the sky about evenly', () => {
  const d = S.skyDirections(128), w = S.solidAngle(128) * 4
  for (let p = 0; p < 4; p++) {
    const q = d.filter((_, k) => k % 4 === p)
    const floor = q.reduce((a, [, y]) => a + y * w, 0)
    // a wall facing east: the cosine over the half the quarter sees
    const east = q.reduce((a, [x]) => a + Math.max(0, x) * w, 0)
    assert.ok(Math.abs(floor - Math.PI) / Math.PI < 0.03, `quarter ${p} floor ${floor}`)
    assert.ok(Math.abs(east - Math.PI / 2) / (Math.PI / 2) < 0.15, `quarter ${p} east wall ${east}`)
  }
})

test('the give-back: at or over the seen share, under 1, exact at 0 and 1', () => {
  assert.equal(S.multiBounce(0, 0.45), 0)
  assert.ok(Math.abs(S.multiBounce(1, 0.45) - 1) < 0.01)
  for (let v = 0.05; v < 1; v += 0.05) {
    const g = S.multiBounce(v, 0.45)
    assert.ok(g >= v && g <= 1.0001, `v ${v} -> ${g}`)
  }
})
