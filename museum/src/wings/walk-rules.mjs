// THE WALK'S RULES, shared by every wing that walks: what a key does while the
// eye stands, walks or holds, and which tip a walk carries. Plain functions, so
// the rules are tested without a page (forge/walk-rules.test.mjs).

/**
 * What a key asks of the walk. `layer` is what stands over the picture: a
 * close look, a drawer, or nothing; `walk` is the eye at rest, moving or held.
 * Escape backs out one level and never moves the eye on or up: over a layer it
 * shuts that layer, while the eye moves it holds the walk, and otherwise it
 * does nothing. Space holds and frees a walk as a video's does. 'pass' leaves
 * the key to the handlers that answered it before.
 * @param {{ key: string, repeat?: boolean, layer: 'look' | 'drawer' | 'none', walk: 'rest' | 'moving' | 'held', onControl?: boolean }} at
 * @returns {'look-back' | 'drawer-close' | 'pause' | 'resume' | 'hurry' | 'back' | 'hint' | 'none' | 'pass'}
 */
export function walkKey({ key, repeat = false, layer, walk, onControl = false }) {
  if (key === 'Escape') {
    if (layer === 'look') return 'look-back'
    if (layer === 'drawer') return 'drawer-close'
    if (walk === 'moving' && !repeat) return 'pause'
    return 'none'
  }
  if (layer !== 'none') return 'pass'
  if (key === ' ' || key === 'Spacebar') {
    // a control under the hand answers its own key: the browser presses it
    if (onControl) return 'pass'
    if (walk === 'moving') return repeat ? 'none' : 'pause'
    if (walk === 'held') return repeat ? 'none' : 'resume'
    return 'pass'
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    if (walk === 'held') return 'resume'
    if (walk === 'moving') return 'hurry'
    return 'pass'
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') return walk === 'held' ? 'back' : 'pass'
  if (/^[wasd]$/i.test(key)) return 'hint'
  return 'pass'
}

/** the tips a visit can meet while the eye walks, in the order they come */
export const TIPS = Object.freeze(['keys', 'sideways', 'plan', 'look'])
/** the most tips one visit meets */
export const TIPS_MOST = 4

/**
 * The tip a walk to a stop carries, or null. One a walk, each once a visit,
 * four at most: the keys on the visit's first walk; on an upright phone, the
 * turn sideways on the next; then the plan; later, while no close look has
 * been opened, how to open one.
 * @param {{ shown: readonly string[], upright: boolean, looked: boolean }} at
 * @returns {'keys' | 'sideways' | 'plan' | 'look' | null}
 */
export function nextTip({ shown, upright, looked }) {
  if (shown.length >= TIPS_MOST) return null
  const seen = new Set(shown)
  if (!seen.has('keys')) return 'keys'
  if (upright && !seen.has('sideways')) return 'sideways'
  if (!seen.has('plan')) return 'plan'
  if (!looked && !seen.has('look')) return 'look'
  return null
}
