// A LOCAL COPY OF THE PUBLIC STORE, for working offline. It reads the merged
// record the public site serves (/na-manifest.json), downloads the files that
// record marks for display, and lays them out as the asset plugin expects:
//
//   <copy>/<scope>/<path>               the file, its sha256 checked
//   <copy>/<scope>/<path>.licence.txt   its licence line, holder and source
//   <copy>/<scope>/manifest.json        the scope's records, as deployed
//   <copy>/FETCHED.json                 where and when the copy was made
//
//   node forge/fetch-store.mjs [--into <folder>] [--scope wing-vinci,library]
//                              [--only <scope/path prefix>] [--dry-run] [--yes]
//                              [--concurrency 4] [--verify]
//
// The copy goes to NA_ASSET_STORE, else `asset-store/` beside the app, where
// `pnpm dev` finds it. NA_PUBLIC_ORIGIN names the site (default
// https://museumofages.org). It shows the total before it starts and asks
// (or takes --yes), resumes where it stopped, keeps four requests in flight
// and names itself in every request.
//
// What it leaves out: a file the record marks display:false (the public site
// never serves one), and the folders a record names as a whole (the
// deep-zoom pieces, about a hundred thousand files, and the procedural
// recipes, which have no bytes). Online, the dev server reads what a copy
// lacks from the public site. A copy is for dev only: a production build
// refuses it.
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline/promises'
import { appRecordsDigest, DEFAULT_STORE, FETCHED_NOTE, PUBLIC_ORIGIN, recordDrift } from './vite-na-assets.mjs'

const USER_AGENT = 'MuseumOfAges-fetch-store/1.0 (+https://museumofages.org; contact@museumofages.org)'
const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const DRY = args.includes('--dry-run')
const YES = args.includes('--yes')
const VERIFY = args.includes('--verify')
const SCOPES = flag('--scope')?.split(',').filter(Boolean) ?? null
const ONLY = flag('--only')
const CONCURRENCY = Math.max(1, Math.min(8, Number(flag('--concurrency') ?? 4)))
const INTO = resolve(flag('--into') ?? process.env.NA_ASSET_STORE ?? DEFAULT_STORE)

