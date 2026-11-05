// The street on the Ishtar Gate's axis, measured from the plans (no page): the map street's centre against the passage's
// axis, the street's bends, the map path's stop 4 keys in the passage, and (with --south) the gate page's south paving
// line against the map's own line.
//   node --experimental-strip-types --no-warnings forge/babylon/gate-axis.mjs [--base <map-plan.json>] [--south <south.json>] [--json <out>]
// The gate's frame: x west (the right of a visitor facing the gate), z north out of the front gate's face.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from './pages.mjs'

const W = join(APP, 'src/wings/babylon')
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const j = (p) => JSON.parse(readFileSync(p, 'utf8'))
const { buildPlan, makeFrame } = await import(pathToFileURL(join(W, 'map/plan.ts')).href)
const { gateFrame } = await import(pathToFileURL(join(W, 'gate/gate-geom.ts')).href)

export const PASSAGE_Z = [0, -6, -13, -22, -30, -40, -48]
/** the main gate's south face in the gate's frame: the front gate, the court and the main gate along the axis */
export const southFaceZ = (gp) => -(gp.front.along + gp.court.depth + gp.main.along)

export function measure(plan, gp, cams, south) {
  const B = buildPlan(plan), F = makeFrame(plan), GF = gateFrame(gp)
  const pts = plan.street.points.map((p) => { const [x, z] = GF.fromUtm(p.at[0], p.at[1]); return { x, z, at: p.at, note: p.note ?? '' } })
  // the map street's centre line in the gate's frame (a polyline); its signed x at a z (where the line spans it)
  const xAt = (z) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      if ((z - a.z) * (z - b.z) <= 0 && a.z !== b.z) return a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z)
    }
    return null
  }
  const passage = PASSAGE_Z.map((z) => {
    const [E, N] = GF.utm(0, z), [sx, sz] = F.s(E, N)
    return { z, streetAt: +B.streetAt(sx, sz).d.toFixed(3), x: +xAt(z).toFixed(3) }
  })
  // each point's bend: the turn between the legs into and out of it, degrees
  const bends = pts.map((p, i) => {
    if (i === 0 || i + 1 === pts.length) return 0
    const a = Math.atan2(p.x - pts[i - 1].x, p.z - pts[i - 1].z), b = Math.atan2(pts[i + 1].x - p.x, pts[i + 1].z - p.z)
    let d = ((b - a) * 180) / Math.PI
    while (d > 180) d -= 360
    while (d < -180) d += 360
    return +d.toFixed(2)
  })
  const keys4 = cams.path.filter((k) => k.stop === 4).map((k) => { const [x, z] = GF.fromUtm(k.at[0], k.at[1]); return { t: k.t, x: +x.toFixed(3), z: +z.toFixed(3) } })
  const inPassage = keys4.filter((k) => k.z <= 0.5 && k.z >= southFaceZ(gp) - 0.5)
  const out = {
    passage, passageMax: Math.max(...passage.map((p) => Math.abs(p.streetAt))),
    keys4: inPassage, keys4Max: inPassage.length ? Math.max(...inPassage.map((k) => Math.abs(k.x))) : null,
    points: pts.map((p, i) => ({ i, at: p.at, x: +p.x.toFixed(3), z: +p.z.toFixed(3), bend: bends[i] })).filter((p) => p.z > -260 && p.z < 120),
  }
  if (south) {
    // the gate page's south paving line against the map's line: over the 100 m past the main gate's south face, and on
    // the map's first leg past the gate (its straight run from the hand-off point to the next point)
    const zs = southFaceZ(gp), h = pts.findIndex((p) => p.z < zs - 0.5), legEnd = pts[h + 1].z
    const span = (z0, z1) => {
      const rows = [], heads = []
      for (const [x, z] of south.line) if (z <= z0 && z >= z1) { const m = xAt(z); if (m !== null) rows.push({ z: +z.toFixed(2), x: +x.toFixed(3), map: +m.toFixed(3), off: +(x - m).toFixed(3) }) }
      for (let i = 0; i + 1 < south.line.length; i++) { const [x0, za] = south.line[i], [x1, zb] = south.line[i + 1]; if (za <= z0 && zb >= z1) heads.push((Math.atan2(x1 - x0, za - zb) * 180) / Math.PI) }
      // a change of side: the heading's turn changes sign, counted where a leg turns more than 0.05 degrees
      let turns = 0, last = 0
      for (let i = 0; i + 1 < heads.length; i++) { const d = heads[i + 1] - heads[i], s = Math.abs(d) < 0.05 ? 0 : Math.sign(d); if (s && s !== last) { if (last) turns++; last = s } }
      return { from: z0, to: z1, rows, maxOff: rows.length ? Math.max(...rows.map((r) => Math.abs(r.off))) : null, sideChanges: turns, headings: heads.length ? [+Math.min(...heads).toFixed(2), +Math.max(...heads).toFixed(2)] : null }
    }
    out.south = span(zs, zs - 100)
    out.southLeg = span(pts[h].z, legEnd)
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = j(arg('--plan') ?? join(W, 'map/map-plan.json')), gp = j(join(W, 'gate/gate-plan.json')), cams = j(join(W, 'map/map-cams.json'))
  const south = arg('--south') ? j(arg('--south')) : null
  const r = measure(plan, gp, cams, south)
  console.log(`passage: the map street's centre off the gate's axis ${r.passage.map((p) => `${p.z}: ${p.streetAt}`).join(', ')} (max ${r.passageMax.toFixed(3)} m)`)
  console.log(`stop 4's map keys in the passage: ${r.keys4.length}, max ${r.keys4Max?.toFixed(3)} m off the axis (x ${r.keys4.map((k) => k.x).join(', ')})`)
  for (const p of r.points) console.log(`  point ${p.i} [${p.at.join(', ')}]: x ${p.x} z ${p.z} bend ${p.bend}`)
  if (arg('--base')) {
    const b = j(arg('--base')).street.points, n = plan.street.points
    const same = n.filter((p) => b.some((q) => JSON.stringify(q) === JSON.stringify(p))).length
    console.log(`street points: ${n.length} now, ${b.length} base, ${same} byte-equal to a base point`)
  }
  for (const [k, v] of Object.entries({ 'south paving, 100 m': r.south, "south paving, the map's first leg": r.southLeg })) if (v) console.log(`${k}: ${v.rows.length} samples z ${v.rows[0]?.z} to ${v.rows.at(-1)?.z}, max ${v.maxOff?.toFixed(3)} m off the map's line, headings ${v.headings?.join(' to ')} deg, ${v.sideChanges} change(s) of turn`)
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(r, null, 1))
}
