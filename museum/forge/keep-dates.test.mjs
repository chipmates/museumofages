// A date stays whole on its line in every language (src/wings/keep-dates.mjs):
// its parts are bound with no-break spaces, in the record's own labels as each catalog says them,
// and the words around a date, or a number that is no date, stay as they are.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { keepDates } from '../src/wings/keep-dates.mjs'
import { contentKey, fillPattern, foldNumbers, patternKey } from './lang/key.mjs'

const NB = '\u00a0'
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const STUDS = read('../src/wings/vinci/line/data/timeline.json').studs

/** a catalog's words for a pair, as the page's own lookup finds them (lang-catalog.ts) */
function catalog(code) {
  const entries = {}
  for (const file of readdirSync(new URL(`../lang/${code}/`, import.meta.url))) if (!['status.json', 'tag.json', 'named.json'].includes(file)) Object.assign(entries, read(`../lang/${code}/${file}`))
  return (en, de) => {
    const own = entries[contentKey(en, de)]
    if (own !== undefined || !/\d/.test(en)) return own
    const pattern = entries[patternKey(en, de)]
    return pattern === undefined ? undefined : fillPattern(pattern, foldNumbers(en).values)
  }
}

test('a date is one unit in each language', () => {
  const cases = [
    ['15 April 1452', `15${NB}April${NB}1452`],
    ['15. April 1452', `15.${NB}April${NB}1452`],
    ['1. oder 10. Januar 1478', `1. oder 10.${NB}Januar${NB}1478`],
    ['Au plus tard le 4 mai 1504', `Au plus tard le 4${NB}mai${NB}1504`],
    ['1er ou 10 janvier 1478', `1er ou 10${NB}janvier${NB}1478`],
    ['Dal 9 maggio 1939 all’ottobre 1939', `Dal 9${NB}maggio${NB}1939 all’ottobre${NB}1939`],
    ['1º o 10 gennaio 1478', `1º o 10${NB}gennaio${NB}1478`],
    ['Del 24 de octubre de 2019 al 24 de febrero de 2020', `Del 24${NB}de${NB}octubre${NB}de${NB}2019 al 24${NB}de${NB}febrero${NB}de${NB}2020`],
    ['Novembro de 1493', `Novembro${NB}de${NB}1493`],
    ['От 9 май 1939 г. до октомври 1939 г.', `От 9${NB}май${NB}1939${NB}г. до октомври${NB}1939${NB}г.`],
    ['1499 г. или по-късно', `1499${NB}г. или по-късно`],
    ['Autumn 1502', `Autumn${NB}1502`],
    ['Otoño de 1502', `Otoño${NB}de${NB}1502`],
    ['Есента на 1502 г.', `Есента${NB}на${NB}1502${NB}г.`],
    [`Born 15${NB}April${NB}1452 in${NB}Vinci.`, `Born 15${NB}April${NB}1452 in${NB}Vinci.`],
  ]
  for (const [said, kept] of cases) assert.equal(keepDates(said), kept, said)
})

test('the words around a date and a number that is no date stay as they are', () => {
  for (const said of ['Mars et Jupiter étaient sous l’horizon.', 'Vers 1482, il peint.', '79,4 × 53,4 cm', 'Deliberazioni 1475-1476, folio 41v', 'He may 15 times', 'Около 1482', 'In 1.5 April', 'Il a été 3 fois', 'the summer of his life'])
    assert.equal(keepDates(said), said)
})

test('every day, month and year label of the life reads with no space to break at, in all seven languages', () => {
  const whole = STUDS.filter((s) => /^\d{1,2} \p{L}+ \d{4}$|^\p{L}+ \d{4}$/u.test(s.date_label_en) && !/^(About|Late) /.test(s.date_label_en))
  assert.ok(whole.length >= 25, `${whole.length} labels`)
  let read_ = 0
  for (const code of ['en', 'de', 'fr', 'it', 'es', 'pt-BR', 'bg']) {
    const say = code === 'en' || code === 'de' ? null : catalog(code)
    for (const s of whole) {
      const said = code === 'en' ? s.date_label_en : code === 'de' ? s.date_label_de : say(s.date_label_en, s.date_label_de)
      if (said === undefined) continue
      assert.ok(!/ /.test(keepDates(said)), `${code} ${s.id}: ${keepDates(said).replace(/\u00a0/g, '·')}`)
      read_++
    }
  }
  assert.ok(read_ >= whole.length * 7 - 7, `${read_} labels read`)
})
