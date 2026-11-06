// The processional way's line south of the gate's paving (gate/gate-mat.ts processionLine, as gate.ts SOUTH builds it):
// even 2 m legs, no kink, within 0.35 m of every map point it stands for, straight from the paving's end to the bend.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`), import.meta.url)

const W = join(APP, 'src/wings/babylon')
const M = await import(pathToFileURL(join(W, 'gate/gate-mat.ts')).href)
const { gateFrame } = await import(pathToFileURL(join(W, 'gate/gate-geom.ts')).href)
const plan = JSON.parse(readFileSync(join(W, 'gate/gate-plan.json'), 'utf8')), mp = JSON.parse(readFileSync(join(W, 'map/map-plan.json'), 'utf8'))
const GF = gateFrame(plan), END = -60
const pts = [[0, END + 20, 0], [0, END, 0]], cls = []
for (const p of mp.street.points) { const [x, z] = GF.fromUtm(p.at[0], p.at[1]); if (z < END - 0.5 && z > -260) { pts.push([x, z, p.level - plan.frame.level0]); cls.push(p.cls) } }
const line = M.processionLine(pts, 0.35, 2)
const head = (i) => (Math.atan2(line[i + 1][0] - line[i][0], -(line[i + 1][1] - line[i][1])) * 180) / Math.PI
const off = (p) => Math.min(...line.slice(0, -1).map((a, i) => { const b = line[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], f = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uz) / (ux * ux + uz * uz))); return Math.hypot(a[0] + ux * f - p[0], a[1] + uz * f - p[1]) }))
const corner = pts[2 + cls.lastIndexOf('R')][1]

test('the line runs from the paving end to the canal bridge in even 2 m legs', () => {
  assert.ok(Math.hypot(line[0][0], line[0][1] - END) < 1e-6, 'starts at the paving end on the axis')
  assert.ok(Math.abs(line.at(-1)[1] - pts.at(-1)[1]) < 0.01, 'ends at the last point')
  for (let i = 0; i + 1 < line.length; i++) { const l = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]); assert.ok(Math.abs(l - 2) < 0.05, `leg ${i}: ${l.toFixed(3)} m`) }
})

test('no kink: to the palace corner the heading turns at most 0.6 degrees a leg, past it (the record\'s bend to the bridge) at most 2', () => {
  for (let i = 0; i + 2 < line.length; i++) {
    const d = Math.abs(head(i + 1) - head(i)), lim = line[i + 1][1] > corner + 10 ? 0.6 : 2
    assert.ok(d <= lim, `at z ${line[i + 1][1].toFixed(1)}: ${d.toFixed(2)} degrees`)
  }
})

test('the line passes within 0.35 m of every map point it stands for', () => {
  for (const p of pts.slice(1)) assert.ok(off(p) <= 0.35, `point at z ${p[1].toFixed(1)}: ${off(p).toFixed(2)} m`)
})

test('the uniform spline it replaces kinked: the old sampling turned 6.96 degrees in one leg near z -127', () => {
  const ctl = pts.filter((p) => p[1] > -230); ctl.push(ctl.at(-1).map((v, i) => 2 * v - ctl.at(-2)[i]))
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
  const old = []
  for (let i = 1; i + 2 < ctl.length; i++) { const [a, b, c, d] = [ctl[i - 1], ctl[i], ctl[i + 1], ctl[i + 2]], k = Math.max(1, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / 2)); for (let j = 0; j < k; j++) old.push([0, 1].map((q) => cr(a[q], b[q], c[q], d[q], j / k))) }
  let worst = 0
  for (let i = 0; i + 2 < old.length; i++) { const h = (j) => Math.atan2(old[j + 1][0] - old[j][0], -(old[j + 1][1] - old[j][1])); worst = Math.max(worst, Math.abs(h(i + 1) - h(i)) * 180 / Math.PI) }
  assert.ok(worst > 5, `the old line's worst turn ${worst.toFixed(2)}`)
})
