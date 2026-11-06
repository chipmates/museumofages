// The walk gate: a release goes to a walk only with the house render's record for
// every file it names and no line slot in its census reading as a label or empty.
// usage: walk-gate.mjs <release dir> [--museum <museum root the wing's words are read from>]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { provenance } from './provenance.mjs'
import { runCensus, lineReds } from './census.mjs'
import { museumRoot } from './load.mjs'

export function walkGate(dir, { root = museumRoot } = {}) {
  const refuse = [...provenance(dir).refuse]
  let reds = []
  try {
    reds = lineReds(runCensus(dir, { root }))
  } catch (err) {
    refuse.push({ file: 'film.json', reason: `the census could not read the wing: ${err.message}` })
  }
  for (const r of reds) refuse.push({ file: 'film.json', reason: `stop:${r.id} line: ${r.says} [${r.at}]` })
  return { pass: refuse.length === 0, refuse }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--museum')
  const root = at >= 0 ? path.resolve(args[at + 1]) : museumRoot
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--museum')
  if (!dir) { console.error('usage: walk-gate.mjs <release dir> [--museum <museum root>]'); process.exit(2) }
  const { pass, refuse } = walkGate(path.resolve(dir), { root })
  for (const r of refuse) console.log(`REFUSED ${r.file}: ${r.reason}`)
  console.log(pass ? `PASS ${dir}` : `REFUSED ${dir}: ${refuse.length} reasons`)
  process.exit(pass ? 0 : 1)
}
