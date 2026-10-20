// THE MAP'S SCALE CHECK: known distances measured on the geometry the page builds (plan.ts mounted in node),
// each against its printed source and a tolerance; the stop cameras' eye heights; the class tones against
// the house's --ui-sure-* tokens; the sun against the walk sheet's table. Exit 1 on any miss.
//
//   node --experimental-strip-types --no-warnings forge/babylon-map/scale-check.mjs [--json <out>]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = join(APP, 'src/wings/babylon/map')
const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
const { sunAt, hourOf } = await import(join(MAP, 'sun.ts'))
const plan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(MAP, 'map-cams.json'), 'utf8'))
const b = buildPlan(plan, { houses: false })
const F = makeFrame(plan)
const rows = []
const check = (name, measured, expected, tol, src, unit = 'm') => {
  const ok = Math.abs(measured - expected) <= tol
  rows.push({ name, measured: +measured.toFixed(3), expected, tol, unit, src, ok })
}
const prism = (id) => {
  const p = b.prisms.find((q) => q.id === id)
  if (!p) throw new Error(`no prism ${id}`)
  return p
}
const box = (id) => {
  const r = b.boxes.find((q) => q.id === id)
  if (!r) throw new Error(`no box ${id}`)
  return r
}
const dot = (a, d) => a[0] * d[0] + a[1] * d[1]
const extent = (polys, d) => {
  const v = polys.flatMap((p) => p.map((q) => dot(q, d)))
  return [Math.min(...v), Math.max(...v)]
}
const dist = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1])

// 1 the street: North Gate to the Ishtar Gate's north face along its line; the lion street's walls from the gate to the North Gate
const st = b.street
const iNG = plan.street.points.findIndex((p) => /North Gate/.test(p.note ?? ''))
const iIG = plan.street.points.findIndex((p) => /north face/.test(p.note ?? ''))
const gateA = F.dir(plan.frames.gate.bearing), gateC = F.dir(plan.frames.gate.bearing + 90)
const ng = prism('north-gate-l')
const ngSouth = extent([ng.poly], F.dir(plan.frames.lion.bearing))[0]
void st
const face = F.s(...plan.frames.gate.origin)
check('Ishtar Gate face to the North Gate\'s south face', ngSouth - dot(face, F.dir(plan.frames.lion.bearing)), 180, 10, 'P2021 p. 80: the North Gate some 180 m north along the street')
const lw = b.prisms.filter((p) => p.id.startsWith('lion-wall-w-')), le = b.prisms.filter((p) => p.id.startsWith('lion-wall-e-'))
const lionC = F.dir(plan.frames.lion.bearing + 90)
check('lion street, width between its walls', extent(le.map((p) => p.poly), lionC)[0] - extent(lw.map((p) => p.poly), lionC)[1], 20, 0.05, 'K1914 ch. V, P2021 p. 80: about 20 m between walls 7 m thick')
check('lion walls, thickness', extent([lw[0].poly], lionC)[1] - extent([lw[0].poly], lionC)[0], 7, 0.02, 'K1914 ch. V')