const mb = (n) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`
const fail = (line) => {
  console.error(line)
  process.exit(1)
}

if (!PUBLIC_ORIGIN) fail('NA_PUBLIC_ORIGIN is off: there is no site to fetch from.')

/* NEVER INTO A WORKING STORE. A folder that holds scope records and no note
   of a fetch is somebody's store, and a copy written over it would mix the
   deployed record into the one a build reads. */
if (existsSync(INTO) && !existsSync(join(INTO, FETCHED_NOTE))) {
  const records = readdirSync(INTO, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(INTO, d.name, 'manifest.json')))
  if (records.length) fail(`${INTO} holds a working store (${records.length} scope records, no ${FETCHED_NOTE}). Pass --into <empty folder>.`)
}

async function get(url, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    let answer
    try {
      answer = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, redirect: 'follow' })
    } catch (err) {
      if (attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      continue
    }
    if ((answer.status === 429 || answer.status >= 500) && attempt < 4) {
      const wait = Math.min(60, Number(answer.headers.get('retry-after')) || 2 ** attempt)
      await answer.body?.cancel()
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    return answer
  }
}

// ------------------------------------------------------------- the record
let requests = 0
const recordUrl = `${PUBLIC_ORIGIN}/na-manifest.json`
requests++
const recordAnswer = await get(recordUrl)
if (!recordAnswer.ok) fail(`${recordUrl}: HTTP ${recordAnswer.status}`)
const recordBytes = Buffer.from(await recordAnswer.arrayBuffer())
const deployed = JSON.parse(recordBytes.toString('utf8')).assets ?? []

/** every measured file a displayed record names, relative to its scope:
    the record's own path when it names one file, its previews, its crop and
    its GPU encodes. Other nested paths (a recipe's source file, a dossier)
    belong to the repository or to the sources, never to the store. */
function filesOfRecord(e) {
  const out = []
  const file = (r) => {
    if (r && typeof r === 'object' && typeof r.path === 'string' && r.path && !r.path.endsWith('/') && !r.path.includes('*'))
      out.push({ path: r.path, sha256: r.sha256, bytes: r.bytes })
  }
  file(e)
  if (Array.isArray(e.previews)) e.previews.forEach(file)
  file(e.crop)
  for (const key of ['ktx2', 'ktx2_calm']) if (e[key] && typeof e[key] === 'object') Object.values(e[key]).forEach(file)
  return out
}

const wanted = new Map() // `${scope}/${path}` -> { scope, path, sha256, bytes, entry }
let wholeFolders = 0
for (const e of deployed) {
  if (e.display !== true || e.class === 'REFERENCE-ONLY') continue
  if (SCOPES && !SCOPES.includes(e.wing)) continue
  if (typeof e.path === 'string' && (e.path.endsWith('/') || e.path.includes('*'))) wholeFolders++
  for (const f of filesOfRecord(e)) {
    const key = `${e.wing}/${f.path}`
    if (ONLY && !key.startsWith(ONLY)) continue
    if (f.path.split('/').some((part) => !part || part === '.' || part === '..')) continue
    if (!wanted.has(key)) wanted.set(key, { scope: e.wing, ...f, entry: e })
  }
}

// ---------------------------------------------------------------- the plan
const target = (w) => join(INTO, w.scope, w.path)
const present = (w) => existsSync(target(w)) && (!Number.isSafeInteger(w.bytes) || statSync(target(w)).size === w.bytes)
const list = [...wanted.values()]
const byScope = new Map()
for (const w of list) {
  const s = byScope.get(w.scope) ?? { files: 0, bytes: 0, have: 0 }
  s.files++
  s.bytes += w.bytes ?? 0
  if (present(w)) s.have++
  byScope.set(w.scope, s)
}
const total = list.reduce((n, w) => n + (w.bytes ?? 0), 0)
const todo = list.filter((w) => VERIFY || !present(w))
const todoBytes = todo.reduce((n, w) => n + (w.bytes ?? 0), 0)

console.log(`the record: ${recordUrl} (${deployed.length} entries, ${mb(recordBytes.length)})`)
console.log(`the copy:   ${INTO}`)
for (const [scope, s] of [...byScope].sort()) console.log(`  ${scope.padEnd(12)} ${String(s.files).padStart(6)} files  ${mb(s.bytes).padStart(9)}  (${s.have} already here)`)
console.log(`total ${list.length} files, ${mb(total)}; to fetch now ${todo.length} files, ${mb(todoBytes)}`)
console.log(`left out: ${wholeFolders} records that name a whole folder (deep-zoom pieces, procedural recipes) and every display:false file`)

const drift = recordDrift(deployed)
if (!drift.same)
  console.warn(`note: this checkout's records in assets/ differ from the deployed build's (${drift.changed} changed, ${drift.added} new, ${drift.gone} gone); the copy is the deployed one`)

if (DRY) process.exit(0)
if (todo.length && !YES) {
  if (!process.stdin.isTTY) fail('add --yes to start (no terminal to ask)')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`Download ${todo.length} files, ${mb(todoBytes)}, from ${PUBLIC_ORIGIN}? [y/N] `)
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim())) process.exit(0)
}

// ------------------------------------------------------------ the records
/* the scope records exactly as deployed, display:false entries included (a
   record is public, its unshown file is not): the merged record dev builds
   from this copy is then the deployed one, byte for byte */
mkdirSync(INTO, { recursive: true })
const scopesOfStore = new Map()
for (const e of deployed) {
  if (e.origin !== 'store') continue
  const { origin, ...entry } = e
  if (!scopesOfStore.has(e.wing)) scopesOfStore.set(e.wing, [])
  scopesOfStore.get(e.wing).push(entry)
}
for (const [scope, assets] of scopesOfStore) {
  mkdirSync(join(INTO, scope), { recursive: true })
  writeFileSync(join(INTO, scope, 'manifest.json'), JSON.stringify({ assets }, null, 2) + '\n')
}

// -------------------------------------------------------------- the files
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
function licenceLines(e) {
  return [
    `licence: ${e.licence ?? 'not recorded'}`,
    ...(e.holder ? [`holder: ${e.holder}`] : []),
    ...(e.source_url ? [`source: ${e.source_url}`] : []),
    `record: ${e.id} (${e.class ?? 'unclassed'}) in ${PUBLIC_ORIGIN}/na-manifest.json`,
    '',
  ].join('\n')
}

let done = 0, fetched = 0, fetchedBytes = 0
const missing = []
const broken = []
async function fetchOne(w) {
  const file = target(w)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.licence.txt`, licenceLines(w.entry))
  if (VERIFY && existsSync(file) && (!w.sha256 || sha(file) === w.sha256)) return
  const url = `${PUBLIC_ORIGIN}/na/${w.scope}/${w.path.split('/').map(encodeURIComponent).join('/')}`
  requests++
  const answer = await get(url)
  if (answer.status === 404) {
    await answer.body?.cancel()
    missing.push(`${w.scope}/${w.path}`)
    return
  }
  if (!answer.ok || !answer.body) {
    await answer.body?.cancel()
    broken.push(`${w.scope}/${w.path}: HTTP ${answer.status}`)
    return
  }
  const part = `${file}.part`
  await pipeline(Readable.fromWeb(answer.body), createWriteStream(part))
  const size = statSync(part).size
  if ((Number.isSafeInteger(w.bytes) && size !== w.bytes) || (w.sha256 && sha(part) !== w.sha256)) {
    rmSync(part)
    broken.push(`${w.scope}/${w.path}: the bytes do not match the record`)
    return
  }
  renameSync(part, file)
  fetched++
  fetchedBytes += size
}

