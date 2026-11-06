// The passage's light (gate/gate-mat.ts roomLight, the rooms in gate.ts): the open street's bounce enters through the four
// mouths onto the open, the south one at the street; the give-back is held under its top, so the floor under the vault
// stays darker than the street beyond; inside the rooms the glaze's gloss is its coat's alone. The beaten earth beside the
// street: the city's silt hue, trodden as smooth as the worn paving, the hidden sky given back warm.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon/gate')
const gate = readFileSync(join(W, 'gate.ts'), 'utf8')
const mat = readFileSync(join(W, 'gate-mat.ts'), 'utf8')

test('the rooms name the four mouths onto the open, the street and the forecourt at full light', () => {
  const block = gate.slice(gate.indexOf('mouths: ['), gate.indexOf('],', gate.indexOf('mouths: [')))
  const rows = [...block.matchAll(/\{ z: ([^,]+), out: (-?1), hw: hd, h: [^,]+, lit: ([\d.]+) \}/g)].map((m) => [m[1], Number(m[2]), Number(m[3])])
  assert.deepEqual(rows, [['0', 1, 1], ['zBack', -1, 0.55], ['zM0', 1, 0.55], ['zMS', -1, 1]])
  assert.match(gate, /hue: PAVE_HUE,/)
  assert.match(gate, /const PAVE_HUE = \(\(\): \[number, number, number\] => \{\s*const c = plan\.light\.bounce\.paving\.colour/)
})

test('the give-back is capped by its top and lives only inside the rooms', () => {
  assert.match(mat, /skyBounceNode = vec3\(\.\.\.rooms\.hue\)\.mul\(min\(s\.mul\(uMouth\.give\), uMouth\.top\)\)/)
  assert.match(mat, /s = s\.mul\(r\.inside\)/)
  const top = Number(/top: uniform\(([\d.]+)\)/.exec(mat)[1]), give = Number(/give: uniform\(([\d.]+)\)/.exec(mat)[1])
  // at the mouth (half the view open) the cap holds; the share a mouth adds never passes half the hemisphere
  assert.ok(top < 0.5 * give && top <= 0.5, `top ${top} give ${give}`)
  assert.match(mat, /side = step\(0, p\.z\.sub\(mo\.z\)\.mul\(-mo\.out\)\)/)
})

test('inside the rooms the glaze keeps only its coat as a mirror, in the walls and the panels', () => {
  assert.equal((mat.match(/roomLight\(m, rooms, [^\n]*m\.clearcoatNode\)/g) ?? []).length, 2)
  assert.match(mat, /specularIntensityNode = float\(1\)\.sub\(glaze\.mul\(r\.inside\)\.mul\(uMouth\.glaze\)\)/)
})

test('the earth beside the street keeps the city silt hue, the worn paving sheen and a warm give-back', () => {
  const silt = /const silt = vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(mat).slice(1).map(Number)
  // the map's city ground: TONES.silt (sRGB 138, 122, 96) times (1.12, 1.1, 1.08), its blue over red 0.44 in linear
  assert.ok(Math.abs(silt[2] / silt[0] - 0.444) < 0.01, `silt B/R ${silt[2] / silt[0]}`)
  assert.match(gate, /paintCity\(bodies\.group, city, tones, \{ band, \.\.\.\(q\.get\('earth'\) === '0' \? \{\} : \{ ground: earthOn \}\)/)
  const r = Number(/q\.get\('gRough'\) \?\? ([\d.]+)/.exec(gate)[1])
  assert.ok(r >= 0.6 && r <= 0.82, `the trodden earth's roughness ${r} within the worn paving's 0.6 to 0.82`)
  assert.match(gate, /gm\.roughnessNode = mix\(float\(1\), float\(Number\(q\.get\('gRough'\) \?\? [\d.]+\)\), earthAt\(\)\.w\)/)
  assert.match(gate, /mat\.skyBounceNode = vec3\(\.\.\.PAVE_HUE\)\.mul\(uCityBack\)/)
})
