/* THE COUNTED UNIT: an amount drawn as one pencil unit repeated, never one
   unit enlarged. A tenth is a tenth of a unit's width, so 8.7 is eight units
   and most of a ninth. A count far larger than its neighbours shrinks the way
   a life's empty years do (`life/scale.ts`): one mark stands for a whole
   group and says how many it holds, so a row stays a row a reader can count.

   The counter's figures are words of the page's language, formatted here and
   never typed. Pure: no DOM. */

export interface UnitBox { x: number; y: number; w: number; h: number; part: number; index: number }

export interface UnitGridOptions {
  /** the grid's corner the units start from, and its size and air */
  x: number
  y: number
  size: number
  gap: number
  perRow: number
  /** rows run up from the foot (units settle), or down from the head */
  rise?: boolean
  /** a right-to-left page fills its rows from the right */
  mirror?: boolean
  /** where a part of a unit is cut: across its width (a row), or from its top (a pile, the part lying on the row under it) */
  cut?: 'width' | 'height'
}

/** `count` units in rows of `perRow`, the last one cut to its fraction */
export function unitGrid(count: number, o: UnitGridOptions): UnitBox[] {
  const out: UnitBox[] = []
  const whole = Math.floor(count + 1e-9), part = count - whole
  const n = whole + (part > 1e-6 ? 1 : 0)
  const pitch = o.size + o.gap
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / o.perRow), col = i % o.perRow
    const share = i < whole ? 1 : part
    const byHeight = o.cut === 'height'
    const w = byHeight ? o.size : o.size * share, h = byHeight ? o.size * share : o.size
    const x = o.mirror ? o.x + (o.perRow - 1 - col) * pitch + (o.size - w) : o.x + col * pitch
    const y = (o.rise ? o.y - (row + 1) * pitch + o.gap : o.y + row * pitch) + (o.size - h)
    out.push({ x, y, w, h, part: share, index: i })
  }
  return out
}

/** the grid's own box for `count` units, to reserve its room before it fills */
export function gridBox(count: number, o: UnitGridOptions): { w: number; h: number } {
  const n = Math.ceil(count - 1e-9)
  const rows = Math.max(1, Math.ceil(n / o.perRow)), cols = Math.min(o.perRow, Math.max(1, n))
  return { w: cols * o.size + (cols - 1) * o.gap, h: rows * o.size + (rows - 1) * o.gap }
}

/** A RANGE OF GROUPS: `lo` marks drawn whole and the rest up to `hi` drawn
 * open, for a count a source gives as "12 or 15 by how it is counted" */
export function rangeRow(lo: number, hi: number, o: Omit<UnitGridOptions, 'rise'>): (UnitBox & { open: boolean })[] {
  return unitGrid(hi, { ...o, rise: false }).map(b => ({ ...b, open: b.index >= lo }))
}

/** a count in millions as the page's language writes it: 8.7 / 8,7 */
export function millions(value: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

/** how many units a fraction of the pour shows: the units settle one by one */
export function poured(count: number, share: number): number {
  const s = Math.max(0, Math.min(1, share))
  return Math.round(count * s * 10) / 10
}
