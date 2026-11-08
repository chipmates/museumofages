// The gate's paving veins (gate/gate-mat.ts): the breccia's white veins break along their length, so no whole cell edge
// draws as one straight pale segment.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../pages.mjs'

const mat = readFileSync(join(APP, 'src/wings/babylon/gate/gate-mat.ts'), 'utf8')
const fn = (name) => {
  const a = mat.indexOf(`export function ${name}(`)
  assert.ok(a >= 0, name)
  const b = mat.indexOf('\nexport ', a + 1)
  return mat.slice(a, b < 0 ? mat.length : b)
}

test('the breccia veins are broken along their length by a finer noise and drawn at most a fifth strong', () => {
  const pave = fn('pavingMaterial')
  const run = /const veinRun = smoothstep\(([\d.]+), ([\d.]+), mx_noise_float\(vec3\(s\.mul\((\d+)\), t\.mul\((\d+)\), [\d.]+\)\)\.add\(0\.5\)\)/.exec(pave)
  assert.ok(run, 'veinRun')
  // the break noise runs several times finer than the cells' pick (1.7 per metre), so a vein stops inside its own edge
  assert.ok(Number(run[3]) >= 5 && Number(run[3]) === Number(run[4]), `break scale ${run[3]}`)
  assert.match(pave, /const vein = smoothstep\(0\.02, 0\.0, edge\)\.mul\([^\n]*\)\.mul\(veinRun\)\n/)
  const w = Number(/V\(PAL\.brecciaVein\), vein\.mul\(([\d.]+)\)\)/.exec(pave)[1])
  assert.ok(w <= 0.2, `vein weight ${w}`)
})
