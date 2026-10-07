import { FontLoader, type FontData } from 'three/addons/loaders/FontLoader.js'
import { font } from './font'
import type { TextOutline, TextSettingOptions } from './outline'

/* THE LETTERS OF THE OTHER LANGUAGES. `font.ts` carries English and German
   and stays as it is; this second font copies its glyphs and adds, in the
   same stroke construction, the accents French, Italian, Spanish and
   Portuguese need and the Bulgarian Cyrillic in its Bulgarian forms (Д and Л
   pointed, в г д ж з и й к л п т ц ш щ ю as Bulgarian print draws them).
   Only the page draws with it: the scene never reads this file. */

type Point = readonly [number, number]
type Glyph = FontData['glyphs'][string]
const BASE = font.data.glyphs
const glyphs: FontData['glyphs'] = {}
const round = (n: number) => Math.round(n * 100) / 100

// The stroke construction of `font.ts`, which exports none of it: the same
// code, so a new letter cannot be told from an old one.
function polygon(points: readonly Point[], clockwise = true): string {
  if (points.length < 3) return ''
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!
    area += a[0] * b[1] - b[0] * a[1]
  }
  const p = (area > 0) === clockwise ? [...points].reverse() : [...points]
  return p.map((q, i) => `${i ? 'l' : 'm'} ${round(q[0])} ${round(q[1])}`).join(' ') +
    ` l ${round(p[0]![0])} ${round(p[0]![1])}`
}
function stroke(points: readonly Point[], weight = 56): string {
  weight *= 1.45
  const normals: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    normals.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l])
  }
  const side = (sign: number): Point[] => points.map((p, i) => {
    const before = normals[Math.max(0, i - 1)]!, after = normals[Math.min(normals.length - 1, i)]!
    const nx = before[0] + after[0], ny = before[1] + after[1]
    const scale = sign * weight / Math.max(0.65, nx * after[0] + ny * after[1]) / 2
    return [p[0] + nx * scale, p[1] + ny * scale]
  })
  return polygon([...side(1), ...side(-1).reverse()])
}
const line = (x1: number, y1: number, x2: number, y2: number, w = 56) =>
  stroke([[x1, y1], [x2, y2]], w)
/** an arc's centre line, sampled as `font.ts` samples its arcs */
function along(cx: number, cy: number, rx: number, ry: number, a: number, b: number): Point[] {
  const steps = Math.max(5, Math.ceil(Math.abs(b - a) / (Math.PI / 10)))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = a + (b - a) * i / steps
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] as Point
  })
}
const arc = (cx: number, cy: number, rx: number, ry: number, a: number, b: number, w = 56): string =>
  stroke(along(cx, cy, rx, ry, a, b), w)
function ring(cx: number, cy: number, rx: number, ry: number, w = 56): string {
  const outer: Point[] = [], inner: Point[] = []
  const half = w * 1.45 / 2
  for (let i = 0; i < 20; i++) {
    const t = -Math.PI / 2 + i * Math.PI / 10
    const co = Math.cos(t), si = Math.sin(t)
    const nx = co / rx, ny = si / ry, k = half / Math.hypot(nx, ny)
    outer.push([cx + co * rx + nx * k, cy + si * ry + ny * k])
    inner.push([cx + co * rx - nx * k, cy + si * ry - ny * k])
  }
  return `${polygon(outer)} ${polygon(inner, false)}`
}
const dot = (x: number, y: number, r = 35) => polygon(Array.from({ length: 10 }, (_, i) =>
  [x + Math.cos(i * Math.PI / 5) * r, y + Math.sin(i * Math.PI / 5) * r] as Point))
const serif = (x: number, y: number, wide = 80) => line(x - wide, y, x + wide, y, 28)
const stem = (x: number, lo = 0, hi = 1000, w = 65) => {
  const half = w * 1.45 / 2, flare = 80, lip = 20.3, shoulder = 55
  return polygon([[x-flare,lo-lip],[x+flare,lo-lip],[x+half,lo+shoulder],[x+half,hi-shoulder],[x+flare,hi+lip],[x-flare,hi+lip],[x-half,hi-shoulder],[x-half,lo+shoulder]])
}
/** `stem` without its top flare: a side that runs on into a curve */
const foot = (x: number, lo: number, hi: number, w = 57) => {
  const half = w * 1.45 / 2, flare = 80, lip = 20.3, shoulder = 55
  return polygon([[x-flare,lo-lip],[x+flare,lo-lip],[x+half,lo+shoulder],[x+half,hi],[x-half,hi],[x-half,lo+shoulder]])
}
function add(char: string, advance: number, ...outlines: string[]): void {
  glyphs[char] = { ha: advance, x_min: 0, x_max: advance - 45, o: outlines.join(' ') }
}
/** A glyph of either table; a new glyph is always a new object, since three
 * caches a glyph's split outline on the glyph itself. */
