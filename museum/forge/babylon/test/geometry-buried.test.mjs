// node --test forge/babylon/test/*.test.mjs (the sub-pixel pass and a mount's closed bodies: a sliver whose long edge
// runs into another closed body shows only as part of that body's face; one standing free is thin)
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { cameraFrom, facesFrom, fittedFov, subPixel } from '../geometry.mjs'

const tris = (faces, body, list) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(2), 3))
  return facesFrom(faces, g, null, () => body)
}

test("a sliver whose long edge runs into another closed body is set aside; a free one rows", () => {
  const faces = []
  // a pier x 2.25 to 11, y -2.5 to 21, z -26 to -19; an arch's end face sliver 0.29 m thick, its 11 m long edge inside
  // the pier 0.15 m past its face, its apex on the intrados in the doorway (as the gate's arches)
  const pier = { body: 'pier', x0: 2.25, x1: 11, y0: -2.5, y1: 21, z0: -26, z1: -19 }
  tris(faces, 'arch', [[[2.4, 21, -25], [2.4, 10.05, -25], [2.106, 10.843, -25]]])
  // the same sliver standing free, 10 m to the west
  tris(faces, 'free', [[[-7.6, 21, -25], [-7.6, 10.05, -25], [-7.894, 10.843, -25]]])
  const buried = (p, body) => body !== pier.body && p.x >= pier.x0 && p.x <= pier.x1 && p.y >= pier.y0 && p.y <= pier.y1 && p.z >= pier.z0 && p.z <= pier.z1
  const cam = cameraFrom({ name: 'far', eye: [0, 300, 600], look: [0, 10, -25], vfov: fittedFov(58, 1600, 900), w: 1600, h: 900 })
  const off = subPixel(faces, [cam]), on = subPixel(faces, [cam], { buried })
  assert.deepEqual(off.rows.map((x) => x.body).sort(), ['arch', 'free'])
  assert.deepEqual(on.rows.map((x) => x.body), ['free'])
  assert.equal(on.inside, 1)
})
