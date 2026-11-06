/* THE PAPER'S TWO COLOURS, and the only colour values a paper feature has.
   Anything from another time than the walk's day, or an idea, is drawn in
   ink on paper; every other shade on a plate is one of these two mixed. The
   values are a proposal until the palette round sets them, so they live here
   and nowhere else (a tool that renders offline reads this file too).

   Pure: no DOM, so node checks the contrast the plates promise. */

export const PAPER_TOKENS = {
  /** a pale clay buff, lighter than the brick buff */
  paper: '#ede4d1',
  /** the bitumen black */
  ink: '#221c17',
} as const

/** THE SHARES OF INK in each derived shade, mixed into the paper. A share is
 * the only knob a plate has: the floor each one has to keep against the
 * paper is tested beside it (`paper.test.mjs`). */
export const INK_SHARE = {
  /** our measures (figure, ruler, counted unit, counter): grey pencil, text-safe at 4.5:1 on the grain's darkest paper too */
  pencil: 0.7,
  /** the solid fill of what is in place, under its heavy line */
  solid: 0.3,
  /** the core inside a solid: a second solid, darker, never a pattern */
  solidDeep: 0.48,
  /** a counted unit's own fill, inside its pencil line */
  unit: 0.2,
  /** a counted unit of the darker kind, where two kinds are counted side by side */
  unitFull: 0.42,
  /** the paper's grain, felt and never read */
  grain: 0.05,
} as const

/** the floors every meaning stroke and every text keeps against the paper */
export const CONTRAST_FLOOR = { stroke: 3, text: 4.5, main: 7 } as const

export type Rgb = readonly [number, number, number]

export function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** an sRGB mix, as `color-mix(in srgb, ink <share>, paper)` draws it */
export function mixRgb(ink: Rgb, paper: Rgb, share: number): Rgb {
  return [0, 1, 2].map(i => ink[i]! * share + paper[i]! * (1 - share)) as unknown as Rgb
}

/** WCAG 2.2 relative luminance of an sRGB colour, 0 to 255 per channel */
export function luminance(rgb: Rgb): number {
  const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** each shade a plate draws with, as RGB, from the two tokens */
export function shades(tokens: { paper: string; ink: string } = PAPER_TOKENS): Record<'paper' | 'ink' | keyof typeof INK_SHARE, Rgb> {
  const paper = hexRgb(tokens.paper), ink = hexRgb(tokens.ink)
  const out: Record<string, Rgb> = { paper, ink }
  for (const [name, share] of Object.entries(INK_SHARE)) out[name] = mixRgb(ink, paper, share)
  return out as Record<'paper' | 'ink' | keyof typeof INK_SHARE, Rgb>
}

/** THE TOKENS AS CSS: two values and the shares, so a style sheet mixes the
 * shades itself and holds no colour of its own */
export function paperStyle(tokens: { paper: string; ink: string } = PAPER_TOKENS): string {
  const pct = (share: number): string => `${Math.round(share * 1000) / 10}%`
  return [
    `--paper: ${tokens.paper}`,
    `--paper-ink: ${tokens.ink}`,
    ...Object.entries(INK_SHARE).map(([name, share]) => `--paper-${name}: color-mix(in srgb, var(--paper-ink) ${pct(share)}, var(--paper))`),
  ].join('; ')
}
