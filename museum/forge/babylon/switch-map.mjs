// THE EVIDENCE SWITCH FOR THE MAP PAGE AT ONE STOP, the map's half of switch.mjs (which drives the gate page): every
// body the map page builds, stop 6's court and stop 7's house bodies with it, named to its rows by pieces.json and given its classes from
// record-classes.json through record.ts, written as the JSON the evidence check's --switch reads, one line per body.
//
//   node --experimental-strip-types --no-warnings forge/babylon/switch-map.mjs --out <shown.json> [--stop 6] [--bodies <tsv>] [--tower built|dug|bruegel]
//
// --tower mounts the tower switch's state as the page's ?tower= does; Bruegel's tower is outside the classes, so its
// bodies are listed and never shown with a class.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from './pages.mjs'
import { mountMap } from './mounts.mjs'
import { isLetter, recordNamer } from '../../src/wings/babylon/record.ts'
import { buildPlan } from '../../src/wings/babylon/map/plan.ts'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const STOP = String(opt('--stop', '6'))
const OUT = opt('--out', null)
if (!OUT) { console.error('--out <shown.json>'); process.exit(2) }

const RANK = { blank: 0, guessed: 1, known: 2, 'in place': 3 }
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const name = recordNamer(json(join(APP, 'src/wings/babylon/pieces.json')), json(join(APP, 'src/wings/babylon/record-classes.json')), STOP)
const mapPlan = json(join(APP, 'src/wings/babylon/map/map-plan.json'))

const TOWER = opt('--tower', 'built')
const M = await mountMap(STOP, { reach: 1e7, tower: TOWER })
const names = [...new Set(M.faces.map((f) => f.body.replace(/#\d+$/, '')))]
const courtLetters = new Map([...M.court.bodies, ...(M.houseBodies ?? []), ...(M.dug?.bodies ?? []), ...(M.bridge?.bodies ?? [])].map((b) => [`map:${b.id}`, b.letters]))

/** the plans' letters for a map body: [plan, height], or null when the plans do not give them (as switch.mjs) */
function letters(body) {
  if (courtLetters.has(body)) return courtLetters.get(body)
  if (!body.startsWith('map:')) return null
  const id = body.slice(4)
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
const streetParts = (() => {
  const P = buildPlan(mapPlan).street, out = new Map()
  for (let i = 0; i + 1 < P.length; i++) if (!P[i].deck) out.set(P[i + 1].cls, [P[i + 1].cls, P[i + 1].cls])
  return [...out.values()]
})()
const partsOf = (body) => (body === 'map:street' ? streetParts : [letters(body)])

const shown = {}, lines = [['body', 'plan row', 'body row', 'letters', 'plan shows', 'body shows', 'from'].join('\t')]
const unnamed = [], noRow = []
const show = (piece, cls) => { if (piece && (!shown[piece] || RANK[cls] > RANK[shown[piece]])) shown[piece] = cls }
const outside = names.filter((b) => b.startsWith('map:bruegel-'))
for (const body of names) for (const L of partsOf(body)) {
  if (outside.includes(body)) { lines.push([body, '-', '-', '-', '-', 'outside the classes', 'SET E5'].join('\t')); break }
  const c = name(body, L && isLetter(L[0]) && isLetter(L[1]) ? L : null)
  if (!c.piece) { unnamed.push([c.rule?.part ?? body, c.missing.join('; ')]); break }
  if (c.missing.length) noRow.push([body, c.missing])
  if (c.plan) show(c.plan, c.foot)
  show(c.piece, c.above)
  for (const s of c.strips) show(s.row, s.shown)
  lines.push([body, c.plan || '-', c.piece, L ? L.join('/') : '-', c.plan ? c.foot : '-', c.above, c.missing.length ? `letters (no row ${c.missing.join(', ')})` : 'record'].join('\t'))
}
writeFileSync(OUT, JSON.stringify(shown, null, 1))
if (opt('--bodies', null)) writeFileSync(opt('--bodies'), lines.join('\n') + '\n')
console.log(`switch for the map page at stop ${STOP}, tower ${TOWER}: ${names.length} bodies, ${lines.length - 1 - outside.length} lines named to a row, ${Object.keys(shown).length} record rows shown, ${outside.length} outside the classes`)
const groups = new Map()
for (const [part, why] of unnamed) { const k = `${part}: ${why}`; groups.set(k, (groups.get(k) ?? 0) + 1) }
console.log(`no rule names (${unnamed.length} bodies):${groups.size ? '' : ' none'}`)
for (const [k, n] of groups) console.log(`  ${n} x ${k}`)
const rows = new Map()
for (const [body, miss] of noRow) for (const m of miss) rows.set(m, [...(rows.get(m) ?? []), body])
console.log(`no row in the class file (${noRow.length} bodies, shown by their letters):${rows.size ? '' : ' none'}`)
for (const [m, bs] of rows) console.log(`  ${m}: ${bs.length} bodies, first ${bs[0]}`)
