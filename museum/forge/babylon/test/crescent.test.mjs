// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// The walk's last stop: the crescent the page draws holds the computation (sky-570.json, JPL Horizons DE441) at the
// stop's own hour: its minute, its place, its size, its phase and the tilt of its lit edge, and it is never drawn
// before sunset (RULES 13.2, 13.3, F11.1).
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
const stop = cams.stops.find((s) => s.n === 14)
const row = (ut) => sky.minutes.find((r) => r.ut === ut)
const hold = row(sky.hold)
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the hold\'s minute is Yallop\'s best time, 16:09 UT, between sunset and moonset', () => {
  assert.equal(sky.hold, '16:09')
  assert.equal(sky.events.best, '16:09')
  const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  assert.ok(m(sky.events.sunset) < m(sky.hold) && m(sky.hold) < m(sky.events.moonset))
})

test('the stop\'s hour is that minute on the page\'s own sun (map/sun.ts against Horizons)', () => {
  const h = sun.hourOf(stop.hour)
  const moon = S.moonAtSun(sky, sun.sunAt(h).elevation)
  assert.ok(moon, 'a Moon at the stop\'s hour')
  near(moon.ut, 16 * 60 + 9, 0.5, 'UT minute')
  near(sun.sunAt(h).elevation, hold.sun.el, 0.1, 'sun elevation')
  near(sun.sunAt(h).azimuth, hold.sun.az, 0.4, 'sun azimuth')
  // the clock holds through the stop: its hour and the walk's end hour are one
  assert.equal(cams.endHour, stop.hour)
})

test('the crescent stands where the computation puts it, the Moon\'s own size, on the map\'s grid', () => {
  const moon = S.moonAtSun(sky, sun.sunAt(sun.hourOf(stop.hour)).elevation)
  near(moon.az, hold.moon.az, 0.05, 'azimuth')
  near(moon.elR, hold.moon.elR, 0.05, 'refracted altitude')
  near(moon.diam, hold.moon.diam, 0.001, 'diameter')
  const f = S.moonFrame(sky, moon)
  const az = Math.atan2(f.dir[0], -f.dir[2]) / D + 360
  // the stop's hour falls a few seconds before 16:09 UT: the drawn direction is the Moon at that instant
  near(az % 360, moon.az - sky.convergence, 0.001, 'grid azimuth of the drawn direction')
  near(Math.asin(f.dir[1]) / D, moon.elR, 0.001, 'altitude of the drawn direction')
  // about 10 degrees up, a little north of west, low over the west bank
  assert.ok(hold.moon.elR > 9 && hold.moon.elR < 12 && hold.moon.az > 270 && hold.moon.az < 280)
})

test('the phase: the disc as drawn is lit by Horizons\' share, under a twentieth', () => {
  const moon = S.moonAtSun(sky, sun.sunAt(sun.hourOf(stop.hour)).elevation)
  near(S.litShare(moon.sto) * 100, moon.illu, 0.1, 'lit percent from the phase angle')
  // the drawn disc integrated: the share of its area the lit test accepts
  const n = 1200
  let on = 0, lit = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u = ((i + 0.5) / n) * 2 - 1, v = ((j + 0.5) / n) * 2 - 1
    if (u * u + v * v >= 1) continue
    on++
    if (S.litAt(u, v, moon.sto) > 0) lit++
  }
  near((lit / on) * 100, moon.illu, 0.25, 'drawn lit percent')
  assert.ok(moon.illu < 5)
})

test('the lit edge faces the set sun: Meeus\' bright-limb angle from the two RA/Dec agrees with the drawn tilt', () => {
  const moon = S.moonAtSun(sky, sun.sunAt(sun.hourOf(stop.hour)).elevation)
  const { ra: a0, dec: d0 } = hold.sun, { ra: a, dec: d } = hold.moon
  const chi = Math.atan2(Math.cos(d0 * D) * Math.sin((a0 - a) * D), Math.sin(d0 * D) * Math.cos(d * D) - Math.cos(d0 * D) * Math.sin(d * D) * Math.cos((a0 - a) * D)) / D
  const H = (hold.last * 15 - a) * D
  const q = Math.atan2(Math.sin(H), Math.tan(sky.site[1] * D) * Math.cos(d * D) - Math.sin(d * D) * Math.cos(H)) / D
  // Meeus counts from the zenith's direction counter-clockwise on the sky; the drawn tilt clockwise as seen
  const ccw = (((chi - q) % 360) + 360) % 360
  const cw = S.limbClockwise(sky, moon)
  near(((ccw + cw) % 360 + 540) % 360 - 180, 0, 0.3, 'Meeus against the drawn tilt')
  // down and to the right of the disc's centre, toward the sun under the horizon to the north of west
  assert.ok(cw > 120 && cw < 180, `${cw}`)
})

test('never before sunset: no Moon at the bridge\'s hour, and the fade starts under the horizon', () => {
  const bridge = cams.stops.find((s) => s.n === 13)
  const m = S.moonAtSun(sky, sun.sunAt(sun.hourOf(bridge.hour)).elevation)
  assert.ok(!m || m.sunEl > -0.83, 'at the bridge the sun is up')
  assert.ok(plan.fade.value[0] < -0.83 && plan.fade.value[1] < plan.fade.value[0])
  assert.ok(plan.dusk.from[0] < 0 && plan.dusk.from[1] < plan.dusk.from[0])
  for (const s of cams.stops) if (s.n !== 14) assert.ok(sun.sunAt(sun.hourOf(s.hour)).elevation > plan.dusk.from[0], `stop ${s.n} keeps the day's sky`)
})
