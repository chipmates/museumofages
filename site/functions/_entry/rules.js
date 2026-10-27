import { ASKED_MAKING, UNASKED } from '../_count/lists.js'

// The shared rules of the question for visitors from our grant ads: who is asked, what a yes sends and leaves in the
// tab, and how long it holds. A yes is reported at once as a visit, and on a page from which a wing can be entered it
// also stays in the tab until a wing opens, which reports the entry. The edge (_middleware.js), the question's script
// (site/_src/js/ask.js), the walk's sender (museum/src/core/museum-entry.ts) and the function (v1/entry.js) each hold
// these values; site/tests/entry.test.mjs holds them equal.

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

/** The two conversions, each its own action in the ads account, its resource name in a setting of its own: the yes on
 *  any page that asks (sent at once by the page), and the entry into a wing after a yes (sent by the walk). Each
 *  counts once per click. */
export const VISIT_ACTION_NAME = 'Page read'
export const VISIT_ACTION_SETTING = 'MOA_VISIT_ACTION'
export const ENTRY_ACTION_NAME = 'Museum Entry'
export const ENTRY_ACTION_SETTING = 'MOA_ENTRY_ACTION'
/** What the page sends for the yes itself, in place of the walk's wing. */
export const VISIT_KIND = 'visit'

/** The path as the host could serve it: decoded, its repeated slashes as one, its letters in lower case. */
function served(path) {
  let rest = path
  try {
    rest = decodeURIComponent(rest)
  } catch {
    // a broken escape is read as written
  }
  return rest.replace(/\/{2,}/g, '/').toLowerCase()
}

const ASKED = Object.freeze(Object.values(ASKED_MAKING).flat())

/** Whether a path (without the grant's prefix) is a topic page of a wing in the making, which asks though its wing's
 *  own page does not, by any spelling of its address. */
export function askedMaking(path) {
  const rest = served(path)
  return ASKED.some((page) => rest === page || rest === page.slice(0, -1) || rest === `${page}index.html`)
}

/**
 * Whether an address under the grant's prefix shows a page of a wing in the making that is never asked: the count's
 * lists name those pages from the registry, and its topic pages are taken out of them. The path is read as the host
 * could serve it, so no spelling of the same page is asked.
 */
export function unasked(pathname) {
  const rest = served(pathname.slice(GRANT_PREFIX.length - 1))
  if (askedMaking(rest)) return false
  return UNASKED.some((page) => rest === page.slice(0, -1) || rest.startsWith(page))
}

/**
 * Whether a page gets the question's script: under the grant's prefix and not the walk nor a page of a wing in the
 * making, for a request without the Global Privacy Control header. The script itself tests the address for a click
 * id and the browser for Global Privacy Control once more, so no server code reads the query.
 */
export function asks(pathname, headers) {
  return pathname.startsWith(GRANT_PREFIX) && !pathname.startsWith(WALK_PREFIX) && !unasked(pathname) && headers.get('Sec-GPC') !== '1'
}
