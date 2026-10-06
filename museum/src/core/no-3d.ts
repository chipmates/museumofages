/* THE SCREEN FOR A BROWSER THAT CANNOT DRAW THE ROOMS. Every room is drawn
   with WebGPU, or with WebGL2 where there is no adapter. A browser with
   neither gets one plain screen in place of the app: the wing's first still
   where a release names one, what is missing and what helps, and the way to
   the wing's page on the site where the build names one. Nothing of the app
   starts behind it. */

import css from './no-3d.css?inline'
import { lang, type Bilingual } from '../wings/content'
import { FILM_RELEASE } from '../wings/film-release'
import { LOBBY_TEXT } from '../content/lobby'

const WORDS: Record<'line' | 'help', Bilingual> = {
  line: {
    en: 'This browser cannot draw the museum’s rooms: it has no 3D graphics, or they are switched off.',
    de: 'Dieser Browser kann die Räume des Museums nicht darstellen: Die 3D-Grafik fehlt oder ist ausgeschaltet.',
  },
  help: {
    en: 'Open this page in an up-to-date browser with hardware acceleration turned on, or on another device. The rooms need WebGL2 or WebGPU.',
    de: 'Öffne die Seite in einem aktuellen Browser mit eingeschalteter Hardwarebeschleunigung oder auf einem anderen Gerät. Die Räume brauchen WebGL2 oder WebGPU.',
  },
}

/** the way to a wing's own page, by the wing; a link that leads anywhere
    else carries the museum's name, so no label names a page it is not */
const WING_LINK: ReadonlyMap<string, Bilingual> = new Map([
  ['vinci', {
    en: 'Leonardo’s life in pictures and text',
    de: 'Leonardos Leben in Wort und Bild',
  }],
])

const ARROW = 'M3 8h10M9 4l4 4-4 4'

/** Where the screen leads: the wing the address names ('' for none) and the site's page, or null where the build names none. */
export interface ScreenWay {
  wing: string
  page: string | null
}

/** True where a renderer can be built. An offered WebGPU is asked for its
    adapter by the stack itself, and a refusal there ends in the stack's own
    throw, which `stackOrScreen` catches. */
