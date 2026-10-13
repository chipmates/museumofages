// The museum's own count: every row it can write, field by field, and everything it must not write.
//   node --test site/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { onRequestPost } from '../functions/v1/funnel.js'
import { DEVICES, DOORS, HOLDS, LOOKS, STEPS, deviceOf, rowOf } from '../functions/_count/rows.js'
import { HOST_LISTS, SOURCES, prefixWord, sourceWord } from '../functions/_count/source.js'
import { LANGUAGES, PAGE_KINDS, WING_STOPS } from '../functions/_count/lists.js'

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
// what a request carries that must never reach a row
const SECRETS = ['gclid', 'abc', 'utm', '203.0.113.9', 'Mozilla', 'google', 'q=leonardo', '?']

/** One beacon through the real route, with an env that records every binding it touches. */
async function post(payload, { url = 'https://museumofages.org/v1/funnel?gclid=abc&utm_source=x', headers = {}, raw } = {}) {
  const points = []
  const touched = []
  const env = new Proxy({ COUNT: { writeDataPoint: (p) => points.push(p) } }, {
    get(target, key) { touched.push(key); return target[key] },
  })
  const request = new Request(url, {
    method: 'POST',
    body: raw ?? JSON.stringify(payload),
    headers: {
      'User-Agent': DESK, 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'https://museumofages.org',
      'CF-Connecting-IP': '203.0.113.9', 'CF-IPCountry': 'DE',
      Referer: 'https://museumofages.org/de/?gclid=abc&utm_source=x', ...headers,
    },
  })
  const answer = await onRequestPost({ request, env })
  assert.equal(answer.status, 204)
  assert.equal(await answer.text(), '')
  // the route reads no binding but its dataset: no store, no limiter
  for (const key of touched) if (typeof key === 'string') assert.equal(key, 'COUNT')
  return points
}

const one = async (payload, opts) => {
  const points = await post(payload, opts)
  assert.equal(points.length, 1, `one row for ${JSON.stringify(payload)}`)
  assert.deepEqual(Object.keys(points[0]).sort(), ['blobs', 'indexes'])
  assert.deepEqual(points[0].indexes, [payload.step])
  const text = JSON.stringify(points[0])
  for (const s of SECRETS) assert.ok(!text.includes(s), `${s} reached a row: ${text}`)
  return points[0].blobs
}
const none = async (payload, opts) => assert.deepEqual(await post(payload, opts), [], `no row for ${JSON.stringify(payload)}`)

// each row of the sheet, with exactly its fields
const GOOD = {
  museum_arrival: { step: 'museum_arrival', wing: 'vinci', language: 'de', hold: 'upright', source: 'search', probe: 1 },
  museum_stop: { step: 'museum_stop', wing: 'vinci', stop: 3, language: 'fr', hold: 'sideways', probe: 1 },
  museum_look: { step: 'museum_look', wing: 'vinci', look: 'machine', language: 'pt-BR', hold: 'wide' },
  museum_use: { step: 'museum_use', wing: 'vinci', language: 'bg', hold: 'upright', source: 'ad_grant' },
  page_arrival: { step: 'page_arrival', page: 'leonardo', language: 'it', start: 1, source: 'forum', probe: 1 },
  page_read: { step: 'page_read', page: 'inventions', language: 'es' },
  door_press: { step: 'door_press', page: 'home', door: 'item', language: 'en', probe: 1 },
}
const ROWS = {
  museum_arrival: ['museum_arrival', 'vinci', '', 'de', 'upright', 'search', '', 'desktop', 'DE', 'probe'],
  museum_stop: ['museum_stop', 'vinci', '3', 'fr', 'sideways', '', '', 'desktop', 'DE', 'probe'],
  museum_look: ['museum_look', 'vinci', 'machine', 'pt-BR', 'wide', '', '', 'desktop', 'DE', ''],
  museum_use: ['museum_use', 'vinci', '', 'bg', 'upright', 'ad_grant', '', 'desktop', 'DE', ''],
  page_arrival: ['page_arrival', 'leonardo', '', 'it', '', 'forum', 'start', 'desktop', 'DE', 'probe'],
  page_read: ['page_read', 'inventions', '', 'es', '', '', '', 'desktop', 'DE', ''],
  door_press: ['door_press', 'home', 'item', 'en', '', '', '', 'desktop', 'DE', 'probe'],
}

