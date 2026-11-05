// The gate page's film on the phone: at each hold whose phone still stands on it, the film's lens and shift are the
// still's (the frame that is judged is the frame that ships); 46 degrees elsewhere. The lens is eased by path.ts from the
// keys' `phone`, which gate.ts hands over as they are. GATE_CLIP=<folder of gate-clip.mjs frames> also reads the
// film's own frame logs there.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../pages.mjs'
import { makePath } from '../../../src/wings/babylon/map/path.ts'

const W = join(APP, 'src/wings/babylon/gate')
const cams = JSON.parse(readFileSync(join(W, 'gate-cams.json'), 'utf8'))
const src = readFileSync(join(W, 'gate.ts'), 'utf8')
const lookOf = (l) => (l === 'gate' ? [0, -20, 1.65] : l === 'south' ? [2, -200, 1.65] : [l[0], l[2], l[1]])
const atOf = (a) => (typeof a === 'string' ? [0, Number(a.slice(7))] : a)
// the keys' timing and lens as gate.ts `pathCams` builds them; the places only carry the easing (the frame's own x and z)
const path = makePath({
  eye: cams.eye, lens: { desktop: cams.stills.desktop.hfov, phoneFilm: cams.phoneFilm }, stops: cams.stops.map((s) => ({ n: s.n, hour: s.hour[0] })),
  path: cams.stops.flatMap((s) => s.keys.map((k, i) => ({ t: k.t + (i === 0 && s !== cams.stops[0] ? 1e-4 : 0), at: atOf(k.at), y: 'eye', look: lookOf(k.look), stop: s.n, hold: k.kind === 'hold' || i === 0, kind: k.kind, ...(k.phone ? { phone: k.phone } : {}) }))),
}, (E, N) => [E, N], () => 0)

/** a stop's phone still as gate.ts `stillView` takes it: its place, lens and shift */
function phoneStill(s) {
  if (!s.still) return { ...cams.stills.phone, own: false }
  const k = s.keys.find((x) => x.t === s.still.t), o = s.still.phone ?? {}
  return { at: o.at ?? k.at, hfov: o.hfov ?? cams.stills.phone.hfov, shift: o.shift ?? 0, t: s.still.t, own: true }
}

test('gate.ts hands the keys their phone lens and films the phone with it', () => {
  assert.match(src, /phoneFilm: cams\.phoneFilm/)
  assert.match(src, /\.\.\.\(k\.phone \? \{ phone: k\.phone \} : \{\}\)/)
  assert.match(src, /const hfov = o\.framing === 'phone' \? p\.phone\.hfov : p\.hfov/)
  assert.match(src, /const shift = o\.framing === 'phone' \? p\.phone\.shift : 0/)
  assert.doesNotMatch(src, /framing === 'phone' \? 46/)
})

test("at each hold with its own phone still the film's phone lens and shift are the still's", () => {
  let n = 0
  for (const s of cams.stops) {
    const st = phoneStill(s)
    if (!st.own) continue
    const p = path.sample(st.t)
    assert.equal(p.phone.hfov, st.hfov, `stop ${s.n} at ${st.t} s: lens ${p.phone.hfov}, the still's ${st.hfov}`)
    assert.ok(Math.abs(p.phone.shift - st.shift) < 1e-9, `stop ${s.n} at ${st.t} s: shift ${p.phone.shift}, the still's ${st.shift}`)
    n++
  }
  assert.ok(n >= 2, `${n} holds checked`)
})

test("a hold whose phone still stands elsewhere keeps the film's 46", () => {
  for (const s of cams.stops) {
    if (s.still) continue
    const hold = s.keys.filter((k) => k.kind === 'hold').at(-1)
    assert.deepEqual(atOf(hold.at), atOf(s.keys.at(-1).at))
    assert.notDeepEqual(atOf(hold.at), cams.stills.phone.at, `stop ${s.n}: the hero phone still stands on this hold`)
    assert.equal(path.sample(hold.t).phone.hfov, cams.phoneFilm, `stop ${s.n} at ${hold.t} s`)
  }
  assert.equal(cams.phoneFilm, 46)
})

test('GATE_CLIP: the film frames at the holds were shot with the still lens', { skip: !process.env.GATE_CLIP }, () => {
  const dir = process.env.GATE_CLIP
  assert.ok(existsSync(dir), dir)
  const frames = readdirSync(dir).filter((f) => /^phone-frames-\d+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).frames)
  let n = 0
  for (const s of cams.stops) {
    const st = phoneStill(s)
    if (!st.own) continue
    const f = frames.find((x) => Math.abs(x.t - Math.round(st.t * 8) / 8) < 1e-6)
    if (!f) continue
    assert.ok(Math.abs(f.hfov - st.hfov) < 1e-3 && Math.abs(f.shift - st.shift) < 1e-3, `stop ${s.n} frame at ${f.t}: ${f.hfov}/${f.shift}`)
    n++
  }
  assert.ok(n >= 1, 'no frame at a hold with its own phone still in GATE_CLIP')
})
