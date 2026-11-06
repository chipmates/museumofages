// A RELEASE'S PROVENANCE: every clip rung and still rung that `film.json` names
// must stand in the house render's record, `pack.json`, which `pack.mjs` writes
// beside `film.json` from an export run (its heads, each clip's frames and
// bytes, each still's node, framing, rung and bytes). A release assembled by
// hand or from a sketch shooter has no such record, or one that does not name
// its files.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PACK_FORMAT = /-film-pack-v\d+$/

/** every file the player would load, with what the record must say about it */
export function releaseFiles(film) {
  const out = []
  for (const [node, n] of Object.entries(film.nodes ?? {})) {
    for (const [framing, rungs] of Object.entries(n.stills ?? {})) {
      for (const [rung, f] of Object.entries(rungs ?? {})) out.push({ kind: 'still', node, framing, rung, file: f.file, bytes: f.bytes })
    }
  }
  for (const e of film.edges ?? []) {
    for (const [framing, x] of Object.entries(e.framings ?? {})) {
      for (const [rung, f] of Object.entries(x.files ?? {})) out.push({ kind: 'clip', clip: e.id, framing, rung, file: f.file, bytes: f.bytes })
      if (x.track) out.push({ kind: 'track', clip: e.id, framing, file: x.track })
    }
  }
  return out
}

/** the refusals, one per file (an empty list passes) */
export function provenance(dir, film = JSON.parse(readFileSync(join(dir, 'film.json'), 'utf8'))) {
  const files = releaseFiles(film)
  const packFile = join(dir, 'pack.json')
  const refuse = []
  let pack = null
  if (existsSync(packFile)) {
    try { pack = JSON.parse(readFileSync(packFile, 'utf8')) } catch (err) { refuse.push({ file: 'pack.json', reason: `unreadable: ${err.message}` }) }
  }
  const whole = []
  if (!pack) whole.push('no pack.json: no house render recorded this release')
  else {
    if (!PACK_FORMAT.test(String(pack.format ?? ''))) whole.push(`pack.json format "${pack.format}" is not a film pack's`)
    if (!Array.isArray(pack.exports) || !pack.exports.length) whole.push('pack.json names no export run')
    if (!pack.exportHeads || !Object.keys(pack.exportHeads).length) whole.push('pack.json names no export head')
  }
  if (!film.revision) whole.push('film.json carries no revision (the tree the export rendered)')

  const stillRec = new Map((pack?.stills ?? []).map((s) => [`${s.node} ${s.framing} ${s.rung}`, s]))
  const clipRec = new Map()
  for (const c of pack?.clips ?? []) for (const [f, x] of Object.entries(c.framings ?? {})) clipRec.set(`${c.id} ${f}`, x)

  for (const f of files) {
    const reasons = [...whole]
    const path = f.file ? join(dir, f.file) : null
    if (!path || !existsSync(path)) reasons.push('the file is missing')
    if (pack && f.kind === 'still') {
      const r = stillRec.get(`${f.node} ${f.framing} ${f.rung}`)
      if (!r) reasons.push(`no still record for ${f.node} ${f.framing} ${f.rung}`)
      else if (r.bytes !== f.bytes) reasons.push(`the record's bytes ${r.bytes} differ from film.json's ${f.bytes}`)
    }
    if (pack && f.kind === 'clip') {
      const r = clipRec.get(`${f.clip} ${f.framing}`)
      if (!r) reasons.push(`no clip record for ${f.clip} ${f.framing}`)
      else {
        if (r.bytes?.[f.rung] !== f.bytes) reasons.push(`the record's bytes ${r.bytes?.[f.rung]} differ from film.json's ${f.bytes} at ${f.rung}`)
        if (!(r.frames > 0)) reasons.push('the record carries no frame count')
      }
    }
    if (path && existsSync(path) && f.bytes !== undefined && statSync(path).size !== f.bytes) reasons.push(`on disk ${statSync(path).size} bytes, film.json says ${f.bytes}`)
    if (reasons.length) refuse.push({ file: f.file ?? `${f.kind} ${f.node ?? f.clip} ${f.framing}`, reason: reasons.join('; ') })
  }
  if (!files.length) refuse.push({ file: 'film.json', reason: 'names no still and no clip' })
  return { files: files.length, refuse }
}