// 2 the gate: front gate across, door clear, complex length, main gate across
const fg = ['gate-front-l', 'gate-front-r', 'gate-front-lintel'].map((id) => prism(id).poly)
const [c0, c1] = extent(fg, gateC)
check('Ishtar Gate, front gate across', c1 - c0, 28, 0.02, 'K1918, P2021 p. 71 to 72: 28 m')
check('Ishtar Gate, front gate door clear', extent([prism('gate-front-r').poly], gateC)[0] - extent([prism('gate-front-l').poly], gateC)[1], 4.5, 0.02, 'GR part 8: 4.50 m clear')
const all = [...fg, ...['gate-main-l', 'gate-main-r'].map((id) => prism(id).poly)]
const [a0, a1] = extent(all, gateA)
check('Ishtar Gate, complex length along the axis', a1 - a0, 50, 0.02, 'P2021 p. 71: 50 m long')
const mg = ['gate-main-l', 'gate-main-r'].map((id) => prism(id).poly)
check('Ishtar Gate, main gate across', extent(mg, gateC)[1] - extent(mg, gateC)[0], 22, 0.02, 'K1918: 22 m')
const gc = [(extent(all, [1, 0])[0] + extent(all, [1, 0])[1]) / 2, (extent(all, [0, 1])[0] + extent(all, [0, 1])[1]) / 2]
check('Ishtar Gate, centre against its UTM point', dist(F.utm(...gc), [445780, 3600820]), 0, 3, 'P2021 p. 71: 445780 E 3600820 N')
const ngAll = b.prisms.filter((p) => p.id.startsWith('north-gate-')).map((p) => p.poly)
const ngc = [(extent(ngAll, [1, 0])[0] + extent(ngAll, [1, 0])[1]) / 2, (extent(ngAll, [0, 1])[0] + extent(ngAll, [0, 1])[1]) / 2]
check('North Gate, centre against its UTM point', dist(F.utm(...ngc), [445735, 3601035]), 0, 8, 'P2021 p. 230: 445735 E 3601035 N')
check('street, the Ishtar Gate to the North Gate, centre to centre', dist(gc, ngc), 220, 8, 'P2021 p. 71 and 230: the two gates\' UTM points, 220 m apart (WALK)')

// 3 Etemenanki
const t1 = box('tower-stage-1')
check('Etemenanki, base side', t1.sx, 91.5, 0.5, 'P2021 p. 153: 91.5 x 91.5 m (K1914: about 90 m)')
check('Etemenanki, base second side', t1.sz, 91.5, 0.5, 'P2021 p. 153')
check('Etemenanki, centre against its UTM point', dist(F.utm(t1.x, t1.z), [445640, 3600040]), 0, 8, 'P2021 p. 153: 445640 E 3600040 N; C6.2 read-off 445641.5, 3600034')
check('Etemenanki, total height (a guessed value inside its range)', b.facts.tower.height, 91.5, 0.01, 'P2021 Fig. 4.18 builds 91.5 m; range 66 to 91.5 (EV)')
const mid = b.ramps.find((r) => r.id === 'tower-stair-middle')
const towerA = F.dir(plan.frames.tower.bearing)
check('Etemenanki, middle stair starts out from the face', dot(mid.a, towerA) - dot([t1.x, t1.z], towerA) - t1.sx / 2, 51.6, 0.05, 'P2021 p. 156: 51.6 m')

// 4 the bridge
const ab = [box('bridge-abutment-east'), box('bridge-abutment-west')]
const bd = [Math.sin(265 * Math.PI / 180), -Math.cos(265 * Math.PI / 180)]
const axis = (() => { const a = F.s(...plan.bridge.axis[0]), c = F.s(...plan.bridge.axis[1]); const L = dist(a, c); return [(c[0] - a[0]) / L, (c[1] - a[1]) / L] })()
const inner = dot([ab[1].x, ab[1].z], axis) - ab[1].sx / 2 - (dot([ab[0].x, ab[0].z], axis) + ab[0].sx / 2)
check('bridge, between the abutments', inner, 126, 1, 'P2021 p. 204: abutments first 126 m apart')
const piers = b.boxes.filter((r) => r.id.startsWith('bridge-pier-'))
check('bridge, free piers', piers.length, 6, 0, 'P2021 p. 204: six free piers', 'count')
check('bridge, pier size along the bridge', piers[0].sx, 9, 0.01, 'P2021 p. 204: 21 x 9 m')
check('bridge, pier size across the bridge', piers[0].sz, 21, 0.01, 'P2021 p. 204')
check('bridge, gap between piers', dot([piers[1].x, piers[1].z], axis) - dot([piers[0].x, piers[0].z], axis) - 9, 9, 0.01, 'P2021 p. 204: 9 m apart')
check('bridge, easternmost pier against the sheet', F.utm(piers[0].x, piers[0].z)[0], 445512, 4, 'C6.2 read-off, E 445512')
check('bridge, westernmost pier against the sheet', F.utm(piers[5].x, piers[5].z)[0], 445422, 4, 'C6.2 read-off, E 445422')
const bp = F.s(445470, 3599830), bt = dot(bp, axis), off = Math.abs(dot(bp, [-axis[1], axis[0]]) - dot([ab[0].x, ab[0].z], [-axis[1], axis[0]]))
const inSpan = bt > dot([ab[0].x, ab[0].z], axis) && bt < dot([ab[1].x, ab[1].z], axis)
check('bridge, P2021\'s point lies on the span (metres off the axis)', inSpan ? off : 99, 0, 10, 'P2021 p. 204: 445470 E 3599830 N, given to 10 m; the WALK row calls it the east end, C6.2 draws it mid-river')
void bd

