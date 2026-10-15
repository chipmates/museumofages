export type WalkLayer = 'look' | 'drawer' | 'none'
export type WalkMotion = 'rest' | 'moving' | 'held'
export type WalkAction = 'look-back' | 'drawer-close' | 'pause' | 'resume' | 'hurry' | 'back' | 'hint' | 'none' | 'pass'
export function walkKey(at: { key: string; repeat?: boolean; layer: WalkLayer; walk: WalkMotion; onControl?: boolean }): WalkAction

export type WalkTip = 'keys' | 'sideways' | 'plan' | 'look'
export const TIPS: readonly WalkTip[]
export const TIPS_MOST: number
export function nextTip(at: { shown: readonly string[]; upright: boolean; looked: boolean }): WalkTip | null
