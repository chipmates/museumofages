// The museum entry: who is asked at the edge, every check of POST /v1/entry one by one, the one upload's exact
// body, the click id kept out of every log line, and the same rules in the edge, the page's script and the walk.
//   node --test site/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { ASK_SCRIPT, CLICK, ENTRY_KEY, GRANT_PREFIX, WALK_PREFIX, YES_MAX_AGE_MS, asks, unasked } from '../functions/_entry/rules.js'
import * as entryModule from '../functions/v1/entry.js'
import { API_VERSION, MAX_BODY, SETTINGS, YES_SKEW_MS, dateTimeOf, forgetToken, onRequestPost, orderIdOf, redact, uploadBody } from '../functions/v1/entry.js'
import { onRequest as middleware } from '../functions/_middleware.js'
import { UNASKED, WING_STOPS } from '../functions/_count/lists.js'

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
      assert.deepEqual(seen.filter((x) => x.append), [], path)
      assert.equal(seen.filter((x) => x.set).length, 1, path)
    })
  }
})

/* ---- the pages of a wing in the making: never asked, whatever the address carries ---- */

const MAKING = ['/a/g/animals/', '/a/g/animals/megalodon/', `/a/g/animals/megalodon/?gclid=${GCLID}`, '/a/g/de/tiere/',
  '/a/g/de/tiere/megalodon/', '/a/g/animals', '/a/g/de/tiere', '/a/g//animals/megalodon/', '/a/g/Animals/Megalodon/',
  '/a/g/%61nimals/megalodon/', '/a/g/de//tiere/', '/a/g/animals/megalodon/index.html', '/a/g/de/TIERE/megalodon/']

test('the edge never gives the question\'s script to a page of a wing in the making, by any spelling of its address', () => {
  assert.deepEqual([...UNASKED].sort(), ['/animals/', '/de/tiere/'])
  const none = new Headers()
  for (const path of MAKING) {
    assert.equal(unasked(path), true, path)
    assert.equal(asks(path, none), false, path)
    assert.equal(asks(path, new Headers({ 'Sec-GPC': '0' })), false, path)
  }
  // a page whose name only begins like theirs is asked as before, and so is every other page under the prefix
  for (const path of ['/a/g/animalsx/', '/a/g/de/tierex/', '/a/g/de/', '/a/g/leonardo-da-vinci/', '/a/g/de/leonardo-da-vinci/groessen/']) {
    assert.equal(unasked(path), false, path)
    assert.equal(asks(path, none), true, path)
  }
  // a broken escape is read as written and asks as any page would
  assert.equal(asks('/a/g/%E0%A4%A/', none), true)
})

test('the edge puts no question\'s script on a page of a wing in the making, click id or not', async () => {
  for (const path of [`/a/g/animals/megalodon/?gclid=${GCLID}`, `/a/g/de/tiere/?gclid=${GCLID}`, '/a/g/animals/', `/a/g//de/tiere/megalodon/?gclid=${GCLID}`]) {
    await withRewriter(async (seen) => {
      await page(path, { Referer: 'https://www.google.com/' })
      assert.deepEqual(seen.filter((x) => x.append), [], path)
      // the visit's source word is still set: the count knows the visit came from the grant
      assert.deepEqual(seen.find((x) => x.set).set, ['data-source', 'ad_grant'], path)
    })
  }
})

test('the question\'s script does nothing at all on a page of a wing in the making, whatever its address carries', async () => {
  const vm = await import('node:vm')
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
      location: { hostname: 'museumofages.org', pathname: '/a/g/animals/megalodon/', search: `?gclid=${GCLID}`, hash: '' },
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

test('every built page of a wing in the making carries the mark, and stands at an address the edge never asks', () => {
  const dist = at('../dist/')
  if (!existsSync(dist)) return
  for (const rel of ['animals/index.html', 'animals/megalodon/index.html', 'de/tiere/index.html', 'de/tiere/megalodon/index.html']) {
    const text = readFileSync(dist + rel, 'utf8')
    assert.match(text, /<main\b[^>]*\sdata-unasked[\s>]/, rel)
    assert.ok(!text.includes('/static/ask.js'), rel)
    assert.equal(asks(`/a/g/${rel.replace(/index\.html$/, '')}`, new Headers()), false, rel)
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
