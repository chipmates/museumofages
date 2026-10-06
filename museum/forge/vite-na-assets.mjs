// THE ASSET STORE. Not one byte of the museum's art lives in this
// repository: the store sits outside it, the bytes are served from the
// media origin in production, and the build copies nothing but the record.
//
// In dev the plugin serves /na-assets/<scope>/<path> straight off the
// store, so a change is seen on the real file without a deploy. In build it
// emits only the merged manifest (public/na-manifest.json), because a bundle
// that carries assets is a bundle whose licence lines are a guess.
//
// A checkout with no store still runs in dev: the plugin then reads the
// public site, GET only, for the store's files, the films and the merged
// record, and says so once in the terminal. A build never does: without the
// store itself it stops.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { Readable, pipeline } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { MARKER, localPath } from './local-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const APP_ROOT = resolve(HERE, '..')
/* WHERE THE STORE IS, first found wins:
   1. NA_ASSET_STORE, the store's folder;
   2. `asset-store/` beside the app, where `forge/fetch-store.mjs` puts a
      copy of the public store (outside vite's root, so the watcher never
      walks a few thousand pictures);
   3. the `store` of the nearest `.museum-local.json` at or above the app
      (forge/local-paths.mjs): a store kept outside the checkout, shared by
      every worktree below that file.
   With none of them there is no store, and STORE names the second. A store
   the first or the third names is taken as named: when it is not on disk,
   the dev server says where it looked. */
export const DEFAULT_STORE = resolve(APP_ROOT, '..', 'asset-store')

export const STORE = process.env.NA_ASSET_STORE
  ? resolve(process.env.NA_ASSET_STORE)
  : existsSync(DEFAULT_STORE) ? DEFAULT_STORE : (localPath('store', APP_ROOT) ?? DEFAULT_STORE)
const CACHE = process.env.NA_ASSET_CACHE === '1'

/* A COPY IS NOT THE STORE. fetch-store.mjs leaves this note at the root of
   what it fetched: the displayed files and the deployed records, never the
   unshown originals those records also name. Dev serves such a copy and
   reads the public site for what it lacks; a build refuses it. */
export const FETCHED_NOTE = 'FETCHED.json'
/** 'own' a working store, 'fetched' a copy of the public one, 'none' no store at all */
export function storeKind() {
  if (!existsSync(STORE)) return 'none'
  return existsSync(join(STORE, FETCHED_NOTE)) ? 'fetched' : 'own'
}

/** why a build or the full check cannot run here, or null when the store is its own */
export function notBuildable() {
  const kind = storeKind()
  if (kind === 'own') return null
  return kind === 'none'
    ? `no asset store at ${STORE}. The full check and a production build need the museum's own ` +
      `store: set NA_ASSET_STORE to its folder, or name it as "store" in a ${MARKER}. ` +
      'Without one, `pnpm dev` reads the public site, ' +
      '`node forge/fetch-store.mjs` copies it for offline viewing (a copy does not build), and ' +
      '`node forge/manifest-check.mjs --records-only` checks what the repository itself carries.'
    : `the store at ${STORE} is a copy fetched from the public site (${FETCHED_NOTE}). ` +
      'The full check and a production build need the museum\'s own store: set NA_ASSET_STORE to its folder.'
}

/* THE PUBLIC SITE a dev server reads for what is not on disk:
   NA_PUBLIC_ORIGIN, or `off` for no network at all. Its paths mirror the
   bucket: /na/<scope>/<path> the store, /film/<release>/<path> the films,
   /na-manifest.json the merged record of the deployed build. */
const originSetting = process.env.NA_PUBLIC_ORIGIN
export const PUBLIC_ORIGIN =
  originSetting === undefined ? 'https://museumofages.org'
    : /^(off|none|no|0|false)?$/i.test(originSetting.trim()) ? null
      : new URL(originSetting.trim()).origin
/** a folder of film releases (`<release>/film.json`) that dev serves under /film/ */
export const FILM_DIR = process.env.NA_FILM_DIR ? resolve(process.env.NA_FILM_DIR) : null
export const USER_AGENT = 'MuseumOfAges-dev (+https://museumofages.org; contact@museumofages.org)'

