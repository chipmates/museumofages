// WHAT LIGHTS THE WING BEYOND THE NODE WORLD, read off a tree's texts: the
// modules that capture the scene (a cube probe, a planar mirror) or make a
// light with a shadow, the rooms whose surfaces read them, and the key
// light's far cascade. The picture key's stand-in (`seen.mjs`) and the
// narrowed carry (`narrow.mjs`) both read it.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { APP_ROOT, WING_DIR, createLoader } from './load.mjs'
import { CELL_M, cellNumber } from './scene.mjs'

/** The wing's modules that capture the scene (a cube probe, a planar mirror, a render into a target), by path
    under the wing: the water's mirror is the stand-in's own part; the hall air's depth is drawn from the frame's
    own eye inside the hall; the bridge of poles' mirror lights only its own stream, and only the machine bench
    builds a showcase piece, never a frame (`narrow.test.mjs` refuses a tree where another module does); every
    other one lights a room inside `litRoomCells`. */
export const KNOWN_CAPTURES = ['collection/body-wall-cabinet.ts', 'collection/hall-air.ts', 'collection/hall-fabric.ts', 'collection/hall-light.ts',
  'collection/line-gallery.ts', 'collection/picture-room.ts', 'collection/reading-room.ts', 'collection/supper-room.ts', 'machines/bridge-of-poles.ts', 'water.ts']
/** The wing's modules that make a light with a shadow: the collection's rooms (inside `litRoomCells`); the
    house hall's sun (the key light's own direction); the grave diagram's light (its map holds the
    diagram's own building, its receiver the diagram's plate: both the grave's cells); the static cache's
    light (made only to borrow a method, never in the scene). */
export const KNOWN_SHADOW_LIGHTS = ['collection/body-wall-cabinet.ts', 'collection/hall-light.ts', 'collection/line-gallery.ts',
  'collection/picture-room.ts', 'collection/reading-room.ts', 'grave/diagram.ts', 'house-hall.ts', 'static-shadow-cache.ts']
/** Wing files whose lights light only the machine bench's own page (`src/bench`), never a frame of the
    film: the wing's modules reach none of them (`narrow.test.mjs` refuses a tree where one does). */
