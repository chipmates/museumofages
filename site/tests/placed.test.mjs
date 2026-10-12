// The addresses of links we place ourselves (/a/<letter>/<real path>): the function answers with the real path's
// own files, keeps the prefix on the host's forwards within the site, leaves every other address alone, and gives
// the walk its one script; the script takes the prefix off the walk's address.
//   node --test site/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { PLACED_SCRIPT, onRequest, placedPrefix } from '../functions/a/[x]/[[path]].js'
import { prefixWord } from '../functions/_count/source.js'

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'].filter((x) => prefixWord(`/a/${x}/`))
const ORIGIN = 'https://museumofages.org'

/** One request through the function, with a host whose files answer `answer` and a next() that is recorded. */
async function ask(path, { method = 'GET', headers = {}, answer = () => new Response('<html><head></head></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"real"' } }) } = {}) {
  const asked = []
  let passed = 0
  const request = new Request(ORIGIN + path, { method, headers: { Accept: 'text/html', ...headers } })
  const context = {
    request,
    env: { ASSETS: { fetch: async (r) => { asked.push(r); return answer(r) } } },
    next: async () => { passed++; return new Response('next', { status: 404 }) },
  }
  const response = await onRequest(context)
  return { response, asked, passed }
}

/** A stand-in for the runtime's HTMLRewriter: records what is put into which element. */
function withRewriter(fn) {
  const seen = []
  globalThis.HTMLRewriter = class {
    on(selector, handlers) {
      this.selector = selector
      this.handlers = handlers
      return this
    }
    transform(response) {
      const el = { prepend: (content, options) => seen.push({ selector: this.selector, content, options }) }
      this.handlers.element(el)
      return new Response(response.body, response)
    }
  }
  return fn(seen).finally(() => { delete globalThis.HTMLRewriter })
}

test('the four letters are the count\'s, and nothing else is a prefix', () => {
  assert.deepEqual(LETTERS.sort(), ['f', 'g', 'o', 'p'])
  for (const x of LETTERS) {
    assert.equal(placedPrefix(`/a/${x}/de/`), `/a/${x}`)
    assert.equal(placedPrefix(`/a/${x}`), `/a/${x}`)
  }
  for (const path of ['/a/z/de/', '/a/gg/', '/a/G/', '/a/', '/a', '/b/g/', '/de/a/g/', '/ag/', '/a/g.html', '']) {
    assert.equal(placedPrefix(path), '', path)
  }
})

