// The Processional Way on the Ishtar Gate's axis (map-plan.json's street and gate frame against gate-plan.json's frame),
// the map path's stop 4 keys in the passage, and the street's points kept by index for the plans that read them so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../pages.mjs'
import { measure, southFaceZ } from '../gate-axis.mjs'

const W = join(APP, 'src/wings/babylon')
const j = (p) => JSON.parse(readFileSync(join(W, p), 'utf8'))
const plan = j('map/map-plan.json'), gp = j('gate/gate-plan.json'), cams = j('map/map-cams.json')
const r = measure(plan, gp, cams, null)

test('the map street runs through the passage on the gate axis', () => {
  for (const p of r.passage) assert.ok(Math.abs(p.streetAt) <= 0.3, `z ${p.z}: the street's centre ${p.streetAt} m off the axis`)
})

test("the map's gate frame stands on the gate plan's face", () => {
  const g = plan.frames.gate, f = gp.frame.face
  assert.ok(Math.hypot(g.origin[0] - f[0], g.origin[1] - f[1]) <= 0.05, `frames.gate ${g.origin} against the face ${f}`)
  assert.ok(Math.abs(g.bearing - ((gp.frame.zGrid + 180) % 360)) <= 0.05, `bearing ${g.bearing}`)
})

test("the street's bends near the gate stay inside the lion street's own angle to the gate axis", () => {
  for (const p of r.points) assert.ok(Math.abs(p.bend) <= 5.9 || p.z < -200, `point ${p.i}: a ${p.bend} degree bend`)
})

test("stop 4's map keys walk the passage on the axis", () => {
  assert.ok(r.keys4.length >= 10, `${r.keys4.length} keys in the passage`)
  for (const k of r.keys4) assert.ok(Math.abs(k.x) <= 0.3, `t ${k.t}: ${k.x} m off the axis at z ${k.z}`)
  assert.ok(southFaceZ(gp) < -49 && southFaceZ(gp) > -51)
})

test("the street keeps its points' indices for Esagila's street (esagila-plan.json street.from and to)", () => {
  const ep = j('esagila/esagila-plan.json'), P = plan.street.points
  assert.match(P[ep.street.from].note ?? '', /turn west/)
  assert.ok(P[ep.street.to].at[0] < 445700 && P[ep.street.to].at[1] < 3599900, `point ${ep.street.to} at ${P[ep.street.to].at}`)
})
