// The gate page's film on the desktop: over each hold whose desktop still stands on it, the film's lens and shift are
// the still's (the frame that is judged is the frame that ships), eased by path.ts from the keys' `desktop`, which
// gate.ts hands over as the key's own lens and shift. The lens data move no camera, and the film takes no step.
// GATE_CLIP=<folder of gate-clip.mjs frames> also reads the film's own frame logs there.
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
// the keys as gate.ts `pathCams` builds them (the frame's own x and z carry the easing); `bare` drops every lens
const build = (bare) => makePath({
  eye: cams.eye, lens: { desktop: cams.stills.desktop.hfov, phoneFilm: cams.phoneFilm }, stops: cams.stops.map((s) => ({ n: s.n, hour: s.hour[0] })),
  path: cams.stops.flatMap((s) => s.keys.map((k, i) => ({
    t: k.t + (i === 0 && s !== cams.stops[0] ? 1e-4 : 0), at: atOf(k.at), y: 'eye', look: lookOf(k.look), stop: s.n, hold: k.kind === 'hold' || i === 0, kind: k.kind,
    // a phone's own stand (`phone.at`) is a place, not a lens: the bare path keeps it
    ...(k.phone && (!bare || k.phone.at) ? { phone: bare ? { at: k.phone.at } : k.phone } : {}), ...(!bare && k.desktop ? { hfov: k.desktop.hfov, shift: k.desktop.shift } : {}),
  }))),
}, (E, N) => [E, N], () => 0)
const path = build(false), bare = build(true)

/** a stop's desktop still as gate.ts `stillView` takes it, with the hold it stands on: [the arrival's second, the hold's] */
function deskStill(s) {
  let t, o
  if (s.still) { t = s.still.t; o = { hfov: s.still.desktop?.hfov ?? cams.stills.desktop.hfov, shift: s.still.desktop?.shift ?? 0 } }
  else if (cams.stills.desktop.stop === s.n) { t = s.keys.filter((k) => k.kind === 'hold').at(-1).t; o = { hfov: cams.stills.desktop.hfov, shift: cams.stills.desktop.shift } }
  else return null
  const i = s.keys.findIndex((k) => k.t === t)
  return { ...o, t, from: s.keys[i - 1].kind === 'arrive' ? s.keys[i - 1].t : t }
}
const seconds = (a, b) => { const out = []; for (let g = Math.ceil(a * 8 - 1e-9); g <= Math.floor(b * 8 + 1e-9); g++) out.push(g / 8); return out }

test('gate.ts hands the keys their desktop lens and films the desktop with it', () => {
  assert.match(src, /\.\.\.\(k\.desktop \? \{ hfov: k\.desktop\.hfov, shift: k\.desktop\.shift \} : \{\}\)/)
  assert.match(src, /const shift = o\.framing === 'phone' \? p\.phone\.shift : p\.shift/)
  for (const s of cams.stops) for (const k of s.keys) if (k.desktop) assert.ok(typeof k.desktop.hfov === 'number' && typeof k.desktop.shift === 'number', `key at ${k.t}: a desktop lens names both`)
})

test("over each hold with a desktop still the film's desktop lens and shift are the still's", () => {
  let n = 0
  for (const s of cams.stops) {
    const st = deskStill(s)
    if (!st) continue
    for (const t of [st.from, ...seconds(st.from, st.t), st.t]) {
      const p = path.sample(t)
      assert.ok(Math.abs(p.hfov - st.hfov) < 1e-9, `stop ${s.n} at ${t} s: lens ${p.hfov}, the still's ${st.hfov}`)
      assert.ok(Math.abs(p.shift - st.shift) < 1e-9, `stop ${s.n} at ${t} s: shift ${p.shift}, the still's ${st.shift}`)
    }
    n++
  }
  assert.ok(n >= 3, `${n} holds checked`)
})

test('the lens data move no camera: every sample at 8 fps stands, looks and keeps its hour as without them', () => {
  for (const t of seconds(0, path.duration)) {
    const a = path.sample(t), b = bare.sample(t)
    assert.deepEqual([a.pos, a.look, a.phone.look, a.hour], [b.pos, b.look, b.phone.look, b.hour], `at ${t} s`)
  }
})

test('no step in the film: between frames at 8 fps the shift moves at most 0.01 and the lens 0.3 degrees, either framing', () => {
  const ts = seconds(0, path.duration)
  for (let i = 1; i < ts.length; i++) {
    const a = path.sample(ts[i - 1]), b = path.sample(ts[i])
    for (const [name, x, y] of [['desktop shift', a.shift, b.shift], ['phone shift', a.phone.shift, b.phone.shift]]) assert.ok(Math.abs(x - y) <= 0.01, `${name} ${x} to ${y} at ${ts[i]} s`)
    for (const [name, x, y] of [['desktop lens', a.hfov, b.hfov], ['phone lens', a.phone.hfov, b.phone.hfov]]) assert.ok(Math.abs(x - y) <= 0.3, `${name} ${x} to ${y} at ${ts[i]} s`)
  }
})

test('GATE_CLIP: the desktop film frames over the holds were shot with the still lens', { skip: !process.env.GATE_CLIP }, () => {
  const dir = process.env.GATE_CLIP
  assert.ok(existsSync(dir), dir)
  const frames = readdirSync(dir).filter((f) => /^desktop-frames-\d+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).frames)
  let n = 0
  for (const s of cams.stops) {
    const st = deskStill(s)
    if (!st) continue
    for (const f of frames.filter((x) => x.t >= st.from - 1e-6 && x.t <= st.t + 1e-6)) {
      assert.ok(Math.abs(f.hfov - st.hfov) < 1e-3 && Math.abs(f.shift - st.shift) < 1e-3, `stop ${s.n} frame at ${f.t}: ${f.hfov}/${f.shift}, the still's ${st.hfov}/${st.shift}`)
      n++
    }
  }
  assert.ok(n >= 2, `${n} desktop frames over a hold with its own still in GATE_CLIP`)
})
