/* THE MUSEUM'S OWN COUNTS: keyless totals sent to the site's own function
   (site/functions/v1/funnel.js), which checks every field against a closed
   list. Six steps, each a plain total with no key between them:
     museum_arrival  a wing opened, once per wing per page load (reach)
     museum_welcome  the welcome passed: its door closed and the walk began,
                     once per wing per page load
     museum_stop     a stop of its walk reached, by its number, once per stop
     museum_skip     a walk skipped, by its number (walk 0 is the walk-in, walk
                     n leads to stop n + 1), once per walk
     museum_look     a close look opened, by the kind of work, once per work
     museum_use      the visit did more than arrive: a second stop reached or
                     a look opened, whichever comes first, once per wing
   Every row says how the screen stood at that moment (upright, sideways,
   wide), read from the wing's own form test, and nothing else about it.
   Arrival, use and the third stop say where the visit came from, as one word
   worked out once (sourceWord). Sent from the museum's own hosts only. For
   the count nothing is stored, the dedup lives in this module's memory, and
   the one thing read from storage is the probe flag our own test browsers
   carry. The arrival also hands the wing to museum-entry.ts, which reports
   the entry only for a tab that holds a yes to the question for visitors from
   our grant ads; the count itself never reads that entry. */

import { pageLang } from '../wings/content'
import { filmForm } from '../wings/vinci/film-cinema'
import { sendEntry } from './museum-entry'

type MuseumStep = 'museum_arrival' | 'museum_welcome' | 'museum_stop' | 'museum_skip' | 'museum_look' | 'museum_use'
export type MuseumHold = 'upright' | 'sideways' | 'wide'
export type MuseumLook = 'painting' | 'machine' | 'sheet' | 'book' | 'film' | 'place'

const PRODUCTION_HOSTS: ReadonlySet<string> = new Set(['museumofages.org', 'www.museumofages.org'])
/** the function of the page's own origin */
const ENDPOINT = '/v1/funnel'
/** the dev flag: `?na-count=http://localhost:8789` sends to a server on this
    machine, from any host but the production ones, and nowhere else */
const DEV_FLAG = 'na-count'
const PROBE_KEY = 'moa_probe'
/** the closed list of source words the function takes (site/functions/_count/source.js) */
const SOURCES: ReadonlySet<string> = new Set([
  'direct', 'search', 'ad_grant', 'ad_paid', 'ad_forum', 'forum', 'code', 'edu', 'wiki', 'news', 'mail', 'award',
  'assistant', 'social', 'referral',
])
/** the addresses of links the museum places itself: a prefix in front of the real path */
const PREFIXES: Readonly<Record<string, string>> = { g: 'ad_grant', p: 'ad_paid', f: 'ad_forum', o: 'forum' }

/** the wing's form test, named as the server's list names it */
const HOLD: Readonly<Record<ReturnType<typeof filmForm>, MuseumHold>> = { upright: 'upright', cinema: 'sideways', desk: 'wide' }
/** the film look's own kinds, by the kind of work; the life's floor opens no look */
const LOOK: ReadonlyMap<string, MuseumLook> = new Map([
  ['picture', 'painting'], ['machine', 'machine'], ['sheet', 'sheet'], ['study-leaf', 'sheet'], ['film', 'film'],
  ['edition', 'book'], ['whole-edition', 'book'], ['topic', 'book'], ['book', 'book'], ['place', 'place'],
])

// A browser marks itself as one of our own test browsers by opening any
// address with ?probe=1, exactly as the app's beacons do.
try {
  if (new URLSearchParams(location.search).get('probe') === '1') localStorage.setItem(PROBE_KEY, '1')
} catch { /* storage or address unavailable: the browser stays unmarked */ }

/** Where the visit came from, worked out once from the address's path, then
    the door's word in the fragment (`#s=7&via=search`), then the word the edge
    set on the page: '' when none says (the walk opened from the site itself). */
