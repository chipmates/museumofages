/* THE BOX THE ISLAND FITS ITS MACHINE IN, shared with the filmed cycle so a
   recording made in one window lands on the same machine in another: the
   viewport less the caption's foot, and on the phone the glass down to the
   card's peek less the caption's room. The room is the machine's own longest
   step where it is measured (`captionRoom`), four rows where it is not. The
   box sets the machine's size; `glassShift` stands it in the glass's middle. */
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
export interface CaptionRoom {
  readonly above: number
  /** the same for the first step alone, the caption a machine at rest shows (the glass's middle is taken to it) */
  readonly rest?: number
}
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
  let top = Infinity, first = NaN
  for (const text of texts) {
    probe.textContent = text
    const at = probe.getBoundingClientRect().top
    if (Number.isNaN(first)) first = at
    top = Math.min(top, at)
  }
  probe.remove()
  const bottom = rect.top + rect.height
  // a caption that stands outside the window (a layout not yet laid) keeps the four rows
  const above = Number.isFinite(top) && top < bottom && top > rect.top ? Math.ceil(bottom - top) : (host.narrow ? CAPTION_BOX : DESK_FIT.foot)
  const rest = Number.isFinite(first) && first < bottom && first > rect.top ? Math.min(above, Math.ceil(bottom - first)) : above
  const room = { above, rest }
  rooms.set(host.caption, { key, room })
  return room
}

/** the air kept between the close button's foot and a machine under its column, px */
const SHUT_AIR = 8

/** THE GLASS'S MIDDLE: how far (px, down positive) a drawn box standing in its fit box moves so that it stands in the
 * middle of the glass the visitor sees, from the window's top (on the phone the close button's row too) down to the
 * top of the caption shown at rest, or to the window's foot where no caption shows. The fit box keeps the machine's
 * size and its caption clear; a box under the close button's column stays below the button. Given `column` (the drawn
 * outline's highest point between two x, Infinity where it has none), the outline under the column does, not its box. */
export function glassShift(host: VitrinePayloadHost, fit: VitrineRect, caption: CaptionRoom | undefined,
  box: { left: number; top: number; right: number; bottom: number }, captioned: boolean,
  column?: (from: number, to: number) => number): number {
  const rect = host.narrow ? host.element.getBoundingClientRect() : host.viewport()
  const foot = host.narrow ? rect.top + rect.height : host.banded ? deskStageHeight() : rect.top + rect.height
  const fitFoot = fit.top + fit.height
  const roomed = captioned && (caption?.above ?? 0) > 0
  // the glass ends at the caption the machine shows at rest; the box still clears the longest step's room below
  const glassFoot = roomed ? fitFoot + CAPTION_AIR + (caption!.above - (caption!.rest ?? caption!.above)) : foot
  // the picture's top on the desk's band and the phone's glass alike: the canvas runs under the close button's row
  const glassTop = host.narrow || host.banded ? 0 : rect.top
  let shift = (glassTop + glassFoot) / 2 - (box.top + box.bottom) / 2
  // a caption keeps its room; with none showing the machine keeps to the window
  shift = Math.min(shift, (roomed ? fitFoot : foot) - box.bottom)
  const shut = host.narrow ? host.element.closest('.vitrine')?.querySelector('.vitrine-shut')?.getBoundingClientRect() : undefined
  if (shut && shut.width > 0 && box.right > shut.left - SHUT_AIR && box.left < shut.right + SHUT_AIR) {
    const under = column ? Math.max(box.top, column(shut.left - SHUT_AIR, shut.right + SHUT_AIR)) : box.top
    if (Number.isFinite(under)) shift = Math.max(shift, shut.bottom + SHUT_AIR - under)
  }
  return Math.max(shift, glassTop - box.top)
}

/** The highest point (least y) between x `from` and `to` of the convex outline of `count / 2` canvas points (x, y in
 * pairs): the outline's top chain (a monotone chain over the points by x), at a vertex inside the band or where the
 * chain crosses its sides. Infinity where the outline does not reach the band. */
const order: number[] = [], chain: number[] = []
export function outlineTop(points: ArrayLike<number>, count: number, from: number, to: number): number {
  const n = count >> 1
  order.length = 0; chain.length = 0
  for (let i = 0; i < n; i++) order.push(i)
  order.sort((a, b) => points[2 * a]! - points[2 * b]! || points[2 * a + 1]! - points[2 * b + 1]!)
  for (const i of order) {
    const x = points[2 * i]!, y = points[2 * i + 1]!
    while (chain.length >= 2) {
      const a = chain[chain.length - 2]!, b = chain[chain.length - 1]!
      const ax = points[2 * a]!, ay = points[2 * a + 1]!, bx = points[2 * b]!, by = points[2 * b + 1]!
      if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) > 0) break
      chain.pop()
    }
    chain.push(i)
  }
  let top = Infinity
  for (let k = 0; k < chain.length; k++) {
    const ax = points[2 * chain[k]!]!, ay = points[2 * chain[k]! + 1]!
    if (ax >= from && ax <= to) top = Math.min(top, ay)
    if (k + 1 === chain.length) break
    const bx = points[2 * chain[k + 1]!]!, by = points[2 * chain[k + 1]! + 1]!
    if (ax < from && bx > from) top = Math.min(top, ay + (by - ay) * (from - ax) / (bx - ax))
    if (ax < to && bx > to) top = Math.min(top, ay + (by - ay) * (to - ax) / (bx - ax))
  }
  return top
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
