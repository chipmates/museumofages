// node --test forge/babylon/test/*.test.mjs (the phone's own stand: a key's `phone.at` moves only the phone's camera, and
// only near the keys that name one; the path is run in a child node that strips its types)
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
import { makePath } from ${url('map/path.ts')}
const cams = JSON.parse(readFileSync(new URL(${url('map/map-cams.json')}), 'utf8'))
// a plain frame (x east, z south) and a sloping ground, so an eye over the ground differs from stand to stand
const toScene = (E, N) => [E - 1000, 2000 - N]
const ground = (x, z) => 2 + 0.05 * x - 0.02 * z
const lens = { desktop: 58, phone: 44, phoneFilm: 46 }
const walk = (phoneAt) => ({ eye: 1.65, lens, stops: [{ n: 1, hour: '10:00' }, { n: 2, hour: '10:10' }], path: [
  { t: 0, at: [1000, 2000], y: 'eye', look: [1000, 1950, 4], stop: 1, kind: 'walk' },
  { t: 4, at: [1010, 1990], y: 'eye', look: [1010, 1950, 4], stop: 1, kind: 'walk' },
  { t: 8, at: [1020, 1980], y: 'eye', look: [1020, 1950, 4], stop: 1, kind: 'walk' },
  { t: 10, at: [1024, 1978], y: 'eye', look: [1024, 1950, 4], stop: 2, kind: 'hold', hold: true, phone: { look: [1022, 1950, 4], hfov: 40, ...phoneAt(0) } },
  { t: 14, at: [1024, 1978], y: 'eye', look: [1024, 1950, 4], stop: 2, kind: 'hold', hold: true, still: true, phone: { look: [1022, 1950, 4], hfov: 40, ...phoneAt(1) } },
  { t: 18, at: [1040, 1970], y: 'eye', look: [1040, 1950, 4], stop: 2, kind: 'walk' },
  { t: 22, at: [1060, 1960], y: 'eye', look: [1060, 1930, 4], stop: 2, kind: 'walk' },
  { t: 26, at: [1080, 1950], y: 'eye', look: [1080, 1920, 4], stop: 2, kind: 'walk' },
] })
const none = makePath(walk(() => ({})), toScene, ground)
const own = makePath(walk((i) => (i === 0 ? { at: [1023, 1975] } : { at: [1023, 1975], y: 9.5 })), toScene, ground)
const ts = Array.from({ length: 26 * 8 + 1 }, (_, i) => i / 8)
const same = (a, b) => a.every((v, i) => Object.is(v, b[i]))
const out = {
  noneSame: ts.every((t) => { const p = none.sample(t); return same(p.phone.pos, p.pos) }),
  deskSame: ts.every((t) => { const a = none.sample(t), b = own.sample(t); return same(a.pos, b.pos) && same(a.look, b.look) }),
  farSame: ts.filter((t) => t <= 4 || t >= 22).every((t) => { const a = none.sample(t), b = own.sample(t); return same(a.phone.pos, b.phone.pos) && same(a.phone.look, b.phone.look) }),
  holdEye: own.sample(10).phone.pos, holdY: own.sample(14).phone.pos, groundThere: ground(23, 25),
  lookFrom: (() => { const p = own.sample(12); const d = [p.phone.look[0] - p.phone.pos[0], p.phone.look[2] - p.phone.pos[2]]; return Math.atan2(d[0], d[1]) })(),
  lookWant: Math.atan2(22 - 23, 50 - 25),
  steps: (() => { let m = 0, prev = own.sample(0).phone.pos; for (let t = 0.01; t <= 26; t += 0.01) { const q = own.sample(t).phone.pos; m = Math.max(m, Math.hypot(q[0] - prev[0], q[2] - prev[2])); prev = q } return m })(),
  // the walk as it stands: every key's phone where its desktop is, unless the key names a phone stand
  real: (() => { const p = makePath(cams, toScene, () => 0); return p.keys.filter((k, i) => !cams.path[i].phone?.at).every((k) => k.phone.pos === k.pos) })(),
}
console.log(JSON.stringify(out))
`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the phone-stand path builds', () => assert.equal(r.status, 0, r.stderr))

test('a walk with no phone stand: the phone stands where the desktop stands at every film frame', () => {
  assert.ok(out.noneSame)
  assert.ok(out.real, "a key of map-cams.json without a phone `at` puts the phone where the desktop is")
})

test("a phone stand moves only the phone: the desktop's position and look are the same to the bit", () => assert.ok(out.deskSame))

test("away from the keys that name a phone stand (beyond their tangents' reach) the phone is today's", () => assert.ok(out.farSame))

test("a key's phone stand: its eye over the ground there, or the level it gives; the look turns from it", () => {
  const [x, y, z] = out.holdEye
  assert.deepEqual([x, z], [23, 25])
  assert.ok(Math.abs(y - (out.groundThere + 1.65)) < 1e-9, `eye ${y} against ground ${out.groundThere} + 1.65`)
  assert.deepEqual(out.holdY, [23, 9.5, 25])
  assert.ok(Math.abs(out.lookFrom - out.lookWant) < 1e-6, `look heading ${out.lookFrom} against ${out.lookWant}`)
})

test('the phone eases into and out of its stand: no step of a hundredth of a second over 0.1 m', () => {
  assert.ok(out.steps < 0.1, `largest step ${out.steps.toFixed(3)} m`)
})
