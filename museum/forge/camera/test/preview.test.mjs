import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PerspectiveCamera, Vector3 } from 'three'
import { FORMAT, fromSketch, readTrack, sliceTrack, writeTrack } from '../track.mjs'
import { curvesOf, readMove, readTrackInto } from '../read.mjs'
import { moveSvg } from '../plot.mjs'
import { PREVIEW, fillLens, lensFrames, poseOf, previewTrack, stripFrames } from '../preview.mjs'

const D2R = Math.PI / 180
const HERE = dirname(fileURLToPath(import.meta.url))
const ASPECT = 1440 / 708
const turn = (a) => ((((a % 360) + 540) % 360) - 180)

/** the camera as the sketch's aim() sets it: lookAt along its own direction with up +y, the roll about the view, the
    vertical lens from the horizontal one and the frame */
function aimed({ pos, yaw, pitch, roll = 0, hfov }, w = 1440, h = 708) {
  const cam = new PerspectiveCamera()
  cam.position.set(...pos)
  cam.up.set(0, 1, 0)
  const c = Math.cos(pitch * D2R)
  cam.lookAt(cam.position.clone().add(new Vector3(Math.sin(yaw * D2R) * c, Math.sin(pitch * D2R), -Math.cos(yaw * D2R) * c)))
  if (roll) cam.rotateZ(roll * D2R)
  cam.fov = (2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))) / D2R
  cam.aspect = w / h
  return cam
}

const POSES = [
  { pos: [1, 1.65, 2], yaw: 215.8, pitch: 0, hfov: 32.5 },
  { pos: [-8.9, 1.65, -109.2], yaw: -144.2, pitch: 12, roll: 0.31, hfov: 96 },
  { pos: [80, 30, 74], yaw: 3, pitch: -61, roll: -4, hfov: 60 },
  { pos: [0, 1.7, 0], yaw: 179.5, pitch: 32, hfov: 20 },
]

test('a pose set as aim() sets it reads back through the track sample unchanged', () => {
  for (const p of POSES) {
    const cam = aimed(p)
    const q = cam.quaternion
    const got = poseOf([...cam.position.toArray(), q.x, q.y, q.z, q.w, cam.fov], ASPECT)
    assert.ok(Math.abs(turn(got.yaw - p.yaw)) < 1e-9, `yaw ${p.yaw}: ${got.yaw}`)
    assert.ok(Math.abs(got.pitch - p.pitch) < 1e-9, `pitch ${p.pitch}: ${got.pitch}`)
    assert.ok(Math.abs(got.roll - (p.roll ?? 0)) < 1e-9, `roll ${p.roll}: ${got.roll}`)
    assert.ok(Math.abs(got.hfov - p.hfov) < 1e-9, `hfov ${p.hfov}: ${got.hfov}`)
    // and set again from what was read, the camera is the same one
    const again = aimed(got)
    assert.ok(again.quaternion.angleTo(q) < 1e-9, `rotation ${p.yaw}`)
    assert.ok(Math.abs(again.fov - cam.fov) < 1e-9, 'lens')
  }
})

test('a sketch sample through the track format comes back as the sketch wrote it', () => {
  const s = (t, yaw, pitch, hfov) => ({ t, x: 3, y: 1.65, z: -4, yaw, pitch, hfov, leg: 'a', kind: 'walk' })
  const raw = { desktop: { samples: [s(0, 370.5, -12, 80), s(0.05, 215.8, 0, 32.5), s(0.1, -144.2, 5, 96)] } }
  const tr = fromSketch(raw)
  raw.desktop.samples.forEach((r, i) => {
    const p = poseOf(tr.samples[i], tr.aspect)
    assert.ok(Math.abs(turn(p.yaw - r.yaw)) < 1e-9 && Math.abs(p.pitch - r.pitch) < 1e-9 && Math.abs(p.roll) < 1e-9 && Math.abs(p.hfov - r.hfov) < 1e-9, `sample ${i}`)
  })
  assert.equal(tr.shifts, undefined, 'no lens in, none out')
  raw.desktop.samples[1].shift = -0.14
  assert.deepEqual(fromSketch(raw).shifts, [[0, 0], [-0.14, 0], [0, 0]])
})

