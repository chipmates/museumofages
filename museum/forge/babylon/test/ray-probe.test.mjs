// node --test forge/babylon/test/*.test.mjs (the pixel probe on a small scene built here: the first face a ray meets,
// the ray through a device pixel, and whether the geometry shades the point a pixel sees)
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { cameraFrom, facesFrom } from '../geometry.mjs'
import { flatten, hit, pixelRay, probePixel } from '../ray-probe.mjs'

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`)
const box = (faces, name, [sx, sy, sz], [x, y, z]) => {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate(x, y + sy / 2, z)
  return facesFrom(faces, g, null, () => name)
}
// a level square whose faces are wound to look down: a ray from above meets its back
const downSquare = (faces, name, size, y) => {
  const g = new THREE.PlaneGeometry(size, size)
  g.rotateX(Math.PI / 2)
  g.translate(0, y, 0)
  return facesFrom(faces, g, null, () => name)
}
// a scene point to a device pixel, the pinhole the stills use (top left the origin, x right, y down, pixel centres
// at whole numbers); written here so the probe's ray is held against a projection of its own
const pixelOf = (cam, p) => {
  const t = new THREE.Vector3(...p).sub(cam.eye), depth = t.dot(cam.forward)
  const nx = t.dot(cam.right) / depth / cam.half / cam.aspect, ny = t.dot(cam.up) / depth / cam.half - cam.shift
  return [((nx + 1) * cam.w) / 2 - 0.5, ((1 - ny) * cam.h) / 2 - 0.5]
}

test('hit: the nearest face a ray meets, from either side, past tMin and short of tMax; beside a face it misses', () => {
  const f = []
  box(f, 'roof', [8, 0.5, 8], [0, 4.5, 0]) // top at 5, foot at 4.5
  downSquare(f, 'ground', 100, 0)
  const T = flatten(f)
  assert.equal(T.n, f.length)
  const down = [0, -1, 0], up = [0, 1, 0]
  const at = (o, d, tMin, tMax) => { const h = hit(T, o, d, tMin, tMax); return h && { body: T.body[h.i], t: +h.t.toFixed(6) } }
  assert.deepEqual(at([0, 10, 0], down), { body: 'roof', t: 5 })
  assert.deepEqual(at([0, 3, 0], down), { body: 'ground', t: 3 })
  assert.deepEqual(at([6, 10, 0], down), { body: 'ground', t: 10 }, 'beside the roof')
  assert.deepEqual(at([0, -1, 0], up), { body: 'ground', t: 1 }, 'the ground met from its front')
  assert.deepEqual(at([0, 5, 0], down, 1e-3), { body: 'roof', t: 0.5 }, 'from the roof top: past tMin its own foot is next')
  assert.equal(at([0, 10, 0], down, 1e-4, 4), null, 'tMax')
  assert.equal(at([0, 10, 0], [1, 0, 0]), null, 'a level ray over everything')
  assert.equal(at([60, 3, 0], down), null, 'past the ground')
})

test('pixelRay: through the pixel centre, the origin top left, rows down, the lens shift up', () => {
  const cam = cameraFrom({ name: 't', eye: [0, 0, 0], look: [0, 0, -1], vfov: 90, w: 200, h: 100 })
  const dir = (px, py) => pixelRay(cam, px, py).d
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
  dir(99.5, 49.5).forEach((x, k) => near(x, [0, 0, -1][k], 1e-12, `centre ${k}`))
  dir(0, 0).forEach((x, k) => near(x, unit([-0.995 * 2, 0.99, -1])[k], 1e-12, `top left ${k}`))
  dir(199, 99).forEach((x, k) => near(x, unit([0.995 * 2, -0.99, -1])[k], 1e-12, `bottom right ${k}`))
  assert.deepEqual(pixelRay(cam, 3, 4).o, [0, 0, 0])
  const shifted = cameraFrom({ name: 's', eye: [0, 0, 0], look: [0, 0, -1], vfov: 90, w: 200, h: 100, shift: 0.5 })
  pixelRay(shifted, 99.5, 49.5).d.forEach((x, k) => near(x, unit([0, 0.5, -1])[k], 1e-12, `shifted centre ${k}`))
  // a stop-like camera: the ray through a point's pixel passes through the point
  const c = cameraFrom({ name: 'c', eye: [-30, 12, 4], look: [0, 1, -2], vfov: 41, w: 1170, h: 2532, shift: 0.12 })
  for (const p of [[0, 0, 0], [-6, 0, 9], [3, 7, -20]]) {
    const { o, d } = pixelRay(c, ...pixelOf(c, p))
    const t = (p[0] - o[0]) * d[0] + (p[1] - o[1]) * d[1] + (p[2] - o[2]) * d[2]
    near(Math.hypot(o[0] + d[0] * t - p[0], o[1] + d[1] * t - p[1], o[2] + d[2] * t - p[2]), 0, 1e-9, `the ray misses ${p}`)
  }
})

test("probePixel: a wall's shade on the ground with the sun in the east, lit ground beside it, the wall's own face", () => {
  const f = []
  box(f, 'wall', [1, 4, 20], [2.5, 0, 0]) // x 2 to 3, y 0 to 4, z -10 to 10
  downSquare(f, 'ground', 100, 0) // wound to look down: the probe turns its normal to the eye
  const T = flatten(f), r = Math.SQRT1_2, sun = [r, r, 0]
  const cam = cameraFrom({ name: 'c', eye: [-30, 12, 0], look: [0, 0, 0], vfov: 40, w: 1600, h: 900 })
  const probe = (p) => probePixel(T, cam, sun, ...pixelOf(cam, p))
  const shade = probe([0, 0, 0]) // the wall's top edge throws its shade 4 m west of its face: x -2 to 2
  assert.equal(shade.sees, 'ground')
  shade.point.forEach((x, k) => near(x, 0, 1e-3, `point ${k}`))
  shade.normal.forEach((x, k) => near(x, [0, 1, 0][k], 1e-3, `normal ${k}`))
  near(shade.sunFacing, r, 1e-3, 'sun on the ground')
  assert.equal(shade.sunBlockedBy, 'wall')
  near(shade.sunBlockedAt, 2 * Math.SQRT2, 0.01, 'the way to the wall')
  near(shade.at, Math.hypot(30, 12), 1e-3, 'the eye to the point')
  for (const p of [[-6, 0, 0], [-1, 0, 15], [-2.5, 0, 3]]) {
    const lit = probe(p)
    assert.equal(lit.sees, 'ground', `${p}`)
    assert.equal(lit.sunBlockedBy, null, `${p} lies in the sun`)
    assert.equal(lit.sunBlockedAt, null)
  }
  const face = probe([2, 2, 0])
  assert.equal(face.sees, 'wall')
  face.normal.forEach((x, k) => near(x, [-1, 0, 0][k], 1e-3, `wall normal ${k}`))
  near(face.sunFacing, -r, 1e-3, 'the west face turned from the sun')
  assert.equal(face.sunBlockedBy, 'wall', 'its own body')
  assert.deepEqual(probePixel(T, cameraFrom({ name: 'sky', eye: [0, 1, 0], look: [0, 50, -10], vfov: 30, w: 100, h: 100 }), sun, 50, 50), { px: 50, py: 50, sees: null })
})
