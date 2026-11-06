// node --test forge/babylon/test/*.test.mjs (the rebuilt houses' court floors over the map's ground, built in a child node that
// strips its types: the arrival draws them as they come, unsettled, so a slope must never rise through a floor)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { rebuildHouses } from ${url('open/houses.ts')}
const city = buildPlan(JSON.parse(readFileSync(new URL(${url('map/map-plan.json')}), 'utf8')))
const H = rebuildHouses(city.boxes.filter((b) => b.group === 'house'), city.ground)
console.log(JSON.stringify(H.boxes.filter((b) => b.part === 4).map((b) => {
  const ca = [Math.cos(b.yaw), -Math.sin(b.yaw)], cb = [Math.sin(b.yaw), Math.cos(b.yaw)]
  let hi = -Infinity
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const su = (i / 6 - 0.5) * b.sx, sv = (j / 6 - 0.5) * b.sz
    hi = Math.max(hi, city.ground(b.x + ca[0] * su + cb[0] * sv, b.z + ca[1] * su + cb[1] * sv))
  }
  return { id: b.id, top: b.y1, g: b.gy, hi }
})))
`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the houses build', () => assert.equal(r.status, 0, r.stderr))

test("every court's floor stands 12 cm over its lot's ground and clears the ground across the court by at least 2.5 cm", () => {
  assert.ok(out.length > 1000)
  const low = out.filter((c) => c.top - c.hi < 0.025)
  assert.equal(low.length, 0, `${low.length} courts: ${low.slice(0, 5).map((c) => `${c.id} ${(c.top - c.hi).toFixed(3)}`).join(', ')}`)
  for (const c of out) assert.ok(c.top >= c.g + 0.12 - 1e-9, `${c.id} at ${c.top} over ${c.g}`)
})

test('only the courts on a slope rise: most floors keep their 12 cm', () => {
  const kept = out.filter((c) => Math.abs(c.top - (c.g + 0.12)) < 1e-9).length
  assert.ok(kept / out.length > 0.9, `${kept} of ${out.length}`)
})
