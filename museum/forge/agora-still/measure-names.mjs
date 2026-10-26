// The thirty names as the front sets them, measured once in its own face, so
// the planner seats each name by the width of its text and not by a guess.
//
//   node forge/agora-still/measure-names.mjs <font.woff2> <figuresCatalog.ts> <sky/strings.ts>
//
// Writes names.json beside this file: per figure the wide's name (the catalog
// name, its short form past 22 characters) and the phone's short name, in
// English and German, and the widest of the two in CSS px at the front's size.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [fontFile, catalogFile, stringsFile] = process.argv.slice(2).map((p) => resolve(p))
if (!fontFile || !catalogFile || !stringsFile) throw new Error('usage: measure-names.mjs <font.woff2> <figuresCatalog.ts> <strings.ts>')

/** the front's wide names leave the catalog form past this many characters */
const WIDE_MAX_CHARS = 22
/** the front's name type: its face, weight, tracking and line, at the wide's
    and the phone's sizes in design px */
const TYPE = { family: 'Space Grotesk', weight: 500, letterSpacing: 0.01, lineHeight: 1.2, wide: 15, house: 14 }

function catalog(src, list) {
  const i = src.indexOf(`export const ${list}`)
  const j = src.indexOf('export const', i + 10)
  const seg = src.slice(i, j > 0 ? j : src.length)
  return Object.fromEntries([...seg.matchAll(/"id":\s*"([^"]+)",\s*\n\s*"name":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]))
}
function shortNames(src, lang) {
  const at = src.indexOf('SHORT_NAMES')
  const block = src.slice(src.indexOf(`${lang}: {`, at), src.indexOf('}', src.indexOf(`${lang}: {`, at)))
  return Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
}

const cat = readFileSync(catalogFile, 'utf8')
const str = readFileSync(stringsFile, 'utf8')
const full = { en: catalog(cat, 'figuresCatalogEn'), de: catalog(cat, 'figuresCatalogDe') }
const short = { en: shortNames(str, 'en'), de: shortNames(str, 'de') }
const slugs = Object.keys(full.en).sort()
if (slugs.length !== 30) throw new Error(`the catalog holds ${slugs.length} figures, not 30`)

const texts = {}
for (const slug of slugs)
  for (const lang of ['en', 'de']) {
    const name = full[lang][slug]
    texts[slug] ??= { wide: {}, house: {} }
    texts[slug].wide[lang] = name.length > WIDE_MAX_CHARS ? (short[lang][slug] ?? name) : name
    texts[slug].house[lang] = short[lang][slug] ?? name
  }

const font = readFileSync(fontFile).toString('base64')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(`<style>@font-face{font-family:'${TYPE.family}';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:300 700}
span{font-family:'${TYPE.family}';font-weight:${TYPE.weight};letter-spacing:${TYPE.letterSpacing}em;line-height:${TYPE.lineHeight};white-space:nowrap;position:absolute}</style><body></body>`)
const measured = await page.evaluate(async ([texts, type]) => {
  await document.fonts.load(`${type.weight} ${type.wide}px '${type.family}'`)
  const out = {}
  for (const [slug, t] of Object.entries(texts)) {
    out[slug] = {}
    for (const kind of ['wide', 'house']) {
      const widths = {}
      for (const lang of ['en', 'de']) {
        const s = document.createElement('span')
        s.style.fontSize = `${type[kind]}px`
        s.textContent = t[kind][lang]
        document.body.append(s)
        widths[lang] = s.getBoundingClientRect().width
        s.remove()
      }
      out[slug][kind] = { en: t[kind].en, de: t[kind].de, css: +Math.max(widths.en, widths.de).toFixed(2), enCss: +widths.en.toFixed(2), deCss: +widths.de.toFixed(2) }
    }
  }
  return { out, loaded: document.fonts.check(`${type.weight} ${type.wide}px '${type.family}'`) }
}, [texts, TYPE])
await browser.close()
if (!measured.loaded) throw new Error('the face did not load: the widths would be a fallback face')

const file = join(dirname(fileURLToPath(import.meta.url)), 'names.json')
writeFileSync(file, `${JSON.stringify({ type: TYPE, wideMaxChars: WIDE_MAX_CHARS, names: measured.out }, null, 1)}\n`)
console.log(`${file}: ${slugs.length} names`)
