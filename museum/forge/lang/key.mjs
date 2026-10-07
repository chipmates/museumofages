// THE CONTENT KEY OF A DISPLAYED STRING PAIR. A translation is filed under the
// pair it translates, so the key names no file, line or commit, and a changed
// English or German line goes stale in every other language by itself.
//
//   contentKey(en, de)            FNV-1a 64 over the UTF-8 bytes of en U+0001 de
//   contentKey(en, de, pointer)   the same with U+0001 pointer appended (homonyms)
//   patternKey(en, de)            the key of the pair with its numbers folded to {0}, {1}
//
// Plain JavaScript: the wing imports this file and the forge tools run it in node.

const SEP = '\u0001'
const encoder = new TextEncoder()

/** FNV-1a 64 of a string's UTF-8 bytes, 16 lowercase hex characters. The
    64-bit product is carried in two 32-bit halves: the prime is 2^40 + 0x1b3,
    so the high half takes the low half shifted by 8. */
export function fnv1a64(text) {
  let hi = 0xcbf29ce4
  let lo = 0x84222325
  for (const byte of encoder.encode(text)) {
    lo = (lo ^ byte) >>> 0
    const low = lo * 0x1b3
    hi = (hi * 0x1b3 + Math.floor(low / 0x100000000) + ((lo << 8) >>> 0)) >>> 0
    lo = low >>> 0
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0')
}

/** The key of a pair; a pointer separates two translations of one pair. */
export function contentKey(en, de, pointer = '') {
  return fnv1a64(pointer ? `${en}${SEP}${de}${SEP}${pointer}` : `${en}${SEP}${de}`)
}

/** A slot a caller fills (`{0}`, `{name}`), or a run of digits. */
const PART = /\{\w+\}|[0-9]+/g

/** A string with its slots and its runs of digits numbered {0}, {1} in the
    order they stand, as the unit cutter keys a pattern: `values[i]` gives
    back a digit run, or the slot as it was written, for the caller to fill. */
export function foldNumbers(text) {
  const values = []
  const pattern = text.replace(PART, (part) => `{${values.push(part) - 1}}`)
  return { pattern, values }
}

/** The key of a pair built at runtime with a number inside: each language folded on its own. */
export function patternKey(en, de, pointer = '') {
  return contentKey(foldNumbers(en).pattern, foldNumbers(de).pattern, pointer)
}

/** A pattern's translation with its numbers put back; a placeholder with no number stays as written. */
export function fillPattern(text, values) {
  return text.replace(/\{(\d+)\}/g, (whole, i) => values[Number(i)] ?? whole)
}
