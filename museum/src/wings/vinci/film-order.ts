/* THE LIFE'S ORDER IN THE FILM. The stops come from the story and the
   stations the wing builds; a release that carries its own story list orders
   them as its legs were rendered, so the walk asks only for legs it filmed.
   No DOM: forge/film-order.test.mjs loads this file in node. */

import { vinciContent, type VinciText } from './content'
import { vinciStory } from './story'
import { VINCI_LISA_STOP, VINCI_OFF_THE_WALK, VINCI_VALVE } from './walk-places'

export interface LifeStop { id: string; station: string; name: VinciText }

/** The life's own order, from the story and the stations the wing builds. */
export function lifeStops(): LifeStop[] {
  const built = new Set(vinciContent.map(s => s.id as string))
  const out: LifeStop[] = []
  for (const stop of [...vinciStory].sort((a, b) => a.order - b.order)) {
    if (stop.kind === 'cut') continue
    // the wall stop is named by its own chapter: the rail that carries these names stands down in the film
    if (stop.id === VINCI_LISA_STOP) out.push({ id: stop.id, station: 'picture-room', name: stop.chapter })
    else if (built.has(stop.id) && !VINCI_OFF_THE_WALK.has(stop.id)) out.push({ id: stop.id, station: stop.id, name: vinciContent.find(s => s.id === stop.id)!.name })
    // the heart valve's stop follows the body wall, as in the walk (walk.ts)
    if (stop.id === VINCI_VALVE.station) out.push({ id: VINCI_VALVE.place, station: VINCI_VALVE.station, name: VINCI_VALVE.name })
  }
  return out
}

/** THE ORDER THE RELEASE WAS RENDERED ALONG: the stops in the order their
    nodes (`stop:<id>`) stand in the release's `story`; a stop it does not
    name rides behind the stop before it in `stops`, one before every named
    stop stays first; without a story list `stops` keep their order. */
export function releaseOrder<S extends { id: string }>(stops: readonly S[], story: readonly string[] | null | undefined): S[] {
  const rank = new Map<string, number>()
  for (const [i, node] of (story ?? []).entries())
    if (typeof node === 'string' && node.startsWith('stop:') && !rank.has(node.slice(5))) rank.set(node.slice(5), i)
  if (!stops.some(s => rank.has(s.id))) return [...stops]
  const behind = new Map<string | null, S[]>()
  let lead: string | null = null
  for (const s of stops) {
    if (rank.has(s.id)) { lead = s.id; continue }
    behind.set(lead, [...(behind.get(lead) ?? []), s])
  }
  const out = [...(behind.get(null) ?? [])]
  const named = stops.filter(s => rank.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  for (const s of named) out.push(s, ...(behind.get(s.id) ?? []))
  return out
}
