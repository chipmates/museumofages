// node --experimental-strip-types --test forge/babylon/test/*.test.mjs
// The sky at a high sun (open/air.ts airColour): past 20.5 degrees of sun the horizon takes a pale day colour, a dusty
// buff toward the sun and a pale blue away; under it the low sun's colours stay exactly as they were. Only the stops
// with the sun over that line (4 at 10:00, 8 and 12) can change.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = join(dirname(fileURLToPath(import.meta.url)), '../../../src/wings/babylon')
const sun = await import(join(W, 'map/sun.ts'))
const cams = JSON.parse(readFileSync(join(W, 'map/map-cams.json'), 'utf8'))
const gate = JSON.parse(readFileSync(join(W, 'gate/gate-cams.json'), 'utf8'))
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
const air = code(readFileSync(join(W, 'open/air.ts'), 'utf8'))
const fn = air.slice(air.indexOf('export function airColour'), air.indexOf('export function skyColour'))
const num = (s) => s.split(',').map(Number)
const high = fn.match(/const high = smoothstep\(([\d.]+), ([\d.]+), U\.uSun\.y\)/)
const near = fn.match(/const near = mix\(mix\(vec3\(([\d., ]+)\), vec3\(U\.uNear\), low\), vec3\(([\d., ]+)\), high\)/)
const away = fn.match(/const away = mix\(mix\(vec3\(([\d., ]+)\), vec3\(U\.uAway\), low\), vec3\(([\d., ]+)\), high\)/)
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

test('the horizon has a high-sun state, from the sun\'s height', () => {
  assert.ok(high, 'high = smoothstep(a, b, U.uSun.y)')
  assert.ok(near && away, 'near and away each mix to their own day colour by high')
  assert.match(fn, /return mix\(away, near, toward\)/)
})

test('under the high sun\'s line the low sun\'s colours are the ones they were', () => {
  assert.deepEqual(num(near[1]), [0.82, 0.5, 0.3])
  assert.deepEqual(num(away[1]), [0.3, 0.3, 0.34])
  assert.equal(Number(high[1]), 0.35, 'high starts where low ends')
  assert.match(fn, /const low = smoothstep\(-0\.04, 0\.35, U\.uSun\.y\)/)
})

test('the day horizon is a dusty buff toward the sun and a pale blue away, never grey or cool toward the sun', () => {
  const [r, g, b] = num(near[2])
  assert.ok(r > g && g > b, `near warm: ${near[2]}`)
  assert.ok(r - b >= 0.12, `near not grey: r - b = ${(r - b).toFixed(2)}`)
  assert.ok(b / r >= 0.7, `near not the evening's peach: b / r = ${(b / r).toFixed(2)} (the low sun's 0.54)`)
  assert.ok(Math.min(r, g, b) >= 0.65, 'near pale')
  const [ar, ag, ab] = num(away[2])
  assert.ok(ab > ag && ag > ar && ab - ar >= 0.1, `away blue: ${away[2]}`)
  assert.ok(Math.min(ar, ag, ab) >= 0.6, 'away pale')
})

test('only stops 4 (the gate page), 8 and 12 (the map) have the sun over the line', () => {
  const lo = Number(high[1]), hi = Number(high[2])
  const y = (hhmm) => sun.sunVector(sun.hourOf(hhmm))[1]
  // every hour the two pages name: the gate's stops (an hour pair each) and its default, the map's stops
  const named = [
    ...gate.stops.flatMap((s) => [].concat(s.hour ?? gate.hour).map((h) => ({ at: `gate ${s.n}`, h }))),
    { at: 'gate default', h: gate.hour },
    ...cams.stops.map((s) => ({ at: `map ${s.n}`, h: s.hour })),
  ]
  const over = [...new Set(named.filter((x) => y(x.h) > lo).map((x) => x.at))]
  assert.deepEqual(over.sort(), ['gate 4', 'map 12', 'map 8'])
  for (const x of named) {
    const w = ss(lo, hi, y(x.h))
    if (over.includes(x.at)) assert.ok(w > 0.1, `${x.at} (${x.h}) takes the day horizon (${w.toFixed(2)})`)
    else assert.equal(w, 0, `${x.at} (${x.h}) keeps its sky`)
  }
})
