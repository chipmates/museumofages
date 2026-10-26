// The museum entry: who is asked at the edge, every check of POST /v1/entry one by one, the one upload's exact
// body, the click id kept out of every log line, and the same rules in the edge, the page's script and the walk.
//   node --test site/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { ASK_SCRIPT, CLICK, ENTRY_ACTION_NAME, ENTRY_ACTION_SETTING, ENTRY_KEY, GRANT_PREFIX, VISIT_ACTION_NAME, VISIT_ACTION_SETTING, VISIT_KIND, WALK_PREFIX, YES_MAX_AGE_MS, askedMaking, asks, unasked } from '../functions/_entry/rules.js'
import * as entryModule from '../functions/v1/entry.js'
import { API_VERSION, MAX_BODY, SETTINGS, VISIT_SETTINGS, YES_SKEW_MS, actionOf, dateTimeOf, entryOf, forgetToken, onRequestPost, orderIdOf, redact, uploadBody } from '../functions/v1/entry.js'
import { onRequest as middleware, WING_STYLE, wingPage } from '../functions/_middleware.js'
import { ASKED_MAKING, UNASKED, WING_STOPS } from '../functions/_count/lists.js'

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const ORIGIN = 'https://museumofages.org'
const GCLID = 'Cj0KCQjwTEST_click-id_0123456789abcdefABCDEF'
const ENV = Object.freeze({
  GADS_DEVELOPER_TOKEN: 'dev-token', GADS_CLIENT_ID: 'client-id', GADS_CLIENT_SECRET: 'client-secret',
  GADS_REFRESH_TOKEN: 'refresh-token', GADS_LOGIN_CUSTOMER_ID: '111-222-3333', GADS_CUSTOMER_ID: '4445556666',
  MOA_ENTRY_ACTION: 'customers/4445556666/conversionActions/987654321',
})
const UPLOAD_URL = `https://googleads.googleapis.com/${API_VERSION}/customers/4445556666:uploadClickConversions`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// every console line any test writes, so the last test can hold all of them against the click id
const lines = []
for (const level of ['log', 'error', 'warn', 'info']) {
  const real = console[level]
  console[level] = (...args) => { lines.push(args.map(String).join(' ')); if (process.env.ENTRY_TEST_LOUD) real(...args) }
}

/** Google, standing in: records each request and answers the token call and the upload as told. */
function google({ upload = () => Response.json({ results: [{}] }), token = () => Response.json({ access_token: 'ya29.token', expires_in: 3599 }) } = {}) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url) === TOKEN_URL) return token()
    if (String(url) === UPLOAD_URL) return upload()
    throw new Error(`unexpected fetch ${url}`)
  }
  return { calls, fetcher }
}