const OTHER = { stop: 9, look: 'film', door: 'end', page: 'privacy', wing: 'vinci', hold: 'wide', source: 'search', start: 1 }
const NOISE = { path: '/de/?gclid=abc', gclid: 'abc', utm_source: 'x', referrer: 'https://www.google.com/?q=leonardo', id: 'abc', time: 1234 }

test('the seven steps are the sheet\'s seven', () => {
  assert.deepEqual(Object.keys(STEPS).sort(), Object.keys(GOOD).sort())
})

for (const step of Object.keys(GOOD)) {
  test(`${step}: one row with exactly its fields`, async () => {
    assert.deepEqual(await one(GOOD[step]), ROWS[step])
  })
  test(`${step}: fields of other steps and of no step never reach its row`, async () => {
    const spec = STEPS[step]
    const own = new Set([...spec.needs, 'probe', ...(spec.source || spec.start ? ['source'] : []), ...(spec.start ? ['start'] : [])])
    const extras = Object.fromEntries(Object.entries(OTHER).filter(([k]) => !own.has(k)))
    assert.deepEqual(await one({ ...GOOD[step], ...extras, ...NOISE }), ROWS[step])
  })
  test(`${step}: a needed field missing or off its list writes nothing`, async () => {
    for (const field of STEPS[step].needs) {
      const gone = { ...GOOD[step] }
      delete gone[field]
      await none(gone)
      // 1 is a stop on the list, so the stop's own off-list values stand in the stops test below
      for (const bad of ['nope', '', 1, null, ['x'], { x: 1 }, 'toString', '__proto__']) {
        if (!(field === 'stop' && bad === 1)) await none({ ...GOOD[step], [field]: bad })
      }
    }
    await none({ ...GOOD[step], probe: 2 })
    await none({ ...GOOD[step], probe: 'yes' })
    await none({ ...GOOD[step], probe: true })
  })
}

test('the walk\'s source word is optional, and off its list it writes nothing', async () => {
  for (const step of ['museum_arrival', 'museum_use']) {
    const { source, ...without } = GOOD[step]
    const row = await one(without)
    assert.equal(row[5], '')
    await none({ ...GOOD[step], source: 'google' })
    await none({ ...GOOD[step], source: 'Search' })
  }
})

test('page_arrival: began here with its word, came from the site, or unknown', async () => {
  const base = { step: 'page_arrival', page: 'home', language: 'en' }
  assert.deepEqual((await one({ ...base, start: 1, source: 'direct' })).slice(5, 7), ['direct', 'start'])
  assert.deepEqual((await one({ ...base, start: 0 })).slice(5, 7), ['', 'inside'])
  assert.deepEqual((await one(base)).slice(5, 7), ['', ''])
  await none({ ...base, start: 1 })
  await none({ ...base, start: 0, source: 'search' })
  await none({ ...base, source: 'search' })
  await none({ ...base, start: 2 })
  await none({ ...base, start: '1', source: 'search' })
  await none({ ...base, start: true, source: 'search' })
})

test('stops: whole numbers from 1 to the wing\'s own number only', async () => {
  for (const stop of [1, WING_STOPS.vinci]) assert.equal((await one({ ...GOOD.museum_stop, stop }))[2], String(stop))
  for (const stop of [0, -1, WING_STOPS.vinci + 1, 3.5, '3', NaN, null]) await none({ ...GOOD.museum_stop, stop })
})

test('every language, hold, kind of work, page kind and door on its list writes; a near miss writes nothing', async () => {
  for (const language of LANGUAGES) await one({ ...GOOD.page_read, language })
  for (const hold of HOLDS) await one({ ...GOOD.museum_use, hold })
  for (const look of LOOKS) await one({ ...GOOD.museum_look, look })
  for (const page of PAGE_KINDS) await one({ ...GOOD.page_read, page })
  for (const door of DOORS) await one({ ...GOOD.door_press, door })
  for (const language of ['pt-br', 'pt', 'EN', 'en-GB', 'de-DE']) await none({ ...GOOD.page_read, language })
  for (const look of ['picture', 'Painting']) await none({ ...GOOD.museum_look, look })
  for (const door of ['bottom', 'dock']) await none({ ...GOOD.door_press, door })
})

