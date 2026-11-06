// The eye's adaptation inside the gate (gate.ts localExposure, gate-plan.json light.adapt): a local exposure on the
// linear frame before the print, its strength by where the camera stands. The pure function is lifted out of gate.ts
// and run on a made frame: dark walls beside a bright opening.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join } from 'node:path'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon/gate')
const gate = readFileSync(join(W, 'gate.ts'), 'utf8')
const A = JSON.parse(readFileSync(join(W, 'gate-plan.json'), 'utf8')).light.adapt
const body = gate.slice(gate.indexOf('/* local-exposure:start'), gate.indexOf('/* local-exposure:end */'))
const localExposure = new Function(`${stripTypeScriptTypes(body)}\nreturn localExposure`)()

// a frame w x h: the outer thirds a brick wall (two tones a course apart), the middle third the bright opening
const W0 = 192, H0 = 108, wall = [0.003, 0.005], open = 0.6
const frame = () => {
  const rgb = new Float32Array(W0 * H0 * 3)
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    const v = x >= W0 / 3 && x < (2 * W0) / 3 ? open : wall[(y >> 2) & 1]
    rgb.set([v * 0.4, v * 0.9, v * 2.2], (y * W0 + x) * 3)
  }
  return rgb
}
const lum = (a, p) => 0.2126 * a[p * 3] + 0.7152 * a[p * 3 + 1] + 0.0722 * a[p * 3 + 2]
const lift = (a, b, x, y) => Math.log2(lum(b, y * W0 + x) / lum(a, y * W0 + x))

test('the plan names the adaptation with its source, a share of the stops under mid grey, held under its cap', () => {
  assert.ok(A.contrast > 0.5 && A.contrast < 1, `contrast ${A.contrast}`)
  assert.equal(A.mid, 0.18)
  assert.ok(A.cap > 0 && A.cap <= 2, `cap ${A.cap}`)
  assert.ok(A.edge[0] < 0 && A.edge[1] > 0, `edge ${A.edge}`)
  assert.ok(A.src.length > 200 && /the opening/.test(A.src))
})

test('the page prints the adapted frame, its strength from the camera\'s place in the gate', () => {
  assert.match(gate, /const k = adaptHere\(\)\n {2}const bytes = printFrame\(localExposure\(rgb, w, h, print\.exposure, ADAPT, k\), w, h, print, 0\)/)
  assert.match(gate, /const d = Math\.min\(-p\.z, p\.z - zMS\)/)
  assert.match(gate, /q\.get\('adapt'\) \?\? 1/)
})

test('outside the gate the frame is the print\'s own', () => {
  const rgb = frame()
  assert.equal(localExposure(rgb, W0, H0, 1, A, 0), rgb)
})

test('inside: the walls rise by their stops under mid grey, the opening keeps its light, no halo at its edge', () => {
  const rgb = frame(), out = localExposure(rgb, W0, H0, 1, A, 1)
  const want = (1 - A.contrast) * (Math.log2(A.mid) - Math.log2(0.004))
  for (const x of [10, 40, 150, 180]) {
    const l = (lift(rgb, out, x, 50) + lift(rgb, out, x, 54)) / 2
    assert.ok(Math.abs(l - want) < 0.25, `wall at x ${x}: ${l.toFixed(2)} stops against ${want.toFixed(2)}`)
  }
  for (const x of [70, 96, 120]) assert.ok(Math.abs(lift(rgb, out, x, 50)) < 1e-6, `opening at x ${x} moved`)
  // the wall's last columns beside the opening take the wall's lift, not the opening's
  const edge = (lift(rgb, out, 62, 50) + lift(rgb, out, 62, 54)) / 2, mid = (lift(rgb, out, 30, 50) + lift(rgb, out, 30, 54)) / 2
  assert.ok(Math.abs(edge - mid) < 0.3, `edge ${edge.toFixed(2)} against the wall's ${mid.toFixed(2)}`)
  // the courses keep most of their contrast (stops between the two tones), and their colour's order
  const before = Math.log2(lum(rgb, 54 * W0 + 30) / lum(rgb, 50 * W0 + 30)), after = Math.log2(lum(out, 54 * W0 + 30) / lum(out, 50 * W0 + 30))
  assert.ok(Math.abs(after) > 0.75 * Math.abs(before), `courses ${after.toFixed(2)} of ${before.toFixed(2)} stops`)
  const p = (50 * W0 + 30) * 3
  assert.ok(out[p + 2] > out[p + 1] && out[p + 1] > out[p], 'the blue stays blue')
})
