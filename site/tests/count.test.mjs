// The museum's own count: every row it can write, field by field, and everything it must not write.
//   node --test site/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { onRequestPost } from '../functions/v1/funnel.js'
import { DEVICES, DOORS, HOLDS, LOOKS, STEPS, deviceOf, rowOf } from '../functions/_count/rows.js'
import { HOST_LISTS, SOURCES, prefixWord, sourceWord } from '../functions/_count/source.js'
import { ASKED_MAKING, LANGUAGES, PAGE_KINDS, UNASKED, WING_STOPS } from '../functions/_count/lists.js'

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
  museum_welcome: { step: 'museum_welcome', wing: 'vinci', language: 'es', hold: 'upright', probe: 1 },
  museum_stop: { step: 'museum_stop', wing: 'vinci', stop: 3, language: 'fr', hold: 'sideways', probe: 1 },
  museum_skip: { step: 'museum_skip', wing: 'vinci', walk: 0, language: 'it', hold: 'wide' },
  museum_look: { step: 'museum_look', wing: 'vinci', look: 'machine', language: 'pt-BR', hold: 'wide' },
  museum_use: { step: 'museum_use', wing: 'vinci', language: 'bg', hold: 'upright', source: 'ad_grant' },
  page_arrival: { step: 'page_arrival', page: 'leonardo', language: 'it', start: 1, source: 'forum', probe: 1 },
  page_read: { step: 'page_read', page: 'inventions', language: 'es', start: 1, source: 'ad_grant' },
  door_press: { step: 'door_press', page: 'home', door: 'item', language: 'en', probe: 1 },
  ask_shown: { step: 'ask_shown', page: 'leonardo', language: 'fr', probe: 1 },
  ask_yes: { step: 'ask_yes', page: 'inventions', language: 'de', probe: 1 },
  ask_no: { step: 'ask_no', page: 'home', language: 'bg' },
  ask_close: { step: 'ask_close', page: 'paintings', language: 'pt-BR' },
  guess_open: { step: 'guess_open', page: 'megalodon', language: 'de', start: 1, source: 'search', probe: 1 },
  out_wing: { step: 'out_wing', page: 'animals', language: 'en', start: 0 },
}
const ROWS = {
  museum_arrival: ['museum_arrival', 'vinci', '', 'de', 'upright', 'search', '', 'desktop', 'DE', 'probe'],
  museum_welcome: ['museum_welcome', 'vinci', '', 'es', 'upright', '', '', 'desktop', 'DE', 'probe'],
  museum_stop: ['museum_stop', 'vinci', '3', 'fr', 'sideways', '', '', 'desktop', 'DE', 'probe'],
  museum_skip: ['museum_skip', 'vinci', '0', 'it', 'wide', '', '', 'desktop', 'DE', ''],
  museum_look: ['museum_look', 'vinci', 'machine', 'pt-BR', 'wide', '', '', 'desktop', 'DE', ''],
  museum_use: ['museum_use', 'vinci', '', 'bg', 'upright', 'ad_grant', '', 'desktop', 'DE', ''],
  page_arrival: ['page_arrival', 'leonardo', '', 'it', '', 'forum', 'start', 'desktop', 'DE', 'probe'],
  page_read: ['page_read', 'inventions', '', 'es', '', 'ad_grant', 'start', 'desktop', 'DE', ''],
  door_press: ['door_press', 'home', 'item', 'en', '', '', '', 'desktop', 'DE', 'probe'],
  ask_shown: ['ask_shown', 'leonardo', '', 'fr', '', '', '', '', '', 'probe'],
  ask_yes: ['ask_yes', 'inventions', '', 'de', '', '', '', '', '', 'probe'],
  ask_no: ['ask_no', 'home', '', 'bg', '', '', '', '', '', ''],
  ask_close: ['ask_close', 'paintings', '', 'pt-BR', '', '', '', '', '', ''],
  guess_open: ['guess_open', 'megalodon', '', 'de', '', 'search', 'start', '', '', 'probe'],
  out_wing: ['out_wing', 'animals', '', 'en', '', '', 'inside', '', '', ''],
}

