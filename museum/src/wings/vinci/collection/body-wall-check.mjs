#!/usr/bin/env node
/** Audit the anatomy's cabinet in the great hall against every certified way
 * through the wing.
 *   node src/wings/vinci/collection/body-wall-check.mjs
 * The hall lays the cabinet and the sheet apart's pier in its things; this
 * supplement records every box they lay (the plan chest and its pulls, the
 * case's back, linen, sides and top board, every frame and mat, the pier's
 * board, hood and stand, the model's reach on it) and proves each clear of
 * every certified route, approach, leg and wall run at its saved near
 * envelope, every corner ball, and every station and viewing eye's own near
 * envelope. A control post stood on the certified walk from the hall's door
 * to the cabinet must fail. It reads the sheets' places and order (the old
 * wing's grid, column 0 at the visitor's left, every sheet in the case's
 * opening, each one's certified viewing eye looking into its own frame) and
 * the cases' own light from its table: even over the pages, the bottom
 * course as the top, the sheet apart leading by a third to three fifths, the
 * strips inside the cases and nothing laid outside them.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import * as THREE from 'three/webgpu'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const modules = new Map()
async function load(file) {
  if (modules.has(file)) return modules.get(file)
  const exports = {}
  modules.set(file, exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const dependencies = new Map()
  for (const [, name] of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
    if (dependencies.has(name)) continue
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(file), name.replace(/\?raw$/, ''))
      dependencies.set(name, name.endsWith('?raw') ? { default: fs.readFileSync(target, 'utf8') } : await load(target + '.ts'))
    } else if (/^three(?:\/|$)/.test(name)) dependencies.set(name, await import(name))
    else throw new Error('Unexpected runtime dependency: ' + name)
  }
  new vm.Script(code, { filename: file }).runInNewContext({
    exports, require: name => dependencies.get(name), Float32Array, performance,
    crypto: globalThis.crypto, TextEncoder: globalThis.TextEncoder, console, matchMedia: () => ({ matches: false }),
  }, { timeout: 20000 })
  return exports
}

const hall = await load(path.join(HERE, '../house-hall.ts'))
const grid = await load(path.join(HERE, 'body-wall-plan.ts'))
const certificate = JSON.parse(fs.readFileSync(path.join(HERE, '../data/rail-clearance.json'), 'utf8'))
/** a hair over the saved envelope, so a box that only grazes it is refused */
const MARGIN_M = .02

/** a box [west, south, bottom, east, north, top] as twelve triangles in three's frame */
function triangles([w, s, b, e, n, t]) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z)
  const c = [v(w, b, -n), v(e, b, -n), v(e, b, -s), v(w, b, -s), v(w, t, -n), v(e, t, -n), v(e, t, -s), v(w, t, -s)]
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]
  return faces.flatMap(([a, bb, cc, d]) => [[c[a], c[bb], c[cc]], [c[a], c[cc], c[d]]])
}
const clamp = value => Math.max(0, Math.min(1, value))
function segmentDistanceSquared(a, b, c, d) {
  const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c)
  const aa = u.dot(u), bb = u.dot(v), cc = v.dot(v), dd = u.dot(w), ee = v.dot(w)
  let s = 0, t = 0
  if (aa < 1e-18) t = cc < 1e-18 ? 0 : clamp(ee / cc)
  else if (cc < 1e-18) s = clamp(-dd / aa)
  else {
    const determinant = aa * cc - bb * bb
    s = determinant < 1e-18 ? 0 : clamp((bb * ee - cc * dd) / determinant)
    t = (bb * s + ee) / cc
    if (t < 0) { t = 0; s = clamp(-dd / aa) }
    else if (t > 1) { t = 1; s = clamp((bb - dd) / aa) }
  }
  return w.addScaledVector(u, s).addScaledVector(v, -t).lengthSq()
}
function segmentTriangleDistance(start, end, [a, b, c]) {
  const direction = end.clone().sub(start), lengthSquared = direction.lengthSq()
  if (lengthSquared > 1e-18) {
    const hit = new THREE.Ray(start, direction.clone().normalize()).intersectTriangle(a, b, c, false, new THREE.Vector3())
    if (hit && hit.distanceToSquared(start) <= lengthSquared + 1e-12) return 0
  }
  const triangle = new THREE.Triangle(a, b, c), closest = new THREE.Vector3()
  return Math.sqrt(Math.min(
    triangle.closestPointToPoint(start, closest).distanceToSquared(start),
    triangle.closestPointToPoint(end, closest).distanceToSquared(end),
    segmentDistanceSquared(start, end, a, b), segmentDistanceSquared(start, end, b, c), segmentDistanceSquared(start, end, c, a),
  ))
}
const pointBoxDistance = (p, box) => new THREE.Box3(new THREE.Vector3(box[0], box[2], -box[4]), new THREE.Vector3(box[3], box[5], -box[1])).distanceToPoint(p)


