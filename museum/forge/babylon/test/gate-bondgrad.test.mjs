// The bond's stretch check (?bondgrad=<limit>, gate/gate-mat.ts) stays out of the default draw: without the flag the
// walls' material holds no derivative node and keeps its own colour and class light; with it the check takes over.
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

const URL_MAT = pathToFileURL(join(APP, 'src/wings/babylon/gate/gate-mat.ts')).href
// the flag is read once at module load, so each case loads its own module instance under its own location
const load = async (search, tag) => {
  if (search === null) delete globalThis.location
  else globalThis.location = { search }
  try { return await import(`${URL_MAT}?case=${tag}`) } finally { delete globalThis.location }
}
const SLOTS = ['colorNode', 'emissiveNode', 'roughnessNode', 'metalnessNode', 'clearcoatNode', 'clearcoatRoughnessNode', 'normalNode', 'outputNode']
const walk = (roots, visit) => {
  const seen = new Set(), stack = [...roots]
  while (stack.length) {
    const n = stack.pop()
    if (!n || typeof n !== 'object' || seen.has(n)) continue
    seen.add(n)
    visit(n)
    for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? stack.push(...v) : stack.push(v)
  }
}
const derivatives = (m) => {
  let c = 0
  walk(SLOTS.map((s) => m[s]), (n) => { if (n.method === 'dFdx' || n.method === 'dFdy') c++ })
  return c
}
const reaches = (node, target) => {
  let hit = false
  walk([node], (n) => { if (n === target) hit = true })
  return hit
}
const rooms = { boxes: [{ x0: -2, x1: 2, z0: -10, z1: -1, y1: 9, open: 0.42 }] }
const wall = (G) => {
  const U = G.makeUniforms({ M: '#808080', R: '#a05040', G: '#40a050' })
  return { U, m: G.wallMaterial(U, rooms) }
}

test('the default draw holds no stretch check: no derivative node, its own colour and class light', async () => {
  for (const [search, tag] of [[null, 'none'], ['', 'empty'], ['?bondgrad=0', 'zero'], ['?stop=3', 'other']]) {
    const { U, m } = wall(await load(search, tag))
    assert.equal(derivatives(m), 0, `${tag}: a derivative node in the default draw`)
    assert.ok(reaches(m.colorNode, U.uSwitch), `${tag}: the colour lost its class switch`)
    assert.ok(reaches(m.emissiveNode, U.uSelf), `${tag}: the emissive lost the class light`)
  }
})

test('the flag swaps the check in (so the default case above can see it)', async () => {
  const { U, m } = wall(await load('?bondgrad=1.5', 'flag'))
  assert.ok(derivatives(m) > 0, 'the check view holds no derivative node')
  assert.ok(!reaches(m.emissiveNode, U.uSelf), 'the check view kept the class light')
})
