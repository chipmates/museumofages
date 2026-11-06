// node --test forge/babylon/test/*.test.mjs (the sub-pixel pass's plane test: a flat face far out split into slivers is
// one plane, though its float32 corners move each sliver's rounded plane key; a sliver turned off its neighbour is not)
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { cameraFrom, facesFrom, fittedFov, subPixel } from '../geometry.mjs'

// the plane of a lion wall run's stepped side face, 160 m out in the gate's frame
const n = new THREE.Vector3(0.998441, 0, 0.055822).normalize()
const u = new THREE.Vector3(-n.z, 0, n.x), v = new THREE.Vector3(0, 1, 0)
const at = (o, a, b, c = 0) => o.clone().addScaledVector(u, a).addScaledVector(v, b).addScaledVector(n, c)
// triangles stored as float32, as the page's buffers hold them
const tris = (faces, body, list) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((t) => t.flatMap((p) => [p.x, p.y, p.z])), 3))
  return facesFrom(faces, g, null, () => body)
}

test('a flat face far out fanned into slivers is one plane; a sliver turned 3 degrees off its neighbour is thin', () => {
  const faces = []
  // a 0.84 by 0.17 m face fanned from one corner into ten slivers 1.7 to 7.5 cm thick, closed by one wide triangle
  const O = new THREE.Vector3(-17.838, 5.214, 160.873), N = 10, L = 0.84, H = 0.17
  const top = (i) => at(O, (L * i) / N, H)
  const fan = []
  for (let i = 0; i < N; i++) fan.push([O, top(i), top(i + 1)])
  fan.push([O, top(N), at(O, L, 0)])
  tris(faces, 'side', fan)
  // beside it a shelf and a 1.7 cm sliver of another body across the shelf's long edge, turned 3 degrees out of its
  // plane: its far corner 0.9 mm off the shelf's plane
  const S = at(O, 2, 0), t = (3 * Math.PI) / 180
  tris(faces, 'shelf', [[S, at(S, 0.84, 0), at(S, 0.42, 0.3)]])
  tris(faces, 'fin', [[at(S, 0.84, 0), S, at(S, 0.5, -0.017 * Math.cos(t), 0.017 * Math.sin(t))]])
  const eye = at(O, 1.4, 0.1, 50)
  const cam = cameraFrom({ name: 'eye', eye: [eye.x, eye.y, eye.z], look: [O.x, O.y, O.z], vfov: fittedFov(58, 1600, 900), w: 1600, h: 900 })
  const r = subPixel(faces, [cam])
  assert.deepEqual(r.rows.map((x) => x.body), ['fin'])
  assert.ok(r.rows[0].thinnestPx < 1)
  assert.ok(r.slivers >= N, `${r.slivers} slivers set aside`)
})