/** a box as its eight corners in three's frame, from a centre and three half axes in east, north, up */
function cornersOf({ centre, axes }) {
  const out = []
  for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) {
    const e = centre[0] + axes[0][0] * i + axes[1][0] * j + axes[2][0] * k
    const n = centre[1] + axes[0][1] * i + axes[1][1] * j + axes[2][1] * k
    const h = centre[2] + axes[0][2] * i + axes[1][2] * j + axes[2][2] * k
    out.push(new THREE.Vector3(e, h, -n))
  }
  return out
}
const BOX_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
/** the distance from a point (three's frame) to an oriented box */
function pointObbDistance(p, { centre, axes }) {
  const d = [p.x - centre[0], -p.z - centre[1], p.y - centre[2]]
  let sum = 0
  for (const a of axes) {
    const l = Math.hypot(...a), t = (d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) / l
    sum += Math.max(0, Math.abs(t) - l) ** 2
  }
  return Math.sqrt(sum)
}
function solidOf(solid) {
  const c = cornersOf(solid)
  return { ...solid, tris: BOX_FACES.flatMap(([a, b, cc, d]) => [[c[a], c[b], c[cc]], [c[a], c[cc], c[d]]]), aabb: new THREE.Box3().setFromPoints(c) }
}

function audit(solids) {
  const boxes = solids.map(solidOf)
  let spans = 0, balls = 0, eyes = 0, worst = null
  const failures = []
  const note = (kind, label, solid, clearance, required) => {
    const margin = clearance - required
    if (!worst || margin < worst.marginM) worst = { kind, label, solid, clearanceM: +clearance.toFixed(4), requiredM: +required.toFixed(4), marginM: +margin.toFixed(4) }
    if (margin < MARGIN_M) failures.push(`${kind} ${label}: ${solid} stands ${clearance.toFixed(4)} m off, inside ${required.toFixed(4)} m and the ${MARGIN_M} m margin`)
  }
  const runs = [
    ...certificate.routes.map(r => ({ kind: 'route', label: `${r.viewport} ${r.from} to ${r.to}`, entry: r })),
    ...(certificate.approaches ?? []).map(r => ({ kind: 'approach', label: `${r.viewport} ${r.station} to ${r.exhibit}`, entry: r })),
    ...(certificate.links ?? []).map(r => ({ kind: 'leg', label: `${r.viewport} ${r.from} to ${r.to}`, entry: r })),
    ...(certificate.walls ?? []).map(r => ({ kind: 'wall', label: `${r.viewport} ${r.id}`, entry: r })),
  ]
  for (const { kind, label, entry } of runs) {
    const points = entry.points.map(([east, north, height]) => new THREE.Vector3(east, height, -north))
    for (let i = 1; i < points.length; i++) {
      spans++
      const span = new THREE.Box3().setFromPoints([points[i - 1], points[i]]).expandByScalar(entry.maxNearRadius + MARGIN_M + .5)
      for (const box of boxes) {
        if (!span.intersectsBox(box.aabb)) continue
        const clearance = Math.min(...box.tris.map(tri => segmentTriangleDistance(points[i - 1], points[i], tri)))
        note(kind, `${label} span ${i - 1}`, box.name, clearance, entry.maxNearRadius)
      }
    }
    for (const ball of entry.certifiedBalls ?? []) {
      balls++
      const centre = new THREE.Vector3().fromArray(ball.centre)
      for (const box of boxes) note(`${kind} ball`, label, box.name, pointObbDistance(centre, box), ball.radiusM)
    }
  }
  const stationEyes = new Map()
  for (const route of certificate.routes) for (const [id, pose] of [[route.from, route.fromPose], [route.to, route.toPose]])
    stationEyes.set(`${route.viewport} ${id}`, pose.eye)
  for (const cone of certificate.stationCones ?? []) {
    for (const station of cone.stations ?? [cone.id]) {
      const eye = stationEyes.get(`${cone.viewport} ${station}`)
      if (!eye) continue
      eyes++
      for (const box of boxes) note('station eye', `${cone.viewport} ${station}`, box.name, pointObbDistance(new THREE.Vector3().fromArray(eye), box), cone.radius)
    }
  }
  for (const approach of certificate.approaches ?? []) {
    eyes++
    for (const box of boxes) note('viewing eye', `${approach.viewport} ${approach.exhibit}`, box.name, pointObbDistance(new THREE.Vector3().fromArray(approach.toPose.eye), box), approach.maxNearRadius)
  }
  return { solids: boxes.length, spans, balls, eyes, worst, failures }
}

