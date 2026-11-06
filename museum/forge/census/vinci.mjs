// The vinci wing in the census's wing-agnostic shape. Every text slot carries
// `at`: the file and key its words are read from.
import fs from 'node:fs'
import path from 'node:path'
import { createLoader, museumRoot } from './load.mjs'

const STORY = 'src/wings/vinci/story.ts'
const CONTENT = 'src/wings/vinci/content.ts'
const CLOSER = 'src/wings/vinci/closer.ts'
const DESK = 'src/wings/desk-story.ts'
const DATA = 'src/wings/vinci/data'

const pair = (v, at) => (v && typeof v.en === 'string' ? { en: v.en, de: typeof v.de === 'string' ? v.de : '', at } : null)

/** Every { en, de } leaf under a value, each with its path. */
export function pairsIn(value, at) {
  if (!value || typeof value !== 'object') return []
  const own = pair(value, at)
  if (own) return [own]
  const entries = Array.isArray(value) ? value.map((v, i) => [`[${i}]`, v]) : Object.entries(value).map(([k, v]) => [`.${k}`, v])
  return entries.flatMap(([k, v]) => pairsIn(v, `${at}${k}`))
}

const readJson = (root, rel) => {
  const file = path.join(root, rel)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

export function readVinci(root = museumRoot) {
  const load = createLoader(root)
  const story = load(STORY)
  const content = load(CONTENT)
  const closer = load(CLOSER)
  const desk = load(DESK)
  const stations = new Map(content.vinciContent.map((s) => [s.id, s]))
  // a story stop without its own station content belongs to the longest station id it extends
  const stationOf = (id) => stations.get(id)
    ?? [...stations.values()].filter((s) => id.startsWith(`${s.id}-`)).sort((a, b) => b.id.length - a.id.length)[0]
  const shown = new Map(desk.deskStory.map((s) => [s.id, s]))

  const stops = []
  const cuts = []
  for (const s of story.vinciStory) {
    const key = (field) => `${STORY} vinciStory[${s.id}].${field}`
    if (s.kind === 'cut') {
      cuts.push({ id: s.id, chapter: pair(s.chapter, key('chapter')), line: pair(s.line, key('line')) })
      continue
    }
    const d = shown.get(s.id) ?? s
    const station = stationOf(s.id)
    const look = closer.closerAtStop(s.id)
    stops.push({
      id: s.id,
      order: s.order,
      kind: s.kind,
      station: station?.id ?? null,
      quiet: Boolean(d.quiet),
      built: s.built !== false,
      shown: shown.has(s.id),
      certainty: d.certainty ?? null,
      chapter: pair(d.chapter, key('chapter')),
      clock: d.quiet ? null : pair(d.age, key('age')),
      line: pair(d.line, key('line')),
      drawer: pair(d.drawer, key('drawer')),
      record: station
        ? {
            text: pair(station.record, `${CONTENT} vinciContent[${station.id}].record`),
            rows: Array.isArray(station.labels) ? station.labels.length : 0,
            at: `${CONTENT} vinciContent[${station.id}].labels`,
          }
        : null,
      classes: null, // the vinci record has no evidence classes
      closer: look ? [{ id: look.id, working: Boolean(look.working), at: `${CLOSER} closerAtStop(${s.id})` }] : [],
    })
  }

  return {
    wing: 'vinci',
    root,
    stops,
    cuts,
    opening: [
      ...pairsIn(story.vinciStoryTitleWall, `${STORY} vinciStoryTitleWall`),
      ...pairsIn(content.vinciOpenings, `${CONTENT} vinciOpenings`),
      ...pairsIn(readJson(root, `${DATA}/opening.json`), `${DATA}/opening.json`),
    ],
    door: [
      ...pairsIn(content.vinciDoorAbout, `${CONTENT} vinciDoorAbout`),
      ...pairsIn(readJson(root, `${DATA}/doors.json`)?.door_contract, `${DATA}/doors.json door_contract`),
    ],
    ending: [
      ...pairsIn(story.vinciStoryExit, `${STORY} vinciStoryExit`),
      ...pairsIn(content.vinciFarewellDoor, `${CONTENT} vinciFarewellDoor`),
      ...pairsIn(readJson(root, `${DATA}/ending.json`), `${DATA}/ending.json`),
    ],
    // parts the pack contract names that the wing's data does not hold at all
    absent: [
      { part: 'ending', slot: 'now', says: 'no "now" sentence or picture in the wing\'s data', at: `${STORY} vinciStoryExit, ${DATA}/ending.json` },
    ],
    bridgeWords: null, // no bridge field in the story data: the kit part is not built
  }
}

export const adapters = { vinci: readVinci }
