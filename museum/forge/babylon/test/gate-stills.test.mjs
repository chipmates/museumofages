// The gate page's stills: every gate stop shoots its own camera (stop 2 the hero stills, stops 3 and 4 their own holds).
// GATE_STILLS=<folder of `step.sh stills 2|3|4`> also reads the page's own sidecars and pictures from that folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP, PAGES, STOPS } from '../pages.mjs'

const cams = JSON.parse(readFileSync(join(APP, 'src/wings/babylon/gate/gate-cams.json'), 'utf8'))
const GATE = STOPS.filter((s) => s.page === 'gate').map((s) => Number(s.stop))
const FRAMINGS = ['desktop', 'phone']

/** a stop's still per framing as gate.ts `stillView` takes it (the height left to the page's street) */
function stillCam(n, framing) {
  const s = cams.stops.find((x) => x.n === n)
  if (!s?.still) {
    const v = cams.stills[framing]
    return { at: v.at, look: v.look, hfov: v.hfov, shift: v.shift }
  }
  const k = s.keys.find((x) => x.t === s.still.t)
  const o = s.still[framing] ?? {}
  return { at: o.at ?? k.at, look: o.look ?? k.look, hfov: o.hfov ?? cams.stills[framing].hfov, shift: o.shift ?? 0 }
}
/** the look as a level bearing from the stand, degrees ('gate' looks at the face's axis 20 m in, 'south' the map's look) */
function bearing(c) {
  const [x, z] = c.at
  const l = c.look === 'gate' ? [0, null, -20] : c.look === 'south' ? null : c.look
  if (!l) return 'south'
  return (Math.atan2(l[0] - x, -(l[2] - z)) * 180) / Math.PI
}

test('the shooter hands the gate page the stop it shoots', () => {
  for (const n of GATE) {
    const call = PAGES.gate.still({ stop: String(n), framing: 'desktop', w: 32, h: 18, css: [16, 9], samples: 1, out: '/x', name: 'x' })
    assert.equal(call.fn, 'shoot')
    assert.equal(call.arg.stop, n)
  }
})

test('stop 2 keeps the hero stills exactly; stops 3 and 4 name a still of their own', () => {
  const two = cams.stops.find((s) => s.n === 2)
  assert.equal(two.still, undefined, 'stop 2 shoots `stills`')
  for (const f of FRAMINGS) assert.deepEqual(stillCam(2, f), { at: cams.stills[f].at, look: cams.stills[f].look, hfov: cams.stills[f].hfov, shift: cams.stills[f].shift })
  for (const n of GATE.filter((n) => n !== 2)) assert.ok(cams.stops.find((s) => s.n === n).still, `stop ${n} has its own still`)
})

test('a stop\'s still is its arrival\'s hold: a hold key of that stop, right after its arrive at the same stand', () => {
  for (const s of cams.stops.filter((x) => x.still)) {
    const i = s.keys.findIndex((k) => k.t === s.still.t)
    assert.ok(i > 0, `stop ${s.n}: a key at t ${s.still.t}`)
    assert.equal(s.keys[i].kind, 'hold', `stop ${s.n}: the still's key is a hold`)
    assert.equal(s.keys[i - 1].kind, 'arrive', `stop ${s.n}: the hold follows the arrival`)
    assert.deepEqual(s.keys[i - 1].at, s.keys[i].at)
    for (const f of FRAMINGS) assert.ok(stillCam(s.n, f).hfov > 20 && stillCam(s.n, f).hfov < 100, `stop ${s.n} ${f}: a lens`)
  }
})

test('no two gate stops\' stills share a camera: the stands 1 m apart or the looks 1 degree apart', () => {
  const all = GATE.flatMap((n) => FRAMINGS.map((f) => ({ n, f, c: stillCam(n, f) })))
  for (const a of all) for (const b of all) {
    if (a.n >= b.n) continue
    const d = Math.hypot(a.c.at[0] - b.c.at[0], a.c.at[1] - b.c.at[1])
    const ba = bearing(a.c), bb = bearing(b.c)
    const turn = typeof ba === 'number' && typeof bb === 'number' ? Math.abs(ba - bb) : ba === bb ? 0 : 180
    assert.ok(d >= 1 || turn >= 1, `stop ${a.n} ${a.f} and stop ${b.n} ${b.f} share a camera (${d.toFixed(2)} m, ${turn.toFixed(2)} degrees)`)
  }
})

const SHOT = process.env.GATE_STILLS
const R = { skip: !SHOT || !existsSync(SHOT) ? 'GATE_STILLS names no folder' : false }
test('read-back: each gate stop\'s still came from its own stand, and no two pictures are the same', R, () => {
  const seen = new Map()
  let n = 0
  for (const f of readdirSync(SHOT).filter((x) => /^0[2-4]-.+-(desktop|phone)\.json$/.test(x))) {
    const j = JSON.parse(readFileSync(join(SHOT, f), 'utf8'))
    const stop = Number(f.slice(0, 2))
    assert.equal(j.stop, stop, `${f}: the page shot stop ${stop}`)
    const c = stillCam(stop, j.framing)
    assert.ok(Math.abs(j.camera.gate.pos[0] - c.at[0]) < 1e-3 && Math.abs(j.camera.gate.pos[2] - c.at[1]) < 1e-3, `${f}: stands at its still`)
    const png = readFileSync(join(SHOT, f.replace(/\.json$/, '.png')))
    const h = createHash('sha256').update(png).digest('hex')
    assert.ok(!seen.has(h), `${f} is the same picture as ${seen.get(h)}`)
    seen.set(h, f)
    n++
  }
  assert.ok(n >= 2, `read ${n} gate sidecars`)
})
