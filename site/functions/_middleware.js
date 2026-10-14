// Every page request: the visit's source word is set on the page's root element as data-source, worked out
// here from the request's own path and Referer header (_count/source.js). An empty value says the visit came
// from this site itself. The page's scripts read only that one word, never the referrer.
// A page under the grant's prefix (the walk excepted), asked for without the Global Privacy Control header, also
// gets the question's script (_entry/rules.js). The script tests the address for a click id itself: the part of an
// address after the question mark is never read here.
// A wing's own address also gets WING_STYLE in its head (wingPage below).
// Everything that is not a page (pictures, scripts, the film, the count's own route) passes untouched.

import { sourceWord } from './_count/source.js'
import { ASK_SCRIPT, asks } from './_entry/rules.js'

// A wing's address, also under a placed link's prefix. The path alone, never what follows the question mark.
const WING_PAGE = /^(?:\/a\/[gpfo])?\/w\/[a-z0-9-]{1,64}\/?$/
export const wingPage = (path) => WING_PAGE.test(path)

// Kept out of the wing's bundle, whose files are part of the film's key. The shell's first frame (the lobby's
// opening screen) stays dark until the wing takes over, and on the desktop the welcome card lets the museum show
// through behind it. The upright glass and the sideways form keep the card as it was. Held upright, the line
// under the welcome's button that suggests turning the phone reads brighter, with a turning sign before it.
export const WING_STYLE = '<style>' +
  "body[data-phase='transit'] #veil{visibility:hidden}" +
  '@media not all and (max-aspect-ratio:9/10){' +
  ".arno-card:not([data-form='cinema']){background:radial-gradient(120% 85% at 50% 38%," +
  'color-mix(in srgb,var(--na-lapis) 55%,transparent) 0%,color-mix(in srgb,var(--na-abyss) 62%,transparent) 100%)!important}' +
  ".arno-card:not([data-form='cinema'])::backdrop{background:transparent!important}}" +
  '@media (max-aspect-ratio:9/10){.turn-line{color:var(--na-starlight)!important}' +
  ".turn-line::before{content:'\\21BB';color:var(--na-gold);margin-right:.35em;font-size:1.1em;line-height:0}}" +
  '</style>'

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
  if (asks(url.pathname, request.headers)) {
    rewriter = rewriter.on('body', { element: (el) => el.append(`<script src="${ASK_SCRIPT}" defer></script>`, { html: true }) })
  }
  if (wingPage(url.pathname)) rewriter = rewriter.on('head', { element: (el) => el.append(WING_STYLE, { html: true }) })
  const page = rewriter.transform(response)
  const out = new Response(page.body, page)
  out.headers.delete('ETag')
  out.headers.delete('Last-Modified')
  out.headers.set('Cache-Control', 'no-cache')
  return out
}