/* THE APP'S OWN SCOPES. Procedural recipes and the provenance of licensed
   Tier 1 / Tier 2 assets may live in `<app>/assets/<scope>/manifest.json`.
   The merge reads these beside the store's scopes. Licensed originals,
   previews and crops remain in STORE/<scope>/<path>, even when the store
   scope has no manifest of its own. Each file has its own path, sha256,
   bytes, width and height; previews is an array of those records, and crop
   is one such record with box [left, top, right, bottom] in original pixels
   (right and bottom exclusive). source_url may name the source's record;
   original_url names the downloaded original. An app-local scope may hold
   nothing besides its manifest: the repository keeps the record, never
   the art. */
export const APP_ASSETS = process.env.NA_APP_ASSETS ?? join(APP_ROOT, 'assets')
export const MERGED = join(APP_ROOT, 'public', 'na-manifest.json')

const NOT_AN_ASSET = new Set(['manifest.json', '_download-log.json', '.DS_Store'])

function scopesIn(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort()
}

/** the store's scopes */
export function storeScopes() {
  return scopesIn(STORE)
}

/** the app's own scopes, which carry records and no bytes */
export function appScopes() {
  return scopesIn(APP_ASSETS)
}

/** every scope either root carries a manifest for */
export function scopes() {
  return [...new Set([...storeScopes(), ...appScopes()])].sort()
}

/** where a scope's record lives: the store, the app, or both */
export function rootsOf(scope) {
  const out = []
  if (existsSync(join(STORE, scope, 'manifest.json'))) out.push({ origin: 'store', dir: join(STORE, scope) })
  if (existsSync(join(APP_ASSETS, scope, 'manifest.json'))) out.push({ origin: 'app', dir: join(APP_ASSETS, scope) })
  return out
}

/** every real file under a root, relative to it */
function filesUnder(root) {
  const out = []
  const walk = (dir, prefix) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || NOT_AN_ASSET.has(e.name)) continue
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(dir, e.name), rel)
      else out.push(rel)
    }
  }
  walk(root, '')
  return out
}

/** every real file of a scope IN THE STORE, relative to the scope folder */
export function filesOf(scope) {
  return filesUnder(join(STORE, scope))
}

/** every file an app-local scope carries besides its manifest. Anything in
    this list is a byte of the museum inside the repository. */
export function strayAppFiles(scope) {
  return filesUnder(join(APP_ASSETS, scope))
}

/** Both records, merged, each entry stamped with its scope and its origin.
    A wing writes its scope as `wing-<slug>` and its ids as `<slug>/...`, so
    an entry that names itself by the short form is the same scope said the
    other way and is normalised here rather than failing the check. */
export function mergeManifests() {
  const assets = []
  const problems = []
  const all = scopes()
  for (const scope of all) {
    const short = scope.replace(/^wing-/, '')
    for (const { origin, dir } of rootsOf(scope)) {
      let doc
      try {
        doc = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
      } catch (err) {
        problems.push(`${origin}:${scope}/manifest.json is not readable JSON: ${err.message}`)
        continue
      }
      const list = Array.isArray(doc) ? doc : (doc.assets ?? [])
      for (const e of list) {
        const named = e.wing ?? scope
        assets.push({ ...e, wing: named === short ? scope : named, origin })
      }
    }
  }
  return { assets, problems }
}

export function writeMerged() {
  const { assets, problems } = mergeManifests()
  mkdirSync(dirname(MERGED), { recursive: true })
  writeFileSync(MERGED, JSON.stringify({ assets }, null, 2) + '\n')
  return { assets, problems }
}

/** one digest over the app-origin records of a merged list: the same code
    carries the same records, so two digests that differ mean two versions */