/** One POST through the real route, with the stand-in for Google as the global fetch. */
async function post(body, { headers = {}, env = ENV, raw, now = Date.now(), answer } = {}) {
  forgetToken()
  const g = google(answer)
  const realFetch = globalThis.fetch
  globalThis.fetch = g.fetcher
  const waits = []
  try {
    const request = new Request(`${ORIGIN}/v1/entry`, {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
      headers: { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': 'Mozilla/5.0 test', 'CF-Connecting-IP': '203.0.113.9', ...headers },
    })
    const response = await onRequestPost({ request, env, waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    assert.equal(response.status, 204)
    const text = await response.text()
    assert.equal(text, '')
    assert.ok(!JSON.stringify([...response.headers]).includes(GCLID))
    return { calls: g.calls, waits }
  } finally {
    globalThis.fetch = realFetch
  }
}
const good = (over = {}) => ({ gclid: GCLID, yes: Date.now() - 60_000, wing: 'vinci', ...over })
const sent = async (body, opts) => {
  const { calls } = await post(body, opts)
  assert.equal(calls.length, 2, `two requests to Google for ${JSON.stringify(body)}`)
  return calls
}
const silent = async (body, opts) => {
  const { calls } = await post(body, opts)
  assert.equal(calls.length, 0, `nothing to Google for ${JSON.stringify(body)?.slice(0, 120)}`)
}

/* ---- the shared rules ---- */

test('the rules: the grant\'s prefix, the walk, the click id\'s shape, the tab\'s key, six hours', () => {
  assert.equal(GRANT_PREFIX, '/a/g/')
  assert.equal(WALK_PREFIX, '/a/g/w/')
  assert.equal(String(CLICK), '/^[A-Za-z0-9_-]{20,200}$/')
  assert.equal(ENTRY_KEY, 'moa_entry')
  assert.equal(YES_MAX_AGE_MS, 6 * 60 * 60 * 1000)
  assert.equal(ASK_SCRIPT, '/static/ask.js')
})

test('the page\'s script and the walk\'s sender hold the same rules as the function', () => {
  const page = readFileSync(at('../_src/js/ask.js'), 'utf8')
  const walk = readFileSync(at('../../museum/src/core/museum-entry.ts'), 'utf8')
  assert.ok(page.includes(`var CLICK = ${CLICK};`))
  assert.ok(page.includes(`var ENTRY_KEY = '${ENTRY_KEY}';`))
  assert.ok(page.includes(`var GRANT = '${GRANT_PREFIX}', WALK = '${WALK_PREFIX}';`))
  assert.ok(page.includes('var YES_MAX_AGE_MS = 6 * 60 * 60 * 1000;'))
  assert.ok(walk.includes(`const CLICK = ${CLICK}`))
  assert.ok(walk.includes(`const ENTRY_KEY = '${ENTRY_KEY}'`))
  assert.ok(walk.includes('const YES_MAX_AGE_MS = 6 * 60 * 60 * 1000'))
  assert.ok(walk.includes("const ENDPOINT = '/v1/entry'"))
  // the page sends the yes itself to the same function, by its own word
  assert.ok(page.includes(`var ENDPOINT = '/v1/entry', VISIT_KIND = '${VISIT_KIND}';`))
  // the count's own script never reads the tab's entry
  assert.ok(!readFileSync(at('../_src/js/count.js'), 'utf8').includes(ENTRY_KEY))
  assert.ok(!readFileSync(at('../../museum/src/core/museum-count.ts'), 'utf8').includes(ENTRY_KEY))
})

test('the click id\'s shape: 20 to 200 letters, digits, _ and -', () => {
  for (const ok of ['a'.repeat(20), 'A'.repeat(200), GCLID, 'EAIaIQobChMI_-x9']) {
    if (ok.length >= 20) assert.ok(CLICK.test(ok), ok)
  }
  for (const bad of ['a'.repeat(19), 'a'.repeat(201), `${GCLID}.`, `${GCLID}=`, `${GCLID}+`, `${GCLID}/`, `${GCLID} `, `${GCLID}\n`, '', `ü${GCLID}`]) {
    assert.ok(!CLICK.test(bad), JSON.stringify(bad))
  }
})

/* ---- who is asked, at the edge ---- */

test('the edge gives the question\'s script to every page under the grant\'s prefix, never the walk, never with GPC', () => {
  const none = new Headers()
  for (const path of ['/a/g/', '/a/g/de/', '/a/g/de/leonardo-da-vinci/erfindungen/', '/a/g/what-this-museum-is/']) {
    assert.equal(asks(path, none), true, path)
    assert.equal(asks(path, new Headers({ 'Sec-GPC': '0' })), true, path)
    assert.equal(asks(path, new Headers({ 'Sec-GPC': '1' })), false, path)
  }
  for (const path of ['/a/p/', '/a/f/x', '/a/o/de/', '/', '/de/', '/a/g/w/vinci', '/a/g/w/', '/a/gg/', '/b/a/g/', '/a/g', '/w/vinci']) {
    assert.equal(asks(path, none), false, path)
  }
})

test('the edge never reads the address after the question mark', async () => {
  const read = []
  const saved = {}
  // the query's two readers; the runtime's own Request reads href, which is not ours
  for (const name of ['search', 'searchParams']) {
    saved[name] = Object.getOwnPropertyDescriptor(URL.prototype, name)
    Object.defineProperty(URL.prototype, name, { configurable: true, get() { read.push(name); return saved[name].get.call(this) } })
  }
  try {
    await withRewriter(async () => {
      for (const path of [`/a/g/de/?gclid=${GCLID}`, `/a/g/?x=1&gclid=${GCLID}`, `/a/p/?gclid=${GCLID}`, `/de/?gclid=${GCLID}`, `/a/g/w/vinci?gclid=${GCLID}`]) {
        await page(path, { Referer: 'https://www.google.com/' })
        await page(path, { Referer: 'https://www.google.com/', 'Sec-GPC': '1' })
      }
    })
  } finally {
    for (const name of Object.keys(saved)) Object.defineProperty(URL.prototype, name, saved[name])
  }
  assert.deepEqual(read, [])
})

/** A stand-in for the runtime's HTMLRewriter: records what is set or put into which element. */
function withRewriter(fn) {
  const seen = []
  globalThis.HTMLRewriter = class {
    constructor() { this.rules = [] }
    on(selector, handlers) { this.rules.push([selector, handlers]); return this }
    transform(response) {
      for (const [selector, handlers] of this.rules) {
        handlers.element({
          setAttribute: (name, value) => seen.push({ selector, set: [name, value] }),
          append: (content, options) => seen.push({ selector, append: content, options }),
        })
      }
      return new Response(response.body, response)
    }
  }
  return fn(seen).finally(() => { delete globalThis.HTMLRewriter })
}

async function page(path, headers = {}) {
  const request = new Request(ORIGIN + path, { headers: { Accept: 'text/html', ...headers } })
  return middleware({ request, next: async () => new Response('<html><body></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) })
}

test('the edge puts the question\'s script on every grant page, click id or not, and on no other, nor with the GPC header', async () => {
  for (const [path, headers] of [[`/a/g/de/?gclid=${GCLID}`, {}], [`/a/g/de/?gclid=${GCLID}`, { 'Sec-GPC': '0' }], ['/a/g/de/', {}],
    ['/a/g/de/leonardo-da-vinci/?utm_source=x', {}]]) {
    await withRewriter(async (seen) => {
      await page(path, headers)
      assert.deepEqual(seen.filter((x) => x.append), [{ selector: 'body', append: '<script src="/static/ask.js" defer></script>', options: { html: true } }], path)
      assert.deepEqual(seen.find((x) => x.set).set, ['data-source', 'ad_grant'], path)
    })
  }
  for (const [path, headers] of [[`/a/g/de/?gclid=${GCLID}`, { 'Sec-GPC': '1' }], ['/a/g/de/', { 'Sec-GPC': '1' }], [`/a/p/de/?gclid=${GCLID}`, {}],
    [`/de/?gclid=${GCLID}`, {}], [`/a/g/w/vinci?gclid=${GCLID}`, {}], [`/a/f/?gclid=${GCLID}`, {}], ['/', {}]]) {
    await withRewriter(async (seen) => {
      await page(path, headers)
      assert.deepEqual(seen.filter((x) => x.append && x.selector === 'body'), [], path)
      assert.equal(seen.filter((x) => x.set).length, 1, path)
    })
  }
})

test('the edge puts the wing\'s first-look style into the head of a wing\'s address and of no other page', async () => {
  for (const path of ['/w/vinci', '/w/vinci/', '/w/vinci?lang=de', `/a/g/w/vinci?gclid=${GCLID}`, '/a/o/w/vinci', '/w/animals']) {
    await withRewriter(async (seen) => {
      await page(path)
      assert.deepEqual(seen.filter((x) => x.selector === 'head'), [{ selector: 'head', append: WING_STYLE, options: { html: true } }], path)
    })
  }
  for (const path of ['/', '/de/', '/leonardo-da-vinci/', '/w/', '/w/vinci/stop', '/a/x/w/vinci', '/x/w/vinci', '/w/Vinci']) {
    assert.equal(wingPage(path), false, path)
    await withRewriter(async (seen) => {
      await page(path)
      assert.deepEqual(seen.filter((x) => x.selector === 'head'), [], path)
    })
  }
  assert.match(WING_STYLE, /^<style>[^<]*<\/style>$/)
})

/* ---- a wing in the making: its own page never asked, its topic pages asked, a yes there the visit alone ---- */

const HUB = ['/a/g/animals/', `/a/g/animals/?gclid=${GCLID}`, '/a/g/de/tiere/', '/a/g/animals', '/a/g/de/tiere', '/a/g//animals/',
  '/a/g/Animals/', '/a/g/%61nimals/', '/a/g/de//tiere/', '/a/g/animals/index.html', '/a/g/de/TIERE/',
  '/a/g/es/animales/', '/a/g/pt-br/animais/', '/a/g/PT-BR/animais/', '/a/g/es/animales/index.html',
  // a path that only begins like a topic page's stays under the wing's own and is not asked
  '/a/g/animals/megalodonx/', '/a/g/animals/megalodon/x/', '/a/g/de/tiere/megalodon-x/']
const TOPICS = Object.values(ASKED_MAKING).flat()
const spellings = (page) => [`/a/g${page}`, `/a/g${page}?gclid=${GCLID}`, `/a/g${page.slice(0, -1)}`, `/a/g${page}index.html`,
  `/a/g${page.toUpperCase()}`, `/a/g/${page}`, `/a/g${page.replace(/a/, '%61')}`]

test('the count\'s lists name the ten animal pages in all four of their languages as the topic pages that ask', () => {
  assert.deepEqual([...UNASKED].sort(), ['/animals/', '/de/tiere/', '/es/animales/', '/pt-br/animais/'])
  assert.deepEqual(Object.keys(ASKED_MAKING), ['megalodon', 'biggest_dinosaurs', 't_rex', 'spinosaurus', 'woolly_mammoth', 'brachiosaurus', 'triceratops', 'ankylosaurus', 'stegosaurus', 'blue_whale'])
  for (const pages of Object.values(ASKED_MAKING)) {
    assert.equal(pages.length, 4)
    assert.match(pages[0], /^\/animals\/[a-z-]+\/$/)
    assert.match(pages[1], /^\/de\/tiere\/[a-z-]+\/$/)
    assert.match(pages[2], /^\/es\/animales\/[a-z-]+\/$/)
    assert.match(pages[3], /^\/pt-br\/animais\/[a-z-]+\/$/)
  }
})

test('the edge never asks on the own page of a wing in the making, by any spelling of its address', () => {
  const none = new Headers()
  for (const path of HUB) {
    assert.equal(unasked(path), true, path)
    assert.equal(asks(path, none), false, path)
    assert.equal(asks(path, new Headers({ 'Sec-GPC': '0' })), false, path)
  }
  // a page whose name only begins like the wing's is asked as before, and so is every other page under the prefix
  for (const path of ['/a/g/animalsx/', '/a/g/de/tierex/', '/a/g/de/', '/a/g/leonardo-da-vinci/', '/a/g/de/leonardo-da-vinci/groessen/']) {
    assert.equal(unasked(path), false, path)
    assert.equal(asks(path, none), true, path)
  }
  // a broken escape is read as written and asks as any page would
  assert.equal(asks('/a/g/%E0%A4%A/', none), true)
})

test('the edge asks on every topic page of a wing in the making, by any spelling of its address, never with GPC', () => {
  assert.equal(TOPICS.length, 40)
  for (const page of TOPICS) {
    assert.equal(askedMaking(page), true, page)
    for (const path of spellings(page)) {
      const bare = path.split('?')[0]
      assert.equal(unasked(bare), false, path)
      assert.equal(asks(bare, new Headers()), true, path)
      assert.equal(asks(bare, new Headers({ 'Sec-GPC': '1' })), false, path)
    }
    // the same page outside the grant's prefix is never asked
    assert.equal(asks(page, new Headers()), false, page)
    assert.equal(asks(`/a/p${page}`, new Headers()), false, page)
  }
})

test('the edge puts the script on a topic page of a wing in the making, never on the wing\'s own page', async () => {
  for (const path of [`/a/g/animals/megalodon/?gclid=${GCLID}`, `/a/g/de/tiere/wollhaarmammut/?gclid=${GCLID}`, '/a/g/animals/t-rex/']) {
    await withRewriter(async (seen) => {
      await page(path, { Referer: 'https://www.google.com/' })
      assert.deepEqual(seen.filter((x) => x.append), [{ selector: 'body', append: '<script src="/static/ask.js" defer></script>', options: { html: true } }], path)
      assert.deepEqual(seen.find((x) => x.set).set, ['data-source', 'ad_grant'], path)
    })
  }
  for (const path of [`/a/g/animals/?gclid=${GCLID}`, `/a/g/de/tiere/?gclid=${GCLID}`, `/a/g//de/tiere/?gclid=${GCLID}`,
    `/a/g/animals/megalodon/?gclid=${GCLID}`]) {
    await withRewriter(async (seen) => {
      await page(path, path.includes('megalodon') ? { 'Sec-GPC': '1' } : { Referer: 'https://www.google.com/' })
      assert.deepEqual(seen.filter((x) => x.append), [], path)
      // the visit's source word is still set: the count knows the visit came from the grant
      assert.deepEqual(seen.find((x) => x.set).set, ['data-source', 'ad_grant'], path)
    })
  }
})

test('the question\'s script does nothing at all on the own page of a wing in the making, whatever its address carries', async () => {
  const source = readFileSync(at('../_src/js/ask.js'), 'utf8').replace('{/*words*/}', JSON.stringify({ en: { privacy: '/privacy/' } }))
  const run = (marked) => {
    const done = []
    const document = {
      documentElement: { getAttribute: (n) => (n === 'lang' ? 'en' : null), hasAttribute: () => false,
        setAttribute: (n) => done.push(`set ${n}`), classList: { add: (c) => done.push(`class ${c}`) } },
      querySelector: (sel) => { done.push(`query ${sel}`); return sel === 'main[data-unasked]' && marked ? {} : null },
      createElement: (t) => { done.push(`create ${t}`); return {} }, currentScript: null, prerendering: false,
      head: { appendChild: () => done.push('sheet') },
      addEventListener: (t) => done.push(`listen ${t}`),
    }
    const window = {
      location: { hostname: 'museumofages.org', pathname: '/a/g/animals/', search: `?gclid=${GCLID}`, hash: '' },
      history: { state: null, replaceState: () => done.push('replaceState') },
      sessionStorage: { getItem: () => null, setItem: () => done.push('store'), removeItem() {} },
    }
    vm.runInNewContext(source, { document, window, navigator: {}, CustomEvent: class {}, JSON, Date })
    return done
  }
  // marked: it reads one thing, the mark, and leaves the address, the tab and the page as they are
  assert.deepEqual(run(true), ['query main[data-unasked]'])
  // the same page unmarked would take the click id out of the address bar at once: the mark is what stops it
  assert.ok(run(false).includes('replaceState'))
})

test('every built page of a wing in the making carries its mark: the wing\'s own page never asked, each topic page a visit alone', () => {
  const dist = at('../dist/')
  if (!existsSync(dist)) return
  for (const rel of ['animals/index.html', 'de/tiere/index.html']) {
    const text = readFileSync(dist + rel, 'utf8')
    assert.match(text, /<main\b[^>]*\sdata-unasked[\s>]/, rel)
    assert.ok(!text.includes('/static/ask.js'), rel)
    assert.equal(asks(`/a/g/${rel.replace(/index\.html$/, '')}`, new Headers()), false, rel)
  }
  for (const pagePath of TOPICS) {
    const text = readFileSync(dist + pagePath.slice(1) + 'index.html', 'utf8')
    assert.match(text, /<main\b[^>]*\sdata-asks="visit"/, pagePath)
    assert.ok(!/<main\b[^>]*\sdata-unasked/.test(text), pagePath)
    // no way into a walk from here: a yes can count nothing but the visit
    assert.ok(!/\sdata-door=|href="[^"]*\/w\//.test(text), pagePath)
    assert.equal(asks(`/a/g${pagePath}`, new Headers()), true, pagePath)
  }
})

/* ---- the page's script, run in a stand-in page: when it asks, and what a yes, a no and the X send and keep ---- */

const ASK_KEYS = ['kicker', 'question', 'text', 'text2', 'under16', 'tell', 'decline', 'more', 'google', 'newtab', 'close', 'dismiss',
  'how_number', 'how_sent', 'how_account', 'how_age', 'full', 'told', 'held', 'none', 'undo', 'undone',
  'visit_text', 'visit_text2', 'visit_how_sent', 'visit_how_account', 'visit_how_age', 'visit_told']
// what the build writes for a language whose card is not translated yet: the privacy page's button and the old shared words
const UNTRANSLATED = ['held', 'none', 'undo', 'undone', 'kicker', 'more', 'google', 'newtab', 'close', 'dismiss']
// the old card's whole set, should a table ever carry it
const OLD_CARD = ['kicker', 'q', 'why', 'what', 'whom', 'age', 'yes', 'no', 'more', 'google', 'newtab', 'close', 'dismiss', 'thanks',
  'undo', 'undone', 'held', 'none', 'visit_what', 'visit_whom', 'visit_thanks']
const marked = (keys) => Object.fromEntries(keys.map((k) => [k, `<${k}>`]))
const ASK_WORDS = {
  en: { ...marked(ASK_KEYS), privacy: '/privacy/' },
  fr: { ...marked(UNTRANSLATED), privacy: '/fr/confidentialite/' },
  it: { ...marked(OLD_CARD), privacy: '/it/privacy/' },
  // the wing's words written, the visit pages' words not yet
  es: { ...marked(ASK_KEYS.filter((k) => !k.startsWith('visit_'))), privacy: '/es/privacidad/' },
}
const ASK_SOURCE = readFileSync(at('../_src/js/ask.js'), 'utf8').replace('{/*words*/}', JSON.stringify(ASK_WORDS))
const VISIBLE_MS = 45_000
const SETTLE_MS = 400
const STILL_MS = 700

/**
 * Runs ask.js once in a small stand-in page with a clock of its own: timers and frames run only when the test moves
 * time on (wait). The page's text is 4000 px tall in an 800 px screen, its middle out of view until scrollTo moves it.
 * The tab's storage is passed in, so two runs can share one tab; every touch of either storage is recorded.
 * asked: bring the moment at once (the middle of the text in view, the page still) and let the card stand long
 * enough to take a tap, so a test of the answers starts at the card.
 */
function askPage({ path, visit = false, gpc = false, tab = new Map(), storage = true, lang = 'en', hidden = false, onArrival = false,
  asked = true, undo = false } = {}) {
  const [pathname, search = ''] = path.split('?')
  const made = [], posts = [], events = [], addresses = [], touched = []
  let now = Date.now(), id = 0
  const timers = new Map()
  const setTimer = (fn, ms = 0) => { timers.set(++id, { fn, at: now + Math.max(0, ms) }); return id }
  const clearTimer = (n) => { timers.delete(n) }
  function wait(ms) {
    const until = now + ms
    for (;;) {
      let next = null
      for (const [n, t] of timers) if (t.at <= until && (!next || t.at < next[1].at)) next = [n, t]
      if (!next) break
      timers.delete(next[0])
      now = next[1].at
      next[1].fn()
    }
    now = until
  }
  const doc = { activeElement: null, visibilityState: hidden ? 'hidden' : 'visible', on: {} }
  class El {
    constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, on: {}, className: '', _text: '', isConnected: true, hidden: false,
      offsetHeight: 300, offsetTop: 0, scrollHeight: 0, clientHeight: 0, scrollTop: 0, style: { setProperty() {}, removeProperty() {} },
      classList: { add() {}, remove() {}, toggle() {} } }); made.push(this) }
    get textContent() { return this._text }
    set textContent(v) { this._text = String(v); if (v === '') this.children = [] }
    setAttribute(n, v) { this.attrs[n] = String(v) }
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null }
    hasAttribute(n) { return n in this.attrs }
    removeAttribute(n) { delete this.attrs[n] }
    appendChild(c) { this.children.push(c); c.parentNode = this; if (typeof c.onload === 'function') c.onload(); return c }
    insertBefore(c) { return this.appendChild(c) }
    addEventListener(type, fn) { (this.on[type] ||= []).push(fn) }
    click() { const e = { type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }; for (const fn of this.on.click || []) fn(e); return e }
    closest(sel) { return sel === 'a[data-door]' && 'data-door' in this.attrs ? this : null }
    remove() { this.isConnected = false; this.removed = true }
    focus() { doc.activeElement = this }
    contains() { return false }
  }
  const body = new El('body'), main = new El('main'), head = new El('head'), mount = new El('div')
  body.appendChild(main)
  // the page's text: its middle at 2000 px from the top, 800 px of screen
  let top = onArrival ? -1700 : 0
  main.getBoundingClientRect = () => ({ top, height: 4000 })
  const html = new El('html')
  html.attrs.lang = lang
  const listen = (on) => (type, fn, opt) => { (on[type] ||= []).push({ fn, capture: opt === true || !!(opt && opt.capture) }) }
  const unlisten = (on) => (type, fn) => { on[type] = (on[type] || []).filter((l) => l.fn !== fn) }
  const fire = (on, type, e = { type }) => { for (const l of (on[type] || []).slice()) l.fn(e) }
  Object.assign(doc, {
    documentElement: html, head, body, currentScript: null, prerendering: false,
    createElement: (tag) => new El(tag),
    getElementById: (name) => (name === 'main' ? main : null),
    querySelector: (sel) => (sel === 'main[data-asks="visit"]' ? (visit ? main : null) : sel === 'main' ? main : sel === '[data-undo]' && undo ? mount : null),
    addEventListener: listen(doc.on), removeEventListener: unlisten(doc.on),
    dispatchEvent: (e) => { events.push(e.detail === undefined ? e.type : `${e.type} ${e.detail}`); return true },
  })
  const session = {
    getItem: (k) => { touched.push(`get ${k}`); return tab.has(k) ? tab.get(k) : null },
    setItem: (k, v) => { touched.push(`set ${k}`); tab.set(k, String(v)) },
    removeItem: (k) => { touched.push(`remove ${k}`); tab.delete(k) },
  }
  const win = { on: {} }
  Object.assign(win, {
    location: { hostname: 'museumofages.org', pathname, search: search ? `?${search}` : '', hash: '' },
    history: { state: null, replaceState: (s, _, url) => addresses.push(url) },
    fetch: (url, init) => { posts.push({ url, init, body: JSON.parse(init.body) }); return Promise.resolve(new Response(null, { status: 204 })) },
    getComputedStyle: () => ({ bottom: '0px' }),
    addEventListener: listen(win.on), removeEventListener: unlisten(win.on),
    requestAnimationFrame: (fn) => setTimer(fn, 16), cancelAnimationFrame: clearTimer,
    setTimeout: setTimer, clearTimeout: clearTimer, innerHeight: 800,
  })
  Object.defineProperty(win, 'sessionStorage', { get() { touched.push('session'); if (!storage) throw new Error('blocked'); return session } })
  Object.defineProperty(win, 'localStorage', { get() { touched.push('local'); return { getItem() { return null }, setItem() {} } } })
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
  vm.runInNewContext(ASK_SOURCE, { document: doc, window: win, navigator: { globalPrivacyControl: gpc }, CustomEvent, JSON, Date: { now: () => now } })
  const find = (text) => made.find((n) => n.tag === 'button' && n._text === text && !n.removed)
  const p = {
    made, tab, posts, events, addresses, touched, wait, mount,
    get card() { return made.find((n) => n.tag === 'section' && n.className.startsWith('ask') && !n.removed) },
    get now() { return now },
    find, words: () => made.filter((n) => n._text && !n.removed).map((n) => n._text),
    yes: () => find('<tell>').click(), no: () => find('<decline>').click(),
    x: () => made.find((n) => n.className === 'ask__close' && !n.removed).click(),
    /** the page moves: each step a scroll event and a frame */
    scrollTo(y) { top = -y; fire(win.on, 'scroll'); wait(16) },
    /** the tab hidden or shown again, as the browser tells it */
    show(visible) { doc.visibilityState = visible ? 'visible' : 'hidden'; fire(doc.on, 'visibilitychange') },
    /** a press inside the page: on a way into the walk (door) or anywhere else */
    press(door, type = 'click', button = 0) {
      const target = new El('a')
      if (door) target.attrs['data-door'] = door
      for (const l of (doc.on[type] || []).slice()) if (l.capture) l.fn({ type, button, target })
    },
    /** the middle of the text into view, then the page stands still */
    reach() { p.scrollTo(1700); wait(SETTLE_MS + 20) },
  }
  if (asked) { p.reach(); wait(STILL_MS) }
  return p
}
const LEO = `/a/g/leonardo-da-vinci/?gclid=${GCLID}`
const ANIMAL = `/a/g/animals/megalodon/?gclid=${GCLID}`

test('the page\'s script: a yes on a Leonardo page sends one visit at once and keeps the entry for the walk', () => {
  const p = askPage({ path: LEO })
  assert.ok(p.card, 'the card stands')
  assert.deepEqual(p.addresses, ['/a/g/leonardo-da-vinci/'])
  assert.equal(p.posts.length, 0)
  const before = p.now
  p.yes()
  assert.equal(p.posts.length, 1)
  const [{ url, init, body }] = p.posts
  assert.equal(url, '/v1/entry')
  assert.deepEqual(Object.keys(body), ['gclid', 'yes', 'kind'])
  assert.equal(body.gclid, GCLID)
  assert.equal(body.kind, VISIT_KIND)
  assert.equal(body.yes, before)
  assert.equal(init.method, 'POST')
  assert.equal(init.keepalive, true)
  assert.equal(init.credentials, 'omit')
  assert.equal(init.mode, 'same-origin')
  const kept = JSON.parse(p.tab.get(ENTRY_KEY))
  assert.deepEqual(Object.keys(kept), ['gclid', 'yes'])
  assert.equal(kept.gclid, GCLID)
  assert.ok(p.words().includes('<told>'))
  assert.ok(p.find('<undo>'), 'the yes can be taken back for the entry')
  // a second press, from any button left in the page, sends nothing more
  p.yes()
  assert.equal(p.posts.length, 1)
  assert.deepEqual(p.events, ['moa:shown', 'moa:answer yes'])
  // taking it back stops the entry, the visit has gone
  p.find('<undo>').click()
  assert.equal(p.tab.has(ENTRY_KEY), false)
  assert.ok(p.words().includes('<undone>'))
})

test('the page\'s script: a second yes in the same tab for the same click sends nothing new, a new click counts once', () => {
  const tab = new Map()
  askPage({ path: LEO, tab }).yes()
  const first = JSON.parse(tab.get(ENTRY_KEY))
  const again = askPage({ path: `/a/g/de/leonardo-da-vinci/?gclid=${GCLID}`, tab })
  again.yes()
  assert.equal(again.posts.length, 0, 'the same click was counted at its first yes')
  assert.equal(JSON.parse(tab.get(ENTRY_KEY)).gclid, first.gclid)
  const other = GCLID.replace('TEST', 'NEXT')
  const fresh = askPage({ path: `/a/g/leonardo-da-vinci/?gclid=${other}`, tab })
  fresh.yes()
  assert.equal(fresh.posts.length, 1)
  assert.equal(fresh.posts[0].body.gclid, other)
  assert.equal(JSON.parse(tab.get(ENTRY_KEY)).gclid, other)
})

test('the page\'s script: a yes on an animal page sends the visit once and keeps nothing, with nothing to take back', () => {
  const p = askPage({ path: ANIMAL, visit: true })
  assert.ok(p.words().includes('<visit_text>') && p.words().includes('<visit_text2>'))
  assert.ok(!p.words().includes('<text>') && !p.words().includes('<text2>'))
  assert.ok(p.words().includes('<visit_how_sent>') && !p.words().includes('<how_sent>'))
  p.yes()
  p.yes()
  assert.equal(p.posts.length, 1)
  assert.deepEqual(p.posts[0].body.kind, 'visit')
  assert.equal(p.posts[0].body.gclid, GCLID)
  assert.equal(p.tab.size, 0, 'nothing in the tab')
  assert.ok(p.words().includes('<visit_told>'))
  assert.equal(p.find('<undo>'), undefined)
  // a tab whose storage is blocked is still asked here, since nothing is kept
  const blocked = askPage({ path: ANIMAL, visit: true, storage: false })
  assert.ok(blocked.card)
  blocked.yes()
  assert.equal(blocked.posts.length, 1)
  // a Leonardo page in such a tab is not asked: its yes could not reach the walk
  assert.equal(askPage({ path: LEO, storage: false }).card, undefined)
})

test('the page\'s script: the first layer is the question, two paragraphs, the age line, two answers and two visible links', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit })
    const [close, headPart, words, act] = p.made.find((n) => n.className === 'ask__in').children
    assert.equal(close.className, 'ask__close')
    assert.equal(close.attrs['aria-label'], '<close>')
    assert.deepEqual(headPart.children.map((n) => [n.tag, n._text]), [['h2', '<question>']])
    const first = visit ? ['<visit_text>', '<visit_text2>'] : ['<text>', '<text2>']
    assert.deepEqual(words.children.slice(0, 2).map((n) => n._text), first)
    // the age line stands right above the answers on every card and outside the words that scroll
    const [age, answers, links] = act.children
    assert.equal(act.className, 'ask__act', path)
    assert.equal(age._text, '<under16>')
    assert.deepEqual(answers.children.map((b) => [b.tag, b._text]), [['button', '<tell>'], ['button', '<decline>']])
    assert.equal(p.made.filter((n) => n._text === '<under16>').length, 1)
    // the two answers differ in their words alone
    assert.equal(answers.children[0].className, answers.children[1].className)
    // the two visible links: the second layer, opened in the card, and Google's page in a new tab
    const [more, google] = links.children
    assert.equal(more.tag, 'button')
    assert.equal(more._text, '<more>')
    assert.equal(more.attrs['aria-expanded'], 'false')
    assert.equal(google.tag, 'a')
    assert.equal(google._text, '<google>')
    assert.equal(google.href, 'https://business.safety.google/privacy')
    assert.equal(google.target, '_blank')
    assert.equal(google.children[0]._text, ' (<newtab>)')
    // no word of the old card
    for (const old of ['<q>', '<why>', '<what>', '<whom>', '<age>', '<yes>', '<no>', '<thanks>']) assert.ok(!p.words().includes(old), old)
  }
})

