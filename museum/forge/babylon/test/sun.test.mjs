// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// One sun for the walk: the pages light with map/sun.ts; gate-geom's node mirror (it takes no imports) must give the same
// sun, in the world and turned into the gate's frame the way the pages turn it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const sun = await import(join(W, 'map/sun.ts'))
const G = await import(join(W, 'gate/gate-geom.ts'))
const plan = JSON.parse(readFileSync(join(W, 'gate/gate-plan.json'), 'utf8'))
const HOURS = ['16:40', '16:45', '17:00', '17:30', '18:00', '18:20']

test('gate-geom gives map/sun.ts\'s sun at the walk\'s hours', () => {
  for (const h of HOURS) {
    const a = sun.sunAt(sun.hourOf(h)), b = G.sunAt(plan, G.hourOf(h))
    assert.ok(Math.abs(a.azimuth - b.azimuth) < 1e-9 && Math.abs(a.elevation - b.elevation) < 1e-9, `${h}: ${a.azimuth} ${a.elevation} against ${b.azimuth} ${b.elevation}`)
  }
})

test('the gate frame\'s sun is map/sun.ts\'s world sun on the gate\'s axes (the pages\' ROT transpose)', () => {
  const m = G.gateFrame(plan).toMap(445700, 3600400)
  const xc = [m[0], m[1], m[2]], yc = [m[4], m[5], m[6]], zc = [m[8], m[9], m[10]]
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  for (const h of HOURS) {
    const w = sun.sunVector(sun.hourOf(h)), g = G.sunVector(plan, G.hourOf(h))
    const want = [dot(w, xc), dot(w, yc), dot(w, zc)]
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(want[i] - g[i]) < 1e-9, `${h} axis ${i}: ${want[i]} against ${g[i]}`)
  }
})

test('the landing\'s sun stands on the right of a look down the street, low in the west (RULES A.5)', () => {
  const s = sun.sunAt(sun.hourOf('16:40'))
  assert.ok(Math.abs(s.azimuth - 265.5) < 0.1 && Math.abs(s.elevation - 20.8) < 0.1, `${s.azimuth} ${s.elevation}`)
  // gate frame: +x west; the sun's x positive lights the east wall's west face
  assert.ok(G.sunVector(plan, sun.hourOf('16:40'))[0] > 0.9)
})
