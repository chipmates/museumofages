// node --test forge/babylon/test/*.test.mjs
// The coplanar check counts a pair only where the two faces' own planes lie within the bed where they overlap.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { coplanar, pushFace } from '../geometry.mjs'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const H = 3.2
// a plain sloping down to the east by `slope` (under a hundredth: it groups with level faces), its plane offset from
// the origin equal to a level face's at H, so offsets alone cannot part them; triangles 800 m long
const plain = (faces, slope, x0 = -400, x1 = 400) => {
  const y = (x) => H - slope * x
  pushFace(faces, 'ground', V(x0, y(x0), 400), V(x1, y(x1), -400), V(x0, y(x0), -400))
  pushFace(faces, 'ground', V(x0, y(x0), 400), V(x1, y(x1), 400), V(x1, y(x1), -400))
  return y
}
// a level square, its top looking up
const level = (faces, body, y, [xa, xb], [za, zb]) => {
  pushFace(faces, body, V(xa, y, zb), V(xb, y, za), V(xa, y, za))
  pushFace(faces, body, V(xa, y, zb), V(xb, y, zb), V(xb, y, za))
}
const pairOf = (pairs, a, b) => pairs.find((p) => [p.a, p.b].sort().join() === [a, b].sort().join())

test('a long tilted triangle under a level face 0.118 m above it where they overlap is no pair', () => {
  const f = []
  const slope = 0.118 / 300 // 0.118 m under the plane at x = 300 m
  const y = plain(f, slope)
  level(f, 'court', H, [295, 305], [-5, 5]) // a 10 by 10 m court at the plane's offset, 300 m east of the origin
  assert.ok(Math.abs(f.find((q) => q.body === 'court').d - f[0].d) < 0.002, 'the offsets alone fall within the bed')
  assert.ok(Math.abs(H - y(300) - 0.118) < 1e-9)
  const old = pairOf(coplanar(f, { local: false }), 'ground', 'court')
  assert.ok(old && old.kind === 'fight' && old.area > 99, 'counted by offsets alone it is a 100 m2 fight')
  assert.ok(old.gapMinMm >= 116 && old.gapMinMm <= 117 && Math.abs(old.gapMm - 118) <= 0.2, `local gap ${old.gapMinMm} to ${old.gapMm} mm`)
  assert.equal(pairOf(coplanar(f), 'ground', 'court'), undefined)
})

test('two faces 1 mm apart where they overlap are a pair, its gap the local one', () => {
  const f = []
  const slope = 0.0003
  const y = plain(f, slope)
  // a 1 m court 1 mm over the plain at x = 3 m: local gaps 0.85 to 1.15 mm
  level(f, 'court', y(3) + 0.001, [2.5, 3.5], [-0.5, 0.5])
  const p = pairOf(coplanar(f), 'ground', 'court')
  assert.ok(p && p.kind === 'fight', 'a fight')
  assert.ok(Math.abs(p.area - 1) < 0.05, `area ${p.area} m2`)
  assert.ok(Math.abs(p.gapMm - 1) <= 0.1, `median gap ${p.gapMm} mm`)
  assert.ok(p.gapMinMm >= 0.8 && p.gapMinMm <= 0.9, `least gap ${p.gapMinMm} mm`)
})

test('a level face over a tilted one counts only the part within the bed', () => {
  const f = []
  const slope = 0.004 // the gap grows 4 mm a metre east of x = 0
  plain(f, slope)
  level(f, 'court', H, [0, 20], [-1, 1]) // 20 by 2 m from the line where the two planes cross
  const p = pairOf(coplanar(f), 'ground', 'court')
  assert.ok(p, 'a pair')
  assert.ok(Math.abs(p.area - 1) < 0.1, `area ${p.area} m2 (0.5 m of the 20 m within 2 mm)`)
  assert.ok(p.gapMm > 0.8 && p.gapMm < 1.2, `median gap ${p.gapMm} mm over the counted cells`)
})