test('the page\'s script: "How this works" opens the second layer in the card, and its privacy link stays in this tab', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit })
    const how = p.made.find((n) => n.id === 'ask-how')
    const more = p.find('<more>')
    assert.equal(how.hidden, true)
    assert.equal(more.attrs['aria-controls'], 'ask-how')
    more.click()
    assert.equal(how.hidden, false)
    assert.equal(more.attrs['aria-expanded'], 'true')
    const v = visit ? 'visit_' : ''
    assert.deepEqual(how.children.slice(0, 4).map((n) => n._text), ['<how_number>', `<${v}how_sent>`, `<${v}how_account>`, `<${v}how_age>`])
    const full = how.children[4]
    assert.equal(full.tag, 'a')
    assert.equal(full._text, '<full>')
    assert.equal(full.href, '/privacy/#question')
    assert.equal(full.target, undefined, 'the privacy page opens in this tab')
    more.click()
    assert.equal(how.hidden, true)
    assert.equal(more.attrs['aria-expanded'], 'false')
    // reading the second layer answers nothing
    assert.deepEqual(p.events, ['moa:shown'])
    assert.equal(p.posts.length + p.tab.size, 0)
  }
})

test('the page\'s script: a no, the X, no click id, a broken one, Global Privacy Control or another prefix send and keep nothing', () => {
  for (const visit of [false, true]) {
    const path = visit ? ANIMAL : LEO
    const no = askPage({ path, visit })
    no.no()
    const x = askPage({ path, visit })
    x.x()
    for (const p of [no, x]) {
      assert.equal(p.posts.length, 0)
      assert.equal(p.tab.size, 0)
      assert.equal(p.card, undefined, 'the card is gone and never comes back on this page')
      p.reach()
      p.wait(VISIBLE_MS * 2)
      assert.equal(p.card, undefined)
    }
    assert.deepEqual(no.events, ['moa:shown', 'moa:answer no'])
    assert.deepEqual(x.events, ['moa:shown', 'moa:answer close'])
    for (const quiet of [askPage({ path: path.split('?')[0], visit }), askPage({ path: path.replace(GCLID, 'short'), visit }),
      askPage({ path, visit, gpc: true }), askPage({ path: path.replace('/a/g/', '/a/p/'), visit }), askPage({ path: path.replace('/a/g/', '/'), visit })]) {
      quiet.wait(VISIBLE_MS * 2)
      assert.equal(quiet.card, undefined)
      assert.equal(quiet.posts.length, 0)
      assert.equal(quiet.tab.size, 0)
    }
  }
  // with Global Privacy Control the click id is not even read from the address
  assert.deepEqual(askPage({ path: ANIMAL, visit: true, gpc: true }).addresses, [])
})

