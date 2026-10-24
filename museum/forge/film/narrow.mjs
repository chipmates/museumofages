// THE NARROWED CARRY: a done clip or still whose PICTURE key alone has moved
// is carried to the job's keys, with no render, when none of the cells that
// moved since its render can show in its picture. What a picture can show is
// read off its own frames: the cells its export recorded through the solid
// pass (`export.mjs`, seen format 2), with the casters toward the sun and the
// water's mirror taken from them as the stand-in takes them from the frustum
// (`seen.mjs`, narrowedHits). A still reads the records of the clips that
// stand at it, rendered from the same tree.
//
// The picture key itself stays the stand-in's, so the gate reads the same keys
// as before; a carry is one more line of the ledger, as `carry.mjs` writes it.
// The render's tree is mounted again from its head: its cells are trusted only
// where it gives the picture key the record was rendered with, and a plate
// cell the record reaches outside that key's cells (a plate's hash reads the
// store, which no revision holds) refuses the carry.
//
// The rooms whose surfaces read a capture of the whole scene (a cube probe,
// the hall floor's mirror) or a room light's shadow are not in the node world:
// a record that enters one is reached by every moved cell. Which modules
// capture the scene or cast a room light's shadow is pinned; a tree with
// another refuses every carry until the pin is read again.
//
//   node forge/film/narrow.mjs --job=<dir> --dry     count only
//   node forge/film/narrow.mjs --job=<dir>           carry, then write the record the gate reads
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FRAMINGS } from './graph.mjs'
import { GLOBAL_DEFINITION, treeKeys } from './keys.mjs'
import { libraryAt } from './library.mjs'
import { buildIndex, narrowedHits } from './seen.mjs'
import { carriedRecord } from './carry.mjs'
import { farBoxOf, lightingAt } from './lit.mjs'
import { appendLedger, keysOf, readLedger, writeRecord } from './render-all.mjs'

/** the seen record a narrowed carry reads: walked to the solid pass in every frame, its struck cells flagged */
export const NARROWED_SEEN_FORMAT = 2
export const NARROWED_METHOD = 'seen format 2: the moved cells against the recorded cells, the casters toward the sun of the cells its rays ended in, the water\'s mirror, and every moved cell where it enters a room lit by a capture of the scene or a room light\'s shadow'
const KEYS = ['motion', 'picture', 'global', 'delivery']
const same = (a, b) => Boolean(a && b) && KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null))
/** the keys a record's files were rendered with, through any carry since */
export const renderedKeys = (r) => (r.carried ? r.carried.rendered?.keys ?? r.carried.from : r.keys)

/* ---- the rooms lit by what the node world does not hold: `lit.mjs`, read by the stand-in too ---- */
export { BENCH_ONLY, KNOWN_CAPTURES, KNOWN_SHADOW_LIGHTS, farBoxOf, farCascadeOf, lightingAt, lightingOf, litRoomCells } from './lit.mjs'

/** The cells whose hash, or whose bodies' shadow flags and layers, differ between two worlds (`mountWorld().cells`), occupied in either. */
export function movedCells(then, now) {
  const out = []
  const flag = (w, n) => (w.flags ? w.flags.get(n) ?? null : 'unread')
  for (const n of new Set([...then.hashes.keys(), ...now.hashes.keys()])) if (then.hashes.get(n) !== now.hashes.get(n) || flag(then, n) !== flag(now, n)) out.push(n)
  return out.sort((a, b) => a - b)
}

/** What a narrowed test reads of the two worlds, once per render tree; `lit` the lit room cells of either. */
export function settingOf(then, now, sun, lit = null) {
  const hashes = new Map([...then.hashes, ...now.hashes])
  const occupied = new Set(hashes.keys())
  return {
    lit,
    moved: movedCells(then, now),
    occupied, index: buildIndex({ hashes, cell: now.cell }),
    mirror: [...new Set([...(then.mirror ?? []), ...(now.mirror ?? [])])], mirrorLevel: then.mirrorLevel ?? now.mirrorLevel,
    top: Math.max(then.top, now.top), cell: now.cell, sun,
    plates: [...new Set([...(then.plates ?? []), ...(now.plates ?? [])])],
  }
}

