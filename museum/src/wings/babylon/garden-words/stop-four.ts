/* STOP 4'S TWO PAPER FEATURES ON ONE BENCH: the door hook from the stop's plan, the two payloads, the photograph and
   today's coasts by address. Both bench pages call it, each opening its own feature first. A dev module. */
import { createPaperBench, type DoorHook } from '../paper/bench'
import { createOilPayload } from '../oil/oil'
import { OIL_WORDS } from '../oil/oil-words'
import type { Coasts } from '../oil/oil-data'
import { createGardenWordsPayload } from './garden-words'
import { GARDEN_WORDS } from './garden-words-words'

export async function stopFourBench(first: 'oil' | 'garden-words'): Promise<void> {
  const q = new URLSearchParams(location.search)
  const lang = q.get('lang') === 'de' ? 'de' : 'en'
  const plan = await fetch(new URL('../gardens/gardens-plan.json', import.meta.url)).then((r) => r.json()) as { door: DoorHook & { colour: { wide: [number, number]; upright: [number, number]; zoom?: { wide: number; upright: number } } } }
  const coastsAt = q.get('coasts')
  const coasts = coastsAt ? await fetch(coastsAt).then((r) => (r.ok ? r.json() as Promise<Coasts> : null)).catch(() => null) : null
  const photo = q.get('photo') ?? ''
  createPaperBench({
    lang, first, hook: plan.door,
    features: [
      { id: 'oil', door: OIL_WORDS[lang].ui.door, title: OIL_WORDS[lang].ui.title, close: OIL_WORDS[lang].ui.close,
        make: (x) => createOilPayload({ lang, reducedMotion: x.reducedMotion, photo, coasts }) },
      { id: 'garden-words', door: GARDEN_WORDS[lang].ui.door, title: GARDEN_WORDS[lang].ui.title, close: GARDEN_WORDS[lang].ui.close,
        make: (x) => createGardenWordsPayload({ lang, reducedMotion: x.reducedMotion, colour: x.still('held'), focus: plan.door.colour }) },
    ],
  })
}