export function appRecordsDigest(assets) {
  const lines = assets.filter((a) => a.origin === 'app').map((a) => JSON.stringify(a)).sort()
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

/** how this checkout's own records differ from a deployed merged list */
export function recordDrift(deployedAssets) {
  const there = new Map(deployedAssets.filter((a) => a.origin === 'app').map((a) => [a.id, JSON.stringify(a)]))
  const here = new Map(mergeManifests().assets.filter((a) => a.origin === 'app').map((a) => [a.id, JSON.stringify(a)]))
  let changed = 0, added = 0, gone = 0
  for (const [id, line] of here) {
    if (!there.has(id)) added++
    else if (there.get(id) !== line) changed++
  }
  for (const id of there.keys()) if (!here.has(id)) gone++
  return { records: here.size, changed, added, gone, same: changed + added + gone === 0 }
}

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.ktx2': 'image/ktx2',
  '.basis': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

/** the file under root the request names, or null: a served folder is a
    served disk, so every path is resolved and checked to stay inside it */
function fileIn(root, url) {
  const rel = normalize(decodeURIComponent((url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  const file = resolve(root, '.' + (rel.startsWith('/') ? rel : `/${rel}`))
  if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) return null
  return file
}

function sendFile(req, res, file) {
  res.setHeader('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
  // A rig reads the store fresh every run; a walk server may cache it
  // (NA_ASSET_CACHE=1) so a reload does not fetch the tier's textures again.
  if (CACHE) {
    const mtime = statSync(file).mtime
    res.setHeader('cache-control', 'public, max-age=86400')
    res.setHeader('last-modified', mtime.toUTCString())
    const since = Date.parse(req.headers['if-modified-since'] ?? '')
    if (!Number.isNaN(since) && since >= Math.floor(mtime.getTime() / 1000) * 1000) {
      res.statusCode = 304
      return res.end()
    }
  } else {
    res.setHeader('cache-control', 'no-store')
  }
  // A VIDEO IS READ IN RANGES: WebKit plays no mp4 from a server that
  // refuses them, and every engine seeks by them
  const size = statSync(file).size
  res.setHeader('accept-ranges', 'bytes')
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
    if (start >= size || start > end) {
      res.statusCode = 416
      res.setHeader('content-range', `bytes */${size}`)
      return res.end()
    }
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${size}`)
    res.setHeader('content-length', String(end - start + 1))
    if (req.method === 'HEAD') return res.end()
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.setHeader('content-length', String(size))
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/* ONE GET ON THE PUBLIC SITE, passed through as it answers: its status (a
   file the record marks display:false is a 404 there, and stays one here),
   its ranges and its cache lines. `x-na-proxied` names where the bytes
   came from, for anyone reading the network panel. */
async function relay(req, res, url) {
  const headers = { 'user-agent': USER_AGENT, 'accept-encoding': 'identity' }
  for (const h of ['range', 'if-none-match', 'if-modified-since']) if (req.headers[h]) headers[h] = req.headers[h]
  let answer
  try {
    answer = await fetch(url, { headers, redirect: 'follow' })
  } catch (err) {
    res.statusCode = 502
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    return res.end(`could not reach ${url}: ${err.cause?.code ?? err.message}`)
  }
  res.statusCode = answer.status
  const encoded = answer.headers.has('content-encoding')
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
    if (h === 'content-length' && encoded) continue
    const v = answer.headers.get(h)
    if (v) res.setHeader(h, v)
  }
  res.setHeader('x-na-proxied', new URL(url).origin)
  if (!answer.body) return res.end()
  pipeline(Readable.fromWeb(answer.body), res, () => {})
}

export function naAssets() {
  let command = 'serve'
  const serveStore = (server, relayed = true) => {
    server.middlewares.use('/na-assets', (req, res, next) => {
      const file = storeKind() === 'none' ? null : fileIn(STORE, req.url)
      if (file) return sendFile(req, res, file)
      // a copy or no store at all: what is not on disk is the public site's
      if (relayed && PUBLIC_ORIGIN && storeKind() !== 'own' && req.method === 'GET')
        return relay(req, res, `${PUBLIC_ORIGIN}/na${req.url}`)
      next()
    })
  }
  /* THE FILMS IN DEV: a folder of releases named by NA_FILM_DIR, else the
     public site's when the store is a copy or missing. A working store's
     dev server answers /film/ as it always has (with nothing), and a film
     server of its own is placed before this plugin. */
  const serveFilms = (server) => {
    server.middlewares.use('/film', (req, res, next) => {
      if (FILM_DIR) {
        const file = fileIn(FILM_DIR, req.url)
        if (file) return sendFile(req, res, file)
        res.statusCode = 404
        return res.end()
      }
      if (PUBLIC_ORIGIN && storeKind() !== 'own' && req.method === 'GET')
        return relay(req, res, `${PUBLIC_ORIGIN}/film${req.url}`)
      next()
    })
  }
  /* THE DEPLOYED RECORD, read once per server and kept in memory, in place
     of the generated one whenever there is no store: without the store's
     own manifests the generated record names the app's scopes alone. */
  let deployed = null
  const deployedRecord = () => {
    deployed ??= fetch(`${PUBLIC_ORIGIN}/na-manifest.json`, { headers: { 'user-agent': USER_AGENT } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return Buffer.from(await r.arrayBuffer())
      })
      .catch((err) => {
        deployed = null
        throw err
      })
    return deployed
  }
  /* SAID ONCE, at the start: where the pictures come from and how to work
     offline. The drift line is a cheap, honest signal: the records this
     checkout carries in assets/ against the deployed build's records of
     the same scopes. A code change that leaves the records alone is not
     seen by it. */
  const tell = (server) => {
    const log = server.config.logger
    const kind = storeKind()
    const say = (line) => log.info(`  ${line}`, { timestamp: false })
    if (kind === 'own') {
      if (FILM_DIR) say(`films: ${FILM_DIR}`)
      return
    }
    if (kind === 'none') {
      say(`No asset store on this machine (looked for ${STORE}).`)
      if (!PUBLIC_ORIGIN) {
        say('NA_PUBLIC_ORIGIN is off, so the museum draws without its pictures.')
        return
      }
      say(`The pictures, the films and the record come from ${PUBLIC_ORIGIN} as you browse (read only).`)
      say('To work offline: node forge/fetch-store.mjs (it shows the size before it starts), then restart.')
      deployedRecord()
        .then((buf) => {
          const d = recordDrift(JSON.parse(buf.toString('utf8')).assets ?? [])
          if (d.same) say(`The deployed records match this checkout's own (${d.records} records in assets/).`)
          else log.warn(`  This checkout's records differ from the deployed build's (${d.changed} changed, ${d.added} new, ${d.gone} gone): ` +
            'the site runs another version of the code, so a picture may be missing or not match.', { timestamp: false })
        })
        .catch((err) => log.warn(`  Could not read ${PUBLIC_ORIGIN}/na-manifest.json (${err.message}).`, { timestamp: false }))
      return
    }
    let note = {}
    try { note = JSON.parse(readFileSync(join(STORE, FETCHED_NOTE), 'utf8')) } catch {}
    say(`The asset store is a copy fetched from ${note.origin ?? 'the public site'}${note.fetched_at ? ` on ${note.fetched_at.slice(0, 10)}` : ''} (${STORE}).`)
    if (note.complete === false) log.warn('  The copy is incomplete: run node forge/fetch-store.mjs again to resume it.', { timestamp: false })
    say(PUBLIC_ORIGIN
      ? `What it lacks comes from ${PUBLIC_ORIGIN} as you browse; NA_PUBLIC_ORIGIN=off keeps everything local.`
      : 'NA_PUBLIC_ORIGIN is off: what the copy lacks answers 404.')
    if (FILM_DIR) say(`films: ${FILM_DIR}`)
    if (note.app_records_sha256 && note.app_records_sha256 !== appRecordsDigest(mergeManifests().assets))
      log.warn('  This checkout\'s records in assets/ differ from the build the copy was fetched from: a picture may be missing or not match.', { timestamp: false })
  }
  /* THE RECORD BY NAME in dev. A fresh checkout writes it while the server
     starts, after vite has listed public/, and until a restart the list
     answers its address with the page: the museum then draws without its
     store and says so in red. */
  const serveRecord = (server) => {
    server.middlewares.use('/na-manifest.json', (req, res, next) => {
      const send = (body) => {
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(body)
      }
      if (storeKind() === 'none' && PUBLIC_ORIGIN) {
        return deployedRecord().then(
          (buf) => {
            res.setHeader('x-na-proxied', PUBLIC_ORIGIN)
            send(buf)
          },
          (err) => {
            server.config.logger.warn(`  ${PUBLIC_ORIGIN}/na-manifest.json: ${err.message}; serving this checkout's own records`, { timestamp: false })
            if (!existsSync(MERGED)) return next()
            send(readFileSync(MERGED))
          }
        )
      }
      if (!existsSync(MERGED)) return next()
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-store')
      createReadStream(MERGED).pipe(res)
    })
    serveStore(server)
    serveFilms(server)
    tell(server)
  }
  return {
    name: 'na-assets',
    configResolved(config) {
      command = config.command
    },
    // the record is written before anything reads it, in dev and in build
    buildStart() {
      /* A BUILD READS THE STORE ITSELF. Without it, or from a copy of the
         public record, the bundle's record would be a guess or a mirror of
         another build: both stop here, whatever ran before. */
      const why = command === 'build' ? notBuildable() : null
      if (why) this.error(why)
      const { problems } = writeMerged()
      for (const p of problems) this.warn(p)
    },
    configureServer: serveRecord,
    // a preview serves a built bundle as it will stand, off the store alone
    configurePreviewServer: (server) => serveStore(server, false),
  }
}