export const BENCH_ONLY = ['machines/bench/index.ts']
const CAPTURE = /\bCubeCamera\s*\(|\.fromScene\s*\(|\.reflector\s*\(|createReflector\s*\(|\.setRenderTarget\s*\(/
// a light made under a namespace or a class of its own is one too
const LIGHT = /new\s+(?:[\w$]+\.)*(?:Directional|Spot|Point|RectArea)Light\s*\(|extends\s+(?:[\w$]+\.)*(?:Directional|Spot|Point|RectArea)Light\b/
const SHADOW = /\.shadow\.|castShadow\s*=\s*true/

/** The wing's TypeScript files at a tree, by path under the wing; an overlay's files under the wing join them. */
export function wingFiles(rev, overlay = {}) {
  const planted = Object.keys(overlay).filter((f) => f.startsWith(`${WING_DIR}/`) && f.endsWith('.ts')).map((f) => f.slice(WING_DIR.length + 1))
  if (!rev) {
    const root = join(APP_ROOT, WING_DIR)
    return [...new Set([...readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.ts')).map((f) => relative(root, join(root, f)).split('\\').join('/')), ...planted])]
  }
  const top = execFileSync('git', ['-C', APP_ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  for (const prefix of [relative(top, APP_ROOT).split('\\').join('/'), 'nightagora']) {
    const listed = execFileSync('git', ['-C', top, 'ls-tree', '-r', '--name-only', rev, '--', `${prefix}/${WING_DIR}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
      .split('\n').filter((f) => f.endsWith('.ts')).map((f) => f.slice(prefix.length + WING_DIR.length + 2))
    if (listed.length) return [...new Set([...listed, ...planted])]
  }
  return planted
}

/** The modules of a tree that capture the scene or make a shadowing light, and those of them the pin does not know. */
export function lightingOf(texts) {
  const captures = [], lights = []
  for (const [file, text] of texts) {
    if (CAPTURE.test(text)) captures.push(file)
    if (LIGHT.test(text) && SHADOW.test(text)) lights.push(file)
  }
  const unknown = [...captures.filter((f) => !KNOWN_CAPTURES.includes(f)), ...lights.filter((f) => !KNOWN_SHADOW_LIGHTS.includes(f))]
  return { captures: captures.sort(), lights: lights.sort(), unknown: [...new Set(unknown)].sort() }
}

/** The court's machines the hall's rig lights: `collection/exhibits.ts` hands every machine but the parachute
    to the hall's rig wherever it stands, so their surfaces read the hall's probe out on the court. A court
    machine named in neither list is outside the pin. */
export const HALL_LIT_COURT = ['anemometer', 'revolving-crane']
const COURT_APART = ['parachute']

/** Each pinned court machine's box: its dossier's declared swept bound (both stand centred on their origin,
    `stands.ts`), turned by its stand's bearing, on its plinth; or why the tree's stands cannot be read. */
export function courtBoxes(load) {
  let STANDS, standLevel, dossiers
  try {
    ({ STANDS, standLevel } = load(`${WING_DIR}/collection/stands.ts`))
    ;({ dossiers } = load(`${WING_DIR}/machines/catalog.ts`))
  } catch { return { boxes: [], unknown: ['the court\'s machines (collection/stands.ts, machines/catalog.ts)'] } }
  const boxes = [], unknown = []
  for (const [slug, s] of Object.entries(STANDS ?? {})) {
    if (s.ground === 'court' && !HALL_LIT_COURT.includes(slug) && !COURT_APART.includes(slug)) unknown.push(`a court machine the pin does not know: ${slug}`)
  }
  for (const slug of HALL_LIT_COURT) {
    const s = STANDS?.[slug], d = dossiers?.[slug]
    if (!s || !d?.scale_m) { unknown.push(`the stand or dossier of ${slug}`); continue }
    const { x, y, z } = d.scale_m
    const a = s.bearing * Math.PI / 180, c = Math.abs(Math.cos(a)), n = Math.abs(Math.sin(a))
    const half = [(x * c + z * n) / 2, (x * n + z * c) / 2]
    const base = standLevel(s.ground) + s.plinth + (d.frame?.ground_y_m ?? 0)
    boxes.push({ east: [s.east - half[0], s.east + half[0]], north: [s.north - half[1], s.north + half[1]], up: [base, base + y] })
  }
  return { boxes, unknown }
}

/** The cells of the rooms the pinned modules light: the collection's envelope, floor to the hall's roof, the
    supper room, floor to its bay's top, and the court's machines the hall's rig lights, each by every cell its
    box meets. */
export function litRoomCells(load, cell = CELL_M) {
  const { FACE, FLOOR, HALL_CEILING_NORTH } = load(`${WING_DIR}/collection/layout.ts`)
  const { ROOM } = load(`${WING_DIR}/collection/supper-room-plan.ts`)
  const boxes = [
    { east: [FACE.wallWest, FACE.glazingEast], north: [FACE.wallSouth, FACE.glazingNorth], up: [FLOOR, HALL_CEILING_NORTH] },
    { east: [ROOM.west, ROOM.east], north: [ROOM.south, ROOM.north], up: [ROOM.floor, ROOM.bayTop] },
    ...courtBoxes(load).boxes,
  ]
  const out = new Set()
  const span = ([a, b]) => { const lo = Math.floor(Math.min(a, b) / cell), hi = Math.floor(Math.max(a, b) / cell); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) }
  for (const b of boxes) for (const x of span(b.east)) for (const y of span(b.up)) for (const z of span(b.north.map((n) => -n))) out.add(cellNumber(x, y, z))
  return out
}

/** THE KEY LIGHT'S FAR CASCADE as the wing stands it (`index.ts`: the key's reach and cascades, the far one aimed
    at the origin from along the sun; `stack/light.ts`: its depth), read off the texts, or null where they say
    otherwise than these forms. */
export function farCascadeOf(wingIndex, stackLight) {
  const key = /stack\.light\(\{[^}]*?reach:(\d+(?:\.\d+)?),cascades:\[[^,\]]+,(\d+(?:\.\d+)?)\]/.exec(wingIndex)
  const aim = /function aimFarCascade[\s\S]*?multiplyScalar\((\d+(?:\.\d+)?)\)/.exec(wingIndex)
  const depth = /shadow\.camera\.near = (\d+(?:\.\d+)?)\s*\n\s*l\.shadow\.camera\.far = Math\.max\((\d+(?:\.\d+)?), reach \* (\d+(?:\.\d+)?)\)/.exec(stackLight)
  if (!key || !aim || !depth) return null
  const reach = Number(key[1])
  return { half: Number(key[2]), light: Number(aim[1]), near: Number(depth[1]), far: Math.max(Number(depth[2]), reach * Number(depth[3])) }
}
/** The world box that holds the far cascade's: its eight corners, from the light along the sun's way. */
export function farBoxOf(far, sun) {
  const z = sun, up = [0, 1, 0]
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
  const x = norm(cross(up, z)), y = cross(z, x)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const a of [-far.half, far.half]) for (const b of [-far.half, far.half]) for (const d of [far.near, far.far]) {
    for (let k = 0; k < 3; k++) {
      const v = z[k] * (far.light - d) + x[k] * a + y[k] * b
      lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v)
    }
  }
  return [lo, hi]
}

/** What a tree's lighting is beyond its cells: its lit room cells, its pinned modules and its far cascade;
    `unknown` every module or cascade outside the pin, `unpinned` the modules alone. */
export async function lightingAt(rev = '', overlay = {}) {
  const loader = await createLoader({ rev, overlay })
  const files = wingFiles(rev, overlay).filter((f) => !BENCH_ONLY.includes(f))
  const texts = files.map((f) => [f, loader.text(`${WING_DIR}/${f}`)])
  const lighting = { lit: litRoomCells(loader.load), ...lightingOf(texts) }
  lighting.unknown.push(...courtBoxes(loader.load).unknown)
  // the modules alone: the stand-in sends its sun's lines down to the ground whatever the cascades
  lighting.unpinned = [...lighting.unknown]
  lighting.far = farCascadeOf(loader.text(`${WING_DIR}/index.ts`), loader.text('src/stack/light.ts'))
  if (!lighting.far) lighting.unknown.push('the far cascade (index.ts, stack/light.ts)')
  return lighting
}
