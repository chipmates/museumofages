// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// One light under the horizon: the walk's light (open/light.ts) is the only writer of the scene's environment on the
// Babylon pages, the map hands it the twilight as its source, and that source is empty at every stop but the last, so
// every other stop keeps the walk's own environment exactly.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const sun = await import(join(W, 'map/sun.ts'))
const plan = JSON.parse(readFileSync(join(W, 'crescent/crescent-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(W, 'map/map-cams.json'), 'utf8'))

const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.ts') ? [join(d, f)] : []))
// code lines only: a comment may name the environment
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, ''))

test('the walk\'s light is the one writer of the environment on the Babylon pages', () => {
  const writers = []
  for (const f of files(W)) {
    code(readFileSync(f, 'utf8')).forEach((l, i) => { if (/\.environment\s*=(?!=)/.test(l)) writers.push(`${relative(W, f)}:${i + 1}`) })
  }
  assert.ok(writers.length > 0, 'the walk\'s light writes it')
  assert.deepEqual([...new Set(writers.map((w) => w.split(':')[0]))], ['open/light.ts'], `writers: ${writers.join(', ')}`)
})

test('the map hands the crescent\'s twilight to the walk\'s light as its source', () => {
  const map = code(readFileSync(join(W, 'map/map.ts'), 'utf8')).join('\n')
  assert.match(map, /L\.setEnvSource\(crescent\.env\)/)
  const light = code(readFileSync(join(W, 'open/light.ts'), 'utf8')).join('\n')
  // the source is asked before the walk's sky is baked, in the one bake every trigger calls
  const bake = light.slice(light.indexOf('function bakeEnv'), light.indexOf('function bakeEnv') + 400)
  assert.ok(bake.indexOf('envSource') > 0 && bake.indexOf('envSource') < bake.indexOf('pmrem.fromScene'), 'the source first, then the walk\'s own bake')
})

test('the source is empty at every stop but the last, and full at the last stop\'s hour', () => {
  const [a, b] = plan.dusk.from
  const weight = (el) => Math.min(1, Math.max(0, (a - el) / (a - b)))
  for (const s of cams.stops) {
    const w = weight(sun.sunAt(sun.hourOf(s.hour)).elevation)
    if (s.n === 14) assert.equal(w, 1, 'the last stop under the twilight in full')
    else assert.equal(w, 0, `stop ${s.n} (${s.hour}) keeps the walk's environment`)
  }
})
