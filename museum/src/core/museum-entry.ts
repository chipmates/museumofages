/* THE MUSEUM ENTRY, for a visitor who came from one of our Google Ad Grants
   ads and said yes to the landing page's question (site/_src/js/ask.js). The
   yes left one entry in this tab's sessionStorage: the ad's click id and the
   time of the yes. When a wing opens (museum-count.ts, with museum_arrival),
   the entry is taken out of the tab first and then sent once, with the wing,
   to the site's own function (site/functions/v1/entry.js), which reports it to
   Google. So one ad click counts once. A tab without the entry sends nothing.
   A browser that sends Global Privacy Control sends nothing and its entry is
   dropped. The rules match site/functions/_entry/rules.js. */

const ENTRY_KEY = 'moa_entry'
const ENDPOINT = '/v1/entry'
const CLICK = /^[A-Za-z0-9_-]{20,200}$/
const YES_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** the museum's own hosts and a server on this machine: the site's function answers on the same origin */
const HOSTS: ReadonlySet<string> = new Set(['museumofages.org', 'www.museumofages.org', 'localhost', '127.0.0.1'])

export interface MuseumEntry { gclid: string; yes: number }

/** The tab's entry, taken out of the store: removed whatever it holds, and
    returned only when it is whole and its yes is younger than six hours. */
export function takeEntry(store: Pick<Storage, 'getItem' | 'removeItem'>, now: number): MuseumEntry | null {
  const raw = store.getItem(ENTRY_KEY)
  if (raw === null) return null
  store.removeItem(ENTRY_KEY)
  try {
    const held = JSON.parse(raw) as { gclid?: unknown; yes?: unknown }
    const { gclid, yes } = held ?? {}
    if (typeof gclid !== 'string' || !CLICK.test(gclid)) return null
    if (typeof yes !== 'number' || !Number.isFinite(yes) || yes < now - YES_MAX_AGE_MS || yes > now) return null
    return { gclid, yes }
  } catch {
    return null
  }
}

/** A wing opened: the tab's entry, if it holds one, goes out once. */
export function sendEntry(wing: string): void {
  try {
    if (!HOSTS.has(location.hostname)) return
    const store = window.sessionStorage
    if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) {
      store.removeItem(ENTRY_KEY)
      return
    }
    const entry = takeEntry(store, Date.now())
    if (!entry) return
    const body = JSON.stringify({ gclid: entry.gclid, yes: entry.yes, wing })
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'same-origin', credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined)
  } catch { /* an entry never stands in the museum's way */ }
}