// 5 the precinct
const ew = b.prisms.filter((p) => p.id.startsWith('precinct-east-wall-'))
const ewLine = plan.walls.find((w) => w.id === 'precinct-east-wall').line.map((p) => F.s(...p))
const ewD = [(ewLine[1][0] - ewLine[0][0]) / dist(...ewLine), (ewLine[1][1] - ewLine[0][1]) / dist(...ewLine)]
const ewE = extent(ew.map((p) => p.poly), ewD)
check('Etemenanki precinct, east side length', ewE[1] - ewE[0], 409, 12, 'K1914: east side 409 m; P2021 p. 153: more than 400 m a side')
const nw = prism('precinct-north-wall')
const nwLine = plan.walls.find((w) => w.id === 'precinct-north-wall').line.map((p) => F.s(...p))
const nwD = [(nwLine[1][0] - nwLine[0][0]) / dist(...nwLine), (nwLine[1][1] - nwLine[0][1]) / dist(...nwLine)]
const nwE = extent([nw.poly], nwD)
check('Etemenanki precinct, north side length', nwE[1] - nwE[0], 400, 10, 'P2021 p. 153: more than 400 m a side (C6.2 draws the wall line)')
const gapW = extent([ew[1].poly], ewD)[0] - extent([ew[0].poly], ewD)[1]
check('Gate 5, opening', gapW, 30, 0.05, 'P2021 p. 211: about 30 m wide')

// 6 the South Palace's Main Courtyard and throne room
const rooms = prism('south-palace-rooms')
const hall = prism('throne-room-hall')
const court = rooms.holes[2]
const cz = court.map((p) => p[1]), cx = court.map((p) => p[0])
const hallWall = b.prisms.filter((p) => p.id.startsWith('throne-room-wall-'))
const hallNorth = Math.min(...hallWall.flatMap((p) => p.poly.map((q) => q[1])))
check('Main Courtyard, east to west', Math.max(...cx) - Math.min(...cx), 55, 0.05, 'P2021 p. 103: 55 x 61 m (K1914: 55 x 60)')
check('Main Courtyard, north to the throne room', hallNorth - Math.min(...cz), 61, 0.05, 'P2021 p. 103')
const hx = hall.poly.map((p) => p[0]), hz = hall.poly.map((p) => p[1])
check('throne room, inner length (outer less two 6 m walls)', Math.max(...hx) - Math.min(...hx) - 12, 51.9, 0.05, 'P2021 p. 103 to 105: 51.9 x 17.5 m, walls 6 m')
check('throne room, inner width (south face less the 6 m north wall)', Math.max(...hz) - hallNorth - 12, 17.5, 0.05, 'P2021 p. 103 to 105')

// 7 Esagila
const es = prism('esagila').poly
check('Esagila, north front', dist(es[0], es[1]), 79.3, 2, 'K1914 ch. XXXV: 79.3 m (north front)')
check('Esagila, west front', dist(es[0], es[3]), 85.8, 2, 'K1914 ch. XXXV: 85.8 m (west front)')

