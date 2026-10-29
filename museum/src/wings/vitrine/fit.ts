/* THE BOX THE ISLAND FITS ITS MACHINE IN, shared with the filmed cycle so a
   recording made in one window lands on the same machine in another: the
   viewport less the caption's foot, and on the phone the glass down to the
   card's peek less the caption's room. The room is the machine's own longest
   step where it is measured (`captionRoom`), four rows where it is not. */
import { deskStageHeight } from '../desk-stage'
import type { VitrinePayloadHost, VitrineRect } from './types'

/** four rows of the longest German step with their padding */
export const CAPTION_BOX = 104

/** the desk band's island: the box's top in the picture, and the room under it for the caption's two rows (the
 * longest German step's), px */
export const DESK_FIT = Object.freeze({ top: 10, foot: 72 })

/** the air between a machine's box and the top of its longest caption, px */
const CAPTION_AIR = 8

/** THE CAPTION'S ROOM: how far above the window's foot the top of the machine's longest step stands, in the
 * caption's own type at its width, px; 0 for a machine that has no step. Measured once per window and language. */
export interface CaptionRoom { readonly above: number }
const rooms = new WeakMap<HTMLElement, { key: string; room: CaptionRoom }>()
export function captionRoom(host: VitrinePayloadHost, texts: readonly string[]): CaptionRoom {
  if (!texts.length) return { above: 0 }
  const rect = host.narrow ? host.element.getBoundingClientRect() : host.viewport()
  const key = `${innerWidth}x${innerHeight}|${host.lang}|${host.narrow}|${texts.join('\n')}`
  const kept = rooms.get(host.caption)
  if (kept?.key === key) return kept.room
  const probe = host.caption.cloneNode(false) as HTMLElement
  probe.removeAttribute('aria-live')
  probe.removeAttribute('id')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.visibility = 'hidden'
  probe.style.removeProperty('min-height')
  host.caption.after(probe)
  let top = Infinity
  for (const text of texts) { probe.textContent = text; top = Math.min(top, probe.getBoundingClientRect().top) }
  probe.remove()
  const bottom = rect.top + rect.height
  // a caption that stands outside the window (a layout not yet laid) keeps the four rows
  const above = Number.isFinite(top) && top < bottom && top > rect.top ? Math.ceil(bottom - top) : (host.narrow ? CAPTION_BOX : DESK_FIT.foot)
  const room = { above }
  rooms.set(host.caption, { key, room })
  return room
}

export function islandFit(host: VitrinePayloadHost, caption?: CaptionRoom): VitrineRect {
  const rect = host.narrow ? host.element.getBoundingClientRect() : host.viewport()
  if (host.banded && !host.narrow) {
    if (caption) {
      // THE WHOLE PICTURE ABOVE THE BAND, less the machine's own caption room: a machine with no step stands in the
      // picture's middle, one with steps between the picture's top and its longest step
      const bottom = caption.above ? rect.top + rect.height - caption.above - CAPTION_AIR : deskStageHeight()
      return { left: rect.left, top: 0, width: rect.width, height: Math.max(80, bottom) }
    }
    const top = Math.min(rect.top, DESK_FIT.top)
    return { left: rect.left, top, width: rect.width, height: Math.max(80, rect.top + rect.height - DESK_FIT.foot - top) }
  }
  const foot = caption ? (caption.above ? caption.above + CAPTION_AIR : 0) : host.narrow ? CAPTION_BOX : 118
  return { left: rect.left, top: rect.top, width: rect.width, height: Math.max(80, rect.height - foot) }
}