export function sourceWord(path: string, hash: string, edge: string | null): string {
  const prefix = /^\/a\/([a-z])\//.exec(path)?.[1]
  const placed = prefix && Object.hasOwn(PREFIXES, prefix) ? PREFIXES[prefix] : undefined
  if (placed) return placed
  const via = /(?:^|[#&])via=([a-z_]+)(?:&|$)/.exec(hash)?.[1]
  if (via && SOURCES.has(via)) return via
  return edge && SOURCES.has(edge) ? edge : ''
}

let source: string | null = null
function sourceField(): string | undefined {
  if (source === null) {
    try { source = sourceWord(location.pathname, location.hash, document.documentElement.getAttribute('data-source')) } catch { source = '' }
  }
  return source || undefined
}
// read before the walk writes its own fragment
sourceField()

let probe: 1 | undefined | null = null
function probeField(): 1 | undefined {
  if (probe !== null) return probe
  try { probe = localStorage.getItem(PROBE_KEY) === '1' ? 1 : undefined } catch { probe = undefined }
  return probe
}

let target: string | null | undefined
function endpoint(): string | null {
  if (target !== undefined) return target
  target = null
  try {
    if (PRODUCTION_HOSTS.has(location.hostname)) target = ENDPOINT
    else {
      const asked = new URLSearchParams(location.search).get(DEV_FLAG)
      const url = asked ? new URL('/v1/funnel', asked) : null
      if (url && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:')) target = url.href
    }
  } catch { target = null }
  return target
}

function send(step: MuseumStep, fields: { stop?: number; walk?: number; look?: MuseumLook }): void {
  try {
    const url = endpoint()
    if (!url) return
    const from = step === 'museum_arrival' || step === 'museum_use' || (step === 'museum_stop' && fields.stop === 3) ? sourceField() : undefined
    const body = JSON.stringify({ step, wing, stop: fields.stop, walk: fields.walk, look: fields.look, hold: HOLD[filmForm()], language: pageLang(), source: from, probe: probeField() })
    // text/plain keeps both transports a simple request: no preflight, no answer read
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return
    void fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined)
  } catch { /* a count never stands in the museum's way */ }
}

/** the wing standing now, whose rows the next steps are */
let wing = ''
const arrived = new Set<string>()
const welcomed = new Set<string>()
const stood = new Set<string>()
const skipped = new Set<string>()
const looked = new Set<string>()
const used = new Set<string>()
const stopsIn = new Map<string, number>()

function use(): void {
  if (used.has(wing)) return
  used.add(wing)
  send('museum_use', {})
}

/** A wing opened. */
export function countArrival(slug: string): void {
  try {
    wing = slug
    if (arrived.has(slug)) return
    arrived.add(slug)
    send('museum_arrival', {})
    sendEntry(slug)
  } catch { /* a count never stands in the museum's way */ }
}

/** The welcome passed: its door closed and the walk began. */
export function countWelcome(): void {
  try {
    if (!wing || welcomed.has(wing)) return
    welcomed.add(wing)
    send('museum_welcome', {})
  } catch { /* a count never stands in the museum's way */ }
}

/** A walk skipped, by its number: the stop it was walking to less one, so the walk-in is 0. */
export function countSkip(walk: number): void {
  try {
    const key = `${wing}|${walk}`
    if (!wing || !Number.isInteger(walk) || walk < 0 || skipped.has(key)) return
    skipped.add(key)
    send('museum_skip', { walk })
  } catch { /* a count never stands in the museum's way */ }
}

/** A stop reached, by its number in the wing's walk (1 is the first). */
export function countStop(stop: number): void {
  try {
    const key = `${wing}|${stop}`
    if (!wing || stood.has(key)) return
    stood.add(key)
    send('museum_stop', { stop })
    const reached = (stopsIn.get(wing) ?? 0) + 1
    stopsIn.set(wing, reached)
    if (reached >= 2) use()
  } catch { /* a count never stands in the museum's way */ }
}

/** A close look opened at a work, by the film look's own kind of it. The work
    is the dedup's key in this module's memory and never leaves it. */
export function countLook(work: string, kind: string | null): void {
  try {
    // the painting at the grave stands under a place's card and is still a painting
    const look = work.startsWith('picture/') ? 'painting' : kind ? LOOK.get(kind) : undefined
    const key = `${wing}|${work}`
    if (!wing || !look || looked.has(key)) return
    looked.add(key)
    send('museum_look', { look })
    use()
  } catch { /* a count never stands in the museum's way */ }
}
