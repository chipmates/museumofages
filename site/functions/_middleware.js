// Every page request: the visit's source word is set on the page's root element as data-source, worked out
// here from the request's own path and Referer header (_count/source.js). An empty value says the visit came
// from this site itself. The page's scripts read only that one word, never the referrer.
// Everything that is not a page (pictures, scripts, the film, the count's own route) passes untouched.

import { sourceWord } from './_count/source.js'

export async function onRequest(context) {
  const { request } = context
  if (request.method !== 'GET' || !(request.headers.get('Accept') || '').includes('text/html')) return context.next()
  // a page's word belongs to this request alone: the browser may not answer it from a copy made for another
  const headers = new Headers(request.headers)
  headers.delete('If-None-Match')
  headers.delete('If-Modified-Since')
  const response = await context.next(new Request(request, { headers }))
  if (response.status !== 200 || !(response.headers.get('Content-Type') || '').startsWith('text/html')) return response
  const word = sourceWord(new URL(request.url), request.headers.get('Referer'))
  const page = new HTMLRewriter()
    .on('html', { element: (el) => el.setAttribute('data-source', word) })
    .transform(response)
  const out = new Response(page.body, page)
  out.headers.delete('ETag')
  out.headers.delete('Last-Modified')
  out.headers.set('Cache-Control', 'no-cache')
  return out
}