/* ---- the moment: never on arrival, at the read or after 45 seconds in view, never after a door ---- */

test('the moment: no card on arrival, nor before the middle of the text or 45 seconds in view', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit, asked: false })
    assert.equal(p.card, undefined, 'never on arrival')
    // the click id has left the address at once
    assert.deepEqual(p.addresses, [visit ? '/a/g/animals/megalodon/' : '/a/g/leonardo-da-vinci/'])
    p.wait(10_000)
    p.scrollTo(600)
    p.scrollTo(1100)
    p.wait(VISIBLE_MS - 10_000 - 1000)
    assert.equal(p.card, undefined, 'a scroll short of the middle and 44 seconds bring no card')
  }
})

test('the moment (a): the card comes when the middle of the text is in view and the page has stood still', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit, asked: false })
    const t0 = p.now
    p.wait(3000)
    p.scrollTo(1100)
    p.wait(SETTLE_MS * 2)
    assert.equal(p.card, undefined)
    // the middle in view: the read; a page still moving keeps the card waiting
    p.scrollTo(1300)
    for (let i = 0; i < 5; i++) { p.wait(200); p.scrollTo(1350 + i * 40) }
    assert.equal(p.card, undefined, 'not while the page moves')
    p.wait(SETTLE_MS - 50)
    assert.equal(p.card, undefined)
    p.wait(100)
    assert.ok(p.card, 'once the page has stood still')
    assert.deepEqual(p.events, ['moa:shown'])
    assert.ok(p.now - t0 < VISIBLE_MS / 4)
  }
})

