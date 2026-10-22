// THE STORE LINT. The other checks prove that a record has its lines; this
// one reads what the lines say. A label has to agree with its own record,
// with the duties of the rights policy, with every copy of the record, and
// (when the saved source pages are handed in) with what its source asks.
//
//   node forge/store-lint.mjs [--json] [--quiet] [--warnings] [--sources <dir>]...
//
// It reads the merged records the build uses (mergeManifests), writes
// nothing and fetches nothing. Exit 1 on any error; warnings never fail.
// --sources (repeatable) names a folder of saved Commons /wiki/File: pages,
// searched below it for .html and matched to records by the page's own
// file name, so any naming of the saved files will do.
//
// The rules, by the brief's four groups:
//   1. a record agrees with itself: its rights tier against its class, its
//      licence line and the tier's own sentences on the label; a note's
//      rights claim against the fields
//   2. the policy's duties: the art. 108 line on an Italian holder's Tier 2
//      label; a licence address and a credit with every Creative Commons
//      licence; "Foto" in German; no dash in a label
//   3. a record and its copies: the app's own painting rule (encoded from
//      validatePaintingRecord and resolveManifestWorkPlates in
//      src/wings/vinci/pictures/policy.ts), the fields a preview, a pyramid
//      and a thumbnail repeat, and a hanging plate the policy cannot label
//   4. (--sources) a source page that asks for attribution, against a label
//      that names no credit
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/* ------------------------------------------------------------ the rules */

/** every rule the lint knows, its group and the reason it exists */
export const RULES = {
  'tier-form': [1, 'the app reads a rights tier only as TIER1, TIER2 or TIER3 (a likeness: 1 or 2 with class "Tier N")'],
  'tier-class': [1, 'an open licence class (CC0, CC-BY, CC-BY-SA) is Tier 1; Tier 2 is a faithful reproduction of a public-domain work (PD-ART)'],
  'tier-licence': [1, 'a non-commercial or no-derivatives licence is Tier 3, never Tier 1 or 2; a Commons PD-Art tag is the Tier 2 basis'],
  'class-licence': [1, 'an open licence class names the licence family its licence line names'],
  'tier-label': [1, 'a Tier 2 label says the policy\'s sentences (public domain, the reproduction, non-profit use); a Tier 1 label does not; a Tier 3 label names its licence'],
  'note-tier': [1, 'a note\'s rights decision names the tier the record carries'],
  'note-licence': [1, 'a licence a note\'s rights decision names is the licence the record carries'],
  'art-108': [2, 'the rights policy\'s Tier 2: an Italian holder\'s work names the Codice dei beni culturali art. 108 exemption on its label'],
  'cc-address': [2, 'a Creative Commons licence stands on the label as a link, so the record carries a licence_url for the licence it names'],
  'cc-credit': [2, 'an attribution licence (CC BY family) is honoured on the label: the licence named and the credit its licence line gives'],
  'photo-de': [2, 'the house writes the German credit "Foto:"'],
  'dash': [2, 'displayed text has no dash (en, em, spaced hyphen); a year range is written with "to" / "bis"'],
  'painting-policy': [3, 'the app refuses a painting record or a work that breaks validatePaintingRecord or resolveManifestWorkPlates'],
  'copy': [3, 'a preview, a pyramid and a thumbnail repeat their source\'s rights fields verbatim'],
  'legacy-plate': [3, 'a hanging painting plate carries its tier and label (the rights policy); the app accepts a tier only on a full policy record'],
  'source-credit': [4, 'where the source page asks for attribution (a licence flag or the photographer\'s request), the label credits him'],
}

const LABEL_FIELDS_EN = ['honesty_en', 'label_en', 'italian_state_en']
const LABEL_FIELDS_DE = ['honesty_de', 'label_de', 'italian_state_de']
const LABEL_FIELDS = [...LABEL_FIELDS_EN, ...LABEL_FIELDS_DE]
const OPEN_CLASSES = new Set(['CC0', 'CC-BY', 'CC-BY-SA'])
/** the render tiers a generated asset carries; never a rights tier */
const RENDER_TIERS = new Set(['calm', 'standard', 'hero'])

const textOf = (record, fields) => fields.map((f) => record[f]).filter((v) => typeof v === 'string' && v.trim()).join(' ')
const hasLabel = (record) => LABEL_FIELDS.some((f) => typeof record[f] === 'string' && record[f].trim())
const isPyramid = (record) => /-tiles$/.test(record.role ?? '')

/** the rights tier a record claims, as 1, 2 or 3; null when it claims none;
    'bad' when it carries a tier the app cannot read */
export function rightsTier(record) {
  const t = record.tier
  if (t === undefined || t === null) return null
  if (record.class === 'GENERATED' && RENDER_TIERS.has(t)) return null
  if (typeof t === 'string' && /^TIER[123]$/.test(t)) return Number(t.slice(4))
  if (typeof t === 'number' && /^Tier [12]$/.test(record.class ?? '')) return t
  return 'bad'
}

/* --------------------------------------------- licences named in a text */

/** every Creative Commons licence or tool a text names, as {type, version}:
    type is by, by-sa, by-nc, by-nc-sa, by-nd, by-nc-nd, zero or mark */