test('the lists the build writes hold the sheet\'s pages and languages', () => {
  for (const kind of ['home', 'leonardo', 'inventions', 'paintings', 'sizes', 'supper', 'statement', 'privacy', 'imprint']) assert.ok(PAGE_KINDS.includes(kind), kind)
  assert.deepEqual([...LANGUAGES].sort(), ['bg', 'de', 'en', 'es', 'fr', 'it', 'pt-BR'])
  assert.deepEqual(WING_STOPS, { vinci: 17 })
})

test('what the server adds: country from Cloudflare, device class from the user agent, nothing else', async () => {
  assert.deepEqual((await one(GOOD.page_read, { headers: { 'User-Agent': PHONE, 'CF-IPCountry': 'BG' } })).slice(7, 9), ['phone', 'BG'])
  assert.deepEqual((await one(GOOD.page_read, { headers: { 'User-Agent': TABLET } })).slice(7, 9), ['tablet', 'DE'])
  assert.deepEqual((await one(GOOD.page_read, { headers: { 'User-Agent': DESK, 'Sec-CH-UA-Mobile': '?1' } }))[7], 'phone')
  assert.deepEqual((await one(GOOD.page_read, { headers: { 'CF-IPCountry': '' } }))[8], 'XX')
  assert.deepEqual((await one(GOOD.page_read, { headers: { 'CF-IPCountry': 'xx-evil' } }))[8], 'XX')
  await none(GOOD.page_read, { headers: { 'User-Agent': '' } })
  assert.deepEqual(DEVICES, ['phone', 'tablet', 'desktop'])
  assert.equal(deviceOf(new Headers({ 'User-Agent': 'curl/8' })), 'desktop')
})

test('a beacon from another site, a broken body or a long one writes nothing', async () => {
  await none(GOOD.page_read, { headers: { Origin: 'https://example.com' } })
  await none(GOOD.page_read, { headers: { Origin: 'https://museumofages.org.example.com' } })
  await one(GOOD.page_read, { headers: { Origin: '' } })
  await one(GOOD.page_read, { url: 'https://www.museumofages.org/v1/funnel', headers: { Origin: 'https://www.museumofages.org' } })
  await none(null, { raw: 'step=page_read' })
  await none(null, { raw: '' })
  await none(null, { raw: '[]' })
  await none(null, { raw: 'null' })
  await none(null, { raw: JSON.stringify({ ...GOOD.page_read, pad: 'x'.repeat(1100) }) })
  await none({ ...GOOD.page_read, step: 'page_view' })
  await none({ ...GOOD.page_read, step: 'constructor' })
})

test('a browser that sends Global Privacy Control writes nothing, for every step', async () => {
  for (const payload of Object.values(GOOD)) await none(payload, { headers: { 'Sec-GPC': '1' } })
  await one(GOOD.page_read, { headers: { 'Sec-GPC': '0' } })
})

test('without its dataset the route still answers 204 and writes nowhere', async () => {
  const answer = await onRequestPost({ request: new Request('https://museumofages.org/v1/funnel', { method: 'POST', body: JSON.stringify(GOOD.page_read), headers: { 'User-Agent': DESK } }), env: {} })
  assert.equal(answer.status, 204)
})

test('rowOf reads no field a step does not name', () => {
  const edge = { country: 'DE', device: 'desktop' }
  const row = rowOf({ ...GOOD.page_read, source: 'search', start: 1, hold: 'wide', wing: 'vinci' }, edge)
  assert.deepEqual(row, ROWS.page_read)
})

// the source word at the edge
const word = (url, referer) => sourceWord(new URL(url), referer)

test('the edge\'s word: nothing after the question mark is read', () => {
  assert.equal(word('https://museumofages.org/de/?gclid=abc&utm_source=reddit&p=1', null), 'direct')
  assert.equal(word('https://museumofages.org/?utm_source=x', 'https://example.com/?gclid=abc'), 'referral')
  assert.equal(word('https://museumofages.org/de/?a/g/', null), 'direct')
})

test('the edge\'s word: the path we place ourselves comes first', () => {
  assert.equal(word('https://museumofages.org/a/g/de/leonardo-da-vinci/erfindungen/', 'https://www.google.com/'), 'ad_grant')
  assert.equal(word('https://museumofages.org/a/p/w/vinci', null), 'ad_paid')
  assert.equal(word('https://museumofages.org/a/f/', 'https://www.reddit.com/'), 'ad_forum')
  assert.equal(word('https://museumofages.org/a/o/de/', 'https://old.reddit.com/r/x'), 'forum')
  assert.equal(word('https://museumofages.org/a/x/de/', 'https://github.com/'), 'code')
  assert.equal(word('https://museumofages.org/a/g', null), 'direct')
  assert.equal(prefixWord('/b/g/x'), '')
})

