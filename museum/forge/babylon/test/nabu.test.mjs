// node --test forge/babylon/test/*.test.mjs (stop 8's temple built in a child node that strips its types)
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
import { buildCourt } from ${url('court/court-geom.ts')}
import { buildNabu, SURF } from ${url('nabu/nabu-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')})
const court = buildCourt(buildPlan(plan, { houses: false }), plan, j(${url('court/court-plan.json')}))
const n = buildNabu(court.built, plan, j(${url('nabu/nabu-plan.json')}))
const box = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.min.y, b.max.y] }
const surf = Object.fromEntries(n.bodies.map((b) => { const s = b.geometry.getAttribute('surf'), c = {}; for (let i = 0; i < s.count; i++) c[s.getX(i)] = 1; return [b.id, Object.keys(c).map(Number)] }))
const F = n.F, x = (E) => E - plan.frame.E0, z = (N) => plan.frame.N0 - N
console.log(JSON.stringify({ facts: n.facts, ids: n.bodies.map((b) => b.id), left: n.built.prisms.map((p) => p.id), SURF, surf,
  heights: Object.fromEntries(n.bodies.map((b) => [b.id, box(b.geometry)])),
  stand: { court: n.built.stand(x(445853), z(3600414)), small: n.built.stand(x(445866), z(3600405)), apron: n.built.stand(x(445874.5), z(3600424)) },
  pave: F.pave, apronTop: F.apronTop, court: F.court, altar: F.altar, pedestal: F.pedestal, niche: F.niche, cellaRoom: F.rooms.cella, doors: F.doors,
  doorBoxes: (() => { const g = n.bodies.find((b) => b.id === 'nabu-doors').geometry, p = g.getAttribute('position'), s = g.getAttribute('surf'), out = { leaf: [], sill: [] }; for (let i = 0; i < p.count; i += 36) { const xs = [], ys = [], zs = []; for (let k = i; k < i + 36; k++) { xs.push(p.getX(k)); ys.push(p.getY(k)); zs.push(p.getZ(k)) } out[s.getX(i) === SURF.leaf ? 'leaf' : 'sill'].push([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)]) } return out })(),
  E0: plan.frame.E0, N0: plan.frame.N0 }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the temple builds', () => assert.equal(r.status, 0, r.stderr))

test('the temple stands at the dug sizes (P2021 p. 167 to 170)', () => {
  const f = out.facts
  near(f.area, 1080, 25, 'built area')
  near(f.court[0], 8.7, 0.01, "Nabu's court east-west"); near(f.court[1], 14.8, 0.01, "Nabu's court north-south")
  near(f.cella.width, 4.9, 0.01, "Nabu's cella width"); near(f.cella.area, 54, 0.5, "Nabu's cella area")
  near(f.small[0], 6.6, 0.01, 'smaller court east-west'); near(f.small[1], 9.1, 0.01, 'smaller court north-south')
  near(f.smallCella.width, 3.0, 0.01, "the goddess's cella width"); near(f.smallCella.area, 20, 0.5, "the goddess's cella area")
  for (const [k, v] of Object.entries(f.walls)) near(v, 1.8, 0.01, `wall ${k}`)
})

test('each cella lies south of its court, behind a wall', () => {
  assert.equal(out.facts.cella.southOfCourt, true)
  assert.equal(out.facts.smallCella.southOfCourt, true)
})

test('the floor at +8.0, every door plain, nothing over the 9.0 m the model allows', () => {
  const f = out.facts
  assert.equal(f.floor, 8.0)
  assert.ok(f.doors.every((d) => d.flat), 'a door is not plain')
  assert.ok(f.merlonTop <= f.floor + 9.0 + 1e-6, `battlements at ${f.merlonTop}`)
  assert.ok(out.heights['nabu'][1] <= f.floor + 9.0 + 1e-6, `the temple's top at ${out.heights['nabu'][1]}`)
})

test("the map's block is taken off and the temple's bodies replace it", () => {
  assert.ok(!out.left.includes('nabu'), "the map's nabu block is still drawn")
  assert.deepEqual(out.ids, ['nabu', 'nabu-ashratum', 'nabu-altar', 'nabu-doors', 'nabu-apron'])
})

test('the smaller court has its black wall, Nabu\'s court its banded walls', () => {
  assert.ok(out.surf['nabu'].includes(out.SURF.black), 'no black wall')
  assert.ok(out.surf['nabu'].includes(out.SURF.courtWall), 'no banded court wall')
  assert.ok(out.surf['nabu'].includes(out.SURF.bandedRoom), 'no banded cella')
})

test('a visitor stands on the paving inside and on the open ground before the gate', () => {
  near(out.stand.court, out.pave, 1e-6, "in Nabu's court")
  near(out.stand.small, out.pave, 1e-6, 'in the smaller court')
  near(out.stand.apron, out.apronTop, 1e-6, 'before the gate')
})

test('the cella holds the pedestal as drawn, its niche over it', () => {
  const p = out.pedestal, r = out.cellaRoom
  near(p.x1 - p.x0, 4.7, 0.01, 'pedestal width (C6.2)')
  near(p.z1 - p.z0, 2.6, 0.01, 'pedestal depth (C6.2)')
  near((p.x0 + p.x1) / 2, 445853.0 - out.E0, 0.01, "pedestal on the court's axis")
  near(p.z1, r.z1, 0.01, "pedestal against the cella's back wall")
  near(out.facts.pedestal.top, 1.23, 0.005, 'pedestal top over the floor (ours: 1.2 m over the paving)')
  assert.ok(out.niche.sill > p.top && out.niche.sill - p.top < 0.05, "the niche's sill just over the pedestal's top")
  assert.ok(out.surf['nabu'].includes(out.SURF.pedestal), 'no pedestal surface')
})

test("the court's altars stand before the cella's door, inside the court, clear of feature 6's floor", () => {
  const c = out.court, cella = out.doors.find((d) => d.id === 'cella')
  for (const a of out.altar) {
    assert.ok(a.x0 >= c.x0 && a.x1 <= c.x1 && a.z0 >= c.z0 && a.z1 <= c.z1 + 0.06, `an altar outside the court: ${JSON.stringify(a)}`)
    // feature 6's room: E 445851 to 445855, N 3600412 to 3600416 (scene z -16 to -12)
    const fx0 = 445851 - out.E0, fx1 = 445855 - out.E0, fz0 = out.N0 - 3600416, fz1 = out.N0 - 3600412
    assert.ok(a.x1 <= fx0 || a.x0 >= fx1 || a.z1 <= fz0 || a.z0 >= fz1, "an altar on feature 6's floor")
    assert.ok(a.top - out.pave <= 1.0 + 1e-6, 'an altar over 1 m')
  }
  const block = out.altar[0]
  near((block.x0 + block.x1) / 2, cella.c, 0.01, "the altar block on the cella door's axis")
  near(c.z1 - out.altar[1].z1, 0.9, 0.01, "the altar block 0.9 m off the court's south wall (C6.2)")
  for (const by of out.altar.slice(2)) assert.ok(by.x1 <= cella.box.x0 || by.x0 >= cella.box.x1, "a low block in the cella's door")
})

test('every door has a sill and open leaves standing against its reveal, never across it', () => {
  assert.equal(out.doorBoxes.sill.length, out.doors.length, 'a sill per door')
  for (const l of out.doorBoxes.leaf) {
    const d = out.doors.find((q) => l[0] >= q.box.x0 - 0.01 && l[1] <= q.box.x1 + 0.01 && l[4] >= q.box.z0 - 0.01 && l[5] <= q.box.z1 + 0.01)
    assert.ok(d, `a leaf outside every door's passage: ${l.map((v) => v.toFixed(2))}`)
    const across = d.wall === 'x' ? [l[4], l[5]] : [l[0], l[1]]
    assert.ok(across[1] - across[0] < 0.1, 'a leaf thicker than 10 cm across its door')
    const edge = Math.min(Math.abs(across[0] - (d.c - d.w / 2)), Math.abs(across[1] - (d.c + d.w / 2)))
    near(edge, 0.01, 0.002, 'a leaf 1 cm off its reveal')
    assert.ok(l[3] <= d.top - 0.05, 'a leaf touching its soffit')
  }
})

test("both courts' tops carry a coping and merlons", () => {
  for (const k of ['coping', 'merlon', 'altar', 'leaf', 'sill']) assert.ok(Object.values(out.surf).flat().includes(out.SURF[k]), `no ${k} surface`)
})

test("the courts' corner merlons keep the runs' own gap, and no two merlons meet", () => {
  const ms = out.facts.courtMerlons
  const sep = (a, b, i) => Math.max(b[i] - a[i + 1], a[i] - b[i + 1])
  for (let i = 0; i < ms.length; i++) for (let k = i + 1; k < ms.length; k++) {
    assert.ok(sep(ms[i], ms[k], 0) > 0.01 || sep(ms[i], ms[k], 2) > 0.01, `merlons meet: ${ms[i]} and ${ms[k]}`)
  }
  // a run's own gap, from the east and west runs' (lying along z) neighbours in Nabu's court
  const c = out.court, alongZ = ms.filter((m) => m[1] - m[0] < m[3] - m[2] && m[0] < c.x0 + 0.1 && m[2] > c.z0 - 0.1 && m[3] < c.z1 + 0.1).sort((p, q) => p[2] - q[2])
  const own = Math.min(...alongZ.slice(1).map((m, i) => m[2] - alongZ[i][3]))
  assert.ok(own > 0.4, `the west run's own gap ${own}`)
  for (const zc of [c.z0, c.z1]) {
    const corner = ms.find((m) => m[1] - m[0] > m[3] - m[2] && m[0] < c.x0 && Math.abs((m[2] + m[3]) / 2 - zc) < 0.8)
    const next = alongZ.reduce((b, m) => (Math.abs((m[2] + m[3]) / 2 - zc) < Math.abs((b[2] + b[3]) / 2 - zc) ? m : b))
    assert.ok(corner, `no corner merlon at z ${zc}`)
    const gap = Math.max(next[2] - corner[3], corner[2] - next[3])
    assert.ok(gap >= own - 0.1, `the corner at z ${zc}: gap ${gap.toFixed(2)} against the run's ${own.toFixed(2)}`)
  }
})
