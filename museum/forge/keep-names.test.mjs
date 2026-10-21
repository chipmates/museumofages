// A name's particle stays with the name in every language (src/wings/keep-names.mjs): a line may
// break before "da Vinci", "del Giocondo", "de’ Medici", "ser Piero", "il Moro", never inside them,
// and an article or a preposition of running text stays free.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { keepNames } from '../src/wings/keep-names.mjs'

const NB = '\u00a0'
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('a particle holds to the name after it, in each language', () => {
  const cases = [
    ['Das letzte Haus, in dem Leonardo da Vinci lebte', `Das letzte Haus, in dem Leonardo da${NB}Vinci lebte`],
    ['Ein früher Autor erzählt, Lorenzo de’ Medici habe', `Ein früher Autor erzählt, Lorenzo de’${NB}Medici habe`],
    ["Lorenzo de' Medici", `Lorenzo de'${NB}Medici`],
    ['Er nennt Lisa del Giocondo und die heilige Anna', `Er nennt Lisa del${NB}Giocondo und die heilige Anna`],
    ['the illegitimate son of ser Piero, aged 17', `the illegitimate son of ser${NB}Piero, aged 17`],
    ['Lionardo di ser Piero da Vinci', `Lionardo di${NB}ser${NB}Piero da${NB}Vinci`],
    ['Ludovico Sforza, detto il Moro, duca di Milano', `Ludovico Sforza, detto il${NB}Moro, duca di Milano`],
    ['a letter to Ludovico il Moro', `a letter to Ludovico il${NB}Moro`],
    ['Léonard de Vinci', `Léonard de${NB}Vinci`],
    ['Леонардо да Винчи', `Леонардо да${NB}Винчи`],
    ['(Gualtiero da Bascapè) an Ludovico', `(Gualtiero da${NB}Bascapè) an Ludovico`],
    ['Leonardo da Vinci’s notebooks', `Leonardo da${NB}Vinci’s notebooks`],
  ]
  for (const [said, kept] of cases) assert.equal(keepNames(said), kept, said)
})

test('an article or a preposition of running text stays free', () => {
  for (const said of ['Le portrait de Lisa', 'il a peint de Florence', 'il dipinto di Leonardo', 'Regierung von Florenz', 'Forschungsnotizen des Museums',
    'Musée du Louvre', 'Dianne Dwyer Modestini', 'una donna da Firenze', 'Da Vinci', 'He went da capo', 'да види Леонардо'])
    assert.equal(keepNames(said), said)
})

test('every named pair the walk shows holds, as the wing and each catalog say it', () => {
  const PAIR = /(?<=\p{Lu}[\p{L}’'.]* |^|\s)(da Vinci|da Винчи|да Винчи|de’ Medici|de' Medici|del Giocondo|ser Piero|il Moro)(?![\p{L}])/gu
  const said = []
  const strings = (value) => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
  said.push(...strings(JSON.parse(read('../src/wings/vinci/line/data/timeline.json'))))
  said.push(...strings(JSON.parse(read('../src/wings/vinci/pictures/data/paintings.json'))))
  said.push(...(read('../src/wings/vinci/story.ts').match(/"(?:[^"\\]|\\.)*"/g) ?? []).map((s) => JSON.parse(s)))
  for (const code of ['fr', 'it', 'es', 'pt-BR', 'bg'])
    for (const file of readdirSync(new URL(`../lang/${code}/`, import.meta.url))) said.push(...strings(JSON.parse(read(`../lang/${code}/${file}`))))
  let held = 0
  for (const text of said) for (const m of text.matchAll(PAIR)) {
    const before = text.slice(0, m.index).trimEnd().split(' ').pop() ?? ''
    // a pair a lowercase word leads into is no name ("the da Vinci code"); the walk names none such
    if (!m[1].startsWith('ser') && !m[1].startsWith('il') && before && !/\p{Lu}/u.test(before[0] ?? '')) continue
    assert.ok(keepNames(text).includes(m[1].replace(' ', NB)), `${m[1]} in: ${text.slice(Math.max(0, m.index - 40), m.index + 40)}`)
    held++
  }
  assert.ok(held >= 300, `${held} pairs`)
})