export function licencesIn(text) {
  const out = []
  if (typeof text !== 'string' || !text) return out
  const add = (type, version) => {
    if (!out.some((l) => l.type === type && l.version === version)) out.push({ type, version: version ?? null })
  }
  for (const m of text.matchAll(/\bCC[ -]?BY((?:[ -](?:NC|SA|ND))*)(?:[ -](\d\.\d))?/g))
    add(`by${m[1].toLowerCase().replace(/ /g, '-')}`, m[2])
  for (const m of text.matchAll(/Creative Commons Attribution((?:[ -](?:Share[ -]?Alike|Non[ -]?Commercial|No[ -]?Deriv(?:s|atives)))*)(?: (?:International )?(?:licen[cs]e )?(\d\.\d))?/gi)) {
    const parts = m[1].toLowerCase()
    add(`by${/non/.test(parts) ? '-nc' : ''}${/share/.test(parts) ? '-sa' : ''}${/deriv/.test(parts) ? '-nd' : ''}`, m[2])
  }
  for (const m of text.matchAll(/Reconocimiento(-CompartirIgual)? (\d\.\d)[^.]*Creative Commons/g)) add(m[1] ? 'by-sa' : 'by', m[2])
  if (/\bCC0\b|\bCC Zero\b|Creative Commons Zero|Public Domain Dedication/i.test(text)) add('zero', '1.0')
  if (/Public Domain Mark/i.test(text)) add('mark', '1.0')
  return out
}

/** the licence a creativecommons.org address names, or null for another site */
export function licenceOfUrl(url) {
  if (typeof url !== 'string') return null
  const m = /^https?:\/\/creativecommons\.org\/(?:licenses\/([a-z-]+)\/(\d\.\d)|publicdomain\/(zero|mark)\/(\d\.\d)|share-your-work\/public-domain\/(cc0|pdm))(?:\/|$)/.exec(url)
  if (!m) return null
  if (m[1]) return { type: m[1], version: m[2] }
  if (m[3]) return { type: m[3], version: m[4] }
  return { type: m[5] === 'cc0' ? 'zero' : 'mark', version: '1.0' }
}

const isAttribution = (l) => l.type.startsWith('by')
const sameFamily = (a, b) => a.type === b.type && (!a.version || !b.version || a.version === b.version)
/** one entry per licence and version */
const unique = (list) => list.filter((l, i) => list.findIndex((o) => o.type === l.type && o.version === l.version) === i)
const say = (l) => (l.type === 'zero' ? 'CC0' : l.type === 'mark' ? 'the Public Domain Mark' : `CC ${l.type.toUpperCase()}${l.version ? ` ${l.version}` : ''}`)

/* ------------------------------------------------------ titles and dashes */

/** the file a record's source names on Wikimedia Commons, in words */
export function commonsFileOf(record) {
  for (const url of [record.source_url, record.original_url]) {
    if (typeof url !== 'string') continue
    let name = /commons\.wikimedia\.org\/wiki\/File:([^?#]+)/.exec(url)?.[1]
      ?? /upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(url)?.[1]
    if (!name) continue
    try { name = decodeURIComponent(name) } catch { /* keep it as written */ }
    return name.replace(/_/g, ' ').normalize('NFC')
  }
  return null
}

/** the title a file name gives, which a label may quote: the name without
    its extension */
const titleOf = (file) => file?.replace(/\.[A-Za-z0-9]{2,4}$/, '') ?? null

const DASH = /[‒–—―⸺⸻]| -{1,2} |(?<=\S)--(?=\S)/g
const DASHED_YEARS = /\b(\d{3,4})\s?[‒–—]\s?(\d{2,4})\b/
const HYPHEN_YEARS = /(?<![\d/.-])\b(1[0-9]{3})-(\d{2}|1[0-9]{3})\b(?![\d-])/g

/** every dash a label shows, with where it stands: inside a title quoted
    from the source's file name, or in the label's own words */
export function dashesIn(text, fileTitle) {
  const found = []
  if (typeof text !== 'string') return found
  const quoted = []
  if (fileTitle) {
    for (let at = text.indexOf(fileTitle); at >= 0; at = text.indexOf(fileTitle, at + 1)) quoted.push([at, at + fileTitle.length])
  }
  for (const m of text.matchAll(DASH)) {
    const inTitle = quoted.some(([a, b]) => m.index >= a && m.index < b)
    const around = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24)
    found.push({ dash: m[0], at: m.index, inTitle, around, years: DASHED_YEARS.test(text.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6)) })
  }
  return found
}

/** year ranges written with a hyphen ("1487-1489"), outside URLs */
export function hyphenRanges(text) {
  if (typeof text !== 'string') return []
  const bare = text.replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length))
  return [...bare.matchAll(HYPHEN_YEARS)].map((m) => m[0])
}

/* --------------------------------------------------------- Italian holders */

/** a holder in Italy, by the place or the house its holder line names. The
    Vatican is its own state and stays outside. */
const ITALIAN = /\b(Ital(?:y|ia|ian)|Milan|Milano|Florence|Firenze|Turin|Torino|Venice|Venezia|Rome|Roma|Naples|Napoli|Parma|Bologna|Genoa|Genova|Siena|Pisa|Urbino|Uffizi|Ambrosiana|Trivulziana|Sforzesco|Brera)\b/
export const isItalianHolder = (holder) => typeof holder === 'string' && ITALIAN.test(holder) && !/Vatican/i.test(holder)
const ART_108 = /\b(?:art\.|Art\.|Artikel|article|Article)\s*108\b/

/* --------------------------------------------- the app's painting rule */

const DISPLAY_CLASSES = new Set(['CAPTURED', 'CC0', 'CC-BY', 'CC-BY-SA', 'PD-ART'])
const WORK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PAINTING_ID = /^vinci\/(painting-preview|painting-plate)\/([a-z0-9-]+)(?:__([1-9]\d*)x([1-9]\d*))?$/
const PAINTING_PATH = /^paintings\/([a-z0-9-]+)\/([a-z0-9-]+)__([1-9]\d*)x([1-9]\d*)\.jpg$/

