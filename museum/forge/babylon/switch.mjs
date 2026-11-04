// THE EVIDENCE SWITCH PER RECORD ROW, from what a page builds: every body named to its row by the wing's rules
// (src/wings/babylon/pieces.json), its class read from the page's own letters, written as the JSON the evidence check's
// --switch reads (piece -> the strongest class any of its bodies shows) and one line per body.
//
//   node --experimental-strip-types --no-warnings forge/babylon/switch.mjs --page gate --out <shown.json> [--bodies <tsv>]
//
// The letters are the plans' old ones, put on the record's ladder: M (measured, dug) -> in place, R (rebuilt from finds,
// drawn but not dug, or from a text) -> known, G and T (guessed, a type) -> guessed. A body shows its plan row in its
// foot band (the plan letter) and its body row above it (the weaker of its plan and height letters); a rule without a
// plan row takes the weaker letter for its one row. A body no rule names, or whose letters the plans do not give, is
// listed and left out of the JSON, never guessed.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from './pages.mjs'
import { MOUNTS } from './mounts.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const PAGE = opt('--page', 'gate')
if (PAGE !== 'gate' && PAGE !== 'open') { console.error('--page gate|open'); process.exit(2) }
const STOP = PAGE === 'open' ? 'open' : '3'
const OUT = opt('--out', null)
if (!OUT) { console.error('--out <shown.json>'); process.exit(2) }

const CLASS = { M: 'in place', R: 'known', G: 'guessed', T: 'guessed' }
const RANK = { guessed: 1, known: 2, 'in place': 3 }
const weaker = (a, b) => (RANK[CLASS[a]] <= RANK[CLASS[b]] ? a : b)
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const rules = json(join(APP, 'src/wings/babylon/pieces.json')).rules.map((r) => ({ ...r, re: new RegExp(r.match) }))
const mapPlan = json(join(APP, 'src/wings/babylon/map/map-plan.json'))

const M = PAGE === 'open' ? await MOUNTS.open('open') : await MOUNTS.gate('3', { cityReach: 'all' })
const { B, plan } = M
const bodies = [...new Set(M.faces.map((f) => f.body))].map((b) => b.replace(/#\d+$/, ''))
const names = [...new Set([...bodies, ...(M.extraBodies ?? []).map(([n]) => n)])]

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
  if (M.openLetters?.has(name)) return M.openLetters.get(name)
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

const shown = {}, lines = [['body', 'plan row', 'body row', 'letters', 'plan shows', 'body shows', 'note'].join('\t')]
const unnamed = [], unlettered = []
const show = (piece, cls) => { if (piece && (!shown[piece] || RANK[cls] > RANK[shown[piece]])) shown[piece] = cls }
for (const name of names) {
  const r = rules.find((x) => x.re.test(name) && (!x.stops || x.stops.includes(STOP)))
  if (!r || !r.piece) { unnamed.push([r?.part ?? name, r?.needs ?? 'no rule names this body']); continue }
  const L = letters(name)
  if (!L || !CLASS[L[0]] || !CLASS[L[1]]) { unlettered.push(name); continue }
  const w = weaker(L[0], L[1])
  if (r.plan) { show(r.plan, CLASS[L[0]]); show(r.piece, CLASS[w]) } else show(r.piece, CLASS[w])
  lines.push([name, r.plan || '-', r.piece, L.join('/'), r.plan ? CLASS[L[0]] : '-', CLASS[w], r.note ?? ''].join('\t'))
}
writeFileSync(OUT, JSON.stringify(shown, null, 1))
if (opt('--bodies', null)) writeFileSync(opt('--bodies'), lines.join('\n') + '\n')
console.log(`switch for the ${PAGE} page: ${names.length} bodies, ${lines.length - 1} named with letters, ${Object.keys(shown).length} record rows shown`)
const groups = new Map()
for (const [part, needs] of unnamed) { const k = `${part}: ${needs}`; groups.set(k, (groups.get(k) ?? 0) + 1) }
console.log(`no row (${unnamed.length} bodies):${groups.size ? '' : ' none'}`)
for (const [k, n] of groups) console.log(`  ${n} x ${k}`)
console.log(`no letters in the plans (${unlettered.length}): ${unlettered.join('; ') || 'none'}`)
