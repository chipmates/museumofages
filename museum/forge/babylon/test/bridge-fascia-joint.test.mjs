// node --test forge/babylon/test/*.test.mjs (the edge timber's butt joints: a hairline, no tone step between two
// lengths, nothing per length on the outline; read from the source, the material imports three/webgpu)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const mat = readFileSync(join(W, 'bridge/bridge-mat.ts'), 'utf8')
const geom = readFileSync(join(W, 'bridge/bridge-geom.ts'), 'utf8')
const tone = Number(mat.match(/export const FAS_TONE = ([\d.]+)/)[1])
const [jw, keep] = JSON.parse(mat.match(/export const FAS_JOINT: readonly \[number, number\] = (\[[^\]]+\])/)[1])
const fasH = Number(geom.match(/export const FASCIA = \{ w: [\d.]+, h: ([\d.]+) \}/)[1])
const b0 = mat.indexOf('2b the edge timber'), block = mat.slice(b0, mat.indexOf('── 3 the boards', b0))
const line = (name) => block.split('\n').find((l) => l.includes(`const ${name} =`)) ?? ''

test('the butt joint is a hairline, only a little darker than the timber at a reading distance', () => {
  assert.ok(jw > 0 && jw <= 0.006, `joint ${jw * 1000} mm wide`)
  assert.ok(keep >= 0.5 && keep < 0.9, `the joint keeps ${keep} of the timber`)
  // the line's box filter: under a pixel of footprint fp the joint darkens by min(1, w / fp) of its full share
  const dip = (fp) => Math.min(1, jw / fp) * (1 - keep)
  assert.ok(dip(0.015) <= 0.15 && dip(0.015) >= 0.04, `dip at 1.5 cm a pixel ${dip(0.015).toFixed(3)}`)
  assert.ok(block.includes('FAS_JOINT[1]') && block.includes('FAS_JOINT[0] / 2'), 'the joint not drawn from FAS_JOINT')
})

test('two lengths meet at nearly one tone', () => {
  assert.ok(tone <= 0.06, `lengths' tone spread ${tone}`)
  assert.ok(line('pTone').includes('FAS_TONE'), 'pTone not drawn from FAS_TONE')
})

test('the grain runs on across the joints (no per-length seed on the outline)', () => {
  for (const n of ['gWarp', 'streaks', 'fGrain', 'coarse']) {
    const l = line(n)
    assert.ok(l, `${n} not found in the edge timber's block`)
    assert.ok(!/\bpiece\b/.test(l), `${n} is seeded per length: ${l.trim()}`)
  }
})

test('the seasoning checks stay off the drip edge', () => {
  const m = line('hC1').match(/hC2 = float\(([\d.]+)\)\.add\(hash2\(piece, fa\.z\.add\(\d+\)\)\.mul\(([\d.]+)\)\)/)
  assert.ok(m, 'hC2 not found')
  const warp = Number(line('gWarp').match(/\.mul\(([\d.]+)\)\s*$/)[1])
  const deepest = Number(m[1]) + Number(m[2]) + warp + 0.004
  assert.ok(deepest <= fasH - 0.015, `a check reaches ${deepest.toFixed(3)} m of the ${fasH} m face`)
})
