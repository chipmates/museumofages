// Every page request: the visit's source word is set on the page's root element as data-source, worked out
// here from the request's own path and Referer header (_count/source.js). An empty value says the visit came
// from this site itself. The page's scripts read only that one word, never the referrer.
// A page under the grant's prefix whose address carries an ad's click id, asked for without Global Privacy
// Control, also gets the question's script (_entry/rules.js names the rule). For every other request the part
// of the address after the question mark is never read here.
// Everything that is not a page (pictures, scripts, the film, the count's own route) passes untouched.

import { sourceWord } from './_count/source.js'
import { ASK_SCRIPT, asks } from './_entry/rules.js'

export async function onRequest(context) {
  const { request } = context
  if (request.method !== 'GET' || !(request.headers.get('Accept') || '').includes('text/html')) return context.next()
  // a page's word belongs to this request alone: the browser may not answer it from a copy made for another
  const headers = new Headers(request.headers)
  headers.delete('If-None-Match')
  headers.delete('If-Modified-Since')
  const response = await context.next(new Request(request, { headers }))
  if (response.status !== 200 || !(response.headers.get('Content-Type') || '').startsWith('text/html')) return response
  const url = new URL(request.url)
  const word = sourceWord(url, request.headers.get('Referer'))
  let rewriter = new HTMLRewriter().on('html', { element: (el) => el.setAttribute('data-source', word) })
  if (asks(url, request.headers)) {
    rewriter = rewriter.on('body', { element: (el) => el.append(`<script src="${ASK_SCRIPT}" defer></script>`, { html: true }) })
  }
  const page = rewriter.transform(response)
  const out = new Response(page.body, page)
  out.headers.delete('ETag')
  out.headers.delete('Last-Modified')
  out.headers.set('Cache-Control', 'no-cache')
  return out
}
