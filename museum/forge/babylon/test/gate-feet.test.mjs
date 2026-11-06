// node --test forge/babylon/test/*.test.mjs (the gate page's city walls reach the ground at their far ends, and the
// geometry check's feet allowance stays at the paved bodies' foot whatever the city walls' foot; the gate is mounted in
// a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const KIT = join(APP, 'forge/babylon')
const url = (p) => JSON.stringify(pathToFileURL(p).href)
const code = `
import { MOUNTS } from ${url(join(KIT, 'mounts.mjs'))}
import { floating } from ${url(join(KIT, 'geometry.mjs'))}
const M = await MOUNTS.gate('2')
const box = (id) => M.B.boxes.find((b) => b.id === id)
const paved = box('front-pier-w').y0
const down = (y) => !!M.allowPair[0].test({ facing: -1, n: [0, 1, 0], y: [y, y] })
console.log(JSON.stringify({
  floats: floating(M.faces, { ground: M.ground, checks: (b) => /^gate:(imgur|nemet)-[we]$/.test(b) }),
  paved,
  walls: ['imgur-w', 'imgur-e', 'nemet-w', 'nemet-e'].map((id) => box(id).y0),
  allowed: [paved, box('wing-w').y0, paved + 0.1].map(down),
}))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the gate mounts', () => assert.ok(out, r.stderr))

test("the city walls' far ends reach the ground: none floats", () => {
  assert.deepEqual(out.floats.map((x) => `${x.body} ${x.gapM} m`), [])
})

// the paved bodies stand at -2.5 m, stepped down 12 mm where two overlap (the wings 24 mm); the city walls 2 m deeper
test("the feet allowance stays at the paved bodies' feet, under which the city walls' feet go deeper", () => {
  assert.ok(out.walls.every((y) => y < out.paved - 1), `walls ${out.walls.join(', ')} against ${out.paved}`)
  assert.deepEqual(out.allowed, [true, true, false])
})
