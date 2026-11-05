/* FEATURE 10'S BENCH (`/src/wings/babylon/river/river.html`): stop 13's held frame with its door, the river opening
   through the stop's ink still.
     ?held=<url with {framing}>  ?ink=<url with {framing}>  ?photo=<url>  ?lang=de  ?open=1  ?step=<n>
   The shared bench and its rig `window.__look` are the kit's (`paper/bench.ts`). A dev page. */
import { createPaperBench, type DoorHook } from '../paper/bench'
import { createRiverPayload } from './river'
import { RIVER_WORDS } from './river-words'

const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const plan = await fetch(new URL('../bridge/bridge-plan.json', import.meta.url)).then((r) => r.json()) as { door: DoorHook; water: { body: [number, number, number] } }
const photo = q.get('photo') ?? ''
const W = RIVER_WORDS[lang]
createPaperBench({
  lang, first: 'river', hook: plan.door,
  features: [{
    id: 'river', door: W.ui.door, title: W.ui.title, close: W.ui.close,
    make: (x) => createRiverPayload({ lang, reducedMotion: x.reducedMotion, photo, ink: x.still('ink'), water: plan.water.body }),
  }],
})
