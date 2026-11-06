// node --test forge/babylon/test/*.test.mjs (the street-edge probe's two measures on cases built here: a level's line
// across one triangle of linearly varying face data, and a scene point to a still's device pixel)
import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraFrom } from '../geometry.mjs'
import { pixelRay } from '../ray-probe.mjs'
import { isoSegment, toPixel } from '../street-edge.mjs'

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`)
const nearAll = (a, b, tol, what) => { assert.equal(a.length, b.length, what); a.forEach((x, k) => near(x, b[k], tol, `${what} ${k}`)) }

test('isoSegment: where the level crosses a triangle, by each edge linearly; nothing when it misses', () => {
  const P = [[0, 0, 0], [10, 0, 0], [0, 0, 10]], T = [0, 10, 0]
  const s = isoSegment(P, T, 4)
  nearAll(s[0], [4, 0, 0], 1e-12, 'on the first edge')
  nearAll(s[1], [4, 0, 6], 1e-12, 'on the second edge')
  assert.equal(isoSegment(P, T, 11), null, 'over every corner')
  assert.equal(isoSegment(P, T, -1), null, 'under every corner')
  // face data linear in the scene, as the material reads them inside one triangle: both ends lie on the level
  const f = (p) => 0.3 * p[0] - 0.2 * p[2] + 0.5 * p[1] + 1
  const Q = [[2, 1, -3], [9, 4, 5], [-4, 2, 7]], TQ = Q.map(f)
  const lo = Math.min(...TQ), hi = Math.max(...TQ)
  for (let k = 1; k < 10; k++) {
    const level = lo + ((hi - lo) * k) / 10, seg = isoSegment(Q, TQ, level)
    assert.ok(seg, `level ${level}`)
    for (const p of seg) near(f(p), level, 1e-9, `level ${level.toFixed(2)}`)
    // each end on one of the triangle's edges
    for (const p of seg) {
      const onEdge = [0, 1, 2].some((a) => {
        const A = Q[a], B = Q[(a + 1) % 3], d = B.map((x, c) => x - A[c]), L = d.reduce((m, x) => m + x * x, 0)
        const u = d.reduce((m, x, c) => m + x * (p[c] - A[c]), 0) / L
        return u >= -1e-9 && u <= 1 + 1e-9 && Math.hypot(...p.map((x, c) => x - (A[c] + d[c] * u))) < 1e-9
      })
      assert.ok(onEdge, `${p} on an edge`)
    }
  }
})

test('toPixel: as the stills project, the origin top left, rows down, the lens shift, nothing at the near side or behind', () => {
  const cam = cameraFrom({ name: 't', eye: [0, 0, 0], look: [0, 0, -1], vfov: 90, w: 200, h: 100 })
  nearAll(toPixel(cam, [0, 0, -10]), [99.5, 49.5], 1e-9, 'ahead')
  nearAll(toPixel(cam, [1, 0, -10]), [104.5, 49.5], 1e-9, 'right')
  nearAll(toPixel(cam, [0, 2, -10]), [99.5, 39.5], 1e-9, 'above')
  nearAll(toPixel(cam, [-20, -10, -10]), [-0.5, 99.5], 1e-9, 'the bottom left corner')
  assert.equal(toPixel(cam, [0, 0, 5]), null, 'behind the eye')
  assert.equal(toPixel(cam, [0, 0, -0.2]), null, 'inside the near side')
  const shifted = cameraFrom({ name: 's', eye: [0, 0, 0], look: [0, 0, -1], vfov: 90, w: 200, h: 100, shift: 0.5 })
  nearAll(toPixel(shifted, [0, 0, -10]), [99.5, 74.5], 1e-9, 'ahead, the lens shifted up')
})

test("toPixel takes a point back to the pixel whose ray the ray probe casts through it", () => {
  const c = cameraFrom({ name: 'c', eye: [-30, 12, 4], look: [0, 1, -2], vfov: 41, w: 1170, h: 2532, shift: 0.12 })
  for (const [px, py] of [[0, 0], [585, 1266], [1169, 2531], [212.25, 1900.75]]) {
    const { o, d } = pixelRay(c, px, py)
    nearAll(toPixel(c, o.map((x, k) => x + d[k] * 37)), [px, py], 1e-7, `pixel ${px},${py}`)
  }
})
