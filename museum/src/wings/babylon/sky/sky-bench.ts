/* FEATURE 11'S BENCH (`/src/wings/babylon/sky/sky.html`): stop 13's held frame with its door, the evening sky opening
   through the stop's ink still.
     ?held=<url with {framing}>  ?ink=<url with {framing}>  ?photo=<url>  ?heaps=<url with {framing}>  ?silver=<url>
     ?lang=de  ?open=1  ?step=<n>
   The shared bench and its rig `window.__look` are the kit's (`paper/bench.ts`). A dev page. */
import { createPaperBench, type DoorHook } from '../paper/bench'
import type { SkyFile } from '../crescent/sky'
import { createSkyPayload } from './sky'
import { SKY_WORDS } from './sky-words'

const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const json = <T>(p: string): Promise<T> => fetch(new URL(p, import.meta.url)).then((r) => r.json() as Promise<T>)
const [plan, s14, s15] = await Promise.all([
  json<{ door: DoorHook; water: { body: [number, number, number] } }>('../bridge/bridge-plan.json'),
  json<SkyFile>('./sky-0414.json'),
  json<SkyFile>('../crescent/sky-570.json'),
])
const heaps = q.get('heaps') ?? ''
const W = SKY_WORDS[lang]
createPaperBench({
  // the stop's door, its place as the plan gives it; the plan lists feature 10 alone until the walk is wired
  lang, first: 'sky', hook: { ...plan.door, features: ['sky'] },
  features: [{
    id: 'sky', door: W.ui.door, title: W.ui.title, close: W.ui.close,
    make: (x) => createSkyPayload({
      lang, reducedMotion: x.reducedMotion, skies: { '0414': s14, '0415': s15 },
      photo: q.get('photo') ?? '', heaps: { wide: heaps.replace('{framing}', 'wide'), upright: heaps.replace('{framing}', 'upright') }, silver: q.get('silver') ?? '',
      ink: x.still('ink'), water: plan.water.body,
    }),
  }],
})
