/* THE BOX THE ISLAND FITS ITS MACHINE IN, shared with the filmed cycle so a
   recording made in one window lands on the same machine in another: the
   viewport less the caption's foot, and on the phone the glass down to the
   card's peek less the caption's four-row box. */
import type { VitrinePayloadHost, VitrineRect } from './types'

/** four rows of the longest German step with their padding */
export const CAPTION_BOX = 104

/** the desk band's island: the box's top in the picture and the caption's foot over the viewport's bottom, px */
export const DESK_FIT = Object.freeze({ top: 27, foot: 52 })

export function islandFit(host: VitrinePayloadHost): VitrineRect {
  const rect = host.narrow ? host.element.getBoundingClientRect() : host.viewport()
  if (host.banded && !host.narrow) {
    // a look round's numbers, on the dev server only (stage-close-view's probe)
    const desk = (import.meta.env.DEV ? (globalThis as { __stageProbe?: { fit?: typeof DESK_FIT } }).__stageProbe?.fit : undefined) ?? DESK_FIT
    const top = Math.min(rect.top, desk.top)
    return { left: rect.left, top, width: rect.width, height: Math.max(80, rect.top + rect.height - desk.foot - top) }
  }
  const foot = host.narrow ? CAPTION_BOX : 118
  return { left: rect.left, top: rect.top, width: rect.width, height: Math.max(80, rect.height - foot) }
}
