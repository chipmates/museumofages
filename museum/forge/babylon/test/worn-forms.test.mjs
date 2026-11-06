// node --test forge/babylon/test/*.test.mjs (Etemenanki's built forms: the panels at the plan's pitch and depth, the
// coping's lip and drip, and the 3 px rule at the stops that show them; built in a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { buildCourt } from ${url('court/court-geom.ts')}
import { buildTower } from ${url('tower/tower-geom.ts')}
import { FORM, faces, recesses } from ${url('parts/worn-forms-babylon.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), tp = j(${url('tower/tower-plan.json')})
const c = buildCourt(buildPlan(plan), plan, cp)
const boxes = c.built.boxes.filter((b) => b.id.startsWith('tower-stage-'))
const t = buildTower(c.built, plan, tp)
const PN = tp.tower.panels
const out = {}
for (const b of boxes) {
  const body = t.bodies.find((x) => x.id === b.id)
  const g = body.geometry, p = g.getAttribute('position'), fb = g.getAttribute('fb')
  const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw)
  // each vertex in the box's own frame: how far out from its centre, along the face it lies on
  const reach = (i) => { const dx = p.getX(i) - b.x, dz = p.getZ(i) - b.z; return Math.max(Math.abs(dx * cs - dz * sn) - b.sx / 2, Math.abs(dx * sn + dz * cs) - b.sz / 2) }
  const by = {}
  for (let i = 0; i < p.count; i++) {
    const f = Math.round(fb.getW(i)), r = by[f] ?? (by[f] = { n: 0, lo: Infinity, hi: -Infinity, ylo: Infinity, yhi: -Infinity })
    r.n++; const d = reach(i); r.lo = Math.min(r.lo, d); r.hi = Math.max(r.hi, d); r.ylo = Math.min(r.ylo, p.getY(i)); r.yhi = Math.max(r.yhi, p.getY(i))
  }
  const expect = faces(b).reduce((s, f) => s + recesses(f.half, { pitch: PN.pitch1, share: PN.share }).length, 0)
  out[b.id] = { glaze: !by[FORM.back], backs: (by[FORM.back]?.n ?? 0) / 6, expect, by, y1: b.y1, y0: b.y0 }
}
console.log(JSON.stringify({ out, FORM }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const res = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const tp = JSON.parse(readFileSync(join(W, 'tower/tower-plan.json'), 'utf8')).tower
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the forms build', () => assert.equal(r.status, 0, r.stderr))

test('every brick stage has its recesses at the plan pitch, sunk by the plan depth; the first keeps them off its stair', () => {
  const { out, FORM } = res
  for (const [id, s] of Object.entries(out)) {
    if (id === 'tower-stage-7') continue
    if (id === 'tower-stage-1') assert.ok(s.backs < s.expect && s.backs >= s.expect - 12, `${id}: ${s.backs} recesses of ${s.expect} (the stair face keeps some whole)`)
    else assert.equal(s.backs, s.expect, `${id} recesses`)
    near(s.by[FORM.back].lo, -tp.panels.out, 1e-3, `${id} recess depth`)
    near(s.by[FORM.back].hi, -tp.panels.out, 1e-3, `${id} recess back is one plane`)
  }
})

test('every brick stage wears a coping: its lip and its drip as the plan gives them', () => {
  const { out, FORM } = res
  const C = tp.forms.coping
  for (const [id, s] of Object.entries(out)) {
    if (id === 'tower-stage-7') continue
    near(s.by[FORM.coping].hi, C.lip, 1e-3, `${id} lip`)
    near(s.by[FORM.coping].yhi, s.y1, 1e-3, `${id} coping top`)
    near(s.by[FORM.coping].ylo, s.y1 - C.h - C.drip, 1e-3, `${id} drip's foot`)
    near(s.by[FORM.under].lo, -tp.panels.out, 1e-3, `${id} recess heads under the coping`)
  }
})

// px per metre of the stop that shows each form, from pxm.py on the walk's still cameras: S09 13.9 on the east face
// (299 m, desktop and phone), S12 22.3 on the south face's top (desktop, the least of 22.3 to 23.3)
const SEEN = { S09: 13.9, S12: 22.3 }
test('the 3 px rule: every built form is 3 px or more at the still that shows it', () => {
  const C = tp.forms.coping, P = tp.panels
  const forms = [
    ['panel', P.pitch1 * P.share, 'S09'], ['recess', P.pitch1 * (1 - P.share), 'S09'],
    ['coping band', C.h, 'S09'], ['lip (the stage end against the sky)', C.lip, 'S09'], ['drip', C.drip, 'S12'],
  ]
  for (const [name, m, stop] of forms) assert.ok(m * SEEN[stop] >= 3, `${name}: ${m} m is ${(m * SEEN[stop]).toFixed(1)} px at ${stop}`)
})
