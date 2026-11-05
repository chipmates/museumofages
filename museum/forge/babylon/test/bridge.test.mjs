// node --test forge/babylon/test/*.test.mjs (stop 12's bridge, the old stop 13: its piers, deck, river and hold, built in a
// child node that strips its types)
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
import { buildPlan, makeFrame } from ${url('map/plan.ts')}
import { makePath } from ${url('map/path.ts')}
import { sunAt } from ${url('map/sun.ts')}
import { buildBridge, inPoly } from ${url('bridge/bridge-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), bp = j(${url('bridge/bridge-plan.json')}), cams = j(${url('map/map-cams.json')})
const built0 = buildPlan(plan)
const b = buildBridge(built0, plan, bp)
const F = makeFrame(plan)
const fr = b.frame
const tc = (p) => { const r = [p[0] - fr.a[0], p[1] - fr.a[1]]; return [r[0] * fr.d[0] + r[1] * fr.d[1], r[0] * fr.n[0] + r[1] * fr.n[1]] }
// each pier's outline in the axis frame: its extent along and across, its tip (the northmost point) and how wide it is
// a metre behind the tip
const piers = b.piers.map((p) => {
  const q = p.outline.map(tc), ts = q.map((x) => x[0] - p.t), cs = q.map((x) => x[1])
  const cMax = Math.max(...cs), cMin = Math.min(...cs)
  const tip = q[cs.indexOf(cMax)]
  const behind = q.filter((x) => x[1] >= cMax - 1.0).map((x) => x[0] - p.t)
  const zTip = p.outline[cs.indexOf(cMax)][1]
  return { n: p.n, t: p.t, along: Math.max(...ts) - Math.min(...ts), across: cMax - cMin, tipU: tip[0] - p.t, nearTip: Math.max(...behind) - Math.min(...behind), north: zTip < p.c[1], brickTop: p.brickTop, capTop: p.capTop }
})
const path = makePath(cams, F.s, (x, z) => b.built.stand(x, z))
const keys = path.keys.filter((k) => k.stop === 13)
const still = keys.find((k) => k.still)
const hold = path.sample(still.t)
const [hE, hN] = F.utm(hold.pos[0], hold.pos[2])
const deckAt = tc([hold.pos[0], hold.pos[2]])
const brg = (x, z) => ((Math.atan2(x - hold.pos[0], -(z - hold.pos[2])) * 180) / Math.PI + 360) % 360
const first = path.sample(keys[0].t)
const [fE, fN] = F.utm(first.pos[0], first.pos[2])
const water = built0.water.find((w) => w.id === 'euphrates')
// the open water along the bridge's axis, between the land piers' river faces (the east land pier stands 40 m out
// from the quay into the river)
const LP = plan.bridge.abutments
let open = 0
for (let t = -60; t <= b.frame.length + 60; t += 0.25) { const p = fr.at(t, 0); if (inPoly(p, water.poly) && !(t >= LP.east.from && t <= LP.east.to) && !(t >= LP.west.from && t <= LP.west.to)) open += 0.25 }
const wet = b.plants.filter((p) => inPoly([p.x, p.z], water.poly)).length
// every plant on the west bank: west of the water's westmost edge at its own northing
const westEdge = (z) => { let x = Infinity; const q = water.poly; for (let i = 0; i < q.length; i++) { const a = q[i], c = q[(i + 1) % q.length]; if ((a[1] > z) !== (c[1] > z)) x = Math.min(x, a[0] + ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1])) } return x }
const eastOfMid = b.plants.filter((p) => !(p.x < westEdge(p.z) + 0.5)).length
console.log(JSON.stringify({ facts: b.facts, piers, waterLevel: water.level, open, wet, eastOfMid,
  hold: { E: hE, N: hN, eye: hold.pos[1] - b.deckTop(deckAt[0]), lookY: hold.look[1] - hold.pos[1], hour: hold.hour, look: brg(hold.look[0], hold.look[2]), sun: sunAt(hold.hour) },
  first: { E: fE, N: fN, cut: keys[0].cut, street: b.built.streetAt(first.pos[0], first.pos[2]) } }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the bridge builds', () => assert.equal(r.status, 0, r.stderr))

test('six free piers, each 21 m across the flow by 9 m along the bridge, 9 m apart', () => {
  assert.equal(out.piers.length, 6)
  for (const p of out.piers) {
    near(p.across, 21, 0.3, `pier ${p.n} across`)
    near(p.along, 9, 0.2, `pier ${p.n} along`)
  }
  for (let i = 1; i < out.piers.length; i++) near(out.piers[i].t - out.piers[i - 1].t - out.piers[i - 1].along, 9, 0.2, `gap before pier ${i + 1}`)
})

test('each pier points north into the current, its bow narrowing to a tip on its middle line', () => {
  for (const p of out.piers) {
    assert.ok(p.north, `pier ${p.n}: its tip lies south of its centre`)
    near(p.tipU, 0, 0.05, `pier ${p.n} tip off the middle line`)
    assert.ok(p.nearTip < 3.5, `pier ${p.n} is ${p.nearTip} m wide a metre behind its tip`)
  }
  near(out.facts.pierSize.batter, 0.08, 1e-9, 'batter')
})

test('the land piers: the east one about 40 m to the quay, the west 7.6 m, the last gap about 14 m, the span about 126 m', () => {
  const [e0, e1] = out.facts.landPiers.east, [w0, w1] = out.facts.landPiers.west
  near(e1 - e0, 40.9, 1.0, 'east land pier')
  near(w1 - w0, 7.6, 0.2, 'west land pier')
  const last = out.piers[5]
  near(w0 - (last.t + last.along / 2), 14, 0.8, 'the last gap')
  near(out.facts.landPiers.span, 126, 0.5, 'between the land piers')
})

test('the river 123 to 126 m wide at the bridge, its water at -1.0 m, no plant in it, none on the city side', () => {
  assert.equal(out.waterLevel, -1.0)
  assert.equal(out.facts.water, -1.0)
  assert.ok(out.open >= 122.5 && out.open <= 126.5, `the open water along the axis is ${out.open} m`)
  assert.equal(out.wet, 0, 'plants in the water')
  assert.equal(out.eastOfMid, 0, 'plants off the west bank')
})

test('the deck 9 m wide at the street level, its brick and capping under it', () => {
  assert.equal(out.facts.deck.w, 9)
  for (const y of out.facts.deck.top) assert.ok(y >= 2.3 && y <= 3.2, `deck top ${y}`)
  for (const p of out.piers) assert.ok(p.capTop - p.brickTop > 0.3 && p.capTop < 3.8, JSON.stringify(p))
})

test('the hold: on the deck over the river, the eye 1.65 m up and level, about 18:12, the sun low ahead and a little right', () => {
  near(out.hold.eye, 1.65, 0.05, 'eye over the deck')
  // level: the look point 200 m off within a centimetre of the eye's height
  near(out.hold.lookY, 0, 0.01, 'a level look')
  near(out.hold.hour, 18.2, 0.02, 'the hour')
  near(out.hold.sun.azimuth, 278, 1.5, 'sun azimuth')
  assert.ok(out.hold.sun.elevation > 0.5 && out.hold.sun.elevation < 4, `sun ${out.hold.sun.elevation} degrees up`)
  // walking west on the deck the sun stands 12 to 13 degrees right of the deck's line
  near(out.hold.sun.azimuth - out.facts.axis.bearing, 13, 1.5, 'the sun right of the deck')
  assert.ok(Math.abs(out.hold.look - out.hold.sun.azimuth) < 10, `look ${out.hold.look}, sun ${out.hold.sun.azimuth}`)
})

test('the way in cuts to the street west of Gate 8, on its line', () => {
  assert.equal(out.first.cut, true)
  near(out.first.E, 445618, 3, 'first key easting')
  assert.ok(out.first.street.d <= out.first.street.w / 2, JSON.stringify(out.first.street))
})
