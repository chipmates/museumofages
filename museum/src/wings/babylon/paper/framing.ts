/* THE PLATE'S FRAMING: which of its two layouts a plate of a given box takes. Pure, so a test reads the same rule. */

export type PaperFraming = 'wide' | 'upright'

/** a wide plate's least width: narrower, a side-by-side drawing has no room, so the plate stacks its parts */
export const WIDE_LEAST = 560

/** upright where the box is taller than it is wide, or too narrow to lay out side by side */
export const framingOf = (w: number, h: number): PaperFraming => (h > w * 1.05 || w < WIDE_LEAST ? 'upright' : 'wide')
