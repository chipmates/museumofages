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

/** THE STACK'S FIGURE IS A FIGURE AT EVERY SIZE IT IS DRAWN: under this height
 * in pixels the walk's form f2 shrinks to a pencil dash, so the stack draws the
 * same figure as a sign (a round head clear of the shoulders, a trunk, two
 * legs), widened and never heightened; under `STACK_LEAST_H` device pixels no
 * figure can show and the stack, with its count, leaves the plate */
export const STACK_SIGN_H = 22
export const STACK_LEAST_H = 7
/** the sign's width against its height, and its least width in device pixels */
const SIGN_ACROSS = 0.62, SIGN_LEAST_W = 5

/** a stacked figure's height and width in pixels at a scale on a screen of `dpr`
 * device pixels a pixel, or null where a figure cannot show */
export function stackFigure(px: number, dpr = 1): { h: number; w: number } | null {
  const h = FIGURE_M * px
  if (h * dpr < STACK_LEAST_H) return null
  const air = Math.min(1.2, h * 0.08)
  if (h >= STACK_SIGN_H) return { h: h - air, w: FIGURE_FORM.shoulders * px }
  return { h: h - air, w: Math.max(FIGURE_FORM.shoulders * px, h * SIGN_ACROSS, SIGN_LEAST_W / dpr) }
}

/** THE FIGURE AS A SIGN, soles' middle at (x, foot), `h` tall and `w` wide in
 * pixels: the head a circle a third of the height, a gap, a trunk from the
 * shoulders to the hips, and two legs with air between them */
export function signPath(x: number, foot: number, h: number, w: number): string {
  const d = Math.min(w * 0.8, h * 0.3), r = d / 2
  const gap = Math.max(0.35, h * 0.07)
  const sh = foot - h + d + gap, hip = foot - h * 0.38
  const half = w / 2, hipHalf = w * 0.36, leg = w * 0.3, inner = Math.max(0.5, w * 0.1)
  let out = `M${f2(x - half)} ${f2(sh)}L${f2(x + half)} ${f2(sh)}L${f2(x + hipHalf)} ${f2(hip + 0.4)}L${f2(x - hipHalf)} ${f2(hip + 0.4)}Z`
  for (const s of [-1, 1]) {
    const a = x + s * inner, b = x + s * (inner + leg)
    out += `M${f2(Math.min(a, b))} ${f2(hip)}L${f2(Math.max(a, b))} ${f2(hip)}L${f2(Math.max(a, b))} ${f2(foot)}L${f2(Math.min(a, b))} ${f2(foot)}Z`
  }
  const cy = foot - h + r
  out += `M${f2(x - r)} ${f2(cy)}a${f2(r)} ${f2(r)} 0 1 1 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 1 ${f2(-2 * r)} 0Z`
  return out
}

/** THE STACK: `count` figures, each standing on the last one's crown, from a
 * foot at `foot`; the top of the stack is `count` times 1.70 m. Each figure
 * keeps a hair of air under the next one's soles, and where the scale is
 * small it is drawn wider, never taller, so the height stays the measure.
 * Empty where a figure cannot show at this scale. */
export function stackPath(x: number, foot: number, px: number, count: number, dpr = 1): string {
  const one = stackFigure(px, dpr)
  if (!one) return ''
  let d = ''
  const whole = Math.floor(count)
  const slot = FIGURE_M * px
  for (let i = 0; i < whole; i++) {
    const sole = foot - i * slot
    if (slot >= STACK_SIGN_H) d += figurePath(x, sole, px, one.h / slot, Math.max(px, one.w / FIGURE_FORM.shoulders))
    else d += signPath(x, sole, one.h, one.w)
  }
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