const glyph = (char: string): Glyph => glyphs[char] ?? BASE[char]!
const outline = (char: string): string => glyph(char).o ?? ''
const same = (char: string, from: string): void => {
  const g = glyph(from)
  glyphs[char] = { ha: g.ha, x_min: g.x_min, x_max: g.x_max, o: outline(from) }
}

/* ---- the marks, as `font.ts` cuts its é, è, â and ä ---- */
type Mark = 'acute' | 'grave' | 'circumflex' | 'umlaut' | 'tilde' | 'breve'
function mark(kind: Mark, cx: number, y: number): string {
  if (kind === 'umlaut') return `${dot(cx - 105, y, 35)} ${dot(cx + 105, y, 35)}`
  if (kind === 'acute') return line(cx - 70, y - 45, cx + 105, y + 125, 42)
  if (kind === 'grave') return line(cx - 105, y + 125, cx + 70, y - 45, 42)
  if (kind === 'circumflex') return stroke([[cx - 145, y - 15], [cx, y + 115], [cx + 145, y - 15]], 35)
  if (kind === 'breve') return arc(cx, y + 125, 135, 120, Math.PI * 1.08, Math.PI * 1.92, 36)
  // the tilde's wave turns once each way, in the circumflex's band and weight
  const wave: Point[] = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16
    return [cx - 150 + 300 * t, y + 50 + 48 * Math.sin(-Math.PI / 4 + Math.PI * 2.5 * t)] as Point
  })
  return stroke(wave, 35)
}
/** A letter with its mark over its base, centred on the base's advance; on
 * an i the mark takes the dot's place. */
function marked(char: string, base: string, kind: Mark): void {
  const g = glyph(base), cx = g.ha / 2, y = base === base.toUpperCase() ? 1170 : 865
  const body = base === 'i' ? stem(165, 0, 670, 56) : outline(base)
  glyphs[char] = { ha: g.ha, x_min: g.x_min, x_max: g.x_max, o: `${body} ${mark(kind, cx, y)}` }
}

/* ---- French, Italian, Spanish, Portuguese ---- */
const LATIN: readonly (readonly [string, string, Mark])[] = [
  ['á', 'a', 'acute'], ['í', 'i', 'acute'], ['ó', 'o', 'acute'], ['ú', 'u', 'acute'],
  ['ò', 'o', 'grave'], ['ù', 'u', 'grave'],
  ['î', 'i', 'circumflex'], ['û', 'u', 'circumflex'],
  ['ë', 'e', 'umlaut'], ['ï', 'i', 'umlaut'], ['ÿ', 'y', 'umlaut'],
  ['ã', 'a', 'tilde'], ['õ', 'o', 'tilde'], ['ñ', 'n', 'tilde'],
  ['À', 'A', 'grave'], ['Á', 'A', 'acute'], ['Â', 'A', 'circumflex'], ['Ã', 'A', 'tilde'],
  ['È', 'E', 'grave'], ['Ê', 'E', 'circumflex'], ['Ë', 'E', 'umlaut'],
  ['Ì', 'I', 'grave'], ['Í', 'I', 'acute'], ['Î', 'I', 'circumflex'], ['Ï', 'I', 'umlaut'],
  ['Ò', 'O', 'grave'], ['Ó', 'O', 'acute'], ['Ô', 'O', 'circumflex'], ['Õ', 'O', 'tilde'],
  ['Ù', 'U', 'grave'], ['Ú', 'U', 'acute'], ['Û', 'U', 'circumflex'],
  ['Ñ', 'N', 'tilde'], ['Ÿ', 'Y', 'umlaut'],
]
for (const [char, base, kind] of LATIN) marked(char, base, kind)