test('the moment (b): 45 seconds with the page in view; hidden time does not count', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const idle = askPage({ path, visit, asked: false })
    idle.wait(VISIBLE_MS - 1)
    assert.equal(idle.card, undefined)
    idle.wait(SETTLE_MS + 1)
    assert.ok(idle.card, 'after 45 seconds in view, without a scroll')

    const away = askPage({ path, visit, asked: false })
    away.wait(10_000)
    away.show(false)
    away.wait(30_000)
    away.show(true)
    away.wait(5_000 + SETTLE_MS)
    assert.equal(away.card, undefined, '45 seconds since arrival, 30 of them hidden: 15 in view')
    away.wait(VISIBLE_MS - 15_000 - 1)
    assert.equal(away.card, undefined)
    away.wait(SETTLE_MS + 2)
    assert.ok(away.card, '45 seconds in view in all')

    // a page opened behind another tab starts its time when it is first shown
    const behind = askPage({ path, visit, asked: false, hidden: true })
    behind.wait(VISIBLE_MS * 3)
    assert.equal(behind.card, undefined)
    behind.show(true)
    behind.wait(VISIBLE_MS + SETTLE_MS + 1)
    assert.ok(behind.card)

    // the moment that comes while the page is hidden waits for the page to be seen
    const late = askPage({ path, visit, asked: false })
    late.scrollTo(1700)
    late.show(false)
    late.wait(VISIBLE_MS * 2)
    assert.equal(late.card, undefined)
    late.show(true)
    late.wait(SETTLE_MS + 1)
    assert.ok(late.card)
  }
})

test('the moment: the middle of the text in view on arrival is no read; the time alone brings the card', () => {
  const p = askPage({ path: LEO, asked: false, onArrival: true })
  p.scrollTo(1710)
  p.wait(10_000)
  assert.equal(p.card, undefined)
  p.wait(VISIBLE_MS)
  assert.ok(p.card)
})