const plan = hall.hallCabinetPlan()
const KIND = Object.fromEntries(Object.entries(hall.K).map(([k, v]) => [v, k.toLowerCase()]))
const solids = [...plan.boxes.map((b, i) => ({ ...b, name: `${KIND[b.kind] ?? 'box'}-${i}` })), { ...plan.model, name: 'glass-model' }]
const cabinet = audit(solids)

/* THE HALL'S FRAME: a point east, north, up as u, v and the height over the floor */
const [ox, oy, oz] = plan.origin
const toHall = ([e, n, h]) => [(e - ox) * plan.u[0] + (n - oy) * plan.u[1], (e - ox) * plan.v[0] + (n - oy) * plan.v[1], h - oz]
const fromThree = ([x, y, z]) => [x, -z, y]
const C = hall.HALL_CABINET, VAL = hall.HALL_VALVE, L = hall.HALL_CASE_LIGHT
const placeFailures = []
/* THE CASE'S AND THE PIER'S OWN FRAMES: a hall point as (along, out of the wall, up) */
const F = hall.hallCaseFrames()
const local = (place, [u, v, z]) => { const h = place.heading, al = [Math.cos(h), Math.sin(h)], out = [-Math.sin(h), Math.cos(h)], du = u - place.u, dv = v - place.v; return [du * al[0] + dv * al[1], du * out[0] + dv * out[1], z] }
const pierUV = (a, d) => [F.pier.u + F.pierAlong[0] * a + F.pierOut[0] * d, F.pier.v + F.pierAlong[1] * a + F.pierOut[1] * d]
const pierN = [plan.u[0] * F.pierOut[0] + plan.v[0] * F.pierOut[1], plan.u[1] * F.pierOut[0] + plan.v[1] * F.pierOut[1]]

/* THE SHEETS' PLACES AND ORDER. The grid's sheets in the old wing's order;
 * on this wall the visitor faces -v, so the old wing's north runs to -u and
 * column 0 (its southmost) stands at the visitor's left, the largest u. */
