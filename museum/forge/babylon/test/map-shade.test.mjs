// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// The map ground's open shade takes the dust's hue on the sky's light (not the zenith's blue), and only its hue: the
// tint acts on the summed indirect diffuse and is scaled back to that sum's luminance. A contact seat by a wall's foot
// keeps the plain light: there the tint goes to 0.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const code = (f) => readFileSync(join(W, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

test('the map ground\'s material is the one top.paintGround sets, after paintCity', () => {
  const map = code('map/map.ts')
  const city = map.indexOf('paintCity(bodies.group'), top = map.indexOf('top.paintGround(')
  assert.ok(city > 0 && top > city, 'paintGround replaces paintCity\'s ground material, so the shade tint lives in top.ts')
})

test('the map ground\'s open shade takes the dust\'s hue at the sum\'s own luminance, a seat none', () => {
  const src = code('top/top.ts')
  assert.match(src, /class ShadeWarm extends PhysicalLightingModel/)
  assert.match(src, /setupLightingModel = \(\) => new ShadeWarm\(\)/)
  // the tint follows every indirect term (the environment's, the field's correction, the occlusion), not their inputs
  const ind = src.slice(src.indexOf('override indirect('), src.indexOf('export interface TopMount'))
  assert.ok(ind.indexOf('super.indirect(builder)') >= 0 && ind.indexOf('super.indirect(builder)') < ind.indexOf('d.assign('), 'tint after the indirect sum')
  assert.doesNotMatch(src, /irradiance\.mulAssign/, 'no tint on an input: the field\'s negative correction would change the luminance')
  assert.match(ind, /const d = builder\.context\.reflectedLight\.indirectDiffuse/)
  assert.match(ind, /const kept = max\(dot\(d, Y3\), 1e-6\)\.div\(max\(dot\(warm, Y3\), 1e-6\)\)/)
  assert.match(ind, /d\.assign\(warm\.mul\(kept\)\)/)
  // the seat by the field's share of the open sky's light: no tint under SEAT[0], the full tint over SEAT[1]
  assert.match(ind, /\.mul\(smoothstep\(SEAT\[0\], SEAT\[1\], share\)\)/)
  const seat = src.match(/const SEAT: \[number, number\] = \[([\d.]+), ([\d.]+)\]/)
  assert.ok(seat && Number(seat[1]) < Number(seat[2]) && Number(seat[2]) <= 1, 'SEAT a rising pair under 1')
  assert.ok(Number(seat[1]) > 0.68 && Number(seat[2]) < 0.88, 'S10\'s seat (share 0.63 to 0.68) untinted, S09\'s open shade (0.79 to 0.89) tinted')
  // the print model of the window before is gone: the seat no longer takes a hue at any brightness
  assert.doesNotMatch(src, /printOf|PRINT_EXPOSURE|toeOff/)
  // only in the sun's shadow, only while a sun stands, never in the class view
  assert.match(src, /float\(1\)\.sub\(this\.sunLit\)\)\.mul\(this\.sunUp\)\.mul\(float\(1\)\.sub\(uView\)\)/)
  assert.match(src, /baseColorNode/)
  const k = Number(src.match(/const SHADE_WARM = ([\d.]+)/)?.[1])
  assert.ok(k > 0 && k < 1, `SHADE_WARM ${k}: part of the way to the dust's hue`)
})

// the shader's arithmetic in plain numbers, mirrored from top.ts, with its SEAT
const SEAT = code('top/top.ts').match(/const SEAT: \[number, number\] = \[([\d.]+), ([\d.]+)\]/).slice(1, 3).map(Number)
const Y = [0.2126, 0.7152, 0.0722], lum = (v) => v.reduce((s, c, i) => s + c * Y[i], 0)
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }
const shade = (d, share) => {
  const hue = (v) => v.map((c) => c / Math.max(lum(v), 1e-4))
  const ratio = hue([0.42, 0.35, 0.26]).map((c, i) => c / Math.max(hue([0.16, 0.3, 0.6])[i], 0.25))
  const k = 0.5 * smooth(SEAT[0], SEAT[1], share)
  const warm = d.map((c, i) => c * (1 + (ratio[i] - 1) * k))
  const kept = Math.max(lum(d), 1e-6) / Math.max(lum(warm), 1e-6)
  return warm.map((c) => c * kept)
}
const warmth = (v) => v[0] / v[2]

test('a seat keeps the plain light exactly, the open shade warms at its own luminance', () => {
  const seat = [0.0515, 0.0504, 0.049], open = [0.21, 0.22, 0.25]
  assert.deepEqual(shade(seat, 0.65), seat, 'S10\'s seat (share 0.63 to 0.68): unchanged')
  assert.deepEqual(shade([0, 0, 0], 0.95), [0, 0, 0], 'black stays black')
  const out = shade(open, 0.88)
  assert.ok(Math.abs(lum(out) / lum(open) - 1) < 1e-9, 'the luminance kept')
  assert.ok(warmth(out) > warmth(open) * 1.3, 'and the hue warmed toward the dust')
  // the share of the tint: none in S10's seat (0.63 to 0.68), all of it in S09's open shade (median 0.86), part between
  const k = (s) => (warmth(shade(open, s)) - warmth(open)) / (warmth(out) - warmth(open))
  assert.equal(k(0.68), 0, 'seat')
  assert.ok(k(0.86) > 0.99, `open shade ${k(0.86)}`)
  assert.ok(k(0.75) > 0.2 && k(0.75) < 0.8, `between ${k(0.75)}`)
})
