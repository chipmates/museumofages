// THE LANGUAGE CATALOGS, CHECKED FROM WHAT THE REPOSITORY HOLDS.
//
//   node forge/lang/check.mjs [lang dir]      default: museum/lang
//
// Each language folder holds its catalogs (`<chunk>.json`, a flat object from a
// content key to a text), `status.json` (src, beat, status, at per key) and
// `tag.json` (whether a surface still carries the translation tag). This check
// needs neither the English nor the German: every catalog a flat object of
// 16-hex keys and strings (or plural forms), every placeholder well formed, no
// dash or semicolon, and the status and the tag agreeing with the catalogs. A
// passage of his words may name its source beside it (`prov.<key>.kind`,
// `.label`, `.rest`): an old edition of the language, or the museum's own.
// A file whose name starts with `_` is a fixture: it is reported, as it must
// never land. Exit 1 on any problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = /^[0-9a-f]{16}$/
const PROV = /^prov\.([0-9a-f]{16})\.(kind|label|rest)$/
const TAG = /^[a-z]{2,3}(?:-[A-Z]{2})?$/
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
const STATUS = new Set(['kept', 'draft', 'checked', 'frozen', 'native'])
const SURFACES = ['walk', 'records', 'codex', 'pictures']
/** Which surface a chunk's strings stand on. */
export const SURFACE_OF = { walk: 'walk', machines: 'records', life: 'records', codex: 'codex', pictures: 'pictures', credits: 'pictures' }
const SIGNS = /[—–;]/

/** Placeholders: `{name}`, `{0}`, `{museum:fly_age}`; a brace never stands alone or nested. */
export function placeholderProblem(text) {
  let open = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (open >= 0) return 'a brace opens inside a placeholder'
      open = i
    } else if (text[i] === '}') {
      if (open < 0) return 'a brace closes with none open'
      if (!/^[A-Za-z0-9_][A-Za-z0-9_:.]*$/.test(text.slice(open + 1, i))) return `a malformed placeholder ${text.slice(open, i + 1)}`
      open = -1
    }
  }
  return open >= 0 ? 'a placeholder never closes' : null
}

