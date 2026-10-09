// node --test forge/lang/browser-lang.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLoader } from '../film/load.mjs'

const loader = await createLoader()
const { browserLanguage, addressInBrowserLanguage, adoptBrowserLanguage, visitorLanguages, keepLanguage } = loader.load('src/wings/browser-lang.ts')
const { LANGUAGES, publishedLangs } = loader.load('src/wings/languages.ts')

// the loader's arrays belong to its own realm: copied, so they compare as this one's
const ALL = [...publishedLangs(LANGUAGES.join(','))]
const TWO = [...publishedLangs(undefined)]
const AT = 'https://museum.example/w/vinci?film=job'

test('the first of the browser\'s languages a build publishes', () => {
  assert.deepEqual(ALL, ['en', 'de', 'fr', 'it', 'es', 'pt-BR', 'bg'])
  assert.equal(browserLanguage(['bg-BG', 'en-US'], ALL), 'bg')
  assert.equal(browserLanguage(['de'], ALL), 'de')
  assert.equal(browserLanguage(['en-GB', 'de'], ALL), 'en')
  // a language the museum does not speak gives way to the next the visitor reads
  assert.equal(browserLanguage(['ja', 'zh-TW', 'it-CH', 'en'], ALL), 'it')
  assert.equal(browserLanguage(['ja', 'ko'], ALL), undefined)
  assert.equal(browserLanguage([], ALL), undefined)
})

test('a region tag reads as its language, every Portuguese as pt-BR', () => {
  assert.equal(browserLanguage(['fr-CA'], ALL), 'fr')
  assert.equal(browserLanguage(['es-419'], ALL), 'es')
  assert.equal(browserLanguage(['de-AT'], ALL), 'de')
  for (const tag of ['pt', 'pt-BR', 'pt-PT', 'pt-br', 'PT_pt']) assert.equal(browserLanguage([tag], ALL), 'pt-BR', tag)
  // a longer first part is another language
  assert.equal(browserLanguage(['fil', 'bgc', 'ita'], ALL), undefined)
})

test('a language the build does not publish is never taken', () => {
  assert.deepEqual(TWO, ['en', 'de'])
  assert.equal(browserLanguage(['bg', 'fr', 'de'], TWO), 'de')
  assert.equal(browserLanguage(['bg', 'fr'], TWO), undefined)
  assert.equal(browserLanguage(['pt-BR'], [...publishedLangs('fr')]), undefined)
})

test('the address takes the language, and keeps the rest of itself', () => {
  assert.equal(addressInBrowserLanguage(AT, ['bg'], ALL), `${AT}&lang=bg`)
  assert.equal(addressInBrowserLanguage(`${AT}&opening=arno#s=3`, ['pt-PT'], ALL), `${AT}&opening=arno&lang=pt-BR#s=3`)
  assert.equal(addressInBrowserLanguage('https://museum.example/w/vinci', ['en-US'], ALL), 'https://museum.example/w/vinci?lang=en')
  // no language of the visitor's is published: the address stays as it is, and reads English
  assert.equal(addressInBrowserLanguage(AT, ['ja'], ALL), undefined)
})

test('a named language always wins, whatever it names', () => {
  for (const named of ['lang=de', 'lang=en', 'lang=bg', 'lang=PT', 'lang=xx', 'lang=', 'lang'])
    assert.equal(addressInBrowserLanguage(`${AT}&${named}`, ['fr'], ALL), undefined, named)
})

test('a language chosen by hand comes before the browser\'s', () => {
  assert.deepEqual([...visitorLanguages('de', ['fr-FR', 'en'])], ['de', 'fr-FR', 'en'])
  assert.equal(addressInBrowserLanguage(AT, visitorLanguages('bg', ['fr-FR', 'en']), ALL), `${AT}&lang=bg`)
  assert.equal(addressInBrowserLanguage(AT, visitorLanguages('pt-BR', ['de']), ALL), `${AT}&lang=pt-BR`)
  // nothing kept, or a note that names no language: the browser's languages stand
  for (const kept of [null, undefined, '', 'xx']) assert.equal(browserLanguage(visitorLanguages(kept, ['fr-FR']), ALL), 'fr', String(kept))
  // a kept language the build no longer publishes gives way
  assert.equal(browserLanguage(visitorLanguages('bg', ['de-AT']), TWO), 'de')
  // a named language wins over a kept one too
  assert.equal(addressInBrowserLanguage(`${AT}&lang=fr`, visitorLanguages('de', ['en']), ALL), undefined)
})

test('with no browser behind it, nothing is adopted, nothing is kept and nothing throws', () => {
  assert.equal(adoptBrowserLanguage(ALL), undefined)
  assert.equal(keepLanguage('de'), undefined)
})
