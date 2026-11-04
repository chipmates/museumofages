/* THE PENCIL FIGURE AND THE PENCIL RULER: our two measures on paper.

   The figure is the walk's own scale figure, the one that stands in the
   frames at 1.70 m, drawn face on in pencil from the same numbers
   (`place/person.ts`, form f2; a test holds the two equal, so the 3D figure
   and its drawing never drift apart). It is a measure, never a person: no
   face, no hands, no clothes. Copies stand on each other's heads to measure a
   height, as many as the height holds.

   Pure geometry in metres, then pixels: no DOM here but the path's string. */

/** the scale figure's form, in metres (equal to PERSON_FORMS.f2) */
export const FIGURE_FORM = {
  height: 1.7, head: 0.22, neck: 0.04, shoulders: 0.42, hip: 0.34, hipAt: 0.8, leg: 0.15, gap: 0.04, arm: 0.07, armTo: 0.62,
} as const
export const FIGURE_M = FIGURE_FORM.height

/** THE FIGURE'S OUTLINES face on, in metres, x across from its middle and y
 * up from its soles: the head, the neck, the trunk with its sloping
 * shoulders, two arms and two legs, each a closed outline */
export function figureOutlines(F = FIGURE_FORM): { head: { cx: number; cy: number; r: number }; parts: [number, number][][] } {
  const crown = F.height, r = F.head / 2, chin = crown - F.head, top = chin - F.neck
  const sh = F.shoulders / 2, hp = F.hip / 2, full = top - 0.07, nk = 0.055
  const parts: [number, number][][] = [
    // the neck runs into the head and the trunk
    [[-0.05, top - 0.01], [0.05, top - 0.01], [0.05, chin + 0.02], [-0.05, chin + 0.02]],
    // the trunk from just under the hip to the shoulders' slope
    [[-hp, F.hipAt - 0.03], [hp, F.hipAt - 0.03], [sh, full], [nk, top], [-nk, top], [-sh, full]],
  ]
  for (const s of [-1, 1]) {
    const inner = F.gap / 2, outer = F.gap / 2 + F.leg
    parts.push([[s * inner, 0], [s * outer, 0], [s * outer, F.hipAt + 0.02], [s * inner, F.hipAt + 0.02]])
    // an arm whose outer face is the shoulder's end, hanging to armTo
    parts.push([[s * (sh - F.arm), F.armTo], [s * sh, F.armTo], [s * sh, full - 0.01], [s * (sh - F.arm), full - 0.01]])
  }
  return { head: { cx: 0, cy: crown - r, r }, parts }
}

const f2 = (n: number): string => String(Math.round(n * 100) / 100)

/** THE FIGURE AS ONE SVG PATH, its soles' middle at (x, foot) in pixels, at
 * `px` pixels a metre; `tall` below 1 keeps a hairline between stacked copies */
export function figurePath(x: number, foot: number, px: number, tall = 1, across = px): string {
  const { head, parts } = figureOutlines()
  const at = (mx: number, my: number): string => `${f2(x + mx * across)} ${f2(foot - my * px * tall)}`
  let d = ''
  for (const part of parts) {
    // one winding for every part: a mirrored part runs the other way and would cut a hole where it overlaps
    const area = part.reduce((sum, [ax, ay], i) => { const [bx, by] = part[(i + 1) % part.length]!; return sum + ax * by - bx * ay }, 0)
    const run = area < 0 ? [...part].reverse() : part
    d += `M${run.map(([mx, my]) => at(mx, my)).join('L')}Z`
  }
  const r = head.r * Math.min(px * tall, across), cy = foot - head.cy * px * tall
  // the head as two arcs, so the whole figure stays one path with one fill rule
  // drawn clockwise on the screen, as the parts are, so the neck's overlap does not cut it
  d += `M${f2(x - r)} ${f2(cy)}a${f2(r)} ${f2(r)} 0 1 1 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 1 ${f2(-2 * r)} 0Z`
  return d
}

/** a stacked figure's least width in pixels, shoulder to shoulder, below which a stack reads as a dashed line */
export const STACK_LEAST_PX = 2.2

/** THE STACK: `count` figures, each standing on the last one's crown, from a
 * foot at `foot`; the top of the stack is `count` times 1.70 m. Each figure
 * keeps a device pixel of air under the next one's soles, and where the scale
 * is small it is drawn wider, never taller, so the height stays the measure. */
export function stackPath(x: number, foot: number, px: number, count: number): string {
  let d = ''
  const whole = Math.floor(count)
  const tall = Math.min(0.96, 1 - 1.2 / (FIGURE_M * px))
  const across = Math.max(px, STACK_LEAST_PX / FIGURE_FORM.shoulders)
  for (let i = 0; i < whole; i++) d += figurePath(x, foot - i * FIGURE_M * px, px, tall, across)
  return d
}

/** the most figures a height holds, standing on each other: 66 m holds 38.8, so 39 reach it */
export function figuresFor(metres: number): number {
  return Math.round(metres / FIGURE_M)
}

/** THE PENCIL RULER, ten centimetres: its body and its ticks, every
 * centimetre and every half, and every millimetre where a millimetre is
 * three pixels or more. A ruler for a thing at true size on its plate. */
export function rulerPaths(x: number, y: number, pxPerCm: number, cm = 10): { body: string; ticks: string; ends: [number, number] } {
  const h = Math.max(10, pxPerCm * 0.9)
  const body = `M${f2(x)} ${f2(y)}h${f2(cm * pxPerCm)}v${f2(h)}h${f2(-cm * pxPerCm)}Z`
  let ticks = ''
  const mm = pxPerCm / 10 >= 3
  for (let i = 0; i <= cm * (mm ? 10 : 2); i++) {
    const at = i / (mm ? 10 : 2)
    const len = Number.isInteger(at) ? (at % 5 === 0 ? 0.62 : 0.45) : (mm && (i % 5 !== 0) ? 0.18 : 0.3)
    ticks += `M${f2(x + at * pxPerCm)} ${f2(y)}v${f2(h * len)}`
  }
  return { body, ticks, ends: [x, x + cm * pxPerCm] }
}
