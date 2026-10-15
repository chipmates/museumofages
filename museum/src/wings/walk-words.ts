/* THE WALK'S CONTROL WORDS, shared by every wing that walks: the panel while
   the eye walks, its hold and its skip, the tips and the keys' hint. English
   and German stand here; the other five languages file each pair under its
   own key (`museum/lang/<tag>/walk.json`).
   DRAFTS: the English is a draft and the German only holds the layout until
   the words round writes both. */

import type { Bilingual } from './content'

export const WALK_WORDS = {
  /** the kicker over the place the walk goes to */
  walkingTo: { en: 'Walking to', de: 'Unterwegs zu' },
  /** the hold beside the gold, as its name for a screen reader and its word on the phone */
  pause: { en: 'Pause', de: 'Anhalten' },
  /** the gold while the walk holds */
  walkOn: { en: 'Walk on', de: 'Weitergehen' },
  /** the walk ends at once at the place it goes to */
  skip: { en: 'Skip to the stop', de: 'Direkt zur Station' },
  /** a key, a drag or the wheel a guided walk does not answer */
  hint: { en: 'This is a guided walk. Use → to go on, ← to go back.', de: 'Dies ist ein geführter Rundgang. Mit → geht es weiter, mit ← zurück.' },
  /** the tips while the eye walks (walk-rules.mjs nextTip); the first names the hold and the skip */
  tipKeys: { en: 'Space pauses. Or skip straight to the stop.', de: 'Die Leertaste hält an. Oder geh direkt zur Station.' },
  tipKeysTouch: { en: 'Tap ‖ to pause. Or skip straight to the stop.', de: 'Tippe auf ‖ zum Anhalten. Oder geh direkt zur Station.' },
  tipPlan: { en: 'The Plan jumps to any room.', de: 'Der Plan bringt dich in jeden Raum.' },
  tipLook: { en: 'Press a ring on a work to look closer.', de: 'Tippe auf einen Ring an einem Werk, um es näher anzusehen.' },
} as const satisfies Record<string, Bilingual>
