// THE EVIDENCE SWITCH PER RECORD ROW, from what a page builds: every body named to its rows by the wing's rules
// (src/wings/babylon/pieces.json) and given their classes from the class file (record-classes.json) through the same
// module the pages paint from (src/wings/babylon/record.ts), written as the JSON the evidence check's --switch reads
// (row -> the strongest class any body shows for it) and one line per body.
//
//   node --experimental-strip-types --no-warnings forge/babylon/switch.mjs --page gate --out <shown.json> [--bodies <tsv>]
//
// A body shows its plan row in its foot band and its body row above it; a rule without a plan row shows its body row
// to the foot; the paving shows one row per strip. The plans' letters count only for a row the class file lacks, at
// the lower rung (M known; R, G, T guessed): such a body is listed under "no row" and still written, so the check
// refuses a row the record does not hold. A row held at some stops only (the street's) is read part by part with each
// part's own letters, as the page paints it (record.ts). A body no rule names is listed and left out of the JSON.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from './pages.mjs'
import { MOUNTS } from './mounts.mjs'
import { isLetter, recordNamer } from '../../src/wings/babylon/record.ts'
import { buildPlan } from '../../src/wings/babylon/map/plan.ts'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const PAGE = opt('--page', 'gate')
if (PAGE !== 'gate') { console.error('--page gate (the one page with a switch today)'); process.exit(2) }
const OUT = opt('--out', null)
if (!OUT) { console.error('--out <shown.json>'); process.exit(2) }

const RANK = { blank: 0, guessed: 1, known: 2, 'in place': 3 }
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
// the gate page takes its rows at stop 3, as gate.ts does (RECORD_STOP)
const STOP = '3'
const name = recordNamer(json(join(APP, 'src/wings/babylon/pieces.json')), json(join(APP, 'src/wings/babylon/record-classes.json')), STOP)
const mapPlan = json(join(APP, 'src/wings/babylon/map/map-plan.json'))

