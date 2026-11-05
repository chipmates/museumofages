// The shade light's rooms and hand terms (open/sky-set.ts with the court's, the house's and the temple's materials):
// each material names its rooms for the field and steps its hand sky-view terms aside by the one switch, which is off
// until a field lights a still, so a page without `?sky=set` draws as before.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const src = (p) => readFileSync(join(APP, 'src/wings/babylon', p), 'utf8')

test('the hand terms\' switch is one uniform, off at load', () => {
  assert.equal(S.uSkySet.value, 0)
})

for (const [file, terms] of [
  ['court/court-mat.ts', ['skyAO']],
  ['house/house-mat.ts', ['pavingAO', 'courtWallAO', 'Z.courtFloor']],
  ['nabu/nabu-mat.ts', ['floorAO', 'courtWallAO', 'wallShare', 'occluded']],
]) {
  test(`${file} names its rooms for the field and steps its view factors aside by uSkySet`, () => {
    const s = src(file)
    assert.match(s, /import \{ uSkySet \} from '\.\.\/open\/sky-set'/)
    assert.match(s, /skyOpenNode = float\(1\)\.sub\(/)
    for (const t of terms) {
      const line = s.split('\n').find((l) => l.includes(t) && l.includes('uSkySet'))
      assert.ok(line, `${t} steps aside by uSkySet`)
    }
  })
}
