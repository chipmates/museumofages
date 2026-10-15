/* THE WALK'S CONTROL WORDS, shared by every wing that walks: the panel while
   the eye walks, its hold and its skip, the tips and the keys' hint. English
   and German stand here; the other five languages file each pair under its
   own key (`museum/lang/<tag>/walk.json`), so a changed word here goes stale
   there. The hold's words recur in the keys' tips: change them together. */

import type { Bilingual } from './content'

export const WALK_WORDS = {
  /** the kicker over the place the walk goes to, in capitals */
  walkingTo: { en: 'Next stop', de: 'Nächste Station' },
  /** the hold beside the gold, as its name for a screen reader and its word on the phone */
  pause: { en: 'Pause', de: 'Anhalten' },
  /** the gold while the walk holds */
  walkOn: { en: 'Walk on', de: 'Weitergehen' },
  /** the held walk's state, in the tip's row */
  paused: { en: 'Paused', de: 'Angehalten' },
  /** the walk ends at once at the place it goes to */
  skip: { en: 'Skip to the stop', de: 'Direkt zur Station' },
  /** a key, a mouse drag or the wheel a guided walk does not answer */
  hint: { en: 'This is a guided walk. Use → to go on, ← to go back.', de: 'Das ist ein geführter Rundgang. Mit → geht es weiter, mit ← zurück.' },
  /** the same for a finger's drag, where no arrow key stands: the way on alone */
  hintTouch: { en: 'This is a guided walk. Tap → to go on.', de: 'Das ist ein geführter Rundgang. Tippe auf →, dann geht es weiter.' },
  /** the tips while the eye walks (walk-rules.mjs nextTip); the first names the hold, whose skip stands right above it */
  tipKeys: { en: 'The space bar pauses the walk.', de: 'Mit der Leertaste hältst du an.' },
  tipKeysTouch: { en: 'Tap ‖ to pause the walk.', de: 'Tippe auf ‖, um anzuhalten.' },
  tipPlan: { en: 'At a stop, the Plan in Instruments takes you to any other.', de: 'An jeder Station führt der Plan in „Instrumente“ überallhin.' },
  tipLook: { en: 'Press the gold ring under a work to look closer.', de: 'Drück auf den Ring unter einem Werk, um es näher anzusehen.' },
} as const satisfies Record<string, Bilingual>