export function canDraw(): boolean {
  if ((navigator as Navigator & { gpu?: unknown }).gpu) return true
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    // the probe's context is given back at once: browsers cap the live ones
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** The stack, or the screen. A stack that cannot start shows the screen and
    never resolves, so nothing that waits for it is ever built. */
export async function stackOrScreen<T>(start: () => Promise<T>, way: () => ScreenWay): Promise<T> {
  if (canDraw()) {
    try {
      return await start()
    } catch (err) {
      console.warn('[na] the renderer did not start:', err instanceof Error ? err.message : String(err))
    }
  } else {
    console.warn('[na] neither WebGPU nor WebGL2 is available')
  }
  showScreen(way())
  return new Promise<T>(() => {})
}

/** the words as text, with every hyphened compound kept on one line: a
    narrow glass otherwise breaks "3D-Grafik" after its hyphen */
function unbroken(words: string): (string | HTMLElement)[] {
  return words.split(/(\S+-\S+)/).filter(Boolean).map((part) => {
    if (!/\S-\S/.test(part)) return part
    const keep = document.createElement('span')
    keep.className = 'na-no3d-keep'
    keep.textContent = part
    return keep
  })
}

function showScreen(way: ScreenWay): void {
  const language = lang()
  const style = document.createElement('style')
  style.id = 'na-no3d-style'
  style.textContent = css
  document.head.append(style)
  document.documentElement.dataset['naNo3d'] = ''

  const screen = document.createElement('main')
  screen.className = 'na-no3d'
  screen.lang = language
  const picture = document.createElement('div')
  picture.className = 'na-no3d-picture'
  picture.setAttribute('aria-hidden', 'true')
  const plate = document.createElement('section')
  plate.className = 'na-no3d-plate'
  const line = document.createElement('h1')
  line.className = 'na-no3d-line'
  line.append(...unbroken(WORDS.line[language]))
  const help = document.createElement('p')
  help.className = 'na-no3d-help'
  help.append(...unbroken(WORDS.help[language]))
  plate.append(line, help)
  if (way.page) {
    const row = document.createElement('p')
    row.className = 'na-no3d-way'
    const link = document.createElement('a')
    link.className = 'na-no3d-link'
    link.href = way.page
    const label = document.createElement('span')
    label.textContent = (WING_LINK.get(way.wing) ?? LOBBY_TEXT.name)[language]
    const svgNs = 'http://www.w3.org/2000/svg'
    const icon = document.createElementNS(svgNs, 'svg')
    icon.setAttribute('viewBox', '0 0 16 16')
    icon.setAttribute('aria-hidden', 'true')
    icon.classList.add('na-no3d-arrow')
    const path = document.createElementNS(svgNs, 'path')
    path.setAttribute('d', ARROW)
    icon.append(path)
    link.append(label, icon)
    row.append(link)
    plate.append(row)
  }
  screen.append(picture, plate)
  /* a door's address has the page's own still placed or on its way
     (index.html); any other wing address reads its release here */
  const door = 'naDoor' in document.documentElement.dataset
  const release = way.wing && !door ? new URLSearchParams(location.search).get('film') || FILM_RELEASE : null
  // no picture will come: the plate stands in the middle of the dark ground
  if (!door && !release) screen.dataset['ground'] = ''
  // first in the reading order: the static mirror for readers stays behind it
  document.body.prepend(screen)
  if (release) void placeStill(picture, release)
}

/* THE PICTURE: the release's start still, picked the way the door's script
   in index.html picks it. A release that does not answer leaves the screen
   on the museum's dark ground. */
interface Release {
  start?: string
  story?: string[]
  nodes?: Record<string, { stills?: Record<string, Record<string, { file?: string }>> } | undefined>
  framings?: Record<string, { rungs?: [number, number][] } | undefined>
}

async function placeStill(host: HTMLElement, name: string): Promise<void> {
  const base = new URL(`/film/${encodeURIComponent(name)}/`, location.origin).href
  const release = await fetch(`${base}film.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Release>) : null))
    .catch(() => null)
  const file = release ? startStill(release) : null
  if (!file) return
  const img = new Image()
  img.className = 'na-no3d-still'
  img.alt = ''
  img.decoding = 'async'
  img.addEventListener('load', () => { host.dataset['shown'] = '' }, { once: true })
  img.addEventListener('error', () => img.remove(), { once: true })
  img.src = new URL(file, base).href
  host.append(img)
}

/** the still the player picks: the framing by the glass, the smallest rung
    that carries the box, the smallest on a lean line */
function startStill(release: Release): string | null {
  const nodes = release.nodes
  if (!nodes) return null
  const upright = innerWidth / innerHeight <= 0.9
  const framing = upright ? 'upright' : 'wide'
  const node = release.start && nodes[release.start] ? release.start : release.story?.[0]
  const stills = node ? nodes[node]?.stills?.[framing] : undefined
  if (!stills) return null
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  const lean = !!connection && (connection.saveData === true || /^(slow-2g|2g|3g)$/.test(connection.effectiveType ?? ''))
  const rungs = [...(release.framings?.[framing]?.rungs ?? [])].sort((a, b) => a[0] - b[0])
  const aspect = upright ? 390 / 844 : 1280 / 720
  const across = Math.max(innerWidth, innerHeight * aspect) * (devicePixelRatio || 1)
  const rung = lean ? rungs[0] : (rungs.find((r) => r[0] >= across * 0.9) ?? rungs[rungs.length - 1])
  const chosen = (rung ? stills[`${rung[0]}x${rung[1]}`] : undefined) ?? Object.values(stills)[0]
  return chosen?.file ?? null
}
