/* A PAPER FEATURE'S DRAWING AS DATA: what stands on the plate at one point of
   the slider, in the plate's pixels. A feature's scene function returns one;
   `feature.ts` draws it and node checks it (every label placed clear, every
   part on the plate). Pure: no DOM. */

import type { Box, Seg, Side, Taken } from './placer'

export type PrimMark = 'place' | 'known' | 'guessed' | 'measure' | 'pencil'

interface PrimBase { id: string; cls?: string; alpha?: number }
export type Prim =
  | PrimBase & { type: 'rect'; mark: PrimMark; x: number; y: number; w: number; h: number }
  | PrimBase & { type: 'line'; mark: PrimMark; ax: number; ay: number; bx: number; by: number; width?: number }
  | PrimBase & { type: 'path'; mark: PrimMark; d: string; width?: number }
  /** a picture the feature hands in by key: `fill` keeps the box the scene computed from the file's own size, `cover`
      fills the box and crops round `focus` (fractions of the picture); `clip` shows only its part inside that box of
      the plate, so a picture may stand larger than its panel */
  | PrimBase & { type: 'image'; key: string; x: number; y: number; w: number; h: number; fit: 'fill' | 'cover'; focus?: readonly [number, number]; clip?: Box }

export type AnchorKind = 'ink' | 'pencil' | 'quiet' | 'count' | 'big' | 'pair' | 'credit'
export interface Anchor {
  id: string
  x: number
  y: number
  sides: readonly Side[]
  gap: number
  kind: AnchorKind
  over?: string[]
  /** a credit wraps inside this width */
  width?: number
  reach?: number
}

/** the plate's own margins in pixels: the gutter, and on a phone the safe area at the top */
export interface Inset { l: number; t: number; r: number; b: number }

export interface PaperScene {
  prims: Prim[]
  /** the labels this point of the slider shows, in the order they are placed */
  anchors: Anchor[]
  /** what the labels stay clear of */
  taken: Taken[]
  walls: Seg[]
  bounds: Box
  /** what the read-back and the tests need to know: counts, rows, the dots */
  facts: Record<string, unknown>
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
export const ease = (x: number): number => { const u = clamp01(x); return u * u * (3 - 2 * u) }
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
/** a span of the slider as 0 to 1 */
export const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a))
export const settledAt = (t: number): number | null => (Math.abs(t - Math.round(t)) < 1e-3 ? Math.round(t) : null)

/** a circle as one closed path, so a mark's fill and stroke rules hold */
export function circlePath(cx: number, cy: number, r: number): string {
  const f = (n: number): string => String(Math.round(n * 100) / 100)
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`
}

/** the gutter a plate keeps: 16 px upright (the sheet's own margin) and below the safe area's top, more on a wide plate */
export function insetFor(framing: 'wide' | 'upright', safeTop = 0): Inset {
  if (framing === 'upright') return { l: 16, t: Math.max(16, safeTop + 8), r: 16, b: 12 }
  return { l: 28, t: 24, r: 28, b: 18 }
}

/** the drawing's own box per part: rects, lines and images exactly, paths by their absolute points */
export function primBox(p: Prim): Box | null {
  if (p.type === 'rect' || p.type === 'image') return { l: p.x, t: p.y, r: p.x + p.w, b: p.y + p.h }
  if (p.type === 'line') return { l: Math.min(p.ax, p.bx), t: Math.min(p.ay, p.by), r: Math.max(p.ax, p.bx), b: Math.max(p.ay, p.by) }
  const pts = [...p.d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
  const arcs = [...p.d.matchAll(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)a(-?\d+(?:\.\d+)?) /g)].flatMap((m) => {
    const x = Number(m[1]), y = Number(m[2]), r = Number(m[3])
    return [[x, y - r], [x + 2 * r, y + r]] as const
  })
  const all = [...pts, ...arcs]
  return all.length ? { l: Math.min(...all.map((q) => q[0])), t: Math.min(...all.map((q) => q[1])), r: Math.max(...all.map((q) => q[0])), b: Math.max(...all.map((q) => q[1])) } : null
}