/** the cedilla hangs from the bowl's foot and turns back under it */
const cedilla = (x: number): string =>
  stroke([[x, -10], [x + 12, -88], ...along(x + 2, -158, 82, 70, Math.PI / 2, -Math.PI * .8).slice(1)], 36)
add('ç', 635, outline('c'), cedilla(330))
add('Ç', 780, outline('C'), cedilla(390))

// the o's right side is the e's left: one bowl runs into the other
add('œ', 1040, ring(300, 335, 215, 335, 57), arc(735, 335, 220, 335, 0, Math.PI * 1.82, 55), line(520, 335, 955, 335, 40))
add('Œ', 1080, arc(475, 500, 335, 500, Math.PI / 2, Math.PI * 1.5, 66), stem(475), line(475, 1000, 930, 1000, 40), line(475, 0, 930, 0, 40),
  line(475, 510, 845, 510, 40), line(930, 0, 960, 160, 35), line(930, 1000, 950, 850, 35), line(845, 420, 845, 600, 30))

// ¡ and ¿ are ! and ? turned about the line through 355
const TURN = 710
add('¡', 350, line(175, TURN - 260, 175, TURN - 1000, 55), dot(175, TURN - 38, 42))
add('¿', 650, arc(330, TURN - 755, 235, 245, Math.PI - .7, Math.PI * 2, 57),
  stroke([[150, TURN - 597], [330, TURN - 445], [330, TURN - 270]], 52), dot(330, TURN - 38, 42))

add('«', 560, stroke([[255, 560], [85, 335], [255, 110]], 40), stroke([[475, 560], [305, 335], [475, 110]], 40))
add('»', 560, stroke([[85, 560], [255, 335], [85, 110]], 40), stroke([[305, 560], [475, 335], [305, 110]], 40))
// the ordinal letters of Portuguese, Spanish and Italian: a raised o and a over a rule
add('º', 380, ring(190, 790, 115, 160, 40), line(70, 560, 310, 560, 32))
add('ª', 380, ring(180, 780, 105, 150, 40), stem(300, 625, 945, 40), line(70, 560, 330, 560, 32))
add('\u00a0', 335)
add('\u202f', 190)

/* ---- Bulgarian ---- */
const cap = (char: string, ...parts: string[]) => add(char, 780, ...parts)
const lower = (char: string, ...parts: string[]) => add(char, 635, ...parts)
for (const [cyrillic, latin] of [['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'], ['М', 'M'], ['Н', 'H'], ['О', 'O'], ['Р', 'P'], ['С', 'C'], ['Т', 'T'], ['Х', 'X'],
  ['а', 'a'], ['е', 'e'], ['о', 'o'], ['р', 'p'], ['с', 'c'], ['у', 'y'], ['х', 'x'],
  // the Bulgarian forms that print as Latin letters
  ['и', 'u'], ['к', 'k'], ['п', 'n'], ['т', 'm']] as const) same(cyrillic, latin)

cap('Б', stem(140), line(140, 1000, 610, 1000, 40), line(610, 1000, 630, 850, 35), arc(140, 290, 470, 290, -Math.PI / 2, Math.PI / 2, 70))
cap('Г', stem(140), line(140, 1000, 630, 1000, 40), line(630, 1000, 650, 850, 35))
// the Bulgarian Д: a pointed body standing on its foot
cap('Д', line(150, 0, 390, 1000, 52), line(390, 1000, 630, 0, 74), stroke([[50, -200], [50, 0], [730, 0], [730, -200]], 42))
add('Ж', 1090, stem(545), line(560, 430, 950, 1000, 42), line(705, 650, 990, 0, 80), line(530, 430, 140, 1000, 70), line(385, 650, 100, 0, 44),
  serif(950, 1000), serif(990, 0), serif(140, 1000), serif(100, 0))
