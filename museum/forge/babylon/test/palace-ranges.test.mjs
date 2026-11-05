// node --test forge/babylon/test/*.test.mjs (the South Palace's range wells, built in a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
const plan = JSON.parse(readFileSync(new URL(${url('map/map-plan.json')}), 'utf8'))
const built = buildPlan(plan)
const rooms = built.prisms.find((p) => p.id === 'south-palace-rooms')
const decks = built.prisms.filter((p) => p.id.startsWith('south-palace-deck-'))
console.log(JSON.stringify({ ranges: plan.blocks.find((b) => b.id === 'south-palace-rooms').ranges.length,
  wells: rooms.holes.slice(rooms.holes.length - decks.length), decks: decks.map((d) => ({ id: d.id, poly: d.poly })) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

const area = (p) => p.reduce((a, q, i) => { const n = p[(i + 1) % p.length]; return a + q[0] * n[1] - n[0] * q[1] }, 0) / 2
/** interior angles in degrees (reflex ones over 180) */
const angles = (p) => {
  const s = Math.sign(area(p))
  return p.map((b, i) => {
    const a = p[(i + p.length - 1) % p.length], c = p[(i + 1) % p.length]
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]]
    const ang = (Math.atan2(Math.abs(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    return s * turn > 0 ? ang : 360 - ang
  })
}
/** the longest run of boundary (m) where the width along the inward normal is under `min` */
const narrowRun = (p, min, step = 0.05) => {
  const s = Math.sign(area(p)), flags = []
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-6) continue
    const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-s * t[1], s * t[0]]
    for (let k = 0; k < Math.floor(L / step); k++) {
      const o = [a[0] + t[0] * (k + 0.5) * step, a[1] + t[1] * (k + 0.5) * step]
      let best = Infinity
      for (let j = 0; j < p.length; j++) {
        if (j === i) continue
        const c = p[j], e = p[(j + 1) % p.length], f = [e[0] - c[0], e[1] - c[1]]
        const den = n[0] * f[1] - n[1] * f[0]
        if (Math.abs(den) < 1e-12) continue
        const w = [c[0] - o[0], c[1] - o[1]]
        const tt = (w[0] * f[1] - w[1] * f[0]) / den, uu = (w[0] * n[1] - w[1] * n[0]) / den
        if (tt > 1e-6 && uu >= -1e-9 && uu <= 1 + 1e-9) best = Math.min(best, tt)
      }
      flags.push(best < min)
    }
  }
  let run = 0, most = 0
  for (const f of [...flags, ...flags]) { run = f ? run + 1 : 0; most = Math.max(most, run) }
  return Math.min(most, flags.length) * step
}

test('the South Palace builds its ranges', () => {
  assert.equal(r.status, 0, r.stderr)
  assert.equal(out.decks.length, out.ranges, 'a deck for every range')
  assert.equal(out.wells.length, out.ranges, 'a well for every range')
})

test('no range well is a sliver: no angle under 20 degrees, never under 1.5 m wide for more than 1 m', () => {
  for (const [k, w] of out.wells.entries()) {
    const id = out.decks[k].id
    assert.ok(Math.min(...angles(w)) >= 20, `${id}: an interior angle of ${Math.min(...angles(w)).toFixed(1)} degrees`)
    const run = narrowRun(w, 1.5)
    assert.ok(run <= 1, `${id}: under 1.5 m wide along ${run.toFixed(2)} m of its edge`)
  }
})