/** The problems of one language, from its files as parsed values: { name: value }. */
export function checkLanguage(tag, files) {
  const problems = []
  const say = (file, msg) => problems.push(`${tag}/${file}: ${msg}`)
  if (!TAG.test(tag)) problems.push(`${tag}: not a language tag`)
  const chunks = Object.keys(files).filter((f) => f !== 'status.json' && f !== 'tag.json')
  for (const f of chunks.filter((x) => x.startsWith('_'))) say(f, 'a fixture: drop it before landing')
  const real = chunks.filter((f) => !f.startsWith('_'))
  if (!real.length) return problems
  const status = files['status.json']
  const tagFile = files['tag.json']
  if (!status || typeof status !== 'object' || Array.isArray(status)) { say('status.json', 'missing or not an object'); return problems }
  if (!tagFile || typeof tagFile !== 'object' || Array.isArray(tagFile)) say('tag.json', 'missing or not an object')

  // every status record well formed, and never a commit id
  for (const [key, rec] of Object.entries(status)) {
    if (!KEY.test(key)) { say('status.json', `${key} is not a content key`); continue }
    if (!rec || typeof rec !== 'object') { say('status.json', `${key} has no record`); continue }
    for (const f of Object.keys(rec)) if (!['src', 'beat', 'status', 'at', 'verbatim_signs'].includes(f)) say('status.json', `${key} has a field ${f}`)
    if (!/^[0-9a-f]{12}$/.test(rec.src ?? '')) say('status.json', `${key} src is not 12 hex`)
    if (rec.beat !== undefined && !/^[0-9a-f]{12}$/.test(rec.beat)) say('status.json', `${key} beat is not 12 hex`)
    if (!STATUS.has(rec.status)) say('status.json', `${key} status ${rec.status} is not one of ${[...STATUS].join(', ')}`)
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(rec.at ?? '')) say('status.json', `${key} at ${rec.at} is not a time as date gives it`)
    if (JSON.stringify(rec).match(/\b[0-9a-f]{40}\b/)) say('status.json', `${key} names a commit`)
  }

  // every catalog: a flat object, 16-hex keys, strings or plural forms, no dash or semicolon
  const seen = new Map()
  const provs = []
  const surface = Object.fromEntries(SURFACES.map((s) => [s, []]))
  for (const f of real) {
    const d = files[f]
    const chunk = f.replace(/\.json$/, '')
    if (!d || typeof d !== 'object' || Array.isArray(d)) { say(f, 'not a flat object'); continue }
    if (!SURFACE_OF[chunk]) say(f, `not one of the chunks ${Object.keys(SURFACE_OF).join(', ')}`)
    for (const [key, value] of Object.entries(d)) {
      const prov = PROV.exec(key)
      if (prov) { provs.push([f, key, prov[1], prov[2], value]); continue }
      if (!KEY.test(key)) { say(f, `${key} is not a content key`); continue }
      if (seen.has(key)) say(f, `${key} stands in ${seen.get(key)} too`)
      seen.set(key, f)
      const texts = typeof value === 'string' ? [value]
        : value && typeof value === 'object' && !Array.isArray(value) && 'other' in value && Object.keys(value).every((k) => PLURAL.has(k)) && Object.values(value).every((v) => typeof v === 'string') ? Object.values(value)
          : null
      if (!texts) { say(f, `${key} is neither a string nor plural forms with other`); continue }
      for (const t of texts) {
        if (!t.trim()) say(f, `${key} is empty`)
        const p = placeholderProblem(t)
        if (p) say(f, `${key}: ${p}`)
        if (SIGNS.test(t) && !status[key]?.verbatim_signs) say(f, `${key} holds a dash or a semicolon`)
      }
      const rec = status[key]
      if (!rec) say('status.json', `${key} of ${f} has no status`)
      else if (rec.status === 'kept') say('status.json', `${key} is kept, yet ${f} ships it`)
      if (SURFACE_OF[chunk]) surface[SURFACE_OF[chunk]].push(rec?.status)
    }
  }
  for (const [key, rec] of Object.entries(status)) if (rec?.status && rec.status !== 'kept' && !seen.has(key)) say('status.json', `${key} is ${rec.status} and stands in no catalog`)

  // a passage's source: its passage stands in the same catalog, the kind is a word the page knows, a label a text
  for (const [f, key, of, field, value] of provs) {
    if (seen.get(of) !== f) say(f, `${key} names a passage ${f} does not hold`)
    if (field === 'kind') { if (value !== 'edition' && value !== 'ours') say(f, `${key} is ${JSON.stringify(value)}, not edition or ours`); continue }
    if (typeof value !== 'string' || !value.trim()) { say(f, `${key} is not a text`); continue }
    const p = placeholderProblem(value)
    if (p) say(f, `${key}: ${p}`)
    if (SIGNS.test(value)) say(f, `${key} holds a dash or a semicolon`)
  }

  // the tag: true until every string on its surface is native
  if (tagFile && typeof tagFile === 'object') {
    for (const s of SURFACES) {
      if (typeof tagFile[s] !== 'boolean') { say('tag.json', `${s} is not true or false`); continue }
      const list = surface[s]
      const want = !(list.length && list.every((x) => x === 'native'))
      if (tagFile[s] !== want) say('tag.json', `${s} is ${tagFile[s]}, the catalogs say ${want}`)
    }
    for (const k of Object.keys(tagFile)) if (!SURFACES.includes(k)) say('tag.json', `${k} is not a surface`)
  }
  return problems
}

/** Every language folder under a lang directory, read from disk. */
export function checkDir(dir) {
  const problems = []
  if (!existsSync(dir)) return problems
  for (const tag of readdirSync(dir).sort()) {
    const folder = join(dir, tag)
    if (!statSync(folder).isDirectory()) continue
    const files = {}
    for (const f of readdirSync(folder).filter((x) => x.endsWith('.json')).sort()) {
      try { files[f] = JSON.parse(readFileSync(join(folder, f), 'utf8')) } catch (e) { problems.push(`${tag}/${f}: not JSON (${e.message})`) }
    }
    problems.push(...checkLanguage(tag, files))
  }
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lang'))
  const problems = checkDir(dir)
  for (const p of problems) console.log(p)
  console.log(problems.length ? `${problems.length} problem(s) in ${dir}` : `${dir}: every catalog holds`)
  process.exit(problems.length ? 1 : 0)
}
