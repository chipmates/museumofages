/* THE BOX THE ISLAND FITS ITS MACHINE IN, shared with the filmed cycle so a
   recording made in one window lands on the same machine in another: the
   viewport less the caption's foot, and on the phone the glass down to the
   card's peek less the caption's four-row box. */
import type { VitrinePayloadHost, VitrineRect } from './types'

/** four rows of the longest German step with their padding */
export const CAPTION_BOX = 104

/** the desk band's island: the box's top in the picture, and the room under it for the caption's two rows (the
 * longest German step's), px */
export const DESK_FIT = Object.freeze({ top: 10, foot: 72 })

export function islandFit(host: VitrinePayloadHost): VitrineRect {
  const rect = host.narrow ? host.element.getBoundingClientRect() : host.viewport()
  if (host.banded && !host.narrow) {
    const top = Math.min(rect.top, DESK_FIT.top)
    return { left: rect.left, top, width: rect.width, height: Math.max(80, rect.top + rect.height - DESK_FIT.foot - top) }
  }
  const foot = host.narrow ? CAPTION_BOX : 118
  return { left: rect.left, top: rect.top, width: rect.width, height: Math.max(80, rect.height - foot) }
}
