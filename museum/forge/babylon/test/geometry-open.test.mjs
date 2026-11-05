// node --test forge/babylon/test/*.test.mjs (the geometry check at stop 1, the open page: its bound, the first frame,
// on two planted fights built in a child node that strips the pages' types; and a run of many bodies in one plane)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three/webgpu'
import { APP } from '../pages.mjs'
import { coplanar, facesFrom } from '../geometry.mjs'

const KIT = join(APP, 'forge/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(KIT, p)).href)
// two 1 m squares in one plane (gap 0) facing the desktop still's eye, 300 m ahead of it, and the same pair 300 m
// behind it; the check on those faces under stop 1's own cameras and eyes, with the bound and without
const code = `
import { MOUNTS } from ${url('mounts.mjs')}
import { pushFace } from ${url('geometry.mjs')}
import { checkMount } from ${url('geometry-check.mjs')}
const M = await MOUNTS.open('1')
const c = M.cameras[0]
const faces = []
// a square across the still's axis, wound to face the eye from in front of it (ahead) or from behind it
const square = (name, centre, ahead) => {
  const r = c.right.clone().multiplyScalar(0.5), u = c.up.clone().multiplyScalar(0.5)
  const a = centre.clone().sub(r).sub(u), b = centre.clone().add(r).sub(u), d = centre.clone().add(r).add(u), e = centre.clone().sub(r).add(u)
  if (ahead) { pushFace(faces, name, a, b, d); pushFace(faces, name, a, d, e) } else { pushFace(faces, name, a, d, b); pushFace(faces, name, a, e, d) }
}
// behind every still camera: back along their mean axis
const back = M.cameras.reduce((s, k) => s.add(k.forward), c.eye.clone().set(0, 0, 0)).normalize()
const inside = c.eye.clone().addScaledVector(c.forward, 300), outside = c.eye.clone().addScaledVector(back, -300)
for (const n of ['test:in-a', 'test:in-b']) square(n, inside, true)
for (const n of ['test:out-a', 'test:out-b']) square(n, outside, false)
// the inside square's size in device pixels of the desktop still (its focal length in pixels times metres over depth)
const px = c.reach / 300
const st = { stop: '1', id: 'open', page: 'open' }
const P = { ...M, faces }
const framed = checkMount(P, st, { bound: 'frame' }).report, whole = checkMount(P, st, { bound: 'none' }).report
console.log(JSON.stringify({ camera: c.name, px, faceN: faces.slice(0, 4).map((f) => f.facing * f.n.dot(c.forward)), backN: faces.slice(4).map((f) => f.facing * f.n.dot(back)), framed: { bound: framed.bound, coplanar: framed.coplanar }, whole: { bound: whole.bound, coplanar: whole.coplanar } }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const rowOf = (rep, a) => rep.coplanar.list.find((p) => [p.a, p.b].includes(a))

test('the check runs at stop 1 with its bound', () => assert.equal(r.status, 0, r.stderr))

test('the planted fight inside the first frame covers over 4 device px and is found', () => {
  assert.ok(out.px > 4, `the square spans ${out.px} px`)
  assert.ok(out.faceN.every((d) => d < -0.99), 'the inside squares face the eye')
  assert.ok(out.backN.every((d) => d > 0.5), 'the outside squares face the eye from behind it')
  const row = rowOf(out.framed, 'test:in-a')
  assert.ok(row, 'a row for the inside pair')
  assert.equal(row.kind, 'fight')
  assert.deepEqual([row.a, row.b].sort(), ['test:in-a', 'test:in-b'])
  assert.ok(row.area > 0.9 && row.area < 1.1, `area ${row.area}`)
  assert.equal(row.gapMm, 0)
})

test('the planted fight outside the bound is counted as outside, and found without the bound', () => {
  const b = out.framed.bound
  assert.equal(b.kind, 'frame')
  assert.deepEqual(b.faces, { kept: 4, out: 4 })
  assert.deepEqual(b.bodies, { whole: 2, part: 0, out: 2 })
  assert.equal(b.outByName['test:out'], 2)
  assert.ok(!rowOf(out.framed, 'test:out-a'), 'no row outside the bound')
  assert.equal(out.whole.bound.kind, 'none')
  assert.ok(rowOf(out.whole, 'test:out-a'), 'the outside pair is a fight when nothing is left out')
})

test('a run of many bodies in one plane compares only the pairs whose boxes meet, and keeps every cover', () => {
  // 4000 feet in one plane across 4 km (the open page's houses), two of them overlapping, and over that pair a third
  // body's face looking the other way that closes half their shared area
  const f = []
  const foot = (name, x, z, s = 4) => { const g = new THREE.PlaneGeometry(s, s); g.rotateX(Math.PI / 2); g.translate(x, -13.2, z); facesFrom(f, g, null, () => name) }
  for (let i = 0; i < 4000; i++) foot(`house-${i}`, (i % 200) * 20, Math.floor(i / 200) * 200)
  foot('house-twin', 0, 0)
  const lid = new THREE.PlaneGeometry(2, 4); lid.rotateX(-Math.PI / 2); lid.translate(-1, -13.2, 0); facesFrom(f, lid, null, () => 'lid')
  const t = Date.now()
  const pairs = coplanar(f, { across: false })
  const ms = Date.now() - t
  assert.ok(ms < 5000, `${ms} ms`)
  const fights = pairs.filter((p) => p.kind === 'fight')
  assert.equal(fights.length, 1)
  assert.deepEqual([fights[0].a, fights[0].b].sort(), ['house-0', 'house-twin'])
  assert.ok(Math.abs(fights[0].area - 8) < 0.3, `the lid closes half: ${fights[0].area}`)
  assert.equal(pairs.filter((p) => p.kind === 'butt').length, 2)
})
