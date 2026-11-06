// The census: per stop of a wing, every slot the walk shows, read against the wing's
// data (through its adapter) and a release's film.json. green, amber (not written
// yet, a working line), red with its evidence, n/a where the slot does not apply.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentKey, patternKey } from '../lang/key.mjs'
import { adapters } from './vinci.mjs'
import { museumRoot } from './load.mjs'

// ---- the label rule (a line slot holding a name or a place and a year, no sentence)
const SENTENCE_END = /[.!?…]["'“”‘’»«›‹)\]]*\s*$/u
const FINITE = {
  en: [
    /\b(am|is|are|was|were|be|been|being|has|have|had|does|do|did|will|would|can|could|may|might|shall|should|must)\b/iu,
    /\b\p{L}{3,}ed\b/u,
    /\b(he|she|it|they|we|you|who|i)\s+\p{Ll}+/iu,
    /\b\p{Lu}\p{Ll}+\s+\p{Ll}+[^s\s]s\b/u, // a name and a third-person verb: "Leonardo paints"
  ],
  de: [
    /\b(bin|bist|ist|sind|seid|war|warst|waren|wart|hat|hast|habe|haben|hatte|hatten|wird|wirst|werden|wurde|wurden|kann|können|konnte|konnten|muss|müssen|musste|mussten|will|wollen|wollte|wollten|soll|sollen|sollte|sollten|darf|dürfen|durfte|mag|möchte|gibt|gab|steht|stand|liegt|lag|geht|ging|kommt|kam|bleibt|blieb|zeigt|zeigte)\b/iu,
    /\b(er|sie|es|ich|wir|ihr|man)\s+\p{Ll}+/iu,
    /\b\p{Lu}\p{Ll}+\s+\p{Ll}+(t|te|ten)\b/u, // a name and a verb: "Leonardo malt", "Leonardo malte"
  ],
}

/** null when the text reads as a sentence; otherwise why it reads as a label. */
export function labelReason(text, lang = 'en') {
  const t = String(text ?? '').trim()
  if (!t) return null
  const words = t.split(/\s+/u).length
  const year = /\b\d{3,4}\b/u.test(t) ? ', a year' : ''
  if (!SENTENCE_END.test(t)) return `no sentence end (${words} words${year})`
  const verbs = FINITE[lang]
  if (verbs && !verbs.some((re) => re.test(t))) return `no finite verb (${words} words${year})`
  return null
}

const NOT_WRITTEN = /not written yet|noch nicht geschrieben|in construction|im Bau/iu

// ---- the five catalog languages (en and de stand in each pair)
export function readCatalogs(root) {
  const dir = path.join(root, 'lang')
  const catalogs = new Map()
  if (!fs.existsSync(dir)) return catalogs
  for (const tag of fs.readdirSync(dir).filter((t) => fs.statSync(path.join(dir, t)).isDirectory()).sort()) {
    const entries = new Map()
    let status = {}
    for (const file of fs.readdirSync(path.join(dir, tag)).filter((f) => f.endsWith('.json')).sort()) {
      const json = JSON.parse(fs.readFileSync(path.join(dir, tag, file), 'utf8'))
      if (file === 'status.json') { status = json; continue }
      for (const [k, v] of Object.entries(json)) if (typeof v === 'string') entries.set(k, v)
    }
    catalogs.set(tag, { entries, status })
  }
  return catalogs
}

/** The catalog's words for a pair: by its content key, its pattern key, a kept
 *  entry, or as sentence-cut parts the way the player joins them. */
export function translated(catalog, s) {
  const own = (p) => {
    for (const key of [contentKey(p.en, p.de), patternKey(p.en, p.de)]) {
      if (catalog.entries.has(key)) return catalog.entries.get(key)
      const st = catalog.status[key]
      if (st && (st.status === 'kept' || st.kept === true)) return p.en
    }
    return undefined
  }
  const part = (p) => {
    const found = own(p)
    if (found !== undefined || !p.en.endsWith('.') || !p.de.endsWith('.')) return found
    return own({ en: p.en.slice(0, -1), de: p.de.slice(0, -1) })
  }
  const ends = (text) => [...text.matchAll(/[.!?…]["”’)]?\s/gu)].map((m) => m.index + m[0].length)
  const joined = (p, depth = 0) => {
    if (depth > 8) return undefined
    for (const i of ends(p.en)) for (const j of ends(p.de)) {
      const head = part({ en: p.en.slice(0, i).trimEnd(), de: p.de.slice(0, j).trimEnd() })
      if (head === undefined) continue
      const rest = { en: p.en.slice(i), de: p.de.slice(j) }
      const tail = part(rest) ?? joined(rest, depth + 1)
      if (tail !== undefined) return `${head} ${tail}`
    }
    return undefined
  }
  return part(s) ?? joined(s)
}

// ---- cells
const cell = (state, says = '', at = '') => ({ state, says, at })
const green = (at = '') => cell('green', '', at)

function textCell(slot, { labels = false, label = 'en' } = {}) {
  if (!slot) return null
  for (const lang of ['en', 'de']) {
    if (!slot[lang]?.trim()) return cell('red', `no ${lang} words`, `${slot.at}.${lang}`)
  }
  if (NOT_WRITTEN.test(slot.en) || NOT_WRITTEN.test(slot.de)) return cell('amber', 'not written yet', slot.at)
  if (labels) {
    for (const lang of ['en', 'de']) {
      const why = labelReason(slot[lang], lang)
      if (why) return cell('red', `reads as a label, ${why}: "${slot[lang].slice(0, 60)}"`, `${slot.at}.${lang}`)
    }
  }
  void label
  return green(slot.at)
}

const asList = (v) => (v == null ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.flat() : Object.values(v).flat())
const nodeId = (id) => (id.includes(':') ? id : `stop:${id}`)

function stillCell(dir, film, node, at) {
  const n = film.nodes?.[node]
  if (!n) return cell('red', 'no node in the release', `film.json nodes['${node}']`)
  for (const framing of Object.keys(film.framings ?? { wide: 1, upright: 1 })) {
    const rungs = n.stills?.[framing]
    if (!rungs || !Object.keys(rungs).length) return cell('red', `no ${framing} still`, `film.json nodes['${node}'].stills.${framing}`)
    for (const [rung, r] of Object.entries(rungs)) {
      if (dir && !fs.existsSync(path.join(dir, r.file))) return cell('red', `${framing} ${rung} file missing`, `${at ?? 'film.json'} ${r.file}`)
    }
  }
  return green(`film.json nodes['${node}'].stills`)
}

function bridgeCell(film, wing, index, node) {
  const prev = index === 0 ? film.start : film.story[index - 1]
  if (!prev) return cell('n/a')
  const cut = (film.cuts ?? []).find((c) => nodeId(c.to) === node && nodeId(c.from) === nodeId(prev))
  if (cut) return cut.title ? green(`film.json cuts[${cut.from}>${cut.to}].title`) : cell('red', 'a cut with no card', `film.json cuts[${cut.from}>${cut.to}]`)
  const edge = (film.edges ?? []).find((e) => e.from === prev && e.to === node)
  const seconds = edge?.framings?.wide?.seconds?.walk
  if (seconds === undefined) return cell('red', `no move from ${prev}`, `film.json edges['${prev}>${node}']`)
  if (seconds < 3) return cell('n/a', `${seconds.toFixed(1)} s`)
  if (wing.bridgeWords) return green()
  return cell('red', `a ${seconds.toFixed(1)} s move with no bridge words (the kit part is not built)`, `film.json edges['${edge.id}'].framings.wide.seconds.walk`)
}

export const SLOTS = ['chapter', 'clock', 'line', 'bridge', 'drawer', 'hold', 'record', 'plan', 'set', 'close', 'class', 'closer']

export function census({ wing, film, dir = null, catalogs = new Map() }) {
  const storyNodes = (film.story ?? []).map(nodeId)
  const byId = new Map(wing.stops.map((s) => [s.id, s]))
  const ids = [...new Set([...wing.stops.filter((s) => s.shown !== false).map((s) => s.id), ...storyNodes.map((n) => n.slice(5))])]
  const langs = [...catalogs.keys()]
  const rows = ids.map((id) => {
    const s = byId.get(id)
    const node = `stop:${id}`
    const index = storyNodes.indexOf(node)
    const n = film.nodes?.[node]
    const cells = {}
    const none = cell('red', 'no stop in the wing\'s data', `${wing.wing} adapter`)
    cells.chapter = s ? textCell(s.chapter) ?? cell('red', 'no chapter', `${id}.chapter`) : none
    cells.clock = !s ? none : s.quiet ? cell('n/a', 'a quiet stop') : textCell(s.clock) ?? cell('red', 'no age words: the player hides the clock here (desk-chrome.ts plateClock)', `${s.line?.at.replace(/\.line$/, '.age') ?? id}`)
    cells.line = s ? textCell(s.line, { labels: true }) ?? cell('red', 'no line', `${id}.line`) : none
    cells.drawer = s ? textCell(s.drawer, { labels: true }) ?? cell('red', 'no drawer', `${id}.drawer`) : none
    cells.bridge = index < 0 ? cell('red', 'not in the release\'s story', 'film.json story') : bridgeCell(film, wing, index, node)
    cells.hold = index < 0 ? cell('red', 'not in the release\'s story', 'film.json story') : stillCell(dir, film, node)
    if (!s) cells.record = none
    else if (!s.record) cells.record = cell('red', 'no station content for the stop', `${wing.wing} adapter: ${id}`)
    else if (!s.record.text?.en?.trim() || !s.record.text?.de?.trim()) cells.record = cell('red', 'the record has no words', s.record.text?.at ?? s.record.at)
    else if (!s.record.rows) cells.record = cell('amber', 'the record has no rows', s.record.at)
    else cells.record = green(s.record.at)
    // the plan marks a stop at its print's eye (vinci/film-plan.ts); whether that eye
    // stands on the drawn floors needs the site's geometry, which the census does not read
    const print = String(n?.print?.wide ?? n?.print?.upright ?? '').split(',').map(Number)
    cells.plan = !n ? cell('red', 'no node in the release', `film.json nodes['${node}']`)
      : print.length < 3 || print.some((v) => !Number.isFinite(v)) ? cell('red', 'no print to place the mark', `film.json nodes['${node}'].print`)
      : !s?.record ? cell('red', 'no station content to name the mark', `${wing.wing} adapter: ${id}`)
      : green(`film.json nodes['${node}'].print`)
    const station = n?.station ?? s?.station ?? id
    const pieces = asList(film.sets?.[station])
    cells.set = pieces.length ? green(`film.json sets['${station}']`) : cell('n/a', 'no pieces')
    const closes = pieces.map((p) => stillCell(dir, film, `view:${p}`))
    cells.close = !pieces.length ? cell('n/a')
      : closes.find((c) => c.state === 'red') ?? green(`film.json nodes['view:…'] for ${pieces.length} pieces`)
    cells.class = s?.classes ? (s.classes.length ? green() : cell('red', 'no class still')) : cell('n/a', 'the record has no classes')
    const looks = s?.closer ?? []
    cells.closer = !looks.length ? cell('n/a')
      : looks.some((l) => l.working) ? cell('amber', 'a working line', looks.find((l) => l.working).at) : green(looks[0].at)
    for (const lang of langs) {
      if (!s) { cells[lang] = none; continue }
      const gaps = ['line', 'drawer', 'chapter'].filter((k) => s[k]?.en && translated(catalogs.get(lang), s[k]) === undefined)
      cells[lang] = gaps.length ? cell('red', `no ${lang} words for the ${gaps.join(', ')} (reads in English)`, `lang/${lang}/*.json, keys of ${s.line?.at ?? id}`) : green(`lang/${lang}`)
    }
    return { id, cells }
  })
  const wingRows = ['opening', 'door', 'ending'].map((part) => {
    const slots = wing[part] ?? []
    const bad = slots.map((p) => textCell(p)).find((c) => c.state !== 'green')
    const absent = (wing.absent ?? []).filter((a) => a.part === part)
    const cells = { words: !slots.length ? cell('red', `no ${part} words`, `${wing.wing} adapter`) : bad ?? green(`${slots.length} pairs`) }
    for (const a of absent) cells[a.slot] = cell('red', a.says, a.at)
    return { part, cells }
  })
  return { wing: wing.wing, slots: [...SLOTS, ...langs], rows, wingRows }
}

export function lineReds(result) {
  return result.rows.filter((r) => r.cells.line.state === 'red').map((r) => ({ id: r.id, ...r.cells.line }))
}

export function runCensus(dir, { root = museumRoot } = {}) {
  const film = JSON.parse(fs.readFileSync(path.join(dir, 'film.json'), 'utf8'))
  const adapter = adapters[film.wing]
  if (!adapter) throw new Error(`no census adapter for the wing "${film.wing}"`)
  return census({ wing: adapter(root), film, dir, catalogs: readCatalogs(root) })
}

const MARK = { green: 'G', amber: 'A', red: 'R', 'n/a': '-' }

export function table(result) {
  const out = [`| stop | ${result.slots.join(' | ')} |`, `|${'---|'.repeat(result.slots.length + 1)}`]
  for (const r of result.rows) out.push(`| ${r.id} | ${result.slots.map((k) => MARK[r.cells[k]?.state] ?? '?').join(' | ')} |`)
  out.push('', '| wing part | cells |', '|---|---|')
  for (const w of result.wingRows) out.push(`| ${w.part} | ${Object.entries(w.cells).map(([k, c]) => `${k} ${MARK[c.state]}`).join(', ')} |`)
  const notes = []
  for (const r of result.rows) for (const [k, c] of Object.entries(r.cells)) {
    if (c.state === 'red' || c.state === 'amber') notes.push(`- ${MARK[c.state]} ${r.id} ${k}: ${c.says} [${c.at}]`)
  }
  for (const w of result.wingRows) for (const [k, c] of Object.entries(w.cells)) {
    if (c.state === 'red' || c.state === 'amber') notes.push(`- ${MARK[c.state]} ${w.part} ${k}: ${c.says} [${c.at}]`)
  }
  return [...out, '', ...notes].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--museum')
  const root = at >= 0 ? path.resolve(args[at + 1]) : museumRoot
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--museum')
  if (!dir) { console.error('usage: census.mjs <release dir> [--museum <museum root>] [--json]'); process.exit(2) }
  const result = runCensus(path.resolve(dir), { root })
  console.log(args.includes('--json') ? JSON.stringify(result, null, 1) : table(result))
}
