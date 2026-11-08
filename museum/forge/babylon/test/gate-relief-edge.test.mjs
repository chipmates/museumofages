// The gate's relief panels (gate/gate-mat.ts panelMaterial): a moulding's steep side face takes the animal's colour from
// the top of its step, so at a grazing view the planar colour map's ground band shows no blue and orange rim.
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

test('on steep relief the colour map is read uphill along the height gradient, at least one grid step far', () => {
  const p = fn('panelMaterial')
  const band = /const steep = float\(1\)\.sub\(smoothstep\(([\d.]+), ([\d.]+), dot\(nWorld, nW\)\)\)/.exec(p)
  assert.ok(band, 'steep band on the relief normal against the face normal')
  assert.ok(Number(band[1]) < Number(band[2]) && Number(band[2]) < 1, `band ${band[1]}..${band[2]}`)
  const reach = /const lean = steep\.mul\(max\(float\(([\d.]+)\), e\)\)\.div\(max\(length\(vec2\(hu, hv\)\), [\de.-]+\)\)/.exec(p)
  assert.ok(reach, 'lean along the normalised gradient')
  // the panel grid's step is 1 cm (gate-mesh.ts panelGrid), so a side face spans one step of the map
  assert.ok(Number(reach[1]) >= 0.01, `reach ${reach[1]}`)
  assert.match(p, /const ucol = u\.add\(hu\.mul\(lean\)\), vcol = v\.add\(hv\.mul\(lean\)\)/)
  assert.match(p, /texture\(maps\.colour\[sc\]!, cuvA\)\.level\(lod\)\.mul\(inside\(ucol, vcol\)\)/)
})

test('the coat, its normal and the flat state stay as they were: only the colour lookup moves', () => {
  const p = fn('panelMaterial')
  assert.match(p, /m\.clearcoatNode = mix\(select\(U\.uState\.lessThan\(1\.5\), float\(0\), float\(1\)\.sub\(joint\)\), float\(0\), U\.uSwitch\)/)
  assert.match(p, /m\.clearcoatNormalNode = m\.normalNode/)
  assert.match(p, /const sil = step\(0\.5, texture\(maps\.height, cuv\)\.level\(0\)\.y\.mul\(inside\(u, v\)\)\)/)
  assert.doesNotMatch(p, /specularIntensityNode/)
})
