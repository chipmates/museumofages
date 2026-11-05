// THE GEOMETRY CHECK FOR ANY BABYLON STOP, offline: coplanar pairs, sub-pixel faces at the stills' cameras and floating
// bodies (the map's support rule), on the bodies the stop's page builds (mounts.mjs).
//
//   node --experimental-strip-types --no-warnings forge/babylon/geometry-check.mjs --stop <id> [--near <mm>] [--area 0.01]
//        [--reach 400] (map stops: metres around the eye) [--eyes <facts.json>] (gate: the page's path samples)
//        [--all] [--json <out>]
// Exit 0 when nothing outside the allowances is found, 1 otherwise. Not covered, said plainly: anything a material
// draws (relief, displacement), occlusion (a thin face behind a wall still counts), the sign person, the opening's
// flight cameras (the opening's stills are its first frame only).
import { writeFileSync } from 'node:fs'
import { resolveStop } from './pages.mjs'
import { MOUNTS } from './mounts.mjs'
import { coplanar, floating, subPixel } from './geometry.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
if (!args.includes('--stop')) { console.error('--stop <id> (a stop number or id, map:<stop>, or a page name)'); process.exit(2) }
const st = resolveStop(opt('--stop'))
const page = st.page
const ALL = args.includes('--all')
const NEAR = Number(opt('--near', 0))
const BED = NEAR > 0 ? NEAR / 1000 : 0.002
const AREA = Number(opt('--area', 0.01))
const JSON_OUT = opt('--json', null)

const t0 = Date.now()
const M = await MOUNTS[page](st.stop, { reach: Number(opt('--reach', 400)), eyesFile: opt('--eyes', null) })
const pairs = coplanar(M.faces, { bedM: BED, areaMin: AREA, eyes: M.eyes, counts: M.counts, masked: M.masked ?? null })
const ALLOWED_PAIRS = [
  { kind: 'butt', why: 'two closed bodies meeting face to face: both faces lie inside the union, no eye outside sees either' },
  { kind: 'unseen', why: "every eye of the stop stands behind the plane, so both faces are culled from every eye" },
  ...M.allowPair,
]
const allowedPair = (p) => ALLOWED_PAIRS.find((r) => (r.test && r.test(p)) || (r.kind && r.kind === p.kind))
const thin = subPixel(M.faces, M.cameras, { checks: M.checks })
const allowedThin = (r) => M.allowThin.find((x) => x.body === r.body || (x.prefix && r.body.startsWith(x.prefix)))
const floatRows = floating(M.faces, { ground: M.ground, checks: M.floats })
const allowedFloat = (r) => M.allowFloat.find((x) => x.body === r.body || (x.prefix && r.body.startsWith(x.prefix)))
const floats = floatRows.filter((r) => !allowedFloat(r))

const pairOff = pairs.filter((p) => !allowedPair(p))
const thinOff = thin.rows.filter((r) => !allowedThin(r))
const bodies = new Set(M.faces.map((f) => f.body)).size
const report = {
  checker: 'babylon-geometry', stop: st.stop, stopId: st.id, page: M.page, frame: M.frame, faces: M.faces.length, bodies, bedMm: BED * 1000, areaMin: AREA,
  cameras: M.cameras.map((c) => c.name), eyes: M.eyes.length,
  coplanar: { pairs: pairs.length, offences: pairOff.length, list: (ALL ? pairs : pairOff).map((p) => ({ ...p, why: allowedPair(p)?.why ?? null })) },
  subPixel: { sliversInAPlane: thin.slivers, rows: thin.rows.length, offences: thinOff.length, list: (ALL ? thin.rows : thinOff).map((r) => ({ ...r, why: allowedThin(r)?.why ?? null })) },
  floating: { rows: floatRows.length, offences: floats.length, list: (ALL ? floatRows : floats).map((r) => ({ ...r, why: allowedFloat(r)?.why ?? null })) },
  seconds: Math.round((Date.now() - t0) / 1000),
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1))
console.log(`stop ${st.stop} (${st.id}) on the ${M.page} page${st.page === 'open' ? ' (the opening mounted as the gate page)' : ''}: ${M.faces.length} faces in ${bodies} bodies, ${M.cameras.length} cameras, ${M.eyes.length} eyes, ${report.seconds} s`)
console.log(`coplanar (bed ${BED * 1000} mm where the faces overlap, area over ${AREA} m2; gap: the median where they do): ${pairs.length} pairs (${['fight', 'unseen', 'butt'].map((k) => `${k} ${pairs.filter((p) => p.kind === k).length}`).join(', ')}), ${pairOff.length} not allowed`)
for (const p of (ALL ? pairs : pairOff).slice(0, 30)) console.log(`  [${p.kind} ${p.facing > 0 ? '+' : '-'}] ${p.a} | ${p.b}: ${p.area} m2, gap ${p.gapMm} mm (least ${p.gapMinMm}), n ${p.n.join(',')}, x ${p.x.join('..')} y ${p.y.join('..')} z ${p.z.join('..')}`)
console.log(`sub-pixel (under 1 device px over 4 px; ${thin.slivers} slivers of triangulated planes set aside): ${thin.rows.length} rows, ${thinOff.length} not allowed`)
for (const r of (ALL ? thin.rows : thinOff).slice(0, 30)) console.log(`  ${r.body} at ${r.camera}: ${r.faces} faces, thinnest ${r.thinnestPx} px (${r.thickM} m at ${r.atM} m, run ${r.runPx} px)`)
console.log(`floating (the map's rule: a grounded body's corner over the ground by more than 1 cm, a raised body with nothing under its centre or its ends): ${floatRows.length} rows, ${floats.length} not allowed`)
for (const r of (ALL ? floatRows : floats).slice(0, 30)) console.log(`  ${r.body}: base ${r.baseY} m, ${r.gapM} m over the ground at ${r.at.join(', ')} (${r.rule})`)
const bad = pairOff.length + thinOff.length + floats.length
console.log(bad === 0 ? 'geometry: ok' : `geometry: FAILED (${pairOff.length} coplanar, ${thinOff.length} sub-pixel, ${floats.length} floating)`)
process.exit(bad === 0 ? 0 : 1)