const sheets = plan.plates.filter(p => p.kind === 'sheet')
const mounted = grid.mountedSheets()
const gridMounts = mounted.filter(s => s.mount.row !== 'vortex'), apartMount = mounted.find(s => s.mount.row === 'vortex')
const onWall = sheets.filter(p => Math.abs(p.normal[0] - plan.v[0]) < 1e-9 && Math.abs(p.normal[1] - plan.v[1]) < 1e-9)
const onPier = sheets.filter(p => Math.abs(p.normal[0] - pierN[0]) < 1e-9 && Math.abs(p.normal[1] - pierN[1]) < 1e-9)
if (gridMounts.length !== 28) placeFailures.push(`The old wing's grid holds ${gridMounts.length} sheets, not 28`)
if (onWall.length !== gridMounts.length) placeFailures.push(`${onWall.length} sheets stand in the hall's cabinet against the grid's ${gridMounts.length}`)
if (onPier.length !== 1 || onPier[0]?.id !== apartMount?.mount.id) placeFailures.push('The sheet apart does not stand alone on the pier')
const at = new Map(onWall.map(p => [p.id, toHall(p.centre)]))
const courses = [...new Set(gridMounts.map(s => s.mount.row))]
const order = []
for (const row of courses) {
  const own = gridMounts.filter(s => s.mount.row === row).sort((a, b) => a.mount.north - b.mount.north)
  const us = own.map(s => at.get(s.mount.id)?.[0])
  if (us.some(u => u === undefined)) { placeFailures.push(`Course ${row} lost a sheet`); continue }
  for (let i = 1; i < us.length; i++) if (!(us[i] < us[i - 1])) placeFailures.push(`Course ${row}: column ${i} does not stand to the visitor's right of column ${i - 1}`)
  order.push({ row, columns: own.length, firstU: +us[0].toFixed(3), lastU: +us.at(-1).toFixed(3), z: +at.get(own[0].mount.id)[2].toFixed(3) })
}
const byDatum = [...courses].sort((a, b) => gridMounts.find(s => s.mount.row === b).mount.datum - gridMounts.find(s => s.mount.row === a).mount.datum)
const byZ = [...order].sort((a, b) => b.z - a.z).map(o => o.row)
if (byDatum.join() !== byZ.join()) placeFailures.push(`The courses stand ${byZ.join(',')} top to foot, the old wing's ${byDatum.join(',')}`)
for (const p of onWall) {
  const [u, v, z] = toHall(p.centre), hw = p.width / 2, hh = p.height / 2
  if (u - hw < C.u0 + .05 || u + hw > C.u1 - .05 || z - hh < C.ledge || z + hh > C.top - .03 || v < 0 || v > C.upper)
    placeFailures.push(`${p.id} stands outside the case's opening`)
}
/* each sheet's certified viewing eyes look into its own frame */
const eyesRead = []
for (const p of sheets) {
  const apart = p.id === apartMount?.mount.id, fr = apart ? F.pier : F.case, [ca, cd] = local(fr, toHall(p.centre))
  for (const approach of certificate.approaches.filter(a => a.exhibit === `sheet/${p.id}`)) {
    // the face's own axis: along its wall (0) and out of it (1), in the case's or the pier's frame
    const eye = local(fr, toHall(fromThree(approach.toPose.eye))), aim = local(fr, toHall(fromThree(approach.toPose.at)))
    const off = 1, along = 0
    const d = aim.map((q, i) => q - eye[i]), front = eye[off] - cd
    const t = cd - eye[off]
    const hit = d[off] === 0 ? null : [eye[along] + d[along] * t / d[off], eye[2] + d[2] * t / d[off]]
    // a lens shift composes the sheet off the aim, so the aim must land nearer
    // its own sheet than any other on the wall, and within a third of a metre
    const gap = q => { const [a, , qz] = local(fr, toHall(q.centre)); return Math.hypot(Math.max(0, Math.abs(hit[0] - a) - q.width / 2), Math.max(0, Math.abs(hit[1] - qz) - q.height / 2)) }
    const mine = hit ? gap(p) : Infinity, nearest = hit ? Math.min(...(apart ? onPier : onWall).map(gap)) : 0
    // the phone's eye is the desktop's; its lens shift sets the sheet in the
    // frame, so its aim may fall between two sheets: it stands in the column
    const column = Math.abs(eye[along] - ca)
    const read = approach.viewport === 'phone' ? column <= .24 : mine <= nearest + 1e-9 && mine <= .33
    if (front <= 0 || !read) placeFailures.push(`${approach.viewport} ${approach.exhibit}: its viewing eye does not stand at its own sheet (aim ${mine.toFixed(3)} m off it, eye ${column.toFixed(3)} m off its column)`)
    eyesRead.push(approach.viewport)
  }
}
if (eyesRead.length !== 2 * sheets.length) placeFailures.push(`${eyesRead.length} certified viewing eyes read the hall's ${sheets.length} sheets, not two each`)

/* THE CASES' OWN LIGHT, READ FROM ITS TABLE at every grid sheet's window
 * centre, top and foot, and at the sheet apart's */
const facing = [0, 1, 0], facingPier = [F.pierOut[0], F.pierOut[1], 0]
const pages = []
for (const s of gridMounts) {
  const [u, , z] = at.get(s.mount.id) ?? [0, 0, 0]
  for (const dz of [0, s.window.top - s.mount.datum, s.window.bottom - s.mount.datum]) pages.push({ row: s.mount.row, e: hall.hallCaseWash(u, .034, z + dz, facing) })
}
const pageMin = Math.min(...pages.map(p => p.e)), pageMax = Math.max(...pages.map(p => p.e)), pageMean = pages.reduce((a, p) => a + p.e, 0) / pages.length
const rowMean = row => { const own = pages.filter(p => p.row === row); return own.reduce((a, p) => a + p.e, 0) / own.length }
const top = byDatum[0], foot = byDatum.at(-1)
const apartAt = onPier[0] ? toHall(onPier[0].centre) : [0, VAL.v, VAL.z]
const apartA = local(F.pier, apartAt)[0]
const apartWash = [-.1, 0, .1].flatMap(da => [-.12, 0, .12].map(dz => hall.hallCaseWash(...pierUV(apartA + da, .034), apartAt[2] + dz, facingPier)))
// beside and over the cases, on the partition's and the pier's plaster and on the room side: nothing
const outside = [
  ...[.1, .5, 1, 1.5, 2].map(z => hall.hallCaseWash(C.u0 - .1, .001, z, facing)), ...[.1, .5, 1, 1.5, 2].map(z => hall.hallCaseWash(C.u1 + .1, .001, z, facing)),
  ...[.25, 1.25, 2.25, 3.25].map(k => hall.hallCaseWash(C.u0 + k, .001, C.top + .1, facing)), ...[.25, 1.25, 2.25, 3.25].map(k => hall.hallCaseWash(C.u0 + k, C.upper + .1, 1.4, facing)),
  hall.hallCaseWash(...pierUV(.33, .001), VAL.z, facingPier), hall.hallCaseWash(...pierUV(-.33, .001), VAL.z, facingPier), hall.hallCaseWash(...pierUV(0, .001), VAL.board[3] + .1, facingPier),
  hall.hallCaseWash(...pierUV(0, .4), VAL.z, facingPier),
]
const wash = { pages: { min: +pageMin.toFixed(3), max: +pageMax.toFixed(3), mean: +pageMean.toFixed(3) },
  courses: Object.fromEntries(courses.map(row => [row, +rowMean(row).toFixed(3)])),
  apart: { min: +Math.min(...apartWash).toFixed(3), max: +Math.max(...apartWash).toFixed(3) }, lead: +(Math.max(...apartWash) / pageMean).toFixed(3),
  outside: +Math.max(...outside).toFixed(4),
  strips: { cabinet: { under: +(C.top - .03).toFixed(3), topBoard: [C.top - .03, C.top], depth: C.upper }, apart: { under: VAL.board[3], hood: L.hood } } }
