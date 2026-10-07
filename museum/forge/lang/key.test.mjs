// node --test forge/lang/key.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { contentKey, fillPattern, fnv1a64, foldNumbers, patternKey } from './key.mjs'

/** The textbook FNV-1a 64 in BigInt: the reference the two-half version is held to. */
function reference(text) {
  let h = 0xcbf29ce484222325n
  for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn
  return h.toString(16).padStart(16, '0')
}

test('the fixed vectors', () => {
  assert.equal(contentKey('Back', 'Zurück'), 'b91ac107236cb883')
  assert.equal(contentKey('We rebuild what was. You walk through it.', 'Wir bauen nach, was war. Du gehst hinein.'), '949ed8f7231218b1')
  // the published FNV-1a 64 test vectors
  assert.equal(fnv1a64(''), 'cbf29ce484222325')
  assert.equal(fnv1a64('a'), 'af63dc4c8601ec8c')
  assert.equal(fnv1a64('foobar'), '85944171f73967e8')
})

test('the two halves agree with the BigInt reference', () => {
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const alphabet = ['a', 'Z', ' ', '.', 'ü', 'ß', 'é', 'œ', '’', ' ', 'ж', 'Щ', '中', '😀', '\u0001', '9']
  for (let n = 0; n < 2000; n++) {
    let s = ''
    for (let i = Math.floor(rand() * 40); i > 0; i--) s += alphabet[Math.floor(rand() * alphabet.length)]
    assert.equal(fnv1a64(s), reference(s), JSON.stringify(s))
  }
})

test('the key is the pair, joined by U+0001; a pointer is a third part', () => {
  assert.equal(contentKey('Back', 'Zurück'), reference('Back\u0001Zurück'))
  assert.equal(contentKey('Back', 'Rücken'), reference('Back\u0001Rücken'))
  assert.notEqual(contentKey('Back', 'Zurück'), contentKey('Back', 'Rücken'))
  assert.equal(contentKey('Back', 'Zurück', 'chrome'), reference('Back\u0001Zurück\u0001chrome'))
  assert.equal(contentKey('Back', 'Zurück', ''), contentKey('Back', 'Zurück'))
  assert.match(contentKey('x', 'y'), /^[0-9a-f]{16}$/)
})

test('a pattern folds each language’s numbers in its own order', () => {
  assert.deepEqual(foldNumbers('3 wings open'), { pattern: '{0} wings open', values: ['3'] })
  assert.deepEqual(foldNumbers('from 1452 to 1519, about 4.5 m and 1,234 pages'),
    { pattern: 'from {0} to {1}, about {2} m and {3} pages', values: ['1452', '1519', '4.5', '1,234'] })
  assert.deepEqual(foldNumbers('no number here'), { pattern: 'no number here', values: [] })
  assert.equal(patternKey('3 wings open', '3 Flügel offen'), contentKey('{0} wings open', '{0} Flügel offen'))
  assert.equal(patternKey('7 wings open', '7 Flügel offen'), patternKey('3 wings open', '3 Flügel offen'))
  assert.equal(fillPattern('{0} ailes ouvertes', ['3']), '3 ailes ouvertes')
  assert.equal(fillPattern('de {1} à {0}', ['1452', '1519']), 'de 1519 à 1452')
  assert.equal(fillPattern('{2} reste', ['1']), '{2} reste')
})

test('the wing reads this same module', () => {
  const loader = readFileSync(new URL('../../src/wings/lang-catalog.ts', import.meta.url), 'utf8')
  assert.match(loader, /from '\.\.\/\.\.\/forge\/lang\/key\.mjs'/)
})
