import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PerspectiveCamera, Vector3 } from 'three'
import { FORMAT, forwardOf, fromSketch, quatOf, readTrack, writeTrack } from '../track.mjs'
import { curvesOf, readMove } from '../read.mjs'

const D2R = Math.PI / 180
const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), '.scratch')

/** a made-up track: a level walk north at 1 m/s, a 2 s hold, then a turn at `turnDps` standing */
function madeUp(turnDps, fps = 30) {
  const samples = []
  for (let i = 0; i < 3 * fps; i++) samples.push([0, 1.65, -i / fps, ...quatOf(0, 0), 50])
  for (let i = 0; i < 2 * fps; i++) samples.push([0, 1.65, -3, ...quatOf(0, 0), 50])
  for (let i = 1; i <= 3 * fps; i++) samples.push([0, 1.65, -3, ...quatOf(((turnDps * i) / fps) * D2R, 0), 50])
  return { format: FORMAT, source: 'made up', fps, aspect: 16 / 9, samples, moves: [{ name: 'm', from: 0, to: samples.length }], holds: [], cuts: [], jumps: [] }
}

test('the sketch mapping looks where the sketch aims (three.js lookAt on its own direction)', () => {
  const raw = { desktop: { samples: [{ t: 0, x: 1, y: 1.65, z: 2, yaw: 243.38, pitch: -12, hfov: 80, leg: 'a', kind: 'walk' }, { t: 0.05, x: 1, y: 1.65, z: 2, yaw: 243.38, pitch: -12, hfov: 80, leg: 'a', kind: 'walk' }] } }
  const s = fromSketch(raw).samples[0]
  const c = Math.cos(-12 * D2R), d = new Vector3(Math.sin(243.38 * D2R) * c, Math.sin(-12 * D2R), -Math.cos(243.38 * D2R) * c)
  const cam = new PerspectiveCamera()
  cam.position.set(1, 1.65, 2)
  cam.lookAt(cam.position.clone().add(d))
  const f = forwardOf(s)
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(f[k] - d.getComponent(k)) < 1e-9, `forward ${k}`)
  const q = cam.quaternion, same = Math.abs(q.x * s[3] + q.y * s[4] + q.z * s[5] + q.w * s[6])
  assert.ok(same > 1 - 1e-9, `the same rotation as three.js (dot ${same})`)
})

test('the format round trip', () => {
  const t = madeUp(10)
  const dir = mkdtempSync(SCRATCH)
  writeTrack(join(dir, 't.json'), t)
  assert.deepEqual(readTrack(join(dir, 't.json')), JSON.parse(JSON.stringify(t, (k, v) => (Object.is(v, -0) ? 0 : v))))
})

test('a fast turn is flagged, a calm one is not', () => {
  for (const [dps, want] of [[120, true], [10, false]]) {
    const t = madeUp(dps)
    const r = readMove(t, curvesOf(t), t.moves[0])
    assert.equal(r.flags.some((f) => f.flag === 'fast-turn'), want, `${dps} deg/s`)
  }
})

test('a hold reads as a hold', () => {
  const t = madeUp(10)
  const r = readMove(t, curvesOf(t), t.moves[0])
  const h = r.holds.find((x) => x.t0 > 2.5 && x.t1 < 5.5)
  assert.ok(h, JSON.stringify(r.holds))
  assert.ok(h.seconds > 1.5 && h.seconds <= 2.05, `${h.seconds} s`)
  assert.ok(!r.flags.some((f) => f.flag === 'short-hold'))
})