test('the edge\'s word: a referrer from this site means the visit did not begin here', () => {
  assert.equal(word('https://museumofages.org/de/', 'https://museumofages.org/'), '')
  assert.equal(word('https://museumofages.org/a/g/de/', 'https://www.museumofages.org/de/'), '')
  assert.equal(word('http://127.0.0.1:8611/w/vinci', 'http://127.0.0.1:8611/de/'), '')
})

test('the edge\'s word: the kind of the referring place', () => {
  const cases = {
    'https://www.google.com/': 'search', 'https://www.google.de/': 'search', 'https://www.google.co.uk/': 'search',
    'https://duckduckgo.com/': 'search', 'https://www.bing.com/': 'search', 'android-app://com.google.android.googlequicksearchbox/': 'search',
    'https://news.google.com/': 'news', 'https://mail.google.com/': 'mail', 'https://gemini.google.com/': 'assistant',
    'https://chatgpt.com/': 'assistant', 'https://www.perplexity.ai/': 'assistant', 'https://classroom.google.com/': 'edu',
    'https://cs.stanford.edu/': 'edu', 'https://www.ox.ac.uk/': 'edu', 'https://www.reddit.com/r/x': 'forum',
    'https://news.ycombinator.com/item?id=1': 'forum', 'https://github.com/x/y': 'code', 'https://de.wikipedia.org/wiki/X': 'wiki',
    'https://www.awwwards.com/sites/x': 'award', 'https://t.co/abc': 'social', 'https://www.facebook.com/': 'social',
    'https://example.com/': 'referral', 'https://ac.uk.example.net/': 'referral', 'not a url': 'direct', '': 'direct',
  }
  for (const [referer, expected] of Object.entries(cases)) assert.equal(word('https://museumofages.org/', referer), expected, referer)
})

test('every word the edge can give is on the sheet\'s list, and the list is the sheet\'s', () => {
  assert.deepEqual([...SOURCES].sort(), ['ad_forum', 'ad_grant', 'ad_paid', 'assistant', 'award', 'code', 'direct', 'edu', 'forum',
    'mail', 'news', 'referral', 'search', 'social', 'wiki'])
  for (const kind of Object.keys(HOST_LISTS)) assert.ok(SOURCES.includes(kind), kind)
})

// the three copies of the closed lists: the function, the pages' script, the walk's module
const pageScript = readFileSync(at('../_src/js/count.js'), 'utf8')
const walkModule = readFileSync(at('../../museum/src/core/museum-count.ts'), 'utf8')
const quoted = (block) => [...block.matchAll(/'([a-z_A-Z-]+)'/g)].map((m) => m[1])

test('the pages\' script and the walk name the same source words, doors and probe mark as the function', () => {
  assert.deepEqual(quoted(/var SOURCES = \[([^\]]*)\]/.exec(pageScript)[1]), [...SOURCES])
  assert.deepEqual(quoted(/var DOORS = \[([^\]]*)\]/.exec(pageScript)[1]), [...DOORS])
  assert.deepEqual(quoted(/const SOURCES: ReadonlySet<string> = new Set\(\[([^\]]*)\]/.exec(walkModule)[1]), [...SOURCES])
  assert.match(pageScript, /var PROBE = 'moa_probe'/)
  assert.match(walkModule, /const PROBE_KEY = 'moa_probe'/)
  assert.match(walkModule, /PREFIXES: Readonly<Record<string, string>> = \{ g: 'ad_grant', p: 'ad_paid', f: 'ad_forum', o: 'forum' \}/)
  assert.equal(prefixWord('/a/g/x'), 'ad_grant')
  assert.equal(prefixWord('/a/p/x'), 'ad_paid')
  assert.equal(prefixWord('/a/f/x'), 'ad_forum')
  assert.equal(prefixWord('/a/o/x'), 'forum')
})

test('the walk names the holds and kinds of work the function takes', () => {
  assert.deepEqual(quoted(/export type MuseumHold = ([^\n]*)/.exec(walkModule)[1]), [...HOLDS])
  assert.deepEqual(quoted(/export type MuseumLook = ([^\n]*)/.exec(walkModule)[1]), [...LOOKS])
})
