import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { labelReason } from '../census.mjs'
import { provenance } from '../provenance.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

test('a label in the line slot reads red', () => {
  assert.ok(labelReason('Probe A', 'en'))
  assert.ok(labelReason('Milan, 1495', 'en'))
  assert.ok(labelReason('Amboise, 1519.', 'de'))
})

test('a sentence reads green', () => {
  assert.equal(labelReason('He was buried in the collegiate church of Saint-Florentin.', 'en'), null)
  assert.equal(labelReason('Leonardo paints the lady with the ermine.', 'en'), null)
  assert.equal(labelReason('Er starb hier. Sein Schüler schrieb: „Für jeden war es ein Schmerz.“', 'de'), null)
})

function release(withPack) {
  const dir = fs.mkdtempSync(path.join(here, '.fixture-'))
  fs.mkdirSync(path.join(dir, 'stills'))
  fs.writeFileSync(path.join(dir, 'stills', 'a.webp'), 'webp')
  const film = { revision: 'abc1234', nodes: { 'stop:a': { stills: { wide: { '854x480': { file: 'stills/a.webp', bytes: 4 } } } } }, edges: [] }
  fs.writeFileSync(path.join(dir, 'film.json'), JSON.stringify(film))
  if (withPack) {
    fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify({
      format: 'vinci-film-pack-v1', exports: ['export-run'], exportHeads: { 'export-run': 'abc1234' },
      stills: [{ node: 'stop:a', framing: 'wide', rung: '854x480', bytes: 4 }], clips: [],
    }))
  }
  return dir
}

test('a release with no house render record is refused', () => {
  const dir = release(false)
  try {
    const { refuse } = provenance(dir)
    assert.ok(refuse.length > 0)
    assert.match(refuse[0].reason, /no pack\.json/)
  } finally { fs.rmSync(dir, { recursive: true }) }
})

test('a release with the house render record passes', () => {
  const dir = release(true)
  try {
    assert.deepEqual(provenance(dir).refuse, [])
  } finally { fs.rmSync(dir, { recursive: true }) }
})
