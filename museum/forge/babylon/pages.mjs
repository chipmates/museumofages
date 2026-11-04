// BABYLON'S PAGES AND STOPS: which dev page owns which stop of the walk, and how each page's rig takes a still.
// A new stop module adds one line to STOPS and, if it is a new page, one entry to PAGES; every kit tool reads both.
//
//   import { PAGES, STOPS, resolveStop } from './pages.mjs'
//   resolveStop('3')        -> { stop: '3', id: 'forecourt', page: 'gate' }
//   resolveStop('map:3')    -> the same stop on the map page (the grey blocks)
//   resolveStop('open')     -> the opening's first frame
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
/** the kit's ports; 5199 (the sweep) and 5400 (the walk server) are never a kit tool's */
export const PORTS = [5210, 5219]
export function checkPort(p) {
  if (!Number.isInteger(p) || p < PORTS[0] || p > PORTS[1]) throw new Error(`port ${p}: the Babylon kit owns ${PORTS[0]} to ${PORTS[1]} only`)
  return p
}

/** each page: its document, its rig's global, how long its build may take, and its still call */
export const PAGES = {
  map: {
    html: 'src/wings/babylon/map/map.html',
    rig: '__map',
    readyMs: 600000,
    // the map's own still: the film frame at the stop's still second
    still: (r) => ({ fn: 'shoot', arg: { stop: Number(r.stop), framing: r.framing, view: r.view ?? 'grey', w: r.w, h: r.h, css: r.css, samples: r.samples, out: r.out, name: r.name, t: r.t } }),
  },
  gate: {
    html: 'src/wings/babylon/gate/gate.html',
    rig: '__gate',
    readyMs: 900000,
    // the gate's hero still per framing (desktop: stop 2's last frame, phone: stop 3's); the class view is its switch
    still: (r) => ({ fn: 'shoot', arg: { framing: r.framing, state: r.state ?? 'full', switch: r.view === 'classes', w: r.w, h: r.h, css: r.css, samples: r.samples, out: r.out, name: r.name, hour: r.hour, stops: r.stops, look: r.look } }),
  },
  open: {
    html: 'src/wings/babylon/open/open.html',
    rig: '__open',
    readyMs: 240000,
    // the flight's frame at a second, 0 being the first frame
    still: (r) => ({ fn: 'still', arg: { framing: r.framing, view: r.view ?? 'grey', w: r.w, h: r.h, css: r.css, samples: r.samples, out: r.out, name: r.name, t: r.t ?? 0 } }),
  },
}

/** the walk's fourteen stops (map-cams.json) and the page that shows each today; stop 1 folds into the opening flight */
export const STOPS = [
  { stop: '1', id: 'moat', page: 'open' },
  { stop: '2', id: 'lion-street', page: 'gate' },
  { stop: '3', id: 'forecourt', page: 'gate' },
  { stop: '4', id: 'through-the-gate', page: 'gate' },
  { stop: '5', id: 'gardens', page: 'map' },
  { stop: '6', id: 'throne-court', page: 'map' },
  { stop: '7', id: 'canal-city', page: 'map' },
  { stop: '8', id: 'nabu', page: 'map' },
  { stop: '9', id: 'etemenanki', page: 'map' },
  { stop: '10', id: 'turn', page: 'map' },
  { stop: '11', id: 'esagila', page: 'map' },
  { stop: '12', id: 'great-stair', page: 'map' },
  { stop: '13', id: 'bridge', page: 'map' },
  { stop: '14', id: 'city-and-sky', page: 'map' },
]

/** a stop by number or id, `<page>:<stop>` to take it from another page, or a page name for its own first view */
export function resolveStop(text) {
  const s = String(text).trim()
  if (PAGES[s]) return { stop: s === 'open' ? '1' : s === 'gate' ? '2' : '1', id: s, page: s, own: true }
  const m = /^([a-z]+):(.+)$/.exec(s)
  const [page, key] = m ? [m[1], m[2]] : [null, s]
  if (page && !PAGES[page]) throw new Error(`no Babylon page "${page}" (pages: ${Object.keys(PAGES).join(', ')})`)
  const hit = STOPS.find((x) => x.stop === key || x.id === key)
  if (!hit) throw new Error(`no stop "${key}" (stops 1 to 14 by number or id)`)
  if (page === 'map') return { ...hit, page: 'map' }
  if (page && page !== hit.page) throw new Error(`stop ${hit.stop} is not on the ${page} page (it is on ${hit.page}, and every stop is on map)`)
  return { ...hit }
}

/** the build a still came from: the worktree's head and whether Babylon's files differ from it */
export function buildId() {
  const run = (c) => { try { return execSync(c, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
  const head = run('git rev-parse HEAD') || 'unknown'
  const dirty = run('git status --porcelain -- src/wings/babylon forge/babylon').split('\n').filter(Boolean).length
  return { head, short: head.slice(0, 8), dirty: dirty > 0, dirtyFiles: dirty, branch: run('git rev-parse --abbrev-ref HEAD') }
}

/** "1600x900@2" -> { css: [1600, 900], ratio: 2 } */
export function parseSize(text) {
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(String(text))
  if (!m) throw new Error(`size "${text}": write <css width>x<css height>@<device ratio>`)
  return { css: [Number(m[1]), Number(m[2])], ratio: m[3] ? Number(m[3]) : 1 }
}

/** CSS size times the device ratio, rounded per axis */
export function devicePixels({ css, ratio }) {
  return [Math.round(css[0] * ratio), Math.round(css[1] * ratio)]
}

export const DEFAULT_SIZES = { desktop: '1600x900@2', phone: '390x844@3' }
