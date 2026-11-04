// node --test forge/babylon/test/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { cameraFrom, coplanar, facesFrom, fittedFov, floating, subPixel } from '../geometry.mjs'

const box = (faces, name, [sx, sy, sz], [x, y, z]) => {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate(x, y + sy / 2, z)
  return facesFrom(faces, g, null, () => name)
}
const flat = () => 0

test('two boxes sharing a face looking one way fight; face to face they butt', () => {
  const f = []
  box(f, 'a', [2, 2, 2], [0, 0, 0])
  box(f, 'b', [2, 1, 2], [0, 0, 0]) // the same floor, the same sides: fights
  box(f, 'c', [2, 2, 2], [2, 0, 0]) // meets a at x = 1: a butt joint
  const pairs = coplanar(f)
  assert.ok(pairs.some((p) => p.kind === 'fight' && [p.a, p.b].sort().join() === 'a,b'))
  assert.ok(pairs.some((p) => p.kind === 'butt' && [p.a, p.b].sort().join() === 'a,c'))
  assert.ok(!pairs.some((p) => p.kind === 'fight' && [p.a, p.b].sort().join() === 'a,c'))
})

test('a fight every eye stands behind is unseen', () => {
  const f = []
  box(f, 'a', [2, 2, 2], [0, 0, 0])
  box(f, 'b', [2, 1, 2], [0, 0, 0])
  const eyes = [new THREE.Vector3(0, 0.5, 0)] // inside both bodies, behind every shared plane
  const pairs = coplanar(f, { eyes })
  assert.ok(pairs.filter((p) => p.a !== 'c').every((p) => p.kind !== 'fight'))
})

test('the support rule: grounded corners, raised centres, sunk stages, spans on their ends', () => {
  const f = []
  box(f, 'ground-ok', [2, 2, 2], [0, 0, 0])
  box(f, 'hovering', [2, 2, 2], [10, 0.3, 0]) // 0.3 m over flat ground: a grounded body with a gap
  box(f, 'stage', [1, 1, 1], [0, 1.95, 0]) // sunk 5 cm into the box under it
  box(f, 'cap', [2.2, 0.1, 2.2], [0, 2.95, 0]) // overhangs the stage, held at its centre
  box(f, 'sky', [1, 1, 1], [20, 5, 0]) // nothing under it
  box(f, 'pier-a', [1, 4, 1], [30, 0, 0])
  box(f, 'pier-b', [1, 4, 1], [34, 0, 0])
  box(f, 'beam', [5, 0.5, 1], [32, 4, 0]) // rests on both piers, over air at its centre
  const rows = floating(f, { ground: flat })
  const names = rows.map((r) => r.body).sort()
  assert.deepEqual(names, ['hovering', 'sky'])
})

test('a strip thinner than a device pixel is found; a sliver of a larger plane is not', () => {
  const f = []
  // a 2 mm ledge 20 m long, standing on its own, 100 m in front of the eye
  const g = new THREE.PlaneGeometry(20, 0.002)
  g.translate(0, 1.6, -100)
  facesFrom(f, g, null, () => 'ledge')
  // a far wall fanned into thin triangles from one corner: each triangle is thin, the wall is not
  const pos = []
  for (let i = 0; i < 40; i++) pos.push(-10, 0, -400, -10 + (i * 20) / 40, 3, -400, -10 + ((i + 1) * 20) / 40, 3, -400)
  pos.push(-10, 0, -400, 10, 3, -400, 10, 0, -400)
  const w = new THREE.BufferGeometry()
  w.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  facesFrom(f, w, null, () => 'wall')
  const cam = cameraFrom({ name: 'eye', eye: [0, 1.6, 0], look: [0, 1.6, -1], vfov: fittedFov(58, 1600, 900), w: 1600, h: 900 })
  const r = subPixel(f, [cam])
  assert.deepEqual(r.rows.map((x) => x.body), ['ledge'])
  assert.ok(r.rows[0].thinnestPx < 1)
})
