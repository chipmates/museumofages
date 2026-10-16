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

test('the count\'s lists name the nine animal pages in all four of their languages as the topic pages that ask', () => {
  assert.deepEqual([...UNASKED].sort(), ['/animals/', '/de/tiere/', '/es/animales/', '/pt-br/animais/'])
  assert.deepEqual(Object.keys(ASKED_MAKING), ['megalodon', 'biggest_dinosaurs', 't_rex', 'spinosaurus', 'woolly_mammoth', 'brachiosaurus', 'triceratops', 'ankylosaurus', 'stegosaurus'])
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
  assert.equal(TOPICS.length, 36)
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

/* ---- the page's script, run in a stand-in page: what a yes, a no and the X send and keep ---- */

const ASK_KEYS = ['kicker', 'q', 'what', 'whom', 'why', 'age', 'yes', 'no', 'more', 'google', 'newtab', 'close', 'dismiss', 'thanks',
  'undo', 'undone', 'held', 'none', 'visit_what', 'visit_whom', 'visit_thanks']
const ASK_WORDS = { en: { ...Object.fromEntries(ASK_KEYS.map((k) => [k, `<${k}>`])), privacy: '/privacy/' } }
const ASK_SOURCE = readFileSync(at('../_src/js/ask.js'), 'utf8').replace('{/*words*/}', JSON.stringify(ASK_WORDS))

/** Runs ask.js once in a small stand-in page. The tab's storage is passed in, so two runs can share one tab. */
function askPage({ path, visit = false, gpc = false, tab = new Map(), storage = true } = {}) {
  const [pathname, search = ''] = path.split('?')
  const made = [], posts = [], events = [], addresses = []
  const doc = { activeElement: null }
  class El {
    constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, on: {}, className: '', _text: '', isConnected: true,
      offsetHeight: 300, scrollHeight: 0, clientHeight: 0, scrollTop: 0, style: { setProperty() {}, removeProperty() {} },
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
    click() { for (const fn of this.on.click || []) fn() }
    remove() { this.isConnected = false; this.removed = true }
    focus() { doc.activeElement = this }
    contains() { return false }
  }
  const body = new El('body'), main = new El('main'), head = new El('head')
  body.appendChild(main)
  const html = new El('html')
  html.attrs.lang = 'en'
  Object.assign(doc, {
    documentElement: html, head, body, currentScript: null, prerendering: false,
    createElement: (tag) => new El(tag),
    getElementById: (id) => (id === 'main' ? main : null),
    querySelector: (sel) => (sel === 'main[data-asks="visit"]' ? (visit ? main : null) : sel === 'main' ? main : null),
    addEventListener() {},
    dispatchEvent: (e) => { events.push(e.detail === undefined ? e.type : `${e.type} ${e.detail}`); return true },
  })
  const session = {
    getItem: (k) => (tab.has(k) ? tab.get(k) : null),
    setItem: (k, v) => { tab.set(k, String(v)) },
    removeItem: (k) => { tab.delete(k) },
  }
  const window = {
    location: { hostname: 'museumofages.org', pathname, search: search ? `?${search}` : '', hash: '' },
    history: { state: null, replaceState: (s, _, url) => addresses.push(url) },
    fetch: (url, init) => { posts.push({ url, init, body: JSON.parse(init.body) }); return Promise.resolve(new Response(null, { status: 204 })) },
    getComputedStyle: () => ({ bottom: '0px' }),
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout, clearTimeout,
  }
  Object.defineProperty(window, 'sessionStorage', { get() { if (!storage) throw new Error('blocked'); return session } })
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
  vm.runInNewContext(ASK_SOURCE, { document: doc, window, navigator: { globalPrivacyControl: gpc }, CustomEvent, JSON, Date })
  const find = (text) => made.find((n) => n.tag === 'button' && n._text === text)
  const card = made.find((n) => n.tag === 'section' && n.className.startsWith('ask'))
  const words = () => made.filter((n) => n._text && !n.removed).map((n) => n._text)
  return { made, tab, posts, events, addresses, card, find, words, yes: () => find('<yes>').click(), no: () => find('<no>').click(),
    x: () => made.find((n) => n.className === 'ask__close').click() }
}
const LEO = `/a/g/leonardo-da-vinci/?gclid=${GCLID}`
const ANIMAL = `/a/g/animals/megalodon/?gclid=${GCLID}`

test('the page\'s script: a yes on a Leonardo page sends one visit at once and keeps the entry for the walk', () => {
  const before = Date.now()
  const p = askPage({ path: LEO })
  assert.ok(p.card, 'the card stands')
  assert.deepEqual(p.addresses, ['/a/g/leonardo-da-vinci/'])
  assert.equal(p.posts.length, 0)
  p.yes()
  assert.equal(p.posts.length, 1)
  const [{ url, init, body }] = p.posts
  assert.equal(url, '/v1/entry')
  assert.deepEqual(Object.keys(body), ['gclid', 'yes', 'kind'])
  assert.equal(body.gclid, GCLID)
  assert.equal(body.kind, VISIT_KIND)
  assert.ok(body.yes >= before && body.yes <= Date.now())
  assert.equal(init.method, 'POST')
  assert.equal(init.keepalive, true)
  assert.equal(init.credentials, 'omit')
  assert.equal(init.mode, 'same-origin')
  const kept = JSON.parse(p.tab.get(ENTRY_KEY))
  assert.deepEqual(Object.keys(kept), ['gclid', 'yes'])
  assert.equal(kept.gclid, GCLID)
  assert.ok(p.words().includes('<thanks>'))
  assert.ok(p.find('<undo>'), 'the yes can be taken back for the entry')
  // a second press, from any button left in the page, sends nothing more
  p.yes()
  assert.equal(p.posts.length, 1)
  assert.deepEqual(p.events, ['moa:shown', 'moa:answer yes'])
  // taking it back stops the entry, the visit has gone
  p.find('<undo>').click()
  assert.equal(p.tab.has(ENTRY_KEY), false)
})

test('the page\'s script: a second yes in the same tab for the same click sends nothing new, a new click counts once', () => {
  const tab = new Map()
  assert.equal(askPage({ path: LEO, tab }).yes() ?? 1, 1)
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
  assert.ok(p.words().includes('<visit_what>') && p.words().includes('<visit_whom>'))
  assert.ok(!p.words().includes('<what>') && !p.words().includes('<whom>'))
  p.yes()
  p.yes()
  assert.equal(p.posts.length, 1)
  assert.deepEqual(p.posts[0].body.kind, 'visit')
  assert.equal(p.posts[0].body.gclid, GCLID)
  assert.equal(p.tab.size, 0, 'nothing in the tab')
  assert.ok(p.words().includes('<visit_thanks>'))
  assert.equal(p.find('<undo>'), undefined)
  // a tab whose storage is blocked is still asked here, since nothing is kept
  const blocked = askPage({ path: ANIMAL, visit: true, storage: false })
  assert.ok(blocked.card)
  blocked.yes()
  assert.equal(blocked.posts.length, 1)
  // a Leonardo page in such a tab is not asked: its yes could not reach the walk
  assert.equal(askPage({ path: LEO, storage: false }).card, undefined)
})

test('the page\'s script: the age line stands right above the answers on every card, outside the words that scroll', () => {
  for (const [path, visit] of [[LEO, false], [ANIMAL, true]]) {
    const p = askPage({ path, visit })
    const age = p.made.find((n) => n._text === '<age>')
    const act = age.parentNode
    assert.equal(act.className, 'ask__act', path)
    assert.equal(act.children[0], age)
    assert.equal(act.children[1].className, 'ask__answers')
    assert.ok(act.children[1].children.some((b) => b._text === '<yes>') && act.children[1].children.some((b) => b._text === '<no>'))
    assert.equal(p.made.filter((n) => n._text === '<age>').length, 1)
    assert.ok(!p.made.find((n) => n.className === 'ask__body').children.includes(age))
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
    }
    assert.deepEqual(no.events, ['moa:shown', 'moa:answer no'])
    assert.deepEqual(x.events, ['moa:shown', 'moa:answer close'])
    for (const quiet of [askPage({ path: path.split('?')[0], visit }), askPage({ path: path.replace(GCLID, 'short'), visit }),
      askPage({ path, visit, gpc: true }), askPage({ path: path.replace('/a/g/', '/a/p/'), visit }), askPage({ path: path.replace('/a/g/', '/'), visit })]) {
      assert.equal(quiet.card, undefined)
      assert.equal(quiet.posts.length, 0)
      assert.equal(quiet.tab.size, 0)
    }
  }
  // with Global Privacy Control the click id is not even read from the address
  assert.deepEqual(askPage({ path: ANIMAL, visit: true, gpc: true }).addresses, [])
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