const M = await MOUNTS.gate(STOP, { cityReach: 'all' })
const { B, plan } = M
const bodies = [...new Set(M.faces.map((f) => f.body))].map((b) => b.replace(/#\d+$/, ''))
const names = [...new Set(bodies)]

/** the page's letters for a body: [plan, height], or null when the plans do not give them */
const gateLetters = new Map()
for (const b of [...B.boxes, ...B.prisms, ...B.arches]) gateLetters.set(`gate:${b.id}`, [b.plan, b.height])
for (const b of B.beams) gateLetters.set(`gate:${b.id}`, [b.plan, b.height])
for (const r of B.runs) gateLetters.set(`gate:${r.id}`, [r.plan, r.plan])
for (const f of B.faces) gateLetters.set(`gate:skin:${f.id}`, [f.plan ?? 'M', f.height ?? 'G'])
for (const p of B.pedestals) gateLetters.set(`gate:ped-${p.n}`, [p.plan, p.height])
for (const q of B.panels) gateLetters.set(`panel:${q.id}`, [q.cls, q.cls])
B.doors.forEach((d, i) => gateLetters.set(`gate:leaf-${i}`, [plan.doors.cls, plan.doors.cls]))
const lifeCls = plan.life.cls ?? 'G'
function letters(name) {
  if (gateLetters.has(name)) return gateLetters.get(name)
  if (/^gate:bronze-/.test(name)) return [plan.bronze.cls, plan.bronze.cls]
  if (/^life:/.test(name)) return [lifeCls, lifeCls]
  // the stone band's letter; the brick outside it (restCls) is its own row, bab.paving.outer
  if (name === 'gate:paving') { const c = plan.street?.paving?.cls ?? plan.paving?.cls; return c ? [c, c] : null }
  if (!name.startsWith('map:')) return null
  const id = name.slice(4)
  // the houses' height is a range of metres in the plan: a type's height, guessed
  if (id === 'house') return [mapPlan.houses.plan, 'G']
  if (id === 'street') return [mapPlan.street.plan, mapPlan.street.height]
  if (id === 'ground') return [mapPlan.ground.plan, mapPlan.ground.height]
  if (id === 'water-canal') return [mapPlan.canal.plan, mapPlan.canal.height]
  if (id.startsWith('water-')) { const w = mapPlan.water.find((x) => `water-${x.id}` === id); return w ? [w.plan, w.height] : null }
  const pre = (list) => list.filter((x) => id === x.id || id.startsWith(`${x.id}-`)).sort((a, b) => b.id.length - a.id.length)[0]
  const blk = pre(mapPlan.blocks) ?? pre(mapPlan.walls)
  if (blk) return [blk.plan, blk.height]
  const c = mapPlan.circuits.find((x) => id.startsWith(`${x.id}-`))
  if (c) { const seg = Number(/-(\d+)(?:-t|$)/.exec(id)?.[1] ?? NaN); const s = c.segments[seg]; return s?.plan ? [s.plan, c.height] : null }
  if (/^bridge-pier-/.test(id)) return [mapPlan.bridge.piers.plan, mapPlan.bridge.piers.height]
  if (/^bridge-abutment-/.test(id)) return [mapPlan.bridge.abutments.plan, mapPlan.bridge.abutments.height]
  if (/^tower-stage-(\d+)$/.test(id)) { const s = mapPlan.tower.stages[Number(id.slice(12)) - 1]; return s ? [s.plan, s.height] : null }
  return null
}

/** the letters of each part a page paints on its own: the street per stretch (mass.ts: a stretch takes its far
    point's letter, the deck is the bridge's), any other body as one */
const streetParts = (() => {
  const P = buildPlan(mapPlan).street, out = new Map()
  for (let i = 0; i + 1 < P.length; i++) if (!P[i].deck) out.set(P[i + 1].cls, [P[i + 1].cls, P[i + 1].cls])
  return [...out.values()]
})()
const partsOf = (body) => (body === 'map:street' ? streetParts : [letters(body)])

const shown = {}, lines = [['body', 'plan row', 'body row', 'letters', 'plan shows', 'body shows', 'note', 'from'].join('\t')]
const unnamed = [], noRow = []
const show = (piece, cls) => { if (piece && (!shown[piece] || RANK[cls] > RANK[shown[piece]])) shown[piece] = cls }
for (const body of names) for (const L of partsOf(body)) {
  const c = name(body, L && isLetter(L[0]) && isLetter(L[1]) ? L : null)
  if (!c.piece) { unnamed.push([c.rule?.part ?? body, c.missing.join('; ')]); break }
  if (c.missing.length) noRow.push([body, c.missing])
  if (c.plan) show(c.plan, c.foot)
  show(c.piece, c.above)
  for (const s of c.strips) show(s.row, s.shown)
  const strips = c.strips.length ? `strips ${c.strips.map((s) => `${s.row} ${s.shown}`).join(', ')}` : ''
  lines.push([body, c.plan || '-', c.piece, L ? L.join('/') : '-', c.plan ? c.foot : '-', c.above, [c.rule?.note ?? '', strips].filter(Boolean).join('; '), c.missing.length ? `letters (no row ${c.missing.join(', ')})` : 'record'].join('\t'))
}
writeFileSync(OUT, JSON.stringify(shown, null, 1))
if (opt('--bodies', null)) writeFileSync(opt('--bodies'), lines.join('\n') + '\n')
console.log(`switch for the ${PAGE} page at stop ${STOP}: ${names.length} bodies, ${lines.length - 1} lines named to a row (a held row's body by its parts), ${Object.keys(shown).length} record rows shown`)
const groups = new Map()
for (const [part, why] of unnamed) { const k = `${part}: ${why}`; groups.set(k, (groups.get(k) ?? 0) + 1) }
console.log(`no rule names (${unnamed.length} bodies):${groups.size ? '' : ' none'}`)
for (const [k, n] of groups) console.log(`  ${n} x ${k}`)
const rows = new Map()
for (const [body, miss] of noRow) for (const m of miss) rows.set(m, [...(rows.get(m) ?? []), body])
console.log(`no row in the class file (${noRow.length} bodies, shown by their letters):${rows.size ? '' : ' none'}`)
for (const [m, bs] of rows) console.log(`  ${m}: ${bs.length} bodies, first ${bs[0]}`)