test('the moment: a press on a way into the walk before it means no question on this visit', () => {
  for (const [type, button] of [['click', 0], ['auxclick', 1]]) {
    const p = askPage({ path: LEO, asked: false })
    p.wait(5000)
    p.press('end', type, button)
    p.reach()
    p.wait(VISIBLE_MS * 2)
    assert.equal(p.card, undefined, type)
    assert.equal(p.posts.length + p.tab.size, 0)
  }
  // a press elsewhere, or a right click on the door, changes nothing
  const other = askPage({ path: LEO, asked: false })
  other.press(null)
  other.press('top', 'auxclick', 2)
  other.reach()
  assert.ok(other.card)
  // once the card stands, a door press leaves it as it is: the visit goes on in the walk or here
  const after = askPage({ path: LEO })
  after.press('end')
  assert.ok(after.card)
})

test('the moment: a tap already on its way when the card appears answers nothing', () => {
  const p = askPage({ path: LEO, asked: false })
  p.reach()
  assert.ok(p.card)
  for (const press of [() => p.yes(), () => p.no(), () => p.x(), () => p.find('<more>').click()]) press()
  const google = p.made.find((n) => n._text === '<google>')
  assert.equal(google.click().defaultPrevented, true)
  assert.ok(p.card)
  assert.equal(p.made.find((n) => n.id === 'ask-how').hidden, true)
  assert.deepEqual(p.events, ['moa:shown'])
  assert.equal(p.posts.length + p.tab.size, 0)
  p.wait(STILL_MS)
  assert.equal(google.click().defaultPrevented, false)
  p.yes()
  assert.equal(p.posts.length, 1)
})

test('the moment: until the answer nothing is stored, read from storage or sent, on any path to it', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit, asked: false })
    p.wait(20_000)
    p.show(false)
    p.wait(20_000)
    p.show(true)
    p.scrollTo(900)
    p.reach()
    p.wait(STILL_MS)
    p.find('<more>').click()
    assert.ok(p.card)
    // a Leonardo page tests once that the tab can hold a yes (the storage object, no item); nothing more
    assert.deepEqual(p.touched, visit ? [] : ['session'])
    assert.equal(p.tab.size, 0)
    assert.equal(p.posts.length, 0)
    p.no()
    assert.deepEqual(p.touched, visit ? [] : ['session'])
    const door = askPage({ path, visit, asked: false })
    door.press('end')
    door.wait(VISIBLE_MS * 2)
    assert.deepEqual(door.touched, visit ? [] : ['session'])
    assert.equal(door.posts.length, 0)
  }
})

test('the moment: a language without every word of the card shows none, and its privacy button still works', () => {
  for (const lang of ['fr', 'it']) {
    for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
      const p = askPage({ path, visit, lang })
      p.wait(VISIBLE_MS * 2)
      assert.equal(p.card, undefined, `${lang} ${path}`)
      assert.equal(p.made.filter((n) => n.tag === 'section').length, 0)
      // the click id still leaves the address, and goes nowhere
      assert.equal(p.addresses.length, 1)
      assert.equal(p.posts.length + p.tab.size, 0)
    }
  }
  // the wing's words written, the visit pages' not yet: the card on a Leonardo page, none on an animal page
  assert.ok(askPage({ path: LEO, lang: 'es' }).card)
  assert.equal(askPage({ path: ANIMAL, visit: true, lang: 'es' }).card, undefined)
  // the privacy page's button takes back a kept yes in a language without the card
  const tab = new Map([[ENTRY_KEY, JSON.stringify({ gclid: GCLID, yes: Date.now() - 60_000 })]])
  const privacy = askPage({ path: '/fr/confidentialite/', lang: 'fr', tab, undo: true })
  assert.equal(privacy.mount.hidden, false)
  assert.ok(privacy.words().includes('<held>'))
  privacy.find('<undo>').click()
  assert.equal(tab.has(ENTRY_KEY), false)
  assert.ok(privacy.words().includes('<undone>'))
})

