// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// Two map fixes held in the source: the street's along-street noises fade with the pixel's footprint (no cross bands
// down a long lens), and the gate's far glaze keeps its hue (its coat's mirror cut, its saturation kept).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const code = (f) => readFileSync(join(W, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

test('the street\'s along-street noises go to their mean by the footprint', () => {
  const src = code('esagila/esagila-mat.ts')
  const far = src.match(/const far = seen\(fFlat, ([\d.]+)\)/)
  assert.ok(far, 'one footprint fade over the street')
  // footprint() holds its grazing term at n.v 0.1: a size much over 0.2 m never fades a street seen from its own height
  assert.ok(Number(far[1]) <= 0.2, `fade size ${far[1]}`)
  for (const name of ['drift', 'wornN']) assert.match(src, new RegExp(`const ${name} = .*\\.mul\\(far\\)\\s*$`, 'm'), name)
  for (const name of ['patch', 'sDrift']) assert.match(src, new RegExp(`const ${name} = mix\\(float\\(0\\.5\\), .*, far\\)\\s*$`, 'm'), name)
})

test('the gate\'s far glaze keeps its hue', () => {
  const src = code('map/gate-on-map.ts')
  const fn = src.slice(src.indexOf('function distantGlaze'), src.indexOf('export function buildGateOnMap'))
  assert.match(fn, /m\.clearcoatNode = m\.clearcoatNode\.mul\(float\(1\)\.sub\(far\.mul\(0\.7\)\)\)/)
  assert.match(fn, /mul\(FAR_SAT\)[\s\S]*far\.mul\(float\(1\)\.sub\(U\.uSwitch\)\)/)
  const sat = Number(src.match(/const FAR_SAT = ([\d.]+)/)?.[1])
  assert.ok(sat > 1 && sat <= 2, `FAR_SAT ${sat}`)
})