const OTHER = { stop: 9, walk: 5, look: 'film', door: 'end', page: 'privacy', wing: 'vinci', hold: 'wide', source: 'search', start: 1 }
const NOISE = { path: '/de/?gclid=abc', gclid: 'abc', utm_source: 'x', referrer: 'https://www.google.com/?q=leonardo', id: 'abc', time: 1234 }

test('the fifteen steps are the sheet\'s fifteen', () => {
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
      // 1 is a stop and a walk on the list, so their own off-list values stand in the tests below
      for (const bad of ['nope', '', 1, null, ['x'], { x: 1 }, 'toString', '__proto__']) {
        if (!((field === 'stop' || field === 'walk') && bad === 1)) await none({ ...GOOD[step], [field]: bad })
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

test('walks: whole numbers from 0, the walk-in, to one less than the wing\'s stops only', async () => {
  for (const walk of [0, 1, WING_STOPS.vinci - 1]) assert.equal((await one({ ...GOOD.museum_skip, walk }))[2], String(walk))
  for (const walk of [-1, WING_STOPS.vinci, 2.5, '0', NaN, null, true]) await none({ ...GOOD.museum_skip, walk })
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
  for (const kind of ['home', 'leonardo', 'inventions', 'paintings', 'sizes', 'supper', 'last-years', 'statement', 'privacy', 'imprint',
    'animals', 'megalodon']) assert.ok(PAGE_KINDS.includes(kind), kind)
  // the pages of the wing in the making, which the edge never asks the ads' question
  assert.deepEqual([...UNASKED].sort(), ['/animals/', '/de/tiere/', '/es/animales/', '/pt-br/animais/'])
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
  assert.deepEqual(rowOf({ ...GOOD.door_press, source: 'search', start: 1, hold: 'wide', wing: 'vinci' }, edge), ROWS.door_press)
  assert.deepEqual(rowOf({ ...GOOD.page_read, hold: 'wide', wing: 'vinci', door: 'top', look: 'film', stop: 3 }, edge), ROWS.page_read)
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

test('the walk sends exactly the walk steps the function takes', () => {
  assert.deepEqual(quoted(/type MuseumStep = ([^\n]*)/.exec(walkModule)[1]).sort(), Object.keys(STEPS).filter((s) => s.startsWith('museum_')).sort())
})

test('the walk names the holds and kinds of work the function takes', () => {
  assert.deepEqual(quoted(/export type MuseumHold = ([^\n]*)/.exec(walkModule)[1]), [...HOLDS])
  assert.deepEqual(quoted(/export type MuseumLook = ([^\n]*)/.exec(walkModule)[1]), [...LOOKS])
})

test('the question seen and its answer: a word and the page, never the click id, the time, the country or the device', async () => {
  for (const step of ['ask_shown', 'ask_yes', 'ask_no', 'ask_close']) {
    assert.deepEqual(STEPS[step], { needs: ['page', 'language'], bare: true })
    const row = await one({ ...GOOD[step], gclid: 'Cj0KCQjwTEST_click-id_0123456789', yes: Date.now(), wing: 'vinci', source: 'ad_grant', start: 1 })
    assert.deepEqual(row, ROWS[step])
  }
  await none({ step: 'ask_maybe', page: 'home', language: 'en' })
  await none({ step: 'ask_yes', language: 'en' })
})

test('the question on the seven animal pages: its rows carry the animal\'s page kind and the language, nothing more', async () => {
  for (const page of Object.keys(ASKED_MAKING)) {
    assert.ok(PAGE_KINDS.includes(page), page)
    for (const [step, language] of [['ask_shown', 'en'], ['ask_yes', 'de'], ['ask_no', 'en'], ['ask_close', 'de']]) {
      const row = await one({ step, page, language, gclid: 'Cj0KCQjwTEST_click-id_0123456789', kind: 'visit', source: 'ad_grant', start: 1 })
      assert.deepEqual(row, [step, page, '', language, '', '', '', '', '', ''])
    }
  }
})

test('ask_shown and ask_close carry nothing beyond the page, its language and the probe mark', async () => {
  const edge = { country: 'DE', device: 'phone' }
  const ride = { gclid: 'Cj0KCQjwTEST_click-id_0123456789', yes: Date.now(), seen: 1000, ms: 1234, ratio: 0.5, wing: 'vinci', stop: 3,
    look: 'film', hold: 'wide', door: 'top', source: 'ad_grant', start: 1, time: 1, bucket: 2, id: 'abc', path: '/a/g/de/?gclid=abc' }
  for (const step of ['ask_shown', 'ask_close']) {
    for (const [page, language] of [['home', 'de'], ['inventions', 'en'], ['privacy', 'bg']]) {
      const row = rowOf({ step, page, language, ...ride }, edge)
      assert.deepEqual(row, [step, page, '', language, '', '', '', '', '', ''])
      // only the step, the page and the language are filled: no country, no device class, no source, no label
      assert.deepEqual(row.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [0, 1, 3])
    }
    assert.deepEqual(rowOf({ step, page: 'home', language: 'de', probe: 1 }, edge)[9], 'probe')
    assert.equal(rowOf({ step, page: 'home' }, edge), null)
    assert.equal(rowOf({ step, language: 'de' }, edge), null)
    assert.equal(rowOf({ step, page: 'nowhere', language: 'de' }, edge), null)
    assert.equal(rowOf({ step, page: 'home', language: 'de', probe: 2 }, edge), null)
    const row = await one({ step, page: 'home', language: 'de', ...ride })
    assert.deepEqual(row, [step, 'home', '', 'de', '', '', '', '', '', ''])
  }
  await none({ step: 'ask_seen', page: 'home', language: 'de' })
  await none({ step: 'ask_x', page: 'home', language: 'de' })
})

// the pages' script, run against a stand-in page: the question's events become beacons with the page's kind
test('the pages\' script sends the answer it hears once, as a word, and nothing it was not told', async () => {
  const vm = await import('node:vm')
  const sent = []
  const listeners = {}
  const document = {
    documentElement: { getAttribute: (n) => ({ lang: 'de', 'data-source': '' })[n] ?? null },
    currentScript: { getAttribute: (n) => (n === 'data-count' ? 'inventions' : null) },
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, prerendering: false,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
  }
  const window = { location: { hostname: 'museumofages.org', search: '' }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, innerHeight: 800 }
  const navigator = { sendBeacon: (to, body) => { sent.push([to, JSON.parse(body)]); return true } }
  vm.runInNewContext(pageScript, { document, window, navigator })
  const fire = (detail) => (listeners['moa:answer'] || []).forEach((fn) => fn({ detail }))
  const seen = (detail) => (listeners['moa:shown'] || []).forEach((fn) => fn({ detail }))
  sent.length = 0
  fire({ gclid: 'x' })
  fire('maybe')
  fire('shown')
  fire('yes')
  fire('no')
  fire('close')
  fire('yes')
  assert.deepEqual(sent, [['/v1/funnel', { step: 'ask_yes', page: 'inventions', language: 'de' }]])
  sent.length = 0
  seen({ gclid: 'x' })
  seen()
  seen('yes')
  assert.deepEqual(sent, [['/v1/funnel', { step: 'ask_shown', page: 'inventions', language: 'de' }]])
})

// one page load at a time: the X is its own answer, and seen and answered count once each, in either order
async function pageRun() {
  const vm = await import('node:vm')
  const sent = []
  const listeners = {}
  const document = {
    documentElement: { getAttribute: (n) => ({ lang: 'bg', 'data-source': '' })[n] ?? null },
    currentScript: { getAttribute: (n) => (n === 'data-count' ? 'home' : null) },
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, prerendering: false,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
  }
  const window = { location: { hostname: 'museumofages.org', search: '' }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, innerHeight: 800 }
  const navigator = { sendBeacon: (to, body) => { sent.push(JSON.parse(body)); return true } }
  vm.runInNewContext(pageScript, { document, window, navigator })
  sent.length = 0
  return {
    sent,
    answer: (detail) => (listeners['moa:answer'] || []).forEach((fn) => fn({ detail })),
    shown: () => (listeners['moa:shown'] || []).forEach((fn) => fn({})),
  }
}

test('the pages\' script: the X counts as ask_close, never as ask_no, and No stays ask_no', async () => {
  const x = await pageRun()
  x.shown()
  x.answer('close')
  x.answer('no')
  x.shown()
  assert.deepEqual(x.sent, [{ step: 'ask_shown', page: 'home', language: 'bg' }, { step: 'ask_close', page: 'home', language: 'bg' }])
  const no = await pageRun()
  no.answer('no')
  no.answer('close')
  no.shown()
  assert.deepEqual(no.sent, [{ step: 'ask_no', page: 'home', language: 'bg' }, { step: 'ask_shown', page: 'home', language: 'bg' }])
  for (const b of [...x.sent, ...no.sent]) assert.deepEqual(Object.keys(b).sort(), ['language', 'page', 'step'])
})

test('a page of a wing in the making: the guess opened and the link out, the page, its language and the start rule, nothing else', async () => {
  const edge = { country: 'DE', device: 'phone' }
  const ride = { gclid: 'Cj0KCQjwTEST_click-id_0123456789', wing: 'vinci', stop: 3, look: 'film', hold: 'wide', door: 'top',
    source: 'ad_grant', start: 1, answer: '16 cm', guess: 18, href: '/leonardo-da-vinci/', time: 1, id: 'abc' }
  for (const step of ['guess_open', 'out_wing']) {
    assert.deepEqual(STEPS[step], { needs: ['page', 'language'], bare: true, start: true })
    for (const [page, language] of [['megalodon', 'de'], ['animals', 'en']]) {
      const row = rowOf({ step, page, language, ...ride }, edge)
      assert.deepEqual(row, [step, page, '', language, '', 'ad_grant', 'start', '', '', ''])
      // filled: the step, the page, the language, the word and the start mark; never a country or a device class
      assert.deepEqual(row.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [0, 1, 3, 5, 6])
    }
    assert.equal(rowOf({ step, page: 'megalodon' }, edge), null)
    assert.equal(rowOf({ step, page: 'shark', language: 'en' }, edge), null)
    assert.deepEqual(await one({ step, page: 'megalodon', language: 'en', ...ride }), [step, 'megalodon', '', 'en', '', 'ad_grant', 'start', '', '', ''])
  }
  await none({ step: 'guess_right', page: 'megalodon', language: 'en' })
  await none({ step: 'guess_close', page: 'megalodon', language: 'en' })
})

// the pages' script on a page of a wing in the making: the guess's toggle and the link out, each once per page load
async function makingRun() {
  const vm = await import('node:vm')
  const sent = []
  const listeners = {}
  const document = {
    documentElement: { getAttribute: (n) => ({ lang: 'de', 'data-source': '' })[n] ?? null },
    currentScript: { getAttribute: (n) => (n === 'data-count' ? 'megalodon' : null) },
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, prerendering: false,
    addEventListener: (type, fn, capture) => { (listeners[type] ||= []).push([fn, capture]) },
  }
  const window = { location: { hostname: 'museumofages.org', search: '' }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, innerHeight: 800 }
  const navigator = { sendBeacon: (to, body) => { sent.push(JSON.parse(body)); return true } }
  vm.runInNewContext(pageScript, { document, window, navigator })
  sent.length = 0
  const fire = (type, event) => (listeners[type] || []).forEach(([fn]) => fn({ type, button: 0, ...event }))
  const details = (open, guess = true) => ({ open, matches: (sel) => guess && sel === 'details[data-guess]' })
  const link = (out) => ({ closest: (sel) => (sel === 'a[data-out]' && out ? { getAttribute: () => out } : null) })
  return { sent, listeners, fire, details, link }
}

test('the pages\' script: the guess counts when it opens, once, and the link out once, with the start rule alone', async () => {
  const r = await makingRun()
  // a toggle does not bubble: the script hears it on its way down
  assert.ok(r.listeners.toggle.every(([, capture]) => capture === true))
  r.fire('toggle', { target: r.details(false) })
  r.fire('toggle', { target: r.details(true, false) })
  r.fire('toggle', { target: r.details(true) })
  r.fire('toggle', { target: r.details(false) })
  r.fire('toggle', { target: r.details(true) })
  r.fire('click', { target: r.link(null) })
  r.fire('click', { target: r.link('elsewhere') })
  r.fire('click', { target: r.link('wing') })
  r.fire('auxclick', { target: r.link('wing'), button: 1 })
  r.fire('click', { target: r.link('wing') })
  assert.deepEqual(r.sent, [{ step: 'guess_open', page: 'megalodon', language: 'de', start: 0 }, { step: 'out_wing', page: 'megalodon', language: 'de', start: 0 }])
  // a middle click counts as following the link; a right click does not
  const m = await makingRun()
  m.fire('auxclick', { target: m.link('wing'), button: 2 })
  m.fire('auxclick', { target: m.link('wing'), button: 1 })
  assert.deepEqual(m.sent, [{ step: 'out_wing', page: 'megalodon', language: 'de', start: 0 }])
})

// the arrival's start rule on the read, the guess and the link out: the same branch the arrival takes
const STARTED = ['page_arrival', 'page_read', 'guess_open', 'out_wing']

test('the start rule stands on the arrival, the read, the guess and the link out, and on no other step', () => {
  assert.deepEqual(Object.keys(STEPS).filter((s) => STEPS[s].start === true).sort(), [...STARTED].sort())
  // the read keeps its country and device class, the guess and the link out stay without them
  assert.equal(STEPS.page_read.bare, undefined)
  for (const step of ['guess_open', 'out_wing']) assert.equal(STEPS[step].bare, true)
})

test('read, guess and link out: began here with any word on the list, came from the site, or unknown', async () => {
  const base = { page_read: 'leonardo', guess_open: 'megalodon', out_wing: 'brachiosaurus' }
  for (const [step, page] of Object.entries(base)) {
    const at = { step, page, language: 'de' }
    const bare = STEPS[step].bare === true
    const tail = bare ? ['', ''] : ['desktop', 'DE']
    for (const source of SOURCES) assert.deepEqual(await one({ ...at, start: 1, source }), [step, page, '', 'de', '', source, 'start', ...tail, ''])
    assert.deepEqual(await one({ ...at, start: 0 }), [step, page, '', 'de', '', '', 'inside', ...tail, ''])
    assert.deepEqual(await one(at), [step, page, '', 'de', '', '', '', ...tail, ''])
    assert.deepEqual(await one({ ...at, start: 1, source: 'search', probe: 1 }), [step, page, '', 'de', '', 'search', 'start', ...tail, 'probe'])
  }
})

test('read, guess and link out: a word without start 1, start 1 without a word, a word off the list or an odd start writes nothing', async () => {
  for (const step of ['page_read', 'guess_open', 'out_wing']) {
    const at = { step, page: 'megalodon', language: 'en' }
    // a source word without start 1
    await none({ ...at, source: 'search' })
    await none({ ...at, start: 0, source: 'search' })
    await none({ ...at, start: 0, source: '' })
    // start 1 without a word on the list
    await none({ ...at, start: 1 })
    for (const source of ['google', 'Search', 'search ', '', 'inside', 'start', 'probe', null, 1, ['search'], { search: 1 }, 'toString', '__proto__']) {
      await none({ ...at, start: 1, source })
    }
    // a start that is neither 1 nor 0
    for (const start of [2, -1, '1', '0', true, false, null, 1.5, NaN, ['1']]) await none({ ...at, start, source: 'search' })
    for (const start of ['1', true, null]) await none({ ...at, start })
  }
})

test('a source word on a row of a step that takes none never reaches the row', async () => {
  const ride = { start: 1, source: 'ad_grant' }
  for (const step of Object.keys(GOOD)) {
    const spec = STEPS[step]
    if (spec.start) continue
    const row = await one({ ...GOOD[step], ...ride })
    // no step but the page's four carries a start mark
    assert.equal(row[6], '', step)
    // the walk's arrival and use carry their own word; every other step carries none
    assert.equal(row[5], spec.source ? 'ad_grant' : '', step)
  }
  // the question's rows stay bare: the word, the start mark, the country and the device class never reach them
  for (const step of ['ask_shown', 'ask_yes', 'ask_no', 'ask_close']) {
    const row = await one({ step, page: 'home', language: 'de', ...ride })
    assert.deepEqual(row, [step, 'home', '', 'de', '', '', '', '', '', ''])
  }
  // and on the other steps a word off the list or a stray start is not read either
  assert.deepEqual(await one({ ...GOOD.door_press, source: 'google', start: 2 }), ROWS.door_press)
  assert.deepEqual(await one({ ...GOOD.ask_yes, source: 'google', start: 2 }), ROWS.ask_yes)
})

test('the guess and the link out never carry a country or a device class, the read always does', async () => {
  const phone = { headers: { 'User-Agent': PHONE, 'CF-IPCountry': 'BG' } }
  for (const step of ['guess_open', 'out_wing']) {
    const row = await one({ step, page: 't_rex', language: 'en', start: 1, source: 'ad_grant' }, phone)
    assert.deepEqual(row.slice(7, 9), ['', ''])
    // no more filled fields than the arrival of the same visit, and two fewer
    const arrival = await one({ step: 'page_arrival', page: 't_rex', language: 'en', start: 1, source: 'ad_grant' }, phone)
    assert.equal(row.filter(Boolean).length, arrival.filter(Boolean).length - 2)
  }
  assert.deepEqual((await one({ ...GOOD.page_read }, phone)).slice(5, 9), ['ad_grant', 'start', 'phone', 'BG'])
})

// the pages' script on an animal page whose visit began with a given edge word: four beacons, the same two fields
async function startRun(source) {
  const vm = await import('node:vm')
  const sent = []
  const listeners = {}
  const attrs = { lang: 'en' }
  if (source !== undefined) attrs['data-source'] = source
  const doors = [{ href: '/w/vinci', getAttribute: function (n) { return n === 'href' ? this.href : null }, setAttribute: function (n, v) { if (n === 'href') this.href = v } }]
  const main = { getBoundingClientRect: () => ({ top: 0, height: 400 }) }
  const document = {
    documentElement: { getAttribute: (n) => attrs[n] ?? null },
    currentScript: { getAttribute: (n) => (n === 'data-count' ? 'brachiosaurus' : null) },
    querySelectorAll: (sel) => (sel === 'a[data-door]' ? doors : []), querySelector: () => null,
    getElementById: (id) => (id === 'main' ? main : null), prerendering: false,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
  }
  const window = { location: { hostname: 'museumofages.org', search: '' }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (fn) => fn(), innerHeight: 800 }
  const navigator = { sendBeacon: (to, body) => { sent.push(JSON.parse(body)); return true } }
  vm.runInNewContext(pageScript, { document, window, navigator })
  const fire = (type, event) => (listeners[type] || []).forEach((fn) => fn({ type, button: 0, ...event }))
  fire('toggle', { target: { open: true, matches: (sel) => sel === 'details[data-guess]' } })
  fire('click', { target: { closest: (sel) => (sel === 'a[data-out]' ? { getAttribute: () => 'wing' } : null) } })
  return { sent, doors }
}

test('the pages\' script: the read, the guess and the link out carry the arrival\'s start and word, and nothing more', async () => {
  const steps = ['page_arrival', 'page_read', 'guess_open', 'out_wing']
  const at = { page: 'brachiosaurus', language: 'en' }
  for (const word of ['search', 'ad_grant', 'direct']) {
    const r = await startRun(word)
    assert.deepEqual(r.sent, steps.map((step) => ({ ...at, step, start: 1, source: word })))
    // each beacon its own object: the arrival's fields are never the read's step or page
    for (const b of r.sent) assert.deepEqual(Object.keys(b).sort(), ['language', 'page', 'source', 'start', 'step'])
    // the door still hands the word to the walk, once
    assert.equal(r.doors[0].href, '/w/vinci#via=' + word)
  }
  // a visit that came from this site: start 0 on all four, no word
  const inside = await startRun('')
  assert.deepEqual(inside.sent, steps.map((step) => ({ ...at, step, start: 0 })))
  assert.equal(inside.doors[0].href, '/w/vinci')
  // no edge stood (no attribute), or a word off the list: neither field on any beacon
  for (const odd of [undefined, 'google', 'Search', 'start']) {
    const r = await startRun(odd)
    assert.deepEqual(r.sent, steps.map((step) => ({ ...at, step })))
  }
  // every beacon the script sends makes a row through the real route, with the same word
  for (const b of (await startRun('forum')).sent) {
    const row = await one(b)
    assert.deepEqual(row.slice(5, 7), ['forum', 'start'])
  }
})
