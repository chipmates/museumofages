// THE GATE'S FIDELITY CHECK: mounts the pure geometry in node and prints every number the brief keeps,
// the sun and the shadows it throws on the face, the forecourt and the street, the street's profile and the
// frames. With --facts <json> it also reads the page's own numbers (`window.__gate.facts()`, written by shoot.mjs)
// and checks them against the plan.
//
//   node --experimental-strip-types --no-warnings forge/babylon-gate/fidelity.mjs --plan-only [--hours 16:00,17:00] [--json <abs file>]
//   node --experimental-strip-types --no-warnings forge/babylon-gate/fidelity.mjs --facts <abs facts.json> [--json <abs file>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGate, gateFrame, hourOf, sunAt, sunVector } from '../../src/wings/babylon/gate/gate-geom.ts'
import { animalField, jointConflicts } from '../../src/wings/babylon/gate/gate-relief.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = join(HERE, '../../src/wings/babylon/gate')
const plan = JSON.parse(readFileSync(join(GATE, 'gate-plan.json'), 'utf8'))
const cams = (() => { try { return JSON.parse(readFileSync(join(GATE, 'gate-cams.json'), 'utf8')) } catch { return null } })()
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
  else { opt[a.slice(2)] = next; i++ }
}
const out = { ok: [], fail: [], numbers: {} }
const line = (s) => console.log(s)
const keep = (name, got, want, tol, note = '') => {
  const ok = Math.abs(got - want) <= tol + 1e-9
  ;(ok ? out.ok : out.fail).push(name)
  line(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${typeof got === 'number' ? +got.toFixed(4) : got} (want ${want} +- ${tol})${note ? ' ' + note : ''}`)
}
const B = buildGate(plan)
const F = gateFrame(plan)

/* ── ray casting on the bodies: boxes exactly, prisms by their side faces and top ── */
const solids = []
for (const b of [...B.boxes, ...B.beams]) solids.push({ kind: 'box', id: b.id, lo: [b.x0, b.y0, b.z0], hi: [b.x1, b.y1, b.z1] })
for (const a of B.arches) {
  // the arch piece: two boxes beside the half-disc and one above it is close enough for the sun's test
  solids.push({ kind: 'box', id: a.id + '-top', lo: [a.x0, a.springing + a.r, a.z0], hi: [a.x1, a.top, a.z1] })
}
for (const p of B.prisms) solids.push({ kind: 'prism', id: p.id, poly: p.poly, y0: p.y0, y1: p.y1 })
function hitBox(o, d, lo, hi) {
  let t0 = 1e-4, t1 = 1e9
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k]
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, b)
    if (t0 > t1) return false
  }
  return true
}
function inPoly(x, z, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
function hitPrism(o, d, s) {
  for (let i = 0; i < s.poly.length; i++) {
    const a = s.poly[i], b = s.poly[(i + 1) % s.poly.length]
    const ex = b[0] - a[0], ez = b[1] - a[1]
    const den = d[0] * ez - d[2] * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((a[0] - o[0]) * ez - (a[1] - o[2]) * ex) / den
    const u = ((a[0] - o[0]) * d[2] - (a[1] - o[2]) * d[0]) / den
    if (t > 1e-4 && u >= 0 && u <= 1) { const y = o[1] + d[1] * t; if (y >= s.y0 && y <= s.y1) return true }
  }
  if (Math.abs(d[1]) > 1e-9) { const t = (s.y1 - o[1]) / d[1]; if (t > 1e-4 && inPoly(o[0] + d[0] * t, o[2] + d[2] * t, s.poly)) return true }
  return false
}
const lit = (p, s) => !solids.some((q) => (q.kind === 'box' ? hitBox(p, s, q.lo, q.hi) : hitPrism(p, s, q)))

/* ── P1: the frame, the street, the sun, the shadows ── */
line('== the frame')
const [FE, FN] = plan.frame.face
line(`face point (axis, door wall's outer plane, +15.40): UTM ${FE} E, ${FN} N (read off sheet 2.28)`)
const [cx, cz] = F.fromUtm(445780, 3600820)
line(`P2021's gate centre point 445780 E, 3600820 N lies ${(-cz).toFixed(2)} m behind the face along the axis, ${(-cx).toFixed(2)} m ${cx < 0 ? 'east' : 'west'} of it (complex 50 m long: its middle 23.0 m behind the face)`)
const [mx, mz] = F.fromUtm(445772.7, 3600843.9)
line(`the map's gate frame origin (445772.7, 3600843.9) lies at x ${mx.toFixed(2)}, z ${mz.toFixed(2)} in this frame`)
const M = F.toMap(445700, 3600400)
line(`gate to map scene (column-major 4x4): [${M.map((v) => +v.toFixed(5)).join(', ')}]`)
line(`face normal: ${plan.frame.faceNormalTrue} true, ${plan.frame.zGrid} grid (convergence ${plan.frame.convergence}); +x ${(plan.frame.faceNormalTrue - 90 + 360) % 360} true`)
out.numbers.frame = { face: plan.frame.face, centreOffset: [cx, cz], mapOrigin: [mx, mz], toMap: M }

line('\n== the street (German zero; y = level - 15.40)')
for (const p of B.facts.street) line(`  a ${p.a} m: measured +${p.level}, built +${p.atLevel}`)
for (const g of B.facts.grades) line(`  grade ${g.from} to ${g.to} m: ${g.percent} percent`)
const tp2 = plan.street.levels.find((p) => p.utm && p.level === 12.56)
const [tx, tz] = F.fromUtm(...tp2.utm)
line(`  triangulation point 2 at z ${tz.toFixed(2)}, ${(-tx).toFixed(2)} m east of the axis; grade face to point 2: ${((100 * (15.4 - 12.56)) / tz).toFixed(2)} percent`)
for (const p of plan.street.levels) keep(`street level at a ${p.a}`, B.level(p.a) + plan.frame.level0, p.level, 0.05)
out.numbers.street = { profile: B.facts.street, grades: B.facts.grades, tp2: [tx, tz] }

line('\n== the sun (local apparent solar time, 20 days after the spring equinox, latitude 32.5434, obliquity 23.76)')
const hours = String(opt.hours ?? '16:00,16:30,16:45,17:00,17:15,17:30,17:45,18:00').split(',')
const tw = plan.front.towers, x0 = tw.gap / 2, x1 = x0 + tw.w, hd = plan.front.door / 2
const door = []
const sunRows = []
for (const hh of hours) {
  const h = hourOf(hh)
  const s = sunAt(plan, h)
  const v = sunVector(plan, h)
  const face = Math.max(0, v[2])
  // the door zone: the door wall beside the door (both sides) and the arch's face, 0 to the springing
  const share = (pts) => pts.filter((p) => lit(p, v)).length / Math.max(1, pts.length)
  const grid = (xa, xb, ya, yb, z, st = 0.2) => { const o = []; for (let x = xa + st / 2; x < xb; x += st) for (let y = ya + st / 2; y < yb; y += st) o.push([x, y, z]); return o }
  const doorW = grid(hd, x0, 0.1, plan.front.arch.springing, 0.03)
  const doorE = grid(-x0, -hd, 0.1, plan.front.arch.springing, 0.03)
  const over = grid(-hd, hd, plan.front.arch.crown, plan.front.wallTop.value, 0.03)
  const towerW = grid(x0, x1, 0.1, 12.56, tw.proj + 0.03)
  const towerE = grid(-x1, -x0, 0.1, 12.56, tw.proj + 0.03)
  // the edge of the west tower's shadow on the door wall: the westmost lit x at 3 m
  let edge = null
  for (let x = x0 - 0.05; x > -x0; x -= 0.05) if (lit([x, 3, 0.03], v)) { edge = x; break }
  const fc = []
  for (let x = plan.forecourt.eastWall.inner + 0.25; x < plan.forecourt.westWall.inner; x += 0.5) for (let z = 0.25; z < plan.forecourt.depth; z += 0.5) if (!(Math.abs(x) < x1 && z < tw.proj)) fc.push([x, B.level(z) + 0.02, z])
  const stp = []
  for (let s0 = 21; s0 < 66; s0 += 0.5) for (let t = -B.street.halfWidth + 0.25; t < B.street.halfWidth; t += 0.5) { const x = s0 * B.street.dir[0] + t * Math.cos(Math.atan2(B.street.dir[0], B.street.dir[1])), z = s0 * B.street.dir[1] - t * Math.sin(Math.atan2(B.street.dir[0], B.street.dir[1])); stp.push([x, B.level(z) + 0.02, z]) }
  const row = { hour: hh, azimuth: +s.azimuth.toFixed(1), elevation: +s.elevation.toFixed(1), faceLight: +face.toFixed(3), sun: v.map((q) => +q.toFixed(3)), doorWest: +share(doorW).toFixed(2), doorEast: +share(doorE).toFixed(2), overDoor: +share(over).toFixed(2), towerFrontWest: +share(towerW).toFixed(2), towerFrontEast: +share(towerE).toFixed(2), towerShadowEdgeX: edge === null ? null : +edge.toFixed(2), forecourt: +share(fc).toFixed(2), street21to66: +share(stp).toFixed(2), flankEast: +(Math.max(0, v[0])).toFixed(3) }
  sunRows.push(row)
  line(`  ${hh}: az ${row.azimuth}, el ${row.elevation}, face light ${row.faceLight}, sun (gate frame) [${row.sun.join(', ')}]; lit: door wall west ${row.doorWest}, east ${row.doorEast}, over the arch ${row.overDoor}, tower fronts W ${row.towerFrontWest} E ${row.towerFrontEast}; west tower's shadow on the door wall reaches x ${row.towerShadowEdgeX} (door ${-hd} to ${hd}); forecourt floor ${row.forecourt}, street 21 to 66 m ${row.street21to66}; the east tower's inner flank (faces west) light ${row.flankEast}`)
  door.push(row)
}
out.numbers.sun = sunRows
// the facade's shadow line at 17:00: the lowest lit height per metre across the face
{
  const v = sunVector(plan, hourOf(plan.hour.stills))
  const cols = []
  for (let x = -14; x <= 14; x += 1) {
    const z = Math.abs(x) >= x0 && Math.abs(x) <= x1 ? tw.proj + 0.03 : 0.03
    if (Math.abs(x) < hd) continue
    let lo = null
    for (let y = 0.05; y < 15; y += 0.05) if (lit([x, y, z], v)) { lo = y; break }
    cols.push(`${x}:${lo === null ? 'shade' : lo.toFixed(1)}`)
  }
  line(`  shadow line on the face at ${plan.hour.stills} (x: lowest lit height, m; +x west): ${cols.join(' ')}`)
  out.numbers.shadowLine = cols
}

line('\n== the plan in the scene (pure geometry)')
const f = B.facts.front, m = B.facts.main
keep('front towers wide', f.towerW, plan.front.towers.w, 0.02)
keep('front towers project', f.towerProj, plan.front.towers.proj, 0.02)
keep('front tower gap', f.towerGap, plan.front.towers.gap, 0.02)
keep('front wall', f.frontWall, plan.front.frontWall, 0.02)
keep('front other walls', f.walls, plan.front.walls, 0.02)
keep('front chamber long', f.chamber[0], plan.front.chamber[0], 0.02)
keep('front chamber deep', f.chamber[1], plan.front.chamber[1], 0.02)
keep('front block across', f.across, plan.front.across, 0.02)
keep('front block along', f.along, plan.front.along, 0.02)
keep('front door clear', f.door, plan.front.door, 0.02)
keep('main towers wide', m.towerW, plan.main.towers.w, 0.02)
keep('main towers project', m.towerProj, plan.main.towers.proj, 0.02)
keep('main tower gap', m.towerGap, plan.main.towers.gap, 0.02)
keep('main walls', m.walls, plan.main.walls, 0.02)
keep('main chamber long', m.chamber[0], plan.main.chamber[0], 0.02)
keep('main chamber wide', m.chamber[1], plan.main.chamber[1], 0.02)
keep('main block along', m.along, plan.main.along, 0.05)
keep('main block across', m.across, plan.main.across, 0.02)
keep('court', m.court, plan.court.depth, 0.02)
keep('complex length', m.complex, 50, 0.1)
keep('arch crown (G)', f.crown, plan.front.arch.crown, 0.001)
keep('front walls (G)', f.wallTop, plan.front.wallTop.value, 0.001)
keep('front towers (G)', f.towerTop, plan.front.towerTop.value, 0.001)
keep('main walls (G)', m.wallTop, plan.main.wallTop.value, 0.001)
keep('main towers (G)', m.towerTop, plan.main.towerTop.value, 0.001)
// K1918 p. 47: the main gate stood at least one storey, 3 to 4 m, over the front gate: a floor, not a size
keep('main gate at least a storey over the front gate', m.wallTop - f.wallTop >= 3 ? 1 : 0, 1, 0, `(walls ${+(m.wallTop - f.wallTop).toFixed(2)} m higher; at least 3)`)
keep('main towers over the front towers', m.towerTop - f.towerTop >= 3 ? 1 : 0, 1, 0, `(${+(m.towerTop - f.towerTop).toFixed(2)} m)`)
keep('forecourt width', B.facts.forecourt.width, 32, 1.5, '(read off, about 32)')
for (const [k, g] of [['front', plan.front], ['main', plan.main]]) {
  for (const key of ['wallTop', 'towerTop', 'arch']) {
    const v = key === 'arch' ? g.arch.crown : g[key].value, r = key === 'arch' ? g.arch.range : g[key].range
    keep(`${k} ${key} inside its range ${r.join('..')}`, v >= r[0] && v <= r[1] ? 1 : 0, 1, 0)
  }
}
line('\n== the chosen heights (class G), their ranges and their sources')
for (const [g, name] of [['front', 'front gate'], ['main', 'main gate']]) for (const k of ['wallTop', 'towerTop', 'arch']) {
  const h = plan[g]?.[k]
  if (!h || typeof h !== 'object') continue
  line(`  ${name} ${k}: ${h.value ?? h.crown} (range ${JSON.stringify(h.range)}, ${h.cls}); ${h.src}${h.record ? `; record: ${typeof h.record === 'string' ? h.record : JSON.stringify(h.record)}` : ''}`)
}
line('\n== the rows')
const C = plan.course
keep('course', C * 10, 0.86, 1e-9, '(10 courses, m)')
keep('row pitch (courses)', plan.rows.pitch, plan.rows.animal + plan.rows.plain, 0)
line(`  row pitch ${(plan.rows.pitch * C).toFixed(3)} m; animal ${(plan.rows.animal * C).toFixed(3)} m; plinth 0 to ${(plan.rows.plinth * C).toFixed(3)} m`)
line(`  the rows' classes: ${plan.rows.cls}, their count ${plan.rows.countCls}; sources and row 11: ${plan.rows.src}`)
const rowsBy = {}
for (const p of B.panels) {
  const key = `${p.face} row ${p.row}`
  rowsBy[key] = rowsBy[key] ?? { kind: p.kind, dirs: new Set(), y0: p.y0, n: 0 }
  rowsBy[key].dirs.add(p.dir)
  rowsBy[key].n++
  if (rowsBy[key].kind !== p.kind) out.fail.push(`mixed row ${key}`)
}
const byRow = {}
for (const p of B.panels.filter((q) => q.row > 0)) {
  byRow[p.row] = byRow[p.row] ?? { kinds: new Set(), faces: {} }
  byRow[p.row].kinds.add(p.kind)
  byRow[p.row].faces[p.face] = (byRow[p.row].faces[p.face] ?? 0) + 1
}
for (const [r, v] of Object.entries(byRow)) {
  const facade = Object.entries(v.faces).filter(([fid]) => /^(tower-|door-)/.test(fid)).reduce((a, [, n]) => a + n, 0)
  line(`  row ${r}: ${[...v.kinds].join('+')}, ${facade} on the front gate's facade, faces ${Object.entries(v.faces).map(([k2, n]) => `${k2} ${n}`).join(', ')}`)
  if (v.kinds.size !== 1) out.fail.push(`row ${r} mixes kinds`)
  if (+r <= plan.rows.facade) keep(`row ${r} animals on the facade`, facade, 8, 0)
}
for (const [k2, v] of Object.entries(rowsBy)) if (v.dirs.size !== 1) out.fail.push(`${k2} walks two ways`)
const dirsOk = B.panels.every((p) => {
  if (p.kind === 'lion') return (p.uDir[2] * p.dir) > 0
  if (Math.abs(p.normal[2]) > 0.5) { const toDoor = -Math.sign(p.origin[0] + p.uDir[0] * 0.7); return Math.sign(p.uDir[0] * p.dir) === toDoor }
  return p.uDir[2] * p.dir > 0
})
keep('every animal walks toward the door (across the axis) or north (along it)', dirsOk ? 1 : 0, 1, 0)
line(`  panels: ${B.panels.length} (${B.panels.filter((p) => p.kind === 'lion').length} lions)`)
line('\n== the animals\' own joints (K1918 p. 23: never through an eye, nostril or hoof)')
for (const k of ['bull', 'dragon', 'lion']) {
  const fld = animalField(k)
  const c = jointConflicts(fld, C, plan.brick)
  line(`  ${k}: ${fld.L} m x ${fld.H.toFixed(3)} m, ${fld.w}x${fld.h} texels, highest ${(fld.hMax * 100).toFixed(1)} cm; conflicts ${c.length ? c.join('; ') : 'none'}`)
  if (c.length) out.fail.push(...c)
}

if (cams) {
  line('\n== the cameras (gate-cams.json)')
  for (const [name, c] of Object.entries(cams.stills)) {
    const ground = B.level(c.at[1])
    const eye = c.eye ?? cams.eye
    const u = F.utm(c.at[0], c.at[1])
    line(`  ${name}: x ${c.at[0]}, z ${c.at[1]} (UTM ${u[0].toFixed(1)} E, ${u[1].toFixed(1)} N), street +${(ground + plan.frame.level0).toFixed(2)}, eye ${eye} m over it (+${(ground + eye + plan.frame.level0).toFixed(2)}), ${c.hfov} degrees across, shift ${c.shift}`)
    keep(`${name} eye over the street`, eye, 1.65, 0.05)
    const inside = solids.some((q) => (q.kind === 'box' ? (c.at[0] > q.lo[0] && c.at[0] < q.hi[0] && ground + eye > q.lo[1] && ground + eye < q.hi[1] && c.at[1] > q.lo[2] && c.at[1] < q.hi[2]) : inPoly(c.at[0], c.at[1], q.poly) && ground + eye < q.y1))
    keep(`${name} not inside a body`, inside ? 0 : 1, 1, 0)
  }
}

if (opt.facts && opt.facts !== true) {
  const read = JSON.parse(readFileSync(String(opt.facts), 'utf8'))
  const facts = read.facts ?? read
  line('\n== the page\'s own numbers against the build checked above')
  keep('figure height', facts.figure?.height ?? 0, plan.figure.height, 0.005)
  // every number the page built must be the number node built from the same plan
  const flat = (o, pre = '') => Object.entries(o ?? {}).flatMap(([k2, v]) => (typeof v === 'number' ? [[pre + k2, v]] : v && typeof v === 'object' ? flat(v, `${pre}${k2}.`) : []))
  const nodeNums = new Map(flat(B.facts))
  // the page's rig reports `panels` as every panel it placed (B.panels), where the build's facts count them partway
  nodeNums.set('panels', B.panels.length)
  let same = 0, differ = 0
  for (const [k2, v] of flat(Object.fromEntries(Object.entries(facts).filter(([k3]) => k3 in B.facts)))) {
    if (!nodeNums.has(k2)) continue
    if (Math.abs(nodeNums.get(k2) - v) <= 1e-6) same++
    else { differ++; line(`  differs ${k2}: page ${v}, node ${nodeNums.get(k2)}`) }
  }
  keep('page numbers equal to the node build (differing)', differ, 0, 0)
  line(`  ${same} numbers equal`)
  for (const name of ['desktop', 'phone']) {
    const v = read.views?.[name] ?? facts.views?.[name]
    if (!v) continue
    const at = cams.stills[name].at
    keep(`page ${name} camera at the camera file's place (m)`, Math.hypot(v.pos[0] - at[0], v.pos[2] - at[1]), 0, 0.001)
  }
  if (facts.measured) for (const [k2, v] of Object.entries(facts.measured)) line(`  ${k2}: ${JSON.stringify(v)}`)
}

line(`\n${out.fail.length ? 'FAILED' : 'all kept'}: ${out.ok.length} ok, ${out.fail.length} failed${out.fail.length ? ': ' + out.fail.join('; ') : ''}`)
if (opt.json && opt.json !== true) { mkdirSync(dirname(String(opt.json)), { recursive: true }); writeFileSync(String(opt.json), JSON.stringify(out, null, 1)) }
process.exit(out.fail.length ? 1 : 0)