/** validatePaintingRecord of the app, field by field: what it refuses in a
    record and why, or the record's identity and pixels when it admits it.
    The message names the app's own error; the reasons name the fields. */
export function paintingVerdict(e) {
  const match = PAINTING_ID.exec(e.id ?? '')
  const path = PAINTING_PATH.exec(e.path ?? '')
  const why = []
  if (!match) why.push('id: not vinci/painting-plate|painting-preview/<name>[__WxH]')
  if (!path) why.push('path: not paintings/<work>/<name>__WxH.jpg')
  if (!WORK_ID.test(e.work_id ?? '')) why.push('work_id: missing or malformed')
  if (match && e.role !== match[1]) why.push(`role: ${e.role} where the id says ${match[1]}`)
  if (e.wing !== 'wing-vinci') why.push(`wing: ${e.wing}`)
  if (e.display !== true) why.push('display: not true')
  if (!DISPLAY_CLASSES.has(e.class)) why.push(`class: ${e.class} is not displayable`)
  if (path && path[1] !== e.work_id) why.push(`path: the folder says ${path[1]}, work_id says ${e.work_id}`)
  if (!/^[a-f0-9]{64}$/.test(e.sha256 ?? '')) why.push('sha256: missing or malformed')
  if (!e.licence?.trim?.()) why.push('licence: empty')
  if (why.length) return { refused: 'Inadmissible painting manifest record', why }
  const width = Number(path[3]), height = Number(path[4])
  if (width * height !== e.pixels) why.push(`pixels: ${e.pixels}, the path says ${width}x${height}`)
  if (Math.max(width, height) > (e.role === 'painting-preview' ? 1024 : 4096)) why.push(`path: ${width}x${height} is over the role's long edge`)
  if (e.width !== undefined && e.width !== width) why.push(`width: ${e.width}, the path says ${width}`)
  if (e.height !== undefined && e.height !== height) why.push(`height: ${e.height}, the path says ${height}`)
  if (match[3] !== undefined && (Number(match[3]) !== width || Number(match[4]) !== height)) why.push('id: its pixels are not the path\'s')
  if (why.length) return { refused: 'Painting dimensions disagree', why }
  const policy = e.tier !== undefined || e.plate_id !== undefined || e.honesty_en !== undefined || e.honesty_de !== undefined
  if (policy) {
    if (!['TIER1', 'TIER2'].includes(e.tier ?? '')) why.push(`tier: ${e.tier === undefined ? 'missing' : e.tier}, the app takes TIER1 or TIER2`)
    if (!e.honesty_en?.trim?.()) why.push('honesty_en: missing')
    if (!e.honesty_de?.trim?.()) why.push('honesty_de: missing')
    if (!e.plate_id) why.push('plate_id: missing')
    if (!e.source_url?.trim?.()) why.push('source_url: missing')
    if (e.plate_id) {
      if (!(e.plate_id === e.work_id || e.plate_id.startsWith(`${e.work_id}:`))) why.push(`plate_id: ${e.plate_id} is not ${e.work_id} or ${e.work_id}:<state>`)
      if (!/^[a-z0-9-]+(?::[a-z0-9-]+)?$/.test(e.plate_id)) why.push(`plate_id: ${e.plate_id} is malformed`)
      const named = e.plate_id.replace(':', '-')
      if (path[2] !== named) why.push(`path: the file is named ${path[2]}, the plate_id asks ${named}`)
    }
    if (match[2] !== path[2]) why.push(`id: named ${match[2]}, the file ${path[2]}`)
    if (why.length) return { refused: 'Incomplete or mismatched painting policy', why }
    return { identity: e.plate_id, pixels: { width, height }, legacy: false }
  }
  const front = match[2] === e.work_id || match[2] === `${e.work_id}-obverse`
  const reverse = match[2] === `${e.work_id}-reverse`
  if (!front && !reverse) why.push(`id: ${match[2]} is no face of ${e.work_id}`)
  if (path[2] !== e.work_id) why.push(`path: the file is named ${path[2]}, a legacy face is named ${e.work_id}`)
  if (match[3] !== undefined) why.push('id: a legacy record carries no pixels in its id')
  if (why.length) return { refused: 'Unknown legacy painting face', why }
  return { identity: reverse ? `${e.work_id}:reverse` : e.work_id, pixels: { width, height }, legacy: true }
}

/** resolveManifestWorkPlates of the app over one work: supersession, the
    choice, and one matching preview per surviving plate whose labels and
    shape are the plate's. Returns the problems and the surviving plates. */
