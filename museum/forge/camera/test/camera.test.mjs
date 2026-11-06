import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PerspectiveCamera, Vector3 } from 'three'
import { FORMAT, forwardOf, fromBabylonPath, fromSketch, quatOf, readTrack, sliceTrack, writeTrack } from '../track.mjs'
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

test('the format round trip', (ctx) => {
  const t = madeUp(10)
  const dir = mkdtempSync(SCRATCH)
  ctx.after(() => rmSync(dir, { recursive: true, force: true }))
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

/** a made-up map path: a walk north at 1 m/s that jumps 10 m east at the cut key's time */
function cutPath(cutT, duration = 2) {
  return {
    duration,
    keys: [{ t: 0 }, { t: cutT, cut: true }, { t: duration }],
    sample: (t) => {
      const x = t < cutT ? 0 : 10, z = -t
      return { pos: [x, 1.65, z], look: [x, 1.65, z - 1], hfov: 60, stop: 1, kind: 'walk' }
    },
  }
}

test('a cut key between frames starts the run at the next frame', () => {
  // at 30 fps, 1.01 s lies between frames 30 (1.000 s) and 31 (1.033 s); a key on frame 31's time stays on 31
  for (const [cutT, want] of [[1.01, 31], [31 / 30, 31], [1, 30]]) {
    const t = fromBabylonPath(cutPath(cutT), { fps: 30 })
    assert.deepEqual(t.cuts, [want], `key at ${cutT} s`)
    assert.deepEqual(t.jumps, [], `key at ${cutT} s: the pose change is the cut, not a jump`)
    assert.equal(t.samples[want][0], 10, 'the run starts on the new pose')
    assert.equal(t.samples[want - 1][0], 0, 'the frame before shows the old pose')
  }
})

test('sliceTrack keeps and shifts keys', () => {
  const t = { ...madeUp(10), keys: [0, 10, 30, 50, 140], cuts: [5, 40], jumps: [40] }
  const s = sliceTrack(t, 20, 60)
  assert.deepEqual(s.keys, [10, 30])
  assert.deepEqual(s.cuts, [20])
  assert.deepEqual(s.jumps, [20])
  assert.equal(s.samples.length, 40)
  assert.ok(Math.abs(s.offsetSeconds - 20 / t.fps) < 1e-12)
  assert.ok(!('keys' in sliceTrack(madeUp(10), 20, 60)), 'a track without keys gets none')
})

/** a made-up sketch: walk, a black span over frames 10 to 14, walk on; the pose jumps 10 m east at frame `at` */
function blackSketch(at) {
  const samples = []
  for (let i = 0; i < 30; i++) samples.push({ t: i / 20, x: i < at ? 0 : 10, y: 1.65, z: -i * 0.05, yaw: 0, pitch: 0, hfov: 60, leg: 'a', kind: i >= 10 && i < 15 ? 'black' : 'walk' })
  return { desktop: { samples } }
}

test('a pose jump inside a black span becomes a cut, not a jump', () => {
  for (const at of [12, 15]) {
    const t = fromSketch(blackSketch(at))
    assert.deepEqual(t.jumps, [], `jump at frame ${at}`)
    assert.deepEqual(t.cuts, [10, at], `jump at frame ${at}: the black starts a cut, the run starts at the pose's change`)
  }
  const out = fromSketch(blackSketch(22))
  assert.deepEqual(out.jumps, [22], 'the same jump after the black stays a jump')
  assert.deepEqual(out.cuts, [10, 22])
})
