// The museum entry's shared rules: who is asked, what a yes leaves in the tab, and how long it holds. The edge
// (_middleware.js), the question's script (site/_src/js/ask.js), the walk's sender (museum/src/core/museum-entry.ts)
// and the function (v1/entry.js) each hold these values; site/tests/entry.test.mjs holds them equal.

/** Only a page under the grant's own prefix (source.js names it ad_grant) is ever asked. */
export const GRANT_PREFIX = '/a/g/'
/** The walk is never asked: it opens a wing at once, before any answer could be given. */
export const WALK_PREFIX = '/a/g/w/'
/** A Google click id as the ad's address carries it. */
export const CLICK = /^[A-Za-z0-9_-]{20,200}$/
/** The tab's one entry after a yes: the click id and the time of the yes. */
export const ENTRY_KEY = 'moa_entry'
/** A yes older than this is never sent. */
export const YES_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** The question's script, which the edge puts on an asked page. */
export const ASK_SCRIPT = '/static/ask.js'

/**
 * Whether a page gets the question's script: under the grant's prefix and not the walk, for a request without
 * the Global Privacy Control header. The script itself tests the address for a click id and the browser for
 * Global Privacy Control once more, so no server code reads the query.
 */
export function asks(pathname, headers) {
  return pathname.startsWith(GRANT_PREFIX) && !pathname.startsWith(WALK_PREFIX) && headers.get('Sec-GPC') !== '1'
}