// 8 the moat and the street levels at their measured points
const moat = b.water.find((w) => w.id === 'inner-east-moat')
const half = moat.poly.length / 2
check('inner moat, width', dist(moat.poly[0], moat.poly[moat.poly.length - 1]), 80, 3, 'P2021 p. 51, 59: about 80 m')
for (const [note, want, tol, src] of [[/North Gate/, 7.5, 0.01, 'P2021 p. 228'], [/north face/, 15.4, 0.01, 'K1918 p. 8: +15.40'], [/Gate 5/, 3.0, 0.01, 'P2021 Fig. 5.12: +3.0'], [/turn west/, 2.4, 0.2, 'P2021 p. 208: +2.1 to +2.5']]) {
  const i = plan.street.points.findIndex((p) => note.test(p.note ?? ''))
  check(`street level, ${plan.street.points[i].note.split(',')[0]}`, b.street[i].level, want, tol, src)
}
const iSP = plan.street.points.findIndex((p) => /survey point 2/.test(p.note ?? ''))
check('street slope, survey point 2 up to the Ishtar Gate (percent)', ((15.4 - 12.5) / (st[iIG].s - st[iSP].s)) * 100, 3, 0.5, 'P2021 p. 228 and note 29: about 3 percent between +12.5 and +15.40', '%')
check('street slope, North Gate up to survey point 2, walkable (percent)', ((12.5 - 7.5) / (st[iSP].s - st[iNG].s)) * 100, 5, 1, '[Ours] a guess: no source gives this stretch; under 6 percent', '%')
void half

// 9 the cameras: eye 1.6 to 1.7 m over what the visitor stands on, at every eye-level stop
const stand = (x, z) => { const s = b.streetAt(x, z); return s.d <= s.w / 2 + 0.5 ? s.level : b.ground(x, z) }
for (const s of cams.stops) for (const fr of ['desktop', 'phone']) {
  const v = s[fr]
  if (v.y !== 'eye') continue
  const [x, z] = F.s(...v.at)
  check(`eye height, stop ${s.n} ${fr}`, cams.eye, 1.65, 0.05, 'museum two PROGRAMME rule 23: 1.60 to 1.70 m over the floor the visitor stands on')
  rows[rows.length - 1].standsOn = +stand(x, z).toFixed(2)
}

// 10 the class tones against the house's tokens
const index = readFileSync(join(APP, 'index.html'), 'utf8')
for (const [k, c] of Object.entries(plan.classes).filter(([k]) => k.length === 1)) {
  const m = new RegExp(`${c.token}:\\s*(#[0-9a-fA-F]{6})`).exec(index)
  rows.push({ name: `class ${k} tone equals ${c.token}`, measured: m?.[1] ?? 'missing', expected: c.colour, tol: 0, unit: 'hex', src: 'museum/index.html', ok: (m?.[1] ?? '').toLowerCase() === c.colour.toLowerCase() })
}

// 11 the sun against the walk sheet's table
for (const [t, az, el] of [['16:45', 267, 20], ['17:00', 269, 17], ['17:30', 273, 11], ['18:00', 277, 4]]) {
  const s = sunAt(hourOf(t))
  check(`sun azimuth at ${t}`, s.azimuth, az, 1, 'WALK, GR 5.1 formula', 'deg')
  check(`sun elevation at ${t}`, s.elevation, el, 1, 'WALK, GR 5.1 formula', 'deg')
}

const bad = rows.filter((r) => !r.ok)
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.measured} ${r.unit} (source ${r.expected}, tolerance ${r.tol}) [${r.src}]${r.standsOn !== undefined ? ` stands on +${r.standsOn}` : ''}`)
console.log(`${rows.length - bad.length} of ${rows.length} ok`)
const j = process.argv.indexOf('--json')
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(rows, null, 1))
process.exit(bad.length ? 1 : 0)
