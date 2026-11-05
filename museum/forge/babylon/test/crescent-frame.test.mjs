// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// The walk's last stop as a frame: the crescent at its computed place and true size stands well inside both framings at
// the still (found by the frame, never by enlarging it: the desktop keeps the map's lens), and the night's light, water
// and glitter hold their bounds and stay off every stop with the sun up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const S = await import(join(W, 'crescent/sky.ts'))
const sun = await import(join(W, 'map/sun.ts'))
const sky = JSON.parse(readFileSync(join(W, 'crescent/sky-570.json'), 'utf8'))
const plan = JSON.parse(readFileSync(join(W, 'crescent/crescent-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(W, 'map/map-cams.json'), 'utf8'))
const D = Math.PI / 180
// the map's frame is UTM 38 N: grid north 0.311 degrees west of true north at the site (crescent.test.mjs)
const GRID = 0.311

const stop = cams.stops.find((s) => s.n === 14)
const still = cams.path.find((k) => k.stop === 14 && k.still)
const moon = S.moonAtSun(sky, sun.sunAt(sun.hourOf(stop.hour)).elevation)

// a level camera with a shift lens: where a direction lands in a w x h frame, and the disc's radius in pixels
const project = (look, hfov, shift, w, h) => {
  const az = (Math.atan2(look[0] - still.at[0], look[1] - still.at[1]) / D + 360) % 360
  const vfov = 2 * Math.atan(Math.tan((hfov / 2) * D) * (h / w))
  const d = (moon.az + GRID - az) * D
  const x = Math.tan(d) / Math.tan((hfov / 2) * D)
  const y = Math.tan(moon.elR * D) / Math.cos(d) / Math.tan(vfov / 2) - shift
  return { x: ((x + 1) / 2) * w, y: ((1 - y) / 2) * h, r: (Math.tan((moon.diam / 2) * D) / Math.tan(vfov / 2)) * (h / 2) }
}

test('the desktop keeps the map\'s lens at the last stop: the crescent is not enlarged there', () => {
  for (const k of cams.path.filter((k) => k.stop === 14)) assert.equal(k.hfov, cams.lens.desktop, `key ${k.t}`)
})

test('the crescent stands well inside both framings at the still, off every edge', () => {
  assert.ok(moon, 'a Moon at the stop\'s hour')
  const dk = project(still.look, still.hfov, still.shift ?? 0, 3200, 1800)
  const ph = project(still.phone.look, still.phone.hfov, still.phone.shift ?? 0, 1170, 2532)
  for (const [name, p, w, h] of [['desktop', dk, 3200, 1800], ['phone', ph, 1170, 2532]]) {
    assert.ok(p.x > 0.25 * w && p.x < 0.75 * w, `${name}: x ${p.x.toFixed(0)} of ${w}`)
    assert.ok(p.y > 0.2 * h && p.y < 0.4 * h, `${name}: y ${p.y.toFixed(0)} of ${h}`)
  }
  // the phone's longer lens: the disc at least 1.4 times the base's 7.2 px radius, at its true angle
  assert.ok(ph.r >= 1.4 * 7.2 && ph.r < 2.5 * 7.2, `phone radius ${ph.r.toFixed(2)} px`)
})

test('the night\'s light, water and glitter hold their bounds', () => {
  const L = plan.dusk.light
  assert.ok(L.saturation > 0 && L.saturation < 1, 'the faces\' light paler than the dome\'s, not grey')
  assert.ok(L.gain >= 1 && L.gain <= 4, 'the faces\' light no more than four times the dome\'s')
  assert.ok(L.shadow > 0 && L.shadow <= 1)
  assert.equal(L.tint.length, 3)
  assert.ok(plan.glitter.width > 0.1 && plan.glitter.width < 1 && plan.glitter.gain > 0 && plan.glitter.gain <= 1)
  // every term is switched by the twilight: its weight 0 at every stop but the last (the night water's own switch is
  // the river's sun turned under the horizon, which bridge.ts does only under the same weight)
  const [a, b] = plan.dusk.from
  for (const s of cams.stops) {
    const w = Math.min(1, Math.max(0, (a - sun.sunAt(sun.hourOf(s.hour)).elevation) / (a - b)))
    assert.equal(w, s.n === 14 ? 1 : 0, `stop ${s.n}`)
  }
})
