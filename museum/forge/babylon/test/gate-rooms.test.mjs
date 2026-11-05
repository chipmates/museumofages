// The gate's rooms under the sky field (gate/gate-mat.ts): the openness takes the passages' sky only while no field
// lights the still (it steps aside by uSkySet, so the sky is counted once), and every gate material names its rooms'
// ground share for the field (open/sky-set.ts), so the environment's ground bounce is the rooms' own floor there.
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

const G = await import(pathToFileURL(join(APP, 'src/wings/babylon/gate/gate-mat.ts')).href)
const S = await import(pathToFileURL(join(APP, 'src/wings/babylon/open/sky-set.ts')).href)

const reaches = (node, target) => {
  const seen = new Set(), stack = [node]
  while (stack.length) {
    const n = stack.pop()
    if (!n || typeof n !== 'object' || seen.has(n)) continue
    seen.add(n)
    if (n === target) return true
    for (const v of Object.values(n)) {
      if (v && typeof v === 'object') Array.isArray(v) ? stack.push(...v) : stack.push(v)
    }
  }
  return false
}
const rooms = { boxes: [{ x0: -2, x1: 2, z0: -10, z1: -1, y1: 9, open: 0.42 }] }

test('the walls and the paving step their openness aside under the field and name the rooms\' ground share', () => {
  const U = G.makeUniforms({ M: '#808080', R: '#a05040', G: '#40a050' })
  for (const m of [G.wallMaterial(U, rooms), G.pavingMaterial(U, { limestone: 1.05, limestoneN: 4, breccia: 0.66, brecciaN: 2, sd: [0, 1], st: [1, 0], turnZ: 21.3 }, rooms)]) {
    assert.ok(m.aoNode, 'an occlusion node')
    assert.ok(reaches(m.aoNode, S.uSkySet), 'the occlusion reads the field switch')
    assert.ok(m.skyGroundNode, 'the rooms\' ground share for the field')
  }
})