add('З', 740, arc(355, 765, 270, 235, -Math.PI / 2, Math.PI * .87, 59), arc(355, 265, 285, 265, -Math.PI * .86, Math.PI / 2, 59))
cap('И', stem(140), stem(640), line(140, 0, 640, 1000, 44))
marked('Й', 'И', 'breve')
marked('Ѝ', 'И', 'grave')
// the Bulgarian Л: Λ
cap('Л', line(90, 0, 365, 1000), line(365, 1000, 680, 0, 76), serif(90, 0), serif(680, 0))
cap('П', stem(140), stem(635), line(140, 1000, 635, 1000, 40))
cap('У', line(80, 1000, 440, 400, 73), stroke([[700, 1000], [330, 140], ...along(205, 150, 125, 150, 0, -Math.PI * .62).slice(1)], 42), serif(80, 1000), serif(700, 1000))
add('Ф', 820, stem(410), ring(410, 510, 315, 290, 62))
add('Ц', 800, stem(140), stem(600), stroke([[140, 0], [720, 0], [720, -200]], 40))
cap('Ч', stem(140, 560, 1000), arc(390, 600, 250, 220, Math.PI, Math.PI * 2, 55), stem(640))
add('Ш', 980, stem(140), stem(490), stem(840), line(140, 0, 840, 0, 42))
add('Щ', 1040, stem(140), stem(490), stem(840), stroke([[140, 0], [930, 0], [930, -200]], 42))
add('Ъ', 820, line(40, 1000, 260, 1000, 40), line(40, 1000, 20, 850, 32), stem(260), arc(260, 280, 470, 280, -Math.PI / 2, Math.PI / 2, 70))
add('Ь', 720, stem(140), arc(140, 280, 470, 280, -Math.PI / 2, Math.PI / 2, 70))
add('Ю', 1080, stem(140), line(140, 505, 340, 505, 39), ring(690, 500, 300, 500, 66))
cap('Я', stem(640), arc(635, 750, 450, 250, Math.PI / 2, Math.PI * 1.5, 67), line(445, 495, 115, 0, 62), serif(115, 0))

// б: the bowl's left side rises and runs out right as an arm, ticked as E's arms are
lower('б', ring(320, 335, 235, 335, 57), stroke([...along(430, 360, 333, 560, Math.PI * 1.02, Math.PI * .62), [555, 940]], 50), line(555, 940, 575, 800, 32))
// в: ϐ, the left side runs up into a closed loop over the larger bowl
lower('в', foot(125, 0, 460), stroke([[125, 440], [125, 740], ...along(290, 760, 165, 230, Math.PI, -Math.PI * .6).slice(1), [130, 590]], 54),
  arc(125, 290, 400, 290, -Math.PI / 2, Math.PI / 2, 55))
// г: a turned s, its foot running right
lower('г', arc(315, 507, 205, 170, -Math.PI / 2, Math.PI - .35, 55), arc(325, 171, 220, 171, Math.PI / 2, Math.PI * 1.87, 55))
// д: ∂, the right side rising past the bowl and turning back over it
lower('д', ring(300, 335, 215, 335, 57), stroke([[515, 300], [515, 640], ...along(335, 640, 180, 330, 0, Math.PI * .78).slice(1)], 54))
add('ж', 900, stem(450, 0, 1000, 58), line(455, 225, 800, 670, 42), line(605, 405, 840, 0, 64), line(445, 225, 100, 670, 62), line(295, 405, 60, 0, 42),
  serif(800, 670, 60), serif(840, 0, 58), serif(100, 670, 60), serif(60, 0, 58))
// з: ʒ, a bar and a bowl hanging below the line
lower('з', line(95, 670, 530, 670, 38), line(95, 670, 75, 555, 28), line(530, 670, 270, 345, 50), arc(300, 45, 245, 300, Math.PI * .55, -Math.PI * .8, 57))
marked('й', 'и', 'breve')
marked('ѝ', 'и', 'grave')
// л: ʌ
lower('л', line(70, 0, 315, 670, 40), line(315, 670, 560, 0, 61), serif(70, 0, 55), serif(560, 0, 55))
add('м', 810, stem(110, 0, 670, 42), stem(700, 0, 670, 58), line(110, 670, 405, 75, 62), line(405, 75, 700, 670, 40))
add('н', 640, stem(125, 0, 670, 57), stem(515, 0, 670, 57), line(125, 335, 515, 335, 38))
add('ф', 660, stem(330, -280, 1000, 56), ring(330, 335, 255, 320, 53))
lower('ц', outline('u'), line(530, 30, 548, -190, 44))
lower('ч', stem(125, 360, 670, 57), arc(320, 360, 195, 165, Math.PI, Math.PI * 2, 54), stem(515, 0, 670, 54))
// ш: the m turned, as the u is the n turned
add('ш', 945, stem(820, 0, 670, 56), arc(640, 225, 180, 225, Math.PI, Math.PI * 2, 53), stem(460, 220, 670, 55), arc(280, 225, 180, 225, Math.PI, Math.PI * 2, 53), stem(100, 220, 670, 55))
add('щ', 980, outline('ш'), line(835, 30, 853, -190, 44))
add('ъ', 620, line(30, 670, 205, 670, 37), line(30, 670, 15, 555, 28), stem(205, 0, 670, 57), arc(205, 210, 330, 210, -Math.PI / 2, Math.PI / 2, 55))
add('ь', 575, stem(125, 0, 670, 57), arc(125, 210, 330, 210, -Math.PI / 2, Math.PI / 2, 55))
// ю: its stem rises to the ascender, as Bulgarian print has it
add('ю', 890, stem(125, 0, 1000, 58), line(125, 335, 330, 335, 38), ring(570, 335, 235, 335, 57))
lower('я', stem(510, 0, 670, 57), arc(505, 470, 330, 200, Math.PI / 2, Math.PI * 1.5, 54), line(350, 280, 95, 0, 58), serif(95, 0, 55))