/**
 * WHICH DONE RECORDS A NARROWED CARRY TAKES. Pure: the trees and the records are handed in.
 *   job       the job planned on the tree now
 *   records   readLedger() of the job's folder
 *   now       treeKeys() of the tree now, with `lighting` (lightingAt())
 *   heads     Map head -> treeKeys() of that revision with its `lighting`, or null where it cannot be read
 *   recordOf  (row) -> the Set of cells its seen record holds, or null (not format 2, or not the row's own file)
 * Returns { carried: [{ e, r, before, now, narrowed }], current, stale: [{ id, why }] }.
 */
export function narrowPlan(job, records, now, heads, recordOf) {
  if (job.keys?.definition !== GLOBAL_DEFINITION || job.keys.global !== now.global.key) throw new Error('the job is not planned on this tree under the definition now: plan it again (--plan --replan)')
  const out = { carried: [], current: [], stale: [], planned: 0 }
  const settings = new Map()
  const settingAt = (head) => {
    if (!settings.has(head)) {
      const then = heads.get(head)
      const lit = new Set([...then.lighting.lit, ...now.lighting.lit])
      const s = settingOf(then.world.cells, now.world.cells, now.world.sun, lit)
      // the far cascade's box at either tree, as one box holding both
      const boxes = [then, now].map((t) => (t.lighting.far ? farBoxOf(t.lighting.far, t.world.sun) : null)).filter(Boolean)
      s.farBox = boxes.length ? [[0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k]))), [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k])))] : null
      settings.set(head, s)
    }
    return settings.get(head)
  }
  const unpinned = (t) => (t.lighting ? t.lighting.unknown : ['its lighting was not read'])
  const doneAt = (id) => { const r = records.get(id); return r?.status === 'done' ? r : null }
  for (const e of job.entries) {
    if (e.kind !== 'clip' && e.kind !== 'still') continue
    const k = keysOf(e, job)
    const at = e.kind === 'clip' ? `${e.edge} ${e.framing}` : `${e.node} ${e.framing}`
    const own = (e.kind === 'clip' ? now.clips : now.stills).get(at)
    if (!k || !own) continue
    if (own.motion !== k.motion || own.picture !== k.picture) throw new Error(`${e.id}: the job's keys are not the tree's; plan it again on this tree`)
    out.planned++
    const r = doneAt(e.id)
    if (!r?.keys) continue
    if (same(r.keys, k)) { out.current.push(e.id); continue }
    const stale = (why) => out.stale.push({ id: e.id, why })
    const moved = KEYS.filter((n) => (r.keys[n] ?? null) !== (k[n] ?? null))
    if (moved.length !== 1 || moved[0] !== 'picture') { stale(`moved: ${moved.join(', ')}`); continue }
    const rendered = renderedKeys(r)
    const tree = r.head ? heads.get(r.head) : null
    if (!tree) { stale('the tree it was rendered from cannot be read'); continue }
    const unknown = [...new Set([...unpinned(now), ...unpinned(tree)])]
    if (unknown.length) { stale(`a module lights the scene the narrowed test does not know: ${unknown.join(', ')}`); continue }
    // a light of the scene's own list moved in the node world: no cell says where that shows
    if (!tree.world.lighting || tree.world.lighting !== now.world.lighting) { stale('a light of the node world moved'); continue }
    const then = (e.kind === 'clip' ? tree.clips : tree.stills).get(at)
    if (!then || then.picture !== rendered.picture) { stale('the tree it was rendered from gives another picture key'); continue }
    if (JSON.stringify(then.exposure) !== JSON.stringify(own.exposure)) { stale('its exposure moved'); continue }
    // the cells its frames showed: a clip's own record; a still's, every clip standing at it rendered from the same tree
    let record = null
    if (e.kind === 'clip') record = recordOf(r)
    else {
      const sets = []
      for (const c of job.entries) {
        if (c.kind !== 'clip' || c.framing !== e.framing || (c.from !== e.node && c.to !== e.node)) continue
        const rc = doneAt(c.id)
        if (rc?.head !== r.head) continue
        const cells = recordOf(rc)
        if (cells) sets.push(cells)
      }
      if (sets.length) {
        record = new Set(sets.flatMap((s) => [...s]))
        if (sets.every((s) => s.struck)) record.struck = new Set(sets.flatMap((s) => [...s.struck]))
      }
    }
    if (!record) { stale('no seen record of format 2 from the tree it was rendered from'); continue }
    const s = settingAt(r.head)
    const samples = e.kind === 'clip' ? own.samples : [own.sample]
    const opts = { ...s, aspect: FRAMINGS[e.framing].width / FRAMINGS[e.framing].height }
    const hits = narrowedHits(record, s.moved, samples, opts)
    if (hits.length) { stale(`it can show ${hits.length} moved cell${hits.length > 1 ? 's' : ''} (${[...new Set(hits.map((h) => h.why))].join(', ')})`); continue }
    const checked = new Set(then.cells)
    // a plate casts no shadow (`collection/plates.ts`): its picture shows where it is seen, mirrored or lights a room
    const plates = narrowedHits(record, s.plates.filter((n) => !checked.has(n)), samples, { ...opts, shadows: false })
    if (plates.length) { stale('it can show a plate cell its picture key did not read'); continue }
    out.carried.push({ e, r, before: { ...rendered, global: k.global }, now: k, from: GLOBAL_DEFINITION,
      narrowed: { head: r.head, renderedPicture: rendered.picture, cellsMoved: s.moved.length, recordCells: record.size, method: NARROWED_METHOD } })
  }
  return out
}