test('the strip shows a frame every half second, each labelled with the time it really shows', () => {
  const at20 = stripFrames(261, 20)
  assert.equal(at20.length, 27)
  assert.deepEqual(at20.slice(0, 3), [{ i: 0, t: 0 }, { i: 10, t: 0.5 }, { i: 20, t: 1 }])
  assert.deepEqual(at20[26], { i: 260, t: 13 })
  // at 25 fps half a second falls between frames: the label is the frame's own time, never the grid's
  assert.deepEqual(stripFrames(51, 25).map((s) => s.i), [0, 13, 25, 38, 50])
  assert.deepEqual(stripFrames(51, 25).map((s) => s.t), [0, 0.52, 1, 1.52, 2])
  assert.deepEqual(stripFrames(13, 12).map((s) => s.t), [0, 0.5, 1])
  // a hold shorter than half a second still shows its first frame
  assert.deepEqual(stripFrames(10, 20), [{ i: 0, t: 0 }])
})

test('the lens is read sparsely and filled in, never across a cut', () => {
  assert.deepEqual(lensFrames(12, 5), [0, 5, 10, 11])
  assert.deepEqual(lensFrames(12, 5, [7]), [0, 5, 6, 7, 10, 11])
  const read = new Map([[0, { shift: 0, stops: 5 }], [5, { shift: -0.1, stops: 5 }], [6, { shift: -0.12, stops: 5 }], [7, { shift: 0.3, stops: 1 }], [10, { shift: 0.3, stops: 1 }], [11, { shift: 0.3, stops: 1 }]])
  const f = fillLens(12, read, [7])
  assert.ok(Math.abs(f[2].shift + 0.04) < 1e-12, 'linear inside a run')
  assert.equal(f[6].shift, -0.12)
  assert.equal(f[7].shift, 0.3)
  assert.equal(f[8].stops, 1, 'the run after the cut keeps its own exposure')
  // no readout on the cut itself: the frames after it take the next readout of their own run, not a blend across
  const sparse = fillLens(12, new Map([[0, { shift: 0, stops: 5 }], [5, { shift: -0.1, stops: 5 }], [10, { shift: 0.3, stops: 1 }]]), [7])
  assert.equal(sparse[8].shift, 0.3)
  assert.equal(sparse[6].shift, -0.1)
})

test('a preview track says so in its source, its readings (TSV and JSON) and its plot title', (ctx) => {
  const dir = mkdtempSync(join(HERE, '.scratch-preview-'))
  ctx.after(() => rmSync(dir, { recursive: true, force: true }))
  const samples = Array.from({ length: 40 }, (_, i) => [0, 1.65, -i / 20, 0, 0, 0, 1, 40])
  const t = { format: FORMAT, source: 'made up', fps: 20, aspect: ASPECT, samples, moves: [{ name: 'a', from: 0, to: 20 }, { name: 'b', from: 20, to: 40 }], holds: [], cuts: [], jumps: [] }
  const pt = previewTrack(t, t.moves[1], Array.from({ length: 20 }, () => [-0.14, 0]))
  assert.equal(pt.preview, PREVIEW)
  assert.match(pt.source, /sketch clip, not export/)
  assert.equal(pt.samples.length, 20)
  assert.equal(pt.offsetSeconds, 1)
  writeTrack(join(dir, 'b-preview-track.json'), pt)
  const back = readTrack(join(dir, 'b-preview-track.json'))
  assert.equal(back.shifts.length, 20)
  assert.deepEqual(sliceTrack(back, 5, 8).shifts, [[-0.14, 0], [-0.14, 0], [-0.14, 0]])
  readTrackInto(back, join(dir, 'read'))
  const tsv = readFileSync(join(dir, 'read', 'readings.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'))
  assert.equal(tsv[0].at(-1), 'note')
  assert.equal(tsv[1].at(-1), PREVIEW)
  assert.equal(JSON.parse(readFileSync(join(dir, 'read', 'b.json'), 'utf8')).note, PREVIEW)
  const c = curvesOf(back)
  assert.match(moveSvg(back, c, back.moves[0], readMove(back, c, back.moves[0])).svg, /PREVIEW \(sketch clip, not export\)/)
  // an export's track carries no note
  const c2 = curvesOf(t)
  assert.doesNotMatch(moveSvg(t, c2, t.moves[0], readMove(t, c2, t.moves[0])).svg, /PREVIEW/)
  assert.throws(() => writeTrack(join(dir, 'bad.json'), { ...pt, shifts: pt.shifts.slice(1) }), /shifts/)
})
