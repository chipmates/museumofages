// The content key's shape as the wing reads it: `key.mjs` stays plain
// JavaScript so its tests run in node, and the page imports the same file.

export function fnv1a64(text: string): string
export function contentKey(en: string, de: string, pointer?: string): string
export function foldNumbers(text: string): { pattern: string; values: string[] }
export function patternKey(en: string, de: string, pointer?: string): string
export function fillPattern(text: string, values: readonly string[]): string