/** The seen record of a clip's row, when it is format 2 and the file on disk is the row's own. */
export function recordReader(dir, cellNumbers) {
  return (r) => {
    if ((r?.seenFormat ?? 1) < NARROWED_SEEN_FORMAT) return null
    const w = (r.written ?? []).find((x) => /^seen\/.*\.cells\.gz$/.test(x.file))
    if (!w || !existsSync(join(dir, w.file))) return null
    const bytes = readFileSync(join(dir, w.file))
    if (createHash('sha256').update(bytes).digest('hex') !== w.sha256) return null
    const bits = gunzipSync(bytes)
    const cells = new Set(cellNumbers(bits))
    cells.struck = new Set(cellNumbers(bits, 2))
    return cells
  }
}

async function main() {
  const flags = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)] }))
  if (!flags.get('job')) throw new Error('name the job folder: --job=<dir>')
  const dir = resolve(String(flags.get('job')))
  const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'))
  const records = readLedger(dir)
  const log = (s) => console.error(`  ${s}`)
  const now = await treeKeys({ log: (s) => log(`keys: ${s}`) })
  now.lighting = await lightingAt()
  // the trees the records whose picture alone moved were rendered from
  const heads = new Map()
  for (const e of job.entries) {
    const r = records.get(e.id)
    const k = keysOf(e, job)
    if (r?.status !== 'done' || !r.head || heads.has(r.head) || !k || !r.keys || r.keys.picture === k.picture) continue
    try {
      const tree = await treeKeys({ rev: r.head, library: libraryAt({ rev: r.head }), log: (s) => log(`${r.head.slice(0, 8)}: ${s}`) })
      tree.lighting = await lightingAt(r.head)
      heads.set(r.head, tree)
    } catch (err) { log(`${r.head.slice(0, 8)}: not readable (${err.message.slice(0, 80)})`); heads.set(r.head, null) }
  }
  const { cellNumbers } = await import('./export.mjs')
  const plan = narrowPlan(job, records, now, heads, recordReader(dir, cellNumbers))
  console.log(`${plan.planned} clips and stills planned; current ${plan.current.length}; carried ${plan.carried.length}; not carried ${plan.stale.length}`)
  const why = {}
  for (const s of plan.stale) why[s.why.replace(/\d+ moved cells?/, 'n moved cells')] = (why[s.why.replace(/\d+ moved cells?/, 'n moved cells')] ?? 0) + 1
  for (const [w, n] of Object.entries(why)) console.log(`  ${n}: ${w}`)
  if (flags.has('dry')) return
  const at = new Date().toISOString()
  for (const c of plan.carried) appendLedger(dir, carriedRecord(c, { job, at }))
  writeRecord(dir, job, readLedger(dir))
  console.log(`${plan.carried.length} narrowed carries appended to ${join(dir, 'ledger.jsonl')}; the release rewritten`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { await main() } catch (err) { console.error(`narrow: ${err.message}`); process.exitCode = 1 }
}