const lightFailures = []
if (pageMin < .85 * pageMax) lightFailures.push(`The wash swings ${pageMin.toFixed(3)} to ${pageMax.toFixed(3)} over the pages, more than 15 per cent`)
if (Math.abs(rowMean(foot) - rowMean(top)) > .08 * rowMean(top)) lightFailures.push(`The bottom course takes ${rowMean(foot).toFixed(3)} against the top course's ${rowMean(top).toFixed(3)}`)
if (Math.min(...apartWash) < .85 * Math.max(...apartWash)) lightFailures.push(`The hood's wash swings ${wash.apart.min} to ${wash.apart.max} over the sheet apart`)
if (wash.lead < 1.3 || wash.lead > 1.6) lightFailures.push(`The sheet apart takes ${wash.lead} of the cabinet's wash, outside 1.3 to 1.6`)
if (wash.outside > .005) lightFailures.push(`The strips lay ${wash.outside} outside their cases`)
// the strips are the cases' own: under the cabinet's top board, inside its sides' depth, and under the pier's hood
if (C.top - .03 > C.top || C.upper > C.deep || L.hood > F.stand.d1) lightFailures.push('A strip stands outside its case')

// THE CONTROL: a post on the certified walk from the hall's door to the cabinet, at its middle, where a refusal is certain
const walk = certificate.routes.find(r => r.viewport === 'desktop' && r.from === 'hall' && r.to === 'body')
const failures = [...cabinet.failures, ...placeFailures, ...lightFailures]
let control = { failures: 0, worst: null }
if (!walk) failures.push('No certified walk from the hall to the cabinet to stand the control post on')
else {
  const [e, n, h] = walk.points[Math.floor(walk.points.length / 2)]
  control = audit([{ name: 'control-post', centre: [e, n, h - .8], axes: [[.07, 0, 0], [0, .075, 0], [0, 0, 1]] }])
  if (control.failures.length === 0) failures.push('The control post on the walk to the cabinet was not refused')
}
const tones = Object.fromEntries(plan.plates.filter(p => p.kind === 'painting' || p.id === apartMount?.mount.id || p.id === onWall[0]?.id).map(p => [p.id, p.tone?.map(v => +v.toFixed(3))]))
const sheetTone = onWall.map(p => p.tone?.[1] ?? 0)
console.log(JSON.stringify({ checker: 'vinci-collection-body-wall', ok: failures.length === 0,
  scope: "The anatomy's cabinet in the great hall as the hall lays it: the plan chest, the case's back, linen, sides and top board, every frame and mat, the sheet apart's board, hood and stand, and the glass model's reach; the sheets' places and order; the cases' own light. The collection pavilion's cabinet is no longer audited: no walk visits it.",
  marginM: MARGIN_M, cabinet: { ...cabinet, failures: cabinet.failures.slice(0, 12) }, order, wash,
  tones: { sheets: { min: +Math.min(...sheetTone).toFixed(3), max: +Math.max(...sheetTone).toFixed(3) }, ...tones },
  control: { failures: control.failures.length, worst: control.worst }, failures: failures.slice(0, 20) }, null, 2))
process.exitCode = failures.length ? 1 : 0
