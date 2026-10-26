// The addresses of links we place ourselves: /a/<letter>/ in front of a real path (_count/source.js names the
// letters). Each answers with exactly what the host's own files answer for the real path, its headers included, so
// an ad's final address is the page itself and never a redirect. The page is not rewritten: its relative links stay
// inside the prefix and come through here too, and its canonical already names the real address; the answer
// names it once more in a Link header. A letter off the
// list goes on as any unknown address.

import { OWN_HOSTS, prefixWord } from '../../_count/source.js'

/** The walk's one script for these addresses (site/_src/js/placed.js, copied by the build). */
export const PLACED_SCRIPT = '/static/placed.js'
const WALK = /^\/w\/[a-z0-9-]{1,64}\/?$/

/** The real page's address, as every page's own canonical line names it (the placed address is the same page). */
export function canonicalOf(rest) {
  return `https://${OWN_HOSTS[0]}${rest}`
}

/** The prefix of a path we place ourselves ('/a/g'), or ''. */
export function placedPrefix(pathname) {
  const m = /^\/a\/([a-z])(?=\/|$)/.exec(pathname)
  return m && prefixWord(`/a/${m[1]}/`) ? m[0] : ''
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const prefix = placedPrefix(url.pathname)
  if (!prefix || (request.method !== 'GET' && request.method !== 'HEAD')) return context.next()
  const rest = url.pathname.slice(prefix.length)
  // as the host sends a folder's address without its slash to the folder
  if (!rest) return new Response(null, { status: 308, headers: { Location: `${prefix}/${url.search}` } })
  const real = new URL(url)
  real.pathname = rest
  const answer = await env.ASSETS.fetch(new Request(real, request))

  // the host's own forwards within the site keep the prefix; one to another site stays as it is
  const to = answer.headers.get('Location')
  if (answer.status >= 300 && answer.status < 400 && to) {
    const target = new URL(to, real)
    if (target.origin !== url.origin) return answer
    const headers = new Headers(answer.headers)
    headers.set('Location', prefix + target.pathname + target.search + target.hash)
    return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
  }

  const type = answer.headers.get('Content-Type') || ''
  if (answer.status !== 200 || !type.startsWith('text/html')) return answer
  // a page also names its real address in a header: search engines indexed placed addresses beside the page's line
  const canonical = `<${canonicalOf(rest)}>; rel="canonical"`

  // the walk finds its wing in its own path: its page takes the prefix off before the walk's code runs
  if (request.method === 'GET' && WALK.test(rest)) {
    const page = new HTMLRewriter()
      .on('head', { element: (el) => el.prepend(`<script src="${PLACED_SCRIPT}"></script>`, { html: true }) })
      .transform(answer)
    const out = new Response(page.body, page)
    out.headers.delete('ETag')
    out.headers.append('Link', canonical)
    return out
  }
  const headers = new Headers(answer.headers)
  headers.append('Link', canonical)
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}