test('each letter answers with the real path\'s own answer, its question and headers kept', async () => {
  for (const x of LETTERS) {
    const real = new Response('the page', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' } })
    const { response, asked, passed } = await ask(`/a/${x}/de/leonardo-da-vinci/erfindungen/?gclid=abc&probe=1`, {
      headers: { 'If-None-Match': '"e"', Range: 'bytes=0-9' }, answer: () => real,
    })
    assert.equal(passed, 0)
    assert.equal(asked.length, 1)
    const url = new URL(asked[0].url)
    assert.equal(url.origin, ORIGIN)
    assert.equal(url.pathname, '/de/leonardo-da-vinci/erfindungen/')
    assert.equal(url.search, '?gclid=abc&probe=1')
    assert.equal(asked[0].method, 'GET')
    assert.equal(asked[0].headers.get('If-None-Match'), '"e"')
    assert.equal(asked[0].headers.get('Range'), 'bytes=0-9')
    assert.equal(response, real, 'a page is answered as the host answers it, not rewritten')
  }
})

test('files of the page under the prefix come from the real files, HEAD too', async () => {
  for (const path of ['/static/site.css', '/static/fonts/cardo-400.woff2', '/static/img/grain.png', '/assets/main.js', '/sitemap.xml']) {
    const { asked } = await ask('/a/g' + path, { method: 'HEAD', answer: () => new Response(null, { status: 200 }) })
    assert.equal(new URL(asked[0].url).pathname, path)
    assert.equal(asked[0].method, 'HEAD')
  }
})

test('a letter off the list, another method or no letter at all goes on as any address', async () => {
  for (const [path, method] of [['/a/z/de/', 'GET'], ['/a/gg/de/', 'GET'], ['/a/G/', 'GET'], ['/a/g/de/', 'POST'], ['/a/o/v1/funnel', 'POST'], ['/a/p/', 'PUT'], ['/a/f/', 'DELETE']]) {
    const { asked, passed } = await ask(path, { method })
    assert.deepEqual([asked.length, passed], [0, 1], `${method} ${path}`)
  }
})

test('the prefix alone is sent to its folder, as the host sends a folder without its slash', async () => {
  const { response, asked } = await ask('/a/p?probe=1')
  assert.equal(asked.length, 0)
  assert.equal(response.status, 308)
  assert.equal(response.headers.get('Location'), '/a/p/?probe=1')
})

test('the host\'s forwards within the site keep the prefix; a forward to another site stays as it is', async () => {
  const forward = (status, location) => () => new Response(null, { status, headers: { Location: location } })
  const cases = [
    ['/a/g/de/leonardo-da-vinci', forward(308, '/de/leonardo-da-vinci/'), 308, '/a/g/de/leonardo-da-vinci/'],
    ['/a/o/w/vinci.html?lang=de', forward(308, '/w/vinci?lang=de'), 308, '/a/o/w/vinci?lang=de'],
    ['/a/p/index.html', forward(308, `${ORIGIN}/`), 308, '/a/p/'],
    ['/a/f/source', forward(302, 'https://github.com/chipmates/museumofages'), 302, 'https://github.com/chipmates/museumofages'],
  ]
  for (const [path, answer, status, location] of cases) {
    const { response } = await ask(path, { answer })
    assert.equal(response.status, status, path)
    assert.equal(response.headers.get('Location'), location, path)
  }
})

test('an unknown real path answers as the host answers it, with its own not-found page', async () => {
  const { response } = await ask('/a/g/fr/nowhere/', { answer: () => new Response('fr 404 page', { status: 404, headers: { 'Content-Type': 'text/html' } }) })
  assert.equal(response.status, 404)
  assert.equal(await response.text(), 'fr 404 page')
})

test('a path that looks like another host stays on this one', async () => {
  const { asked } = await ask('/a/g//elsewhere.example/x')
  assert.equal(new URL(asked[0].url).origin, ORIGIN)
})

test('the walk\'s page gets the one script first in its head; no other page is touched', async () => {
  await withRewriter(async (seen) => {
    const { response, asked } = await ask('/a/o/w/vinci?film=job&lang=de')
    assert.equal(new URL(asked[0].url).pathname, '/w/vinci')
    assert.equal(new URL(asked[0].url).search, '?film=job&lang=de')
    assert.deepEqual(seen, [{ selector: 'head', content: `<script src="${PLACED_SCRIPT}"></script>`, options: { html: true } }])
    assert.equal(response.headers.get('ETag'), null, 'the rewritten page is no longer the entity its tag named')
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8')
    seen.length = 0
    for (const path of ['/a/g/', '/a/g/de/leonardo-da-vinci/', '/a/g/w/', '/a/g/w/vinci/x', '/a/g/de/w/vinci']) await ask(path)
    await ask('/a/g/w/vinci', { method: 'HEAD' })
    await ask('/a/g/w/vinci', { answer: () => new Response('gone', { status: 404, headers: { 'Content-Type': 'text/html' } }) })
    await ask('/a/g/w/vinci', { answer: () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }) })
    assert.deepEqual(seen, [])
  })
})

/** The walk's script in a page at `href`: the address it leaves, or null when it leaves it alone. */
function placedRun(href) {
  const url = new URL(href, ORIGIN)
  let wrote = null
  const window = {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: { state: { kept: 1 }, replaceState: (state, _, to) => { assert.deepEqual(state, { kept: 1 }); wrote = to } },
  }
  vm.runInNewContext(readFileSync(at('../_src/js/placed.js'), 'utf8'), { window })
  return wrote
}

test('the walk\'s script takes the prefix off, keeps the question and the stop, drops a via part', () => {
  for (const x of LETTERS) assert.equal(placedRun(`/a/${x}/w/vinci`), '/w/vinci')
  assert.equal(placedRun('/a/g/w/vinci?film=job&lang=de#s=7'), '/w/vinci?film=job&lang=de#s=7')
  assert.equal(placedRun('/a/p/w/vinci#s=7&via=forum'), '/w/vinci#s=7')
  assert.equal(placedRun('/a/f/w/vinci#via=search&s=3&t=12'), '/w/vinci#s=3&t=12')
  assert.equal(placedRun('/a/o/w/vinci/#via=forum'), '/w/vinci/')
  for (const href of ['/w/vinci#s=7', '/a/z/w/vinci', '/a/g/de/', '/a/g/w/vinci/x', '/de/a/g/w/vinci']) assert.equal(placedRun(href), null, href)
})

test('the walk\'s script, the function and the walk\'s count name the same letters', () => {
  const script = readFileSync(at('../_src/js/placed.js'), 'utf8')
  assert.deepEqual([.../\/\^\\\/a\\\/\[([a-z]+)\]/.exec(script)[1]].sort(), LETTERS)
  const walk = readFileSync(at('../../museum/src/core/museum-count.ts'), 'utf8')
  const prefixes = /const PREFIXES[^=]*= \{([^}]*)\}/.exec(walk)[1]
  assert.deepEqual([...prefixes.matchAll(/\b([a-z]): '/g)].map((m) => m[1]).sort(), LETTERS)
})
