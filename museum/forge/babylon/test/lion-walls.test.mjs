// node --test forge/babylon/test/*.test.mjs (the map's lion walls, built in a child node that strips its types: each
// wall's pieces follow one straight line, so consecutive pieces abut instead of lapping, which would put their side
// faces in one plane)
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
const plan = JSON.parse(readFileSync(new URL(${url('map/map-plan.json')}), 'utf8'))
const all = buildPlan(plan)
const out = {}
for (const id of ['lion-wall-w', 'lion-wall-e']) {
  const pieces = all.prisms.filter((p) => new RegExp('^' + id + '-\\\\d+$').test(p.id)).sort((a, b) => +a.id.split('-').pop() - +b.id.split('-').pop())
  const [a, b] = plan.walls.find((w) => w.id === id).line
  const p0 = pieces[0].poly, q = pieces[pieces.length - 1].poly
  // the run's direction from its first piece's corners to its last's
  const c = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0])
  const A = c(p0), B = c(q), L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
  const span = (poly) => { const t = poly.map((p) => p[0] * d[0] + p[1] * d[1]); return [Math.min(...t), Math.max(...t)] }
  out[id] = pieces.map((p) => ({ id: p.id, span: span(p.poly), y1: p.y1 }))
}
console.log(JSON.stringify(out))
`

test('the lion walls: consecutive pieces of one run abut, neither lapping nor leaving a gap, and keep their steps', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const runs = JSON.parse(r.stdout.trim().split('\n').pop())
  for (const [id, pieces] of Object.entries(runs)) {
    assert.ok(pieces.length >= 9, `${id}: ${pieces.length} pieces`)
    for (let k = 1; k < pieces.length; k++) {
      const gap = pieces[k].span[0] - pieces[k - 1].span[1]
      assert.ok(Math.abs(gap) < 1e-3, `${pieces[k - 1].id} to ${pieces[k].id}: ${gap.toFixed(3)} m (negative: a lap)`)
    }
    assert.ok(pieces.some((p, k) => k > 0 && Math.abs(p.y1 - pieces[k - 1].y1) > 0.05), `${id}: the pieces step with the street`)
  }
})
