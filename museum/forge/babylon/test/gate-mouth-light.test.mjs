// The passage's light (gate/gate-mat.ts roomLight, the rooms in gate.ts): the open street's bounce enters through the four
// mouths onto the open, the south one at the street; the give-back is held under its top, so the floor under the vault
// stays darker than the street beyond; inside the rooms the glaze's gloss is its coat's alone.
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
  assert.match(gate, /hue: \(\(\) => \{\s*const c = plan\.light\.bounce\.paving\.colour/)
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