export function resolveWork(workId, records, byId) {
  const problems = []
  const valid = records.filter((r) => r.verdict.identity)
  const seen = new Set()
  for (const r of records) {
    if (seen.has(r.entry.id)) problems.push([r.entry, 'id', 'Duplicate painting manifest id'])
    seen.add(r.entry.id)
  }
  const full = valid.filter((r) => r.entry.role === 'painting-plate')
  const superseded = new Set()
  for (const r of full) for (const id of r.entry.supersedes ?? []) {
    const target = byId.get(id)
    if (!r.entry.tier || !target || target.work_id !== workId || target.role !== 'painting-plate' || id === r.entry.id) {
      problems.push([r.entry, 'supersedes', `Invalid painting supersession: ${id} is not another plate of ${workId}, or the record has no tier`])
      continue
    }
    superseded.add(id)
  }
  const surviving = full.filter((r) => !superseded.has(r.entry.id))
  if (full.length && !surviving.length) problems.push([full[0].entry, 'supersedes', `Cyclic painting supersession: no plate of ${workId} survives`])
  for (const r of surviving) for (const id of r.entry.chosen_over ?? []) {
    const target = surviving.find((c) => c.entry.id === id)
    if (!r.entry.tier || !target || id === r.entry.id || (target.entry.chosen_over ?? []).includes(r.entry.id))
      problems.push([r.entry, 'chosen_over', `Invalid painting choice: ${id}`])
  }
  for (const r of surviving) {
    const matches = valid.filter((c) => c.entry.role === 'painting-preview' && c.verdict.identity === r.verdict.identity
      && c.entry.tier === r.entry.tier && c.entry.source_url === r.entry.source_url && c.entry.licence === r.entry.licence)
    if (matches.length !== 1) {
      const kin = valid.filter((c) => c.entry.role === 'painting-preview' && c.verdict.identity === r.verdict.identity)
      const differs = kin.map((c) => `${c.entry.id} differs in ${['tier', 'source_url', 'licence'].filter((k) => c.entry[k] !== r.entry[k]).join(', ') || 'nothing'}`)
      problems.push([r.entry, 'tier, source_url, licence', `Painting needs one matching preview: ${matches.length} match` + (differs.length ? ` (${differs.join('; ')})` : ' (no preview of this face)')])
      continue
    }
    const p = matches[0]
    const pw = p.verdict.pixels, rw = r.verdict.pixels
    const factor = Math.max(pw.width, pw.height) / Math.max(rw.width, rw.height)
    const fields = []
    if (pw.width > rw.width || pw.height > rw.height || Math.abs(pw.width - rw.width * factor) > 1.1 || Math.abs(pw.height - rw.height * factor) > 1.1) fields.push('path (shape)')
    if (p.entry.honesty_en !== r.entry.honesty_en) fields.push('honesty_en')
    if (p.entry.honesty_de !== r.entry.honesty_de) fields.push('honesty_de')
    if (fields.length) problems.push([p.entry, fields.join(', '), `Painting preview changes the source: ${r.entry.id}`])
  }
  return { problems, surviving: surviving.map((r) => r.entry) }
}

/* ------------------------------------------------------- source pages */

const plain = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim()

/** what a saved Commons /wiki/File: page says about attribution: the file,
    each licence with its attribution flag, the attribution text a licence
    names, the author row, and a request for credit in the page's words */