const started = Date.now()
const queue = [...list]
const pending = new Set(todo)
let last = 0
async function worker() {
  while (queue.length) {
    const w = queue.shift()
    if (pending.has(w)) {
      try {
        await fetchOne(w)
      } catch (err) {
        broken.push(`${w.scope}/${w.path}: ${err.cause?.code ?? err.message}`)
      }
    } else {
      // already here: its licence line still stands beside it
      if (!existsSync(`${target(w)}.licence.txt`)) writeFileSync(`${target(w)}.licence.txt`, licenceLines(w.entry))
    }
    done++
    if (process.stdout.isTTY && Date.now() - last > 500) {
      last = Date.now()
      process.stdout.write(`\r${done}/${list.length} files, ${mb(fetchedBytes)} fetched   `)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
if (process.stdout.isTTY) process.stdout.write('\n')

writeFileSync(join(INTO, FETCHED_NOTE), JSON.stringify({
  origin: PUBLIC_ORIGIN,
  fetched_at: new Date().toISOString(),
  record_sha256: createHash('sha256').update(recordBytes).digest('hex'),
  app_records_sha256: appRecordsDigest(deployed),
  scopes: SCOPES ?? 'all',
  only: ONLY ?? null,
  files: list.length - missing.length - broken.length,
  bytes: total,
  left_out: { whole_folders: wholeFolders, display_false: 'all' },
  missing,
  broken,
}, null, 2) + '\n')

const seconds = Math.round((Date.now() - started) / 1000)
console.log(`${fetched} fetched (${mb(fetchedBytes)}) in ${seconds} s, ${list.length - todo.length} already here; ${requests} requests to ${PUBLIC_ORIGIN}`)
for (const m of missing) console.log(`  not on the site (404): ${m}`)
for (const b of broken) console.log(`  failed: ${b}`)
console.log(missing.length || broken.length ? 'run it again to retry what failed' : `the copy is complete; \`pnpm dev\` now reads it`)
process.exitCode = missing.length || broken.length ? 1 : 0
