// The museum's own count: which rows exist and what each may hold. Every row is a plain total with no key
// between two rows. A field of a step that is off its closed list, or missing where the step needs it, writes
// no row at all. Fields a step does not name are never read into its row.
//
// The dataset's row (blobs in order, the step as the index, no number of our own):
//   1 step      2 wing or page kind      3 stop number, kind of work or door's place, else ''
//   4 language  5 hold (walk rows), else ''  6 source word, else ''  7 'start' or 'inside' (page_arrival), else ''
//   8 device class  9 country (both '' on the answer's rows)  10 'probe' or ''

import { SOURCES } from './source.js'
import { LANGUAGES, PAGE_KINDS, WING_STOPS } from './lists.js'

export const HOLDS = Object.freeze(['upright', 'sideways', 'wide'])
export const LOOKS = Object.freeze(['painting', 'machine', 'sheet', 'book', 'film', 'place'])
export const DOORS = Object.freeze(['top', 'item', 'end'])
export const DEVICES = Object.freeze(['phone', 'tablet', 'desktop'])

// Each step's fields: the ones it needs, and the source word where it may carry one.
export const STEPS = Object.freeze({
  museum_arrival: { needs: ['wing', 'language', 'hold'], source: true },
  museum_stop: { needs: ['wing', 'stop', 'language', 'hold'] },
  museum_look: { needs: ['wing', 'look', 'language', 'hold'] },
  museum_use: { needs: ['wing', 'language', 'hold'], source: true },
  page_arrival: { needs: ['page', 'language'], start: true },
  page_read: { needs: ['page', 'language'] },
  door_press: { needs: ['page', 'door', 'language'] },
  // the answer to the question for visitors from our grant ads (site/_src/js/ask.js), once per landing: the page
  // and its language only, without the country and device class the other rows carry
  ask_yes: { needs: ['page', 'language'], bare: true },
  ask_no: { needs: ['page', 'language'], bare: true },
})

const has = (list, value) => typeof value === 'string' && list.includes(value)

// One check per field, by its closed list.
const FIELDS = {
  wing: (v) => typeof v === 'string' && Object.hasOwn(WING_STOPS, v),
  language: (v) => has(LANGUAGES, v),
  hold: (v) => has(HOLDS, v),
  look: (v) => has(LOOKS, v),
  page: (v) => has(PAGE_KINDS, v),
  door: (v) => has(DOORS, v),
}

/**
 * The row a beacon's payload makes, as the dataset's blobs, or null when it makes none. `edge` holds what the
 * server adds: the country and the device class, both already reduced to their lists.
 */
export function rowOf(payload, edge) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const step = payload.step
  if (typeof step !== 'string' || !Object.hasOwn(STEPS, step)) return null
  const spec = STEPS[step]
  for (const field of spec.needs) {
    if (field === 'stop') continue
    if (!FIELDS[field](payload[field])) return null
  }
  let label = ''
  if (step === 'museum_stop') {
    const stop = payload.stop
    if (!Number.isInteger(stop) || stop < 1 || stop > WING_STOPS[payload.wing]) return null
    label = String(stop)
  } else if (step === 'museum_look') label = payload.look
  else if (step === 'door_press') label = payload.door

  let source = ''
  let start = ''
  if (spec.source && payload.source !== undefined) {
    if (!has(SOURCES, payload.source)) return null
    source = payload.source
  }
  if (spec.start) {
    // whether the visit began on this page: 1 with its source word, 0 without one, or neither when unknown
    if (payload.start === 1) {
      if (!has(SOURCES, payload.source)) return null
      start = 'start'
      source = payload.source
    } else if (payload.start === 0 || payload.start === undefined) {
      if (payload.source !== undefined) return null
      start = payload.start === 0 ? 'inside' : ''
    } else return null
  }
  if (payload.probe !== undefined && payload.probe !== 1) return null
  if (!edge || !has(DEVICES, edge.device) || typeof edge.country !== 'string' || !/^[A-Z0-9]{2}$/.test(edge.country)) return null

  const walk = step.startsWith('museum_')
  const bare = spec.bare === true
  return [
    step,
    walk ? payload.wing : payload.page,
    label,
    payload.language,
    walk ? payload.hold : '',
    source,
    start,
    bare ? '' : edge.device,
    bare ? '' : edge.country,
    payload.probe === 1 ? 'probe' : '',
  ]
}

/**
 * The device class from the request's own headers: tablets first (an iPad, an explicit Tablet, Android without
 * Mobile), then phones (the low-entropy mobile hint or a phone's user agent), else desktop. '' without a user
 * agent, which writes no row. Only the class leaves this function, never the header's text.
 */
export function deviceOf(headers) {
  const ua = headers.get('User-Agent') || ''
  if (!ua) return ''
  if (/\biPad\b/i.test(ua) || /\bTablet\b/i.test(ua) || (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua))) return 'tablet'
  if (headers.get('Sec-CH-UA-Mobile') === '?1' || /Mobi|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'phone'
  return 'desktop'
}

/** The country as Cloudflare names it for the request, two letters, or XX when it names none. */
export function countryOf(request) {
  const named = request.cf?.country ?? request.headers.get('CF-IPCountry') ?? ''
  return typeof named === 'string' && /^[A-Z0-9]{2}$/.test(named) ? named : 'XX'
}