test('the moment: the script and the build name the same words of the card, and the old card\'s words are not among them', () => {
  const page = readFileSync(at('../_src/js/ask.js'), 'utf8')
  const build = readFileSync(at('../_src/ask.py'), 'utf8')
  const py = (name) => [...build.match(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm'))[1].matchAll(/"([\w]+)"/g)].map((m) => m[1])
  const js = (name) => [...page.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`))[1].matchAll(/'([\w]+)'/g)].map((m) => m[1])
  assert.deepEqual(js('CARD'), py('CARD_KEYS'))
  assert.deepEqual(js('VISIT'), py('VISIT_KEYS'))
  for (const old of py('RETIRED_KEYS')) assert.ok(!js('CARD').includes(old) && !js('VISIT').includes(old), old)
  assert.deepEqual([...py('KEYS'), ...py('CARD_KEYS'), ...py('VISIT_KEYS')].sort(), [...new Set(ASK_KEYS)].sort())
  // the moment is the count's read: the same middle of main between the screen's top and its foot
  assert.ok(page.includes('var r = main.getBoundingClientRect(), mid = r.top + r.height / 2;'))
  assert.ok(readFileSync(at('../_src/js/count.js'), 'utf8').includes('var r = main.getBoundingClientRect(), mid = r.top + r.height / 2;'))
  assert.ok(page.includes('var VISIBLE_MS = 45 * 1000;'))
})

test('the moment: the built script carries the whole card in every built language', () => {
  const built = at('../dist/static/ask.js')
  if (!existsSync(built)) return
  const words = JSON.parse(readFileSync(built, 'utf8').match(/var WORDS = (\{.*?\});\n/s)[1])
  for (const [lang, w] of Object.entries(words)) {
    for (const k of ASK_KEYS) assert.ok(w[k], `${lang} ${k}`)
    for (const k of ['q', 'why', 'what', 'whom', 'age', 'yes', 'no', 'thanks', 'visit_what', 'visit_whom', 'visit_thanks']) assert.equal(w[k], undefined, `${lang} ${k}`)
  }
})

/* ---- the function: every check, one by one ---- */

test('the function answers POST only: no other method has a handler', () => {
  const handlers = Object.keys(entryModule).filter((k) => /^onRequest/.test(k))
  assert.deepEqual(handlers, ['onRequestPost'])
})

test('a good entry reaches Google, once', async () => {
  const calls = await sent(good())
  assert.equal(calls[0].url, TOKEN_URL)
  assert.equal(calls[1].url, UPLOAD_URL)
})

test('its own origin only: no Origin, another site, a lookalike, plain http', async () => {
  await silent(good(), { headers: { Origin: '' } })
  await silent(good(), { headers: { Origin: 'https://example.com' } })
  await silent(good(), { headers: { Origin: 'https://museumofages.org.example.com' } })
  await silent(good(), { headers: { Origin: 'http://museumofages.org' } })
  await silent(good(), { headers: { Origin: 'null' } })
})

test('a browser that sends Global Privacy Control is never reported', async () => {
  await silent(good(), { headers: { 'Sec-GPC': '1' } })
  await sent(good(), { headers: { 'Sec-GPC': '0' } })
})

test('a small body only', async () => {
  await silent(null, { raw: JSON.stringify({ ...good(), pad: 'x'.repeat(MAX_BODY) }) })
  await silent(good(), { headers: { 'Content-Length': String(MAX_BODY + 1) } })
  await silent(null, { raw: '' })
  await silent(null, { raw: 'gclid=abc' })
  await silent(null, { raw: '[]' })
  await silent(null, { raw: 'null' })
  await silent(null, { raw: '"x"' })
})

test('the click id must have its shape', async () => {
  for (const gclid of ['a'.repeat(19), 'a'.repeat(201), `${GCLID}.`, `${GCLID}=`, `${GCLID}/`, `x${GCLID} `, 12345678901234567890123, null, ['x'], { a: 1 }]) {
    await silent(good({ gclid }))
  }
  const { gclid, ...without } = good()
  await silent(without)
  await sent(good({ gclid: 'a'.repeat(20) }))
  await sent(good({ gclid: 'b'.repeat(200) }))
})

test('the wing must be on the count\'s closed list', async () => {
  assert.deepEqual(Object.keys(WING_STOPS), ['vinci'])
  for (const wing of ['leonardo', 'Vinci', '', 'toString', '__proto__', 'constructor', 1, null, ['vinci']]) await silent(good({ wing }))
  const { wing, ...without } = good()
  await silent(without)
})

test('the yes must lie within the last six hours', async () => {
  const now = Date.now()
  await sent(good({ yes: now - YES_MAX_AGE_MS + 5_000 }))
  await silent(good({ yes: now - YES_MAX_AGE_MS - 1 }))
  await silent(good({ yes: now - 24 * 60 * 60 * 1000 }))
  // a browser's clock a little ahead is allowed, a yes from the future beyond that is not
  await sent(good({ yes: now + 60_000 }))
  await silent(good({ yes: now + YES_SKEW_MS + 60_000 }))
  for (const yes of [String(now), null, NaN, Infinity, undefined, true]) await silent(good({ yes }))
})

test('without every setting nothing is sent', async () => {
  for (const name of SETTINGS) {
    const env = { ...ENV }
    delete env[name]
    await silent(good(), { env })
    await silent(good(), { env: { ...ENV, [name]: '' } })
    await silent(good(), { env: { ...ENV, [name]: '   ' } })
  }
  await silent(good(), { env: {} })
  await silent(good(), { env: null })
})

test('settings off their shape send nothing: an account number, or an action in another account', async () => {
  await silent(good(), { env: { ...ENV, GADS_CUSTOMER_ID: '123' } })
  await silent(good(), { env: { ...ENV, GADS_LOGIN_CUSTOMER_ID: 'abc-def-ghij' } })
  await silent(good(), { env: { ...ENV, MOA_ENTRY_ACTION: 'customers/9999999999/conversionActions/1' } })
  await silent(good(), { env: { ...ENV, MOA_ENTRY_ACTION: 'conversionActions/1' } })
  await silent(good(), { env: { ...ENV, MOA_ENTRY_ACTION: 'Museum Entry' } })
  // the bare number of the action in the customer's own account is enough
  const calls = await sent(good(), { env: { ...ENV, MOA_ENTRY_ACTION: '987654321' } })
  assert.equal(JSON.parse(calls[1].init.body).conversions[0].conversionAction, 'customers/4445556666/conversionActions/987654321')
})

/* ---- what goes to Google ---- */

test('the token request carries the app\'s own credentials and nothing of the visitor', async () => {
  const [token] = await sent(good())
  assert.equal(token.init.method, 'POST')
  const form = Object.fromEntries(new URLSearchParams(token.init.body))
  assert.deepEqual(form, { client_id: 'client-id', client_secret: 'client-secret', refresh_token: 'refresh-token', grant_type: 'refresh_token' })
})

test('the upload: its exact body, consent fields, the order id, and nothing else about the visitor', async () => {
  const before = Date.now()
  const calls = await sent(good())
  const after = Date.now()
  const upload = calls[1]
  assert.equal(upload.init.method, 'POST')
  assert.deepEqual(Object.fromEntries(Object.entries(upload.init.headers)), {
    Authorization: 'Bearer ya29.token', 'developer-token': 'dev-token', 'login-customer-id': '1112223333', 'Content-Type': 'application/json',
  })
  const body = JSON.parse(upload.init.body)
  const order = 'moa-' + createHash('sha256').update(`${GCLID}:vinci`).digest('hex').slice(0, 32)
  const when = body.conversions[0].conversionDateTime
  assert.match(when, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00$/)
  const ms = Date.parse(when.replace(' ', 'T').replace('+00:00', 'Z'))
  assert.ok(ms >= Math.floor(before / 1000) * 1000 && ms <= after, when)
  assert.deepEqual(body, {
    conversions: [{
      gclid: GCLID,
      conversionAction: 'customers/4445556666/conversionActions/987654321',
      conversionDateTime: when,
      orderId: order,
      consent: { adUserData: 'GRANTED', adPersonalization: 'DENIED' },
    }],
    partialFailure: true,
  })
  // what the request carried about the visitor never reaches the upload
  for (const s of ['203.0.113.9', 'Mozilla', 'museumofages', 'yes']) assert.ok(!upload.init.body.includes(s), s)
  assert.ok(!('validateOnly' in body))
})

test('the order id: made from the click id and the wing, short, and not the click id itself', async () => {
  const id = await orderIdOf(GCLID, 'vinci')
  assert.match(id, /^moa-[0-9a-f]{32}$/)
  assert.equal(id, await orderIdOf(GCLID, 'vinci'))
  assert.notEqual(id, await orderIdOf(GCLID, 'another'))
  assert.notEqual(id, await orderIdOf(GCLID.replace('T', 'U'), 'vinci'))
  assert.ok(!id.includes(GCLID.slice(0, 10)))
})

test('uploadBody and dateTimeOf on their own', () => {
  assert.equal(dateTimeOf(Date.UTC(2026, 9, 14, 7, 5, 9, 123)), '2026-10-14 07:05:09+00:00')
  const body = uploadBody({ gclid: GCLID, wing: 'vinci' }, { action: 'customers/1/conversionActions/2' }, Date.UTC(2026, 0, 2, 3, 4, 5), 'moa-x')
  assert.deepEqual(Object.keys(body.conversions[0]).sort(), ['consent', 'conversionAction', 'conversionDateTime', 'gclid', 'orderId'])
})

test('the access token is kept in memory: a second entry asks Google once', async () => {
  forgetToken()
  const g = google()
  const realFetch = globalThis.fetch
  globalThis.fetch = g.fetcher
  try {
    for (let i = 0; i < 2; i++) {
      const waits = []
      const request = new Request(`${ORIGIN}/v1/entry`, { method: 'POST', body: JSON.stringify(good()), headers: { Origin: ORIGIN } })
      await onRequestPost({ request, env: ENV, waitUntil: (p) => waits.push(p) })
      await Promise.all(waits)
    }
  } finally {
    globalThis.fetch = realFetch
  }
  assert.deepEqual(g.calls.map((c) => c.url), [TOKEN_URL, UPLOAD_URL, UPLOAD_URL])
})

test('the route hands the upload to waitUntil and answers before it ends', async () => {
  const { waits } = await post(good())
  assert.equal(waits.length, 1)
})

/* ---- the yes itself: an Ad Question Yes, at once, on every page that asks ---- */

const VISIT_ACTION = 'customers/4445556666/conversionActions/123123123'
const ENV_BOTH = Object.freeze({ ...ENV, MOA_VISIT_ACTION: VISIT_ACTION })
const visit = (over = {}) => ({ gclid: GCLID, yes: Date.now() - 1_000, kind: 'visit', ...over })

test('the two actions and their settings: the visit and the entry, each a name and a setting of its own', () => {
  assert.equal(VISIT_ACTION_NAME, 'Ad Question Yes')
  assert.equal(VISIT_ACTION_SETTING, 'MOA_VISIT_ACTION')
  assert.equal(ENTRY_ACTION_NAME, 'Museum Entry')
  assert.equal(ENTRY_ACTION_SETTING, 'MOA_ENTRY_ACTION')
  assert.equal(VISIT_KIND, 'visit')
  assert.deepEqual([...VISIT_SETTINGS], [...SETTINGS.slice(0, -1), 'MOA_VISIT_ACTION'])
  assert.equal(SETTINGS.at(-1), 'MOA_ENTRY_ACTION')
  assert.deepEqual(actionOf({ gclid: GCLID, kind: 'visit' }).name, 'Ad Question Yes')
  assert.deepEqual(actionOf({ gclid: GCLID, wing: 'vinci' }).name, 'Museum Entry')
})

test('a yes is reported as an Ad Question Yes to its own action, with an order id of the click and the word visit', async () => {
  const calls = await sent(visit(), { env: ENV_BOTH })
  const body = JSON.parse(calls[1].init.body)
  const order = 'moa-' + createHash('sha256').update(`${GCLID}:visit`).digest('hex').slice(0, 32)
  assert.deepEqual(body, {
    conversions: [{
      gclid: GCLID,
      conversionAction: VISIT_ACTION,
      conversionDateTime: body.conversions[0].conversionDateTime,
      orderId: order,
      consent: { adUserData: 'GRANTED', adPersonalization: 'DENIED' },
    }],
    partialFailure: true,
  })
  for (const s of ['203.0.113.9', 'Mozilla', 'museumofages', 'visit"', 'yes']) assert.ok(!calls[1].init.body.includes(s), s)
  // the entry still goes to its own action, with its own order id
  const entry = JSON.parse((await sent(good(), { env: ENV_BOTH }))[1].init.body).conversions[0]
  assert.equal(entry.conversionAction, ENV.MOA_ENTRY_ACTION)
  assert.notEqual(entry.orderId, order)
})

test('one click counts once per action: the same visit twice carries the same order id, the entry another', async () => {
  const a = JSON.parse((await sent(visit(), { env: ENV_BOTH }))[1].init.body).conversions[0].orderId
  const b = JSON.parse((await sent(visit({ yes: Date.now() - 5_000 }), { env: ENV_BOTH }))[1].init.body).conversions[0].orderId
  assert.equal(a, b)
  assert.equal(a, await orderIdOf(GCLID, 'visit'))
  assert.notEqual(a, await orderIdOf(GCLID, 'vinci'))
  assert.notEqual(a, await orderIdOf(GCLID.replace('T', 'U'), 'visit'))
})

test('the visit needs the account\'s settings and its own action, never the entry\'s, and the entry never the visit\'s', async () => {
  const env = { ...ENV_BOTH }
  delete env.MOA_ENTRY_ACTION
  await sent(visit(), { env })
  await silent(good(), { env })
  // the entry stands as it was: its seven settings and no more
  await sent(good(), { env: ENV })
  for (const name of VISIT_SETTINGS) {
    const without = { ...ENV_BOTH }
    delete without[name]
    await silent(visit(), { env: without })
  }
  await silent(visit(), { env: { ...ENV_BOTH, MOA_VISIT_ACTION: 'customers/9999999999/conversionActions/1' } })
  const bare = await sent(visit(), { env: { ...ENV_BOTH, MOA_VISIT_ACTION: '123123123' } })
  assert.equal(JSON.parse(bare[1].init.body).conversions[0].conversionAction, VISIT_ACTION)
})

test('until its action is set, a visit sends nothing and its log line says so, without the click id', async () => {
  const from = lines.length
  await silent(visit(), { env: ENV })
  await silent(visit(), { env: { ...ENV, MOA_VISIT_ACTION: '   ' } })
  await silent(visit(), { env: { ...ENV_BOTH, GADS_CUSTOMER_ID: '' } })
  const said = lines.slice(from)
  assert.deepEqual(said, ['[entry] Ad Question Yes not sent: MOA_VISIT_ACTION is not set', '[entry] Ad Question Yes not sent: MOA_VISIT_ACTION is not set',
    '[entry] Ad Question Yes not sent: a setting is missing or off its shape'])
  // the entry without its settings stays silent, as it was
  const quiet = lines.length
  await silent(good(), { env: {} })
  assert.equal(lines.length, quiet)
})

test('a body names one kind: a wing or the visit, never both, never another word', async () => {
  const now = Date.now()
  assert.deepEqual(entryOf(JSON.stringify(visit()), now), { gclid: GCLID, kind: 'visit' })
  assert.deepEqual(entryOf(JSON.stringify(good()), now), { gclid: GCLID, wing: 'vinci' })
  for (const body of [visit({ wing: 'vinci' }), visit({ kind: 'Visit' }), visit({ kind: 'entry' }), visit({ kind: 1 }), visit({ kind: null }),
    visit({ kind: ['visit'] }), visit({ gclid: 'short' }), visit({ yes: now - YES_MAX_AGE_MS - 1 }), visit({ yes: now + YES_SKEW_MS + 60_000 }),
    { gclid: GCLID, yes: now }]) {
    assert.equal(entryOf(JSON.stringify(body), now), null, JSON.stringify(body))
    await silent(body, { env: ENV_BOTH })
  }
})

test('a visit: its own origin only, never with Global Privacy Control, a small body only', async () => {
  await silent(visit(), { env: ENV_BOTH, headers: { Origin: 'https://example.com' } })
  await silent(visit(), { env: ENV_BOTH, headers: { Origin: '' } })
  await silent(visit(), { env: ENV_BOTH, headers: { 'Sec-GPC': '1' } })
  await silent(visit({ pad: 'x'.repeat(MAX_BODY) }), { env: ENV_BOTH })
})

test('a visit\'s errors from Google are logged under its name, without the click id', async () => {
  const from = lines.length
  await post(visit(), { env: ENV_BOTH, answer: { upload: () => new Response(`bad ${GCLID}`, { status: 400 }) } })
  await post(visit(), { env: ENV_BOTH, answer: { upload: () => Response.json({ partialFailureError: { message: `exists ${GCLID}` } }) } })
  await post(visit(), { env: ENV_BOTH })
  const said = lines.slice(from)
  assert.match(said[0], /^\[entry\] Ad Question Yes upload http 400: bad \[redacted\]$/)
  assert.match(said[1], /^\[entry\] Ad Question Yes not counted: exists \[redacted\]$/)
  assert.equal(said[2], '[entry] Ad Question Yes counted')
  assert.ok(said.every((l) => !l.includes(GCLID)))
})

/* ---- the click id in no log line ---- */

test('redact takes out the click id, the order id and anything shaped like a click id', () => {
  const order = 'moa-0123456789abcdef0123456789abcdef'
  const text = `The click ${GCLID} with order ${order} was not found (gclid: ${'Z'.repeat(25)}).`
  const out = redact(text, GCLID, order)
  for (const s of [GCLID, order, 'Z'.repeat(25), GCLID.slice(0, 20)]) assert.ok(!out.includes(s), s)
  assert.match(out, /was not found/)
  assert.equal(redact(undefined), '')
})

test('Google\'s errors are logged without the click id: a refused upload, a partial failure, a broken network', async () => {
  const order = await orderIdOf(GCLID, 'vinci')
  const start = lines.length
  await post(good(), { answer: { upload: () => new Response(`{"error":{"message":"Bad gclid ${GCLID}, order ${order}"}}`, { status: 400 }) } })
  await post(good(), { answer: { upload: () => Response.json({ partialFailureError: { code: 3, message: `Click ${GCLID} not from this account (order ${order})` } }) } })
  await post(good(), { answer: { upload: () => { throw new Error(`connection reset while sending ${GCLID}`) } } })
  await post(good(), { answer: { token: () => new Response(`denied for ${GCLID}`, { status: 401 }) } })
  await post(good(), { answer: { upload: () => new Response('not json', { status: 200 }) } })
  const written = lines.slice(start)
  assert.ok(written.some((l) => l.startsWith('[entry] upload http 400')), written.join('\n'))
  assert.ok(written.some((l) => l.startsWith('[entry] not counted')), written.join('\n'))
  assert.ok(written.some((l) => l.startsWith('[entry] failed')), written.join('\n'))
  for (const l of written) {
    assert.ok(!l.includes(GCLID) && !l.includes(order) && !l.includes(GCLID.slice(0, 20)), l)
  }
})

/* ---- the walk's sender ---- */

const museum = at('../../museum')
const tsAt = `${museum}/node_modules/typescript`
test('the walk takes the entry out of the tab first, and sends only a whole one younger than six hours', { skip: !existsSync(tsAt) && 'the museum\'s typescript is not installed' }, async () => {
  const ts = createRequire(`${museum}/package.json`)('typescript')
  const src = readFileSync(`${museum}/src/core/museum-entry.ts`, 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  const { takeEntry } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  const now = Date.UTC(2026, 9, 14, 12)
  const store = (value) => {
    const map = new Map(value === undefined ? [] : [[ENTRY_KEY, value]])
    return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), removeItem: (k) => map.delete(k) }
  }
  const cases = [
    [JSON.stringify({ gclid: GCLID, yes: now - 1000 }), { gclid: GCLID, yes: now - 1000 }],
    [JSON.stringify({ gclid: GCLID, yes: now - YES_MAX_AGE_MS - 1 }), null],
    [JSON.stringify({ gclid: GCLID, yes: now + 1 }), null],
    [JSON.stringify({ gclid: 'short', yes: now - 1000 }), null],
    [JSON.stringify({ gclid: GCLID, yes: String(now) }), null],
    ['not json', null],
    ['null', null],
  ]
  for (const [raw, want] of cases) {
    const s = store(raw)
    assert.deepEqual(takeEntry(s, now), want, raw)
    assert.equal(s.map.has(ENTRY_KEY), false, `the entry stays in the tab after ${raw}`)
  }
  assert.equal(takeEntry(store(), now), null)
})
