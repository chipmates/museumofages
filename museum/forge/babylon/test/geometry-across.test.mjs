// node --test forge/babylon/test/*.test.mjs
// The coplanar check finds two faces within the bed where they overlap even when their plane offsets from the origin
// fall into different runs: tilted against each other far from the origin, split at a run's edge, or rounded apart.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { coplanar, pushFace } from '../geometry.mjs'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const H = 3.2
// a plain sloping down to the east by `slope`, through height H at x = 0; triangles 800 m long
const plain = (faces, slope) => {
  const y = (x) => H - slope * x
  pushFace(faces, 'ground', V(-400, y(-400), 400), V(400, y(400), -400), V(-400, y(-400), -400))
  pushFace(faces, 'ground', V(-400, y(-400), 400), V(400, y(400), 400), V(400, y(400), -400))
  return y
}
// a level rectangle, its top looking up
const level = (faces, body, y, [xa, xb], [za, zb]) => {
  pushFace(faces, body, V(xa, y, zb), V(xb, y, za), V(xa, y, za))
  pushFace(faces, body, V(xa, y, zb), V(xb, y, zb), V(xb, y, za))
}
const pairOf = (pairs, a, b) => pairs.find((p) => [p.a, p.b].sort().join() === [a, b].sort().join())

test('a level face 1 mm over a tilted plain 300 m from the origin is a pair, though their offsets differ by 89 mm', () => {
  const f = []
  const y = plain(f, 0.0003) // normals 0.0003 apart: one hundredth's group
  level(f, 'court', y(300) + 0.001, [299.5, 300.5], [-0.5, 0.5])
  const court = f.find((q) => q.body === 'court'), ground = f[0]
  assert.equal(Math.round(court.n.x * 100), Math.round(ground.n.x * 100), 'one group of normals')
  assert.ok(Math.abs(court.d - ground.d) > 0.08, `offsets ${((ground.d - court.d) * 1000).toFixed(1)} mm apart`)
  assert.equal(pairOf(coplanar(f, { across: false }), 'ground', 'court'), undefined, 'the runs alone never compare them')
  const p = pairOf(coplanar(f), 'ground', 'court')
  assert.ok(p && p.kind === 'fight', 'a fight')
  assert.ok(Math.abs(p.area - 1) < 0.05, `area ${p.area} m2`)
  assert.ok(Math.abs(p.gapMm - 1) <= 0.1, `median gap ${p.gapMm} mm`)
  assert.ok(p.gapMinMm >= 0.8 && p.gapMinMm <= 0.9, `least gap ${p.gapMinMm} mm`)
  assert.ok(p.across >= 1, 'marked as found across runs')
})

test('two level faces 1 mm apart at a run edge are a pair', () => {
  const f = []
  level(f, 'far', H, [100, 101], [0, 1]) // opens the run at H
  level(f, 'low', H + 0.0015, [0, 1], [0, 1]) // within the bed of the run's first face
  level(f, 'high', H + 0.0025, [0, 1], [0, 1]) // past it: the next run, 1 mm over `low`
  assert.equal(pairOf(coplanar(f, { across: false }), 'low', 'high'), undefined, 'the runs alone never compare them')
  const p = pairOf(coplanar(f), 'low', 'high')
  assert.ok(p && p.kind === 'fight', 'a fight')
  assert.ok(Math.abs(p.area - 1) < 0.05, `area ${p.area} m2`)
  assert.ok(Math.abs(p.gapMm - 1) <= 0.05, `gap ${p.gapMm} mm`)
})

test('a level face 1 mm over a plain whose normal rounds to the next hundredth is a pair', () => {
  const f = []
  const y = plain(f, 0.006) // n.x 0.006 rounds to 0.01, the level court's to 0.00
  level(f, 'court', y(0) + 0.001, [-0.1, 0.1], [-0.5, 0.5])
  assert.notEqual(Math.round(f[0].n.x * 100), Math.round(f.find((q) => q.body === 'court').n.x * 100), 'two groups of normals')
  assert.equal(pairOf(coplanar(f, { across: false }), 'ground', 'court'), undefined, 'the runs alone never compare them')
  const p = pairOf(coplanar(f), 'ground', 'court')
  assert.ok(p && p.kind === 'fight', 'a fight')
  assert.ok(Math.abs(p.area - 0.2) < 0.02, `area ${p.area} m2`)
  assert.ok(p.gapMm > 0.8 && p.gapMm < 1.2, `median gap ${p.gapMm} mm`)
})

test('across runs, a level face 0.118 m over the tilted plain is still no pair, and two faces looking apart a butt', () => {
  const f = []
  const y = plain(f, 0.0003)
  level(f, 'court', y(300) + 0.118, [295, 305], [-5, 5])
  assert.equal(pairOf(coplanar(f), 'ground', 'court'), undefined)
  // a box's bottom 1 mm over the plain, looking down: two closed bodies face to face
  const g = []
  const y2 = plain(g, 0.0003)
  pushFace(g, 'box', V(299.5, y2(300) + 0.001, -0.5), V(300.5, y2(300) + 0.001, 0.5), V(299.5, y2(300) + 0.001, 0.5))
  pushFace(g, 'box', V(299.5, y2(300) + 0.001, -0.5), V(300.5, y2(300) + 0.001, -0.5), V(300.5, y2(300) + 0.001, 0.5))
  const p = pairOf(coplanar(g), 'ground', 'box')
  assert.ok(p && p.kind === 'butt', `a butt, not a fight (${p?.kind})`)
})