export function readCommonsPage(html) {
  const doc = html.replace(/&#95;/g, '_')
  let file = /<link rel="canonical" href="https:\/\/commons\.wikimedia\.org\/wiki\/File:([^"#?]+)"/.exec(doc)?.[1]
    ?? /<title>File:(.*?) - Wikimedia Commons<\/title>/.exec(doc)?.[1]
  if (!file) return null
  try { file = decodeURIComponent(file) } catch { /* keep it */ }
  file = plain(file).replace(/_/g, ' ').normalize('NFC')
  const spans = (cls) => [...doc.matchAll(new RegExp(`<span class="${cls}"[^>]*>([\\s\\S]*?)</span>`, 'g'))].map((m) => plain(m[1]))
  const shorts = spans('licensetpl_short')
  const attrReq = spans('licensetpl_attr_req')
  const licences = shorts.map((short, i) => ({ short, attributionRequired: attrReq[i] === 'true' }))
  const attribution = spans('licensetpl_attr').filter(Boolean)
  const authors = [...doc.matchAll(/<td[^>]*id="fileinfotpl_aut"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .filter((m) => /Author|Photograph/i.test(plain(m[1]))).map((m) => plain(m[2]))
  const text = plain(doc)
  const request = /(?:Please|please) (?:credit|attribute)(?: (?:it|this (?:image|photo|file|work)|the (?:photo|image|author|photographer)))?(?: (?:with|as|to))?:? ?(.+?)(?: in the immediate vicinity| when| if|\.(?: |$))/.exec(text)
  return { file, licences, attribution, authors, request: request ? request[1].trim() : null,
    asks: attrReqTrue(licences) || Boolean(request) }
}
const attrReqTrue = (licences) => licences.some((l) => l.attributionRequired)

/** every saved Commons page below a folder, by the file it shows */
export function readSources(dir) {
  const pages = new Map()
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.html?$/i.test(e.name)) {
        const page = readCommonsPage(readFileSync(full, 'utf8'))
        if (page && !pages.has(page.file)) pages.set(page.file, { ...page, saved: full })
      }
    }
  }
  walk(dir)
  return pages
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ')
/** the names a credit request gives, cut from the page's words */
function creditNames(page) {
  const raw = [...page.attribution, ...(page.request ? [page.request] : []), ...page.authors]
  const names = []
  for (const r of raw) {
    for (const part of r.replace(/https?:\/\/\S+/g, ' ').split(/[,;/()|]| and | by |:/)) {
      const n = part.replace(/\b(Own work|own work|talk|contribs|User|Photo|Foto|Photograph(?:er)?|Author|Unknown author|Unknown)\b/g, ' ').replace(/\s+/g, ' ').trim()
      if (n.length >= 3 && /\p{L}/u.test(n)) names.push(n)
    }
  }
  return [...new Set(names)]
}

/* ------------------------------------------------------------ the lint */

/** Every finding over a list of merged records. `pages` is what --sources
    read, `works` the app's painting register (id -> rights_class). */
export function lintRecords(assets, { pages = null, works = null } = {}) {
  const findings = []
  const byId = new Map(assets.map((a) => [a.id, a]))
  const add = (level, rule, record, field, message) => findings.push({ level, rule, group: RULES[rule][0], id: record.id, field, message })
  const error = (...args) => add('error', ...args)
  const warn = (...args) => add('warning', ...args)

  for (const r of assets) {
    const tier = rightsTier(r)
    const en = textOf(r, LABEL_FIELDS_EN), de = textOf(r, LABEL_FIELDS_DE)
    const labelled = hasLabel(r)
    const line = typeof r.licence === 'string' ? r.licence : ''
    const lineLicences = licencesIn(line)

    /* ---- 1. the record against itself */
    if (tier === 'bad') error('tier-form', r, 'tier', `${JSON.stringify(r.tier)} is no tier the app reads`)
    if (typeof tier === 'number') {
      if (/^Tier [12]$/.test(r.class ?? '') && Number(r.class.slice(5)) !== tier)
        error('tier-class', r, 'tier', `tier ${tier} where the class says ${r.class}`)
      if (tier > 1 && OPEN_CLASSES.has(r.class)) error('tier-class', r, 'tier', `Tier ${tier} on an open licence class (${r.class})`)
      if (tier === 2 && !['PD-ART', 'Tier 2'].includes(r.class)) error('tier-class', r, 'class', `${r.class} on a Tier 2 record, whose basis is a public-domain work (PD-ART)`)
      if (['GENERATED', 'CAPTURED', 'REFERENCE-ONLY'].includes(r.class)) error('tier-class', r, 'tier', `a rights tier on a ${r.class} record`)
      const restricted = lineLicences.filter((l) => /-(nc|nd)\b|-nc-|-nd$/.test(l.type))
      if (tier < 3 && restricted.length) error('tier-licence', r, 'licence', `Tier ${tier} with ${restricted.map(say).join(', ')}, which is Tier 3`)
      if (tier === 3 && !lineLicences.some((l) => /nc/.test(l.type))) error('tier-licence', r, 'licence', 'Tier 3 whose licence line names no non-commercial licence')
      if (tier === 1 && /\bPD-Art\b/.test(line)) error('tier-licence', r, 'licence', `Tier 1 whose licence line is a Commons PD-Art tag ("${line}"), the Tier 2 basis`)
    }
    if (OPEN_CLASSES.has(r.class) && line) {
      const want = r.class === 'CC0' ? ['zero'] : r.class === 'CC-BY' ? ['by'] : ['by-sa']
      const named = lineLicences.filter((l) => l.type !== 'mark')
      if (named.length && !named.some((l) => want.includes(l.type)))
        error('class-licence', r, 'class', `${r.class} while the licence line names ${named.map(say).join(', ')}`)
      else if (!named.length && r.class !== 'CC0' && labelled)
        warn('class-licence', r, 'class', `${r.class} while the licence line names no Creative Commons licence ("${line.slice(0, 80)}")`)
    }
    if (typeof tier === 'number' && !isPyramid(r)) {
      if (tier === 2) {
        if (!labelled) error('tier-label', r, 'honesty_en', 'a Tier 2 record with no label at all')
        else {
          for (const [lang, text, pd, np, rep] of [
            ['en', en, /public[- ]domain/i, /non-?profit|non-?commercial/i, /\breproduction\b/i],
            ['de', de, /gemeinfrei/i, /ohne Gewinnabsicht|nicht-?kommerziell/i, /Reproduktion/],
          ]) {
            const field = lang === 'en' ? (r.honesty_en !== undefined ? 'honesty_en' : 'label_en') : (r.honesty_de !== undefined ? 'honesty_de' : 'label_de')
            if (!text) { error('tier-label', r, field, `a Tier 2 record with no ${lang === 'en' ? 'English' : 'German'} label`); continue }
            if (!pd.test(text)) error('tier-label', r, field, 'a Tier 2 label that does not say the work is public domain')
            if (!np.test(text)) error('tier-label', r, field, 'a Tier 2 label without the non-profit cultural use')
            if (!rep.test(text)) warn('tier-label', r, field, 'a Tier 2 label that never says it labels the reproduction')
          }
        }
      }
      if (tier === 1) {
        for (const [field, text] of [['honesty_en', en], ['honesty_de', de]]) {
          const m = /labels the reproduction, not the|credit is for the reproduction, not the|kennzeichnet die Reproduktion, nicht|gilt der Reproduktion, nicht/.exec(text)
          if (m) error('tier-label', r, field, `a Tier 1 label that says the Tier 2 sentence ("...${m[0]}...")`)
        }
      }
      if (tier === 3 && labelled) {
        for (const [field, text] of [['honesty_en', en], ['honesty_de', de]]) {
          if (!lineLicences.some((l) => licencesIn(text).some((t) => sameFamily(t, l))))
            error('tier-label', r, field, `a Tier 3 label that does not name its licence (${lineLicences.map(say).join(', ') || line})`)
        }
      }
    }
    if (typeof r.note === 'string') {
      const { tiers: said, words } = noteClaims(r.note)
      if (said.length === 1 && tier !== 'bad' && said[0] !== tier && !isPyramid(r))
        error('note-tier', r, 'tier', `the note's rights decision says Tier ${said[0]}, the record ${tier === null ? 'carries no tier' : `says Tier ${tier}`}`)
      const own = [...lineLicences, ...licencesIn(en), ...licencesIn(de)]
      for (const l of words.flatMap((w) => licencesIn(w))) {
        if (!own.some((o) => sameFamily(o, l)))
          error('note-licence', r, 'licence', `the note's rights decision names ${say(l)}, the licence line and the labels do not ("${line.slice(0, 80)}")`)
      }
    }

    /* ---- 2. the policy's duties */
    if (tier === 2 && labelled && !isPyramid(r) && isItalianHolder(r.holder)) {
      if (!ART_108.test(en)) error('art-108', r, 'honesty_en', `an Italian holder (${r.holder}) and no art. 108 line in English`)
      if (!ART_108.test(de)) error('art-108', r, 'honesty_de', `an Italian holder (${r.holder}) and no art. 108 line in German`)
    }
    const shown = labelled || /^painting-(plate|preview)$/.test(r.role ?? '')
    if (shown && r.class !== 'GENERATED') {
      const named = unique([...lineLicences, ...licencesIn(en), ...licencesIn(de)].filter((l) => l.type !== 'mark'))
      const url = r.licence_url
      const urlLicence = licenceOfUrl(url)
      if (named.length && !url) error('cc-address', r, 'licence_url', `names ${named.map(say).join(', ')} and carries no licence_url`)
      else if (url && urlLicence && urlLicence.type !== 'mark') {
        // the app links the licence line's own words to this address
        const pdLine = /public domain|domaine public|gemeinfrei|domena publiczna/i.test(line)
        if (!lineLicences.some((l) => sameFamily(l, urlLicence)) && !(urlLicence.type === 'zero' && pdLine))
          error('cc-address', r, 'licence_url', `the address names ${say(urlLicence)}, the licence line ${lineLicences.length ? `names ${unique(lineLicences).map(say).join(', ')}` : 'names none'} ("${line.slice(0, 80)}")`)
      } else if (url && named.length && !urlLicence)
        error('cc-address', r, 'licence_url', `names ${named.map(say).join(', ')} and its licence_url is not a creativecommons.org address (${url})`)
    }
    if (labelled && r.class !== 'GENERATED' && !isPyramid(r)) {
      for (const l of lineLicences.filter(isAttribution)) {
        for (const [field, text] of [['honesty_en', en], ['honesty_de', de]]) {
          if (!licencesIn(text).some((t) => sameFamily(t, l))) error('cc-credit', r, field, `the licence line names ${say(l)}, the label does not`)
        }
      }
      const credit = creditInLine(line)
      if (credit && lineLicences.some(isAttribution)) {
        for (const [field, text] of [['honesty_en', en], ['honesty_de', de]]) {
          if (!fold(text).includes(fold(credit))) error('cc-credit', r, field, `the licence line credits "${credit}", the label does not`)
        }
      }
    }
    const fileTitle = titleOf(commonsFileOf(r))
    for (const field of LABEL_FIELDS) {
      const text = r[field]
      if (typeof text !== 'string') continue
      if (LABEL_FIELDS_DE.includes(field) && /\bPhoto\b/.test(text)) {
        const inTitle = fileTitle && text.includes(fileTitle) && /\bPhoto\b/.test(fileTitle)
        ;(inTitle ? warn : error)('photo-de', r, field, `"${text.match(/.{0,30}\bPhoto\b.{0,24}/)[0]}"${inTitle ? ' (inside the quoted file title)' : ''}`)
      }
      for (const d of dashesIn(text, fileTitle)) {
        const what = d.dash.trim() === '-' ? 'a spaced hyphen' : d.dash.trim() === '--' ? 'a double hyphen' : d.dash === '–' ? 'an en dash' : d.dash === '—' ? 'an em dash' : `a dash (U+${d.dash.codePointAt(0).toString(16).toUpperCase()})`
        const hint = d.years ? `; write the range with ${LABEL_FIELDS_DE.includes(field) ? '"bis"' : '"to"'}` : ''
        ;(d.inTitle ? warn : error)('dash', r, field, `${what} in "${d.around.trim()}"${d.inTitle ? ' (a title quoted from the file name)' : hint}`)
      }
      for (const range of hyphenRanges(text))
        warn('dash', r, field, `the year range "${range}" is written with a hyphen; the house writes ${LABEL_FIELDS_DE.includes(field) ? '"bis"' : '"to"'}`)
    }
  }

  /* ---- 1. one German Tier 2 sentence per scope: the policy gives only the
     English words, so each scope's own majority is its house form */
  const forms = new Map()
  for (const r of assets) {
    const m = /Reproduktion (aus|von) Wikimedia Commons/.exec(textOf(r, LABEL_FIELDS_DE))
    if (!m || rightsTier(r) !== 2) continue
    if (!forms.has(r.wing)) forms.set(r.wing, [])
    forms.get(r.wing).push([r, m[1]])
  }
  for (const [, list] of forms) {
    const aus = list.filter(([, w]) => w === 'aus').length
    const house = aus * 2 >= list.length ? 'aus' : 'von'
    for (const [r, w] of list) {
      if (w !== house) warn('tier-label', r, r.honesty_de !== undefined ? 'honesty_de' : 'label_de', `"Reproduktion ${w} Wikimedia Commons" where its scope writes "Reproduktion ${house}" (${list.filter(([, x]) => x === house).length} of ${list.length})`)
    }
  }

  /* ---- 3. the app's painting rule, work by work */
  const painting = assets.filter((a) => /^painting-(plate|preview)$/.test(a.role ?? '') || /^vinci\/painting-(plate|preview)\//.test(a.id))
  const verdicts = painting.map((entry) => ({ entry, verdict: paintingVerdict(entry) }))
  for (const { entry, verdict } of verdicts) {
    if (verdict.refused) error('painting-policy', entry, verdict.why.map((w) => w.split(':')[0]).join(', '), `the app refuses it (${verdict.refused}): ${verdict.why.join('; ')}${entry.work_id ? `; the work ${entry.work_id} fails to resolve` : ''}`)
  }
  const workIds = [...new Set(verdicts.map((v) => v.entry.work_id).filter(Boolean))].sort()
  const hanging = new Map()
  for (const workId of workIds) {
    const { problems, surviving } = resolveWork(workId, verdicts.filter((v) => v.entry.work_id === workId), byId)
    for (const [entry, field, message] of problems) error('painting-policy', entry, field, `${message}; the work ${workId} fails to resolve`)
    hanging.set(workId, surviving)
  }
  for (const [workId, plates] of hanging) {
    const rights = works?.get(workId)
    for (const plate of plates) {
      if (plate.tier !== undefined) continue
      if (works && rights !== 'DG') continue
      const verdict = paintingVerdict(plate)
      if (!verdict.identity) continue
      const stem = verdict.identity.replace(':', '-')
      const idStem = PAINTING_ID.exec(plate.id)?.[2], fileStem = PAINTING_PATH.exec(plate.path)?.[2]
      const needs = [idStem !== stem && `the id renamed to ${stem} (it is ${idStem})`, fileStem !== stem && `the file renamed to ${stem}__WxH.jpg (it is ${fileStem})`].filter(Boolean)
      error('legacy-plate', plate, 'tier', `the plate hangs${rights ? ` (${workId} is ${rights} in paintings.json)` : ''} with no tier and no label. A tier is accepted only with plate_id ${verdict.identity}, both labels, on plate and preview alike` + (needs.length ? `, and ${needs.join(' and ')}` : ''))
    }
  }

  /* ---- 3. the copies */
  const CORE = ['class', 'licence', 'holder', 'source_url']
  const compare = (copy, source, { required = [], ifPresent = [], ifBoth = [] }) => {
    for (const k of required) {
      if ((copy[k] ?? null) !== (source[k] ?? null)) error('copy', copy, k, `${JSON.stringify(short(copy[k]))} where its source ${source.id} says ${JSON.stringify(short(source[k]))}`)
    }
    for (const k of ifPresent) {
      if (copy[k] !== undefined && copy[k] !== source[k]) error('copy', copy, k, `${JSON.stringify(short(copy[k]))} where its source ${source.id} says ${JSON.stringify(short(source[k]))}`)
    }
    for (const k of ifBoth) {
      if (copy[k] !== undefined && source[k] !== undefined && copy[k] !== source[k]) error('copy', copy, k, `${JSON.stringify(short(copy[k]))} where its source ${source.id} says ${JSON.stringify(short(source[k]))}`)
    }
  }
  const labels = ['tier', 'honesty_en', 'honesty_de', 'rights_notice']
  for (const r of assets) {
    if (r.role === 'painting-tiles') {
      const plate = byId.get(r.derived_from)
      if (plate) compare(r, plate, { required: [...CORE, ...(plate.licence_url !== undefined ? ['licence_url'] : [])], ifPresent: [...labels, 'licence_url'] })
    } else if (['codex-tiles', 'leaf-tiles', 'deep-tiles'].includes(r.role)) {
      const page = byId.get(r.derived_from)
      if (page) compare(r, page, { required: CORE, ifPresent: [...labels, 'excludedFromContentLicence'], ifBoth: ['licence_url'] })
    } else if (r.role === 'painting-preview') {
      const v = paintingVerdict(r)
      if (!v.identity) continue
      const plates = assets.filter((p) => p.role === 'painting-plate' && p.work_id === r.work_id && p.tier === r.tier && p.source_url === r.source_url && paintingVerdict(p).identity === v.identity)
      if (plates.length === 1) compare(r, plates[0], { required: ['class', 'holder', ...(plates[0].licence_url !== undefined ? ['licence_url'] : [])], ifPresent: ['licence_url'] })
    } else if (r.role === 'exhibit-preview' && typeof r.source === 'string') {
      const source = byId.get(r.source)
      if (source) compare(r, source, { ifPresent: ['class', 'tier', 'honesty_en', 'honesty_de', 'licence_url'] })
    } else if (/-thumb$/.test(r.role ?? '')) {
      const source = byId.get(r.of_page) ?? siblingPage(r, assets)
      if (source) compare(r, source, { ifPresent: ['class', ...labels, 'licence', 'holder', 'excludedFromContentLicence'], ifBoth: ['licence_url'] })
    }
  }

  /* ---- 4. the source pages */
  if (pages) {
    for (const r of assets) {
      // a painting with no label of its own shows its licence line instead
      const lineOnly = !hasLabel(r) && /^painting-(plate|preview)$/.test(r.role ?? '')
      if ((!hasLabel(r) && !lineOnly) || isPyramid(r)) continue
      const file = commonsFileOf(r)
      const page = file && pages.get(file)
      if (!page || !page.asks) continue
      const names = creditNames(page)
      const why = page.request ? `the photographer asks: "${page.request}"` : `${page.licences.filter((l) => l.attributionRequired).map((l) => l.short).join(', ')} requires attribution`
      const sides = lineOnly ? [['licence', r.licence ?? '']] : [['honesty_en', textOf(r, LABEL_FIELDS_EN)], ['honesty_de', textOf(r, LABEL_FIELDS_DE)]]
      for (const [field, text] of sides) {
        const credited = names.length
          ? names.some((n) => fold(text).includes(fold(n)))
          : /\b(Photo|Foto|Image|Bild|Photograph by|Aufnahme von)\b/.test(text)
        if (!credited) error('source-credit', r, field, `${why} (${page.saved.split('/').slice(-2).join('/')}), and the label credits none of ${names.length ? names.map((n) => `"${n}"`).join(', ') : 'the authors'}`)
      }
    }
  }
  return findings
}

const short = (v) => (typeof v === 'string' && v.length > 90 ? `${v.slice(0, 87)}...` : v)

/** the rights decision a note records, in the four forms the store writes
    it: "Rights decision Q053: <reason>.", "Tier 2 under RIGHTS-POLICY.md v1:
    <reason>.", "(tier 1, source_open_holder_or_library)" and "Tier 3
    (non-commercial ...". Tiers named elsewhere in a note (a plate it was
    chosen over, a register it overrules) are history, not the claim. */
export function noteClaims(note) {
  const tiers = new Set(), words = []
  const sentence = '\\s*(.*?)(?:\\.(?:\\s|$)|$)'
  for (const m of note.matchAll(new RegExp(`Rights decision [A-Z]+\\d+:${sentence}`, 'g'))) words.push(m[1])
  for (const m of note.matchAll(new RegExp(`\\bTier ([123]) under [^:]{0,80}?:${sentence}`, 'g'))) { tiers.add(Number(m[1])); words.push(m[2]) }
  for (const m of note.matchAll(/\(tier ([123]), [a-z_]+\)|\bTier ([123]) \(non-commercial/g)) tiers.add(Number(m[1] ?? m[2]))
  return { tiers: [...tiers], words }
}

/** the credit a licence line gives beside its attribution licence: the words
    before "CC BY..." (or after it, when the line opens with the licence) */
export function creditInLine(line) {
  const m = /\bCC[ -]?BY(?:[ -](?:NC|SA|ND))*(?:[ -]\d\.\d)?/.exec(line ?? '')
  if (!m) return null
  const strip = (s) => s.replace(/^(?:Photo(?: by)?|Foto|Image|Bild)\s*:?\s*/i, '').replace(/^[\s,.;:]+|[\s,.;:]+$/g, '').trim()
  const before = line.slice(0, m.index).split(/[.;](?:\s|$)/).map(strip).filter(Boolean).pop()
  if (before) return before.split(/,\s*/)[0].length >= 3 ? strip(before) : null
  const after = strip(line.slice(m.index + m[0].length).split(/(?:,\s*)?via Wikimedia Commons/)[0])
  return after ? after.split(/,\s*/)[0] : null
}

/** the page a thumbnail of the same family and name was cut from */
function siblingPage(thumb, assets) {
  const m = /^([a-z0-9-]+)\/([a-z]+)-thumb\/([a-z0-9-]+?)(?:__\d+x\d+)?$/.exec(thumb.id)
  if (!m) return null
  const found = assets.filter((a) => {
    const n = /^([a-z0-9-]+)\/([a-z]+)-(page|plate)\/([a-z0-9-]+?)(?:__\d+x\d+)?$/.exec(a.id)
    return n && n[1] === m[1] && n[2] === m[2] && n[4] === m[3]
  })
  return found.length === 1 ? found[0] : null
}

/** the app's painting register: work id to rights class, or null */
export function readWorks(appRoot) {
  const file = join(appRoot, 'src', 'wings', 'vinci', 'pictures', 'data', 'paintings.json')
  if (!existsSync(file)) return null
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  return new Map((doc.works ?? []).map((w) => [w.id, w.rights_class]))
}

/** findings counted by rule and level */
export function countFindings(findings) {
  const counts = {}
  for (const f of findings) {
    counts[f.rule] ??= { group: f.group, errors: 0, warnings: 0 }
    counts[f.rule][f.level === 'error' ? 'errors' : 'warnings']++
  }
  return counts
}

/* ------------------------------------------------------------- the run */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const JSON_OUT = argv.includes('--json')
  const QUIET = argv.includes('--quiet')
  const ALL_WARNINGS = argv.includes('--warnings')
  const sourcesDirs = argv.flatMap((a, i) => (a === '--sources' ? [argv[i + 1]] : []))
  for (const dir of sourcesDirs) {
    if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`--sources needs a folder of saved Commons pages: ${dir ?? '(none given)'}`)
      process.exit(2)
    }
  }
  const { APP_ROOT, mergeManifests, STORE } = await import('./vite-na-assets.mjs')
  const { assets, problems } = mergeManifests()
  let pages = null
  for (const dir of sourcesDirs) for (const [file, page] of readSources(dir)) (pages ??= new Map()).has(file) || pages.set(file, page)
  const findings = lintRecords(assets, { pages, works: readWorks(APP_ROOT) })
  for (const p of problems) findings.unshift({ level: 'error', rule: 'manifest', group: 0, id: '-', field: '-', message: p })
  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level === 'warning')
  const counts = countFindings(findings)
  if (JSON_OUT) {
    console.log(JSON.stringify({ store: STORE, records: assets.length, sources: pages ? { dirs: sourcesDirs, pages: pages.size } : null,
      ok: errors.length === 0, errors: errors.length, warnings: warnings.length, counts, rules: RULES, findings }, null, 2))
  } else {
    if (!QUIET) {
      for (const f of errors) console.log(`ERROR  ${f.group}.${f.rule}  ${f.id}  ${f.field}: ${f.message}`)
      const shownWarnings = ALL_WARNINGS ? warnings : Object.keys(counts).flatMap((rule) => warnings.filter((w) => w.rule === rule).slice(0, 3))
      for (const f of shownWarnings) console.log(`warn   ${f.group}.${f.rule}  ${f.id}  ${f.field}: ${f.message}`)
      if (!ALL_WARNINGS && shownWarnings.length < warnings.length) console.log(`(${warnings.length - shownWarnings.length} more warnings: --warnings prints them all)`)
      console.log('')
    }
    for (const [rule, c] of Object.entries(counts).sort((a, b) => a[1].group - b[1].group || a[0].localeCompare(b[0])))
      console.log(`${String(c.group).padStart(2)}. ${rule.padEnd(16)} ${String(c.errors).padStart(5)} error(s) ${String(c.warnings).padStart(5)} warning(s)  ${RULES[rule]?.[1] ?? ''}`)
    console.log(`${assets.length} record(s) read from ${STORE}${pages ? `, ${pages.size} saved source page(s)` : ''}: ` +
      (errors.length ? `STORE LINT FAILED, ${errors.length} error(s), ${warnings.length} warning(s)` : `every label agrees with its record, ${warnings.length} warning(s)`))
  }
  process.exitCode = errors.length ? 1 : 0
}