/** Every letter this font adds to the wing's own. */
export const ADDED_LETTERS: readonly string[] = Object.keys(glyphs)

const table: FontData['glyphs'] = { ...BASE, ...glyphs }
export const accentFont = new FontLoader().parse({ ...font.data, glyphs: table })

export function accentAdvance(text: string, size: number): number {
  return Array.from(text).reduce((n, ch) => n + (table[ch]?.ha ?? table['?']!.ha), 0) * size / 1000
}
/** The first character neither font can draw, if any. */
export function missingLetter(text: string): string | undefined {
  for (const ch of text) if (ch !== '\n' && ch !== '\r' && !table[ch]) return ch
  return undefined
}

/* `outline.ts`'s setting with this font. A no-break space holds its words
   together, as French spacing needs; text without one wraps as there. */
const BREAK = /[^\S\u00a0\u202f]+/
function wrap(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let row = ''
    for (const word of paragraph.split(BREAK).filter(Boolean)) {
      const candidate = row ? `${row} ${word}` : word
      if (row && accentAdvance(candidate, size) > maxWidth) {
        lines.push(row)
        row = word
      } else row = candidate
    }
    lines.push(row)
  }
  return lines
}
export function accentOutline(text: string, opts: TextSettingOptions): TextOutline {
  const missing = missingLetter(text)
  if (missing !== undefined) throw new Error(`Vinci vector font has no glyph for ${JSON.stringify(missing)}`)
  if (!Number.isFinite(opts.size) || opts.size <= 0) throw new Error('Text size must be positive')
  const maxWidth = opts.maxWidth ?? Infinity
  const longest = Math.max(1e-9, ...text.split(BREAK).map(word => accentAdvance(word, opts.size)))
  const size = opts.size * Math.min(1, maxWidth / longest)
  const lines = wrap(text, size, maxWidth), lineHeight = size * (opts.lineHeight ?? 1.40)
  const raw: [number, number][][] = []
  const area = (c: readonly [number, number][]): number => {
    let a = 0
    for (let i = 0; i < c.length; i++) { const p = c[i]!, q = c[(i + 1) % c.length]!; a += p[0] * q[1] - q[0] * p[1] }
    return a / 2
  }
  const wound = (c: [number, number][], ccw: boolean): [number, number][] => (area(c) > 0) === ccw ? c : c.reverse()
  for (const [i, row] of lines.entries()) {
    if (!row.trim()) continue
    for (const shape of accentFont.generateShapes(row, size)) {
      const { shape: outer, holes } = shape.extractPoints(4)
      const dy = -i * lineHeight
      raw.push(wound(outer.map(p => [p.x, p.y + dy]), true))
      for (const hole of holes) raw.push(wound(hole.map(p => [p.x, p.y + dy]), false))
    }
  }
  if (!raw.length) return { contours: [], width: 0, height: 0, lines, size }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of raw) for (const [x, y] of c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  return {
    contours: raw.map(c => c.map(([x, y]) => [x - minX, y - maxY] as [number, number])),
    width: maxX - minX, height: maxY - minY, lines, size,
  }
}
/** a single line's rise over its baseline at its cap height, as the line's lettering reads it */
export function accentAscent(text: string, size: number): number {
  let top = 0
  for (const shape of accentFont.generateShapes(text, size)) for (const p of shape.getPoints(2)) top = Math.max(top, p.y)
  return top
}
