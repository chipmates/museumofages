#!/usr/bin/env node
/** The letters of the other languages, proved without a browser.
 *   node src/wings/vinci/words/accents-check.mjs
 * 1. The second font holds every letter of the wing's own font unchanged.
 * 2. Every added letter keeps every contour it draws: three drops a stroke
 *    whose box and inside lie within a larger stroke (see `X` in font.ts).
 * 3. Every letter French, Italian, Spanish, Portuguese and Bulgarian need.
 * 4. Fed the English words, a catalog language's runs are the English runs
 *    to the last float; fed the German, the German runs, save the plaque's
 *    size, which follows its own rule.
 * 5. Accented and Cyrillic letters set on the floor and the stones.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VINCI = path.dirname(HERE)
const modules = new Map()
async function load(file) {
  const resolved = fs.realpathSync(file)
  if (modules.has(resolved)) return modules.get(resolved)
  if (resolved.endsWith('.json')) return { default: JSON.parse(fs.readFileSync(resolved, 'utf8')) }
  const exports = {}
  modules.set(resolved, exports)
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dependencies = new Map()
  for (const [, name] of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
    if (dependencies.has(name)) continue
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(resolved), name.replace(/\?raw$/, ''))
      if (name.endsWith('?raw')) { dependencies.set(name, { default: fs.readFileSync(target, 'utf8') }); continue }
      const source = [target, target + '.ts', path.join(target, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!source) throw new Error('Unresolved dependency: ' + name)
      dependencies.set(name, await load(source))
    } else if (name.startsWith('three')) dependencies.set(name, await import(name))
    else throw new Error('Unexpected dependency: ' + name)
  }
  new vm.Script(code, { filename: path.relative(VINCI, resolved) }).runInNewContext({
    exports, require: name => dependencies.get(name), console, Float32Array, location: { search: '' }, URLSearchParams, performance,
  }, { timeout: 20000 })
  return exports
}

const failures = []
const expect = (condition, detail) => { if (!condition) failures.push(detail) }

await load(path.join(VINCI, 'collection/materials.ts'))
const { font } = await load(path.join(HERE, 'font.ts'))
const { accentFont, ADDED_LETTERS, missingLetter, accentOutline } = await load(path.join(HERE, 'accents.ts'))
const { textOutline } = await load(path.join(HERE, 'outline.ts'))
const { pictureWords } = await load(path.join(VINCI, 'picture-words.ts'))

/* 1. */
const base = font.data.glyphs, table = accentFont.data.glyphs
for (const [char, g] of Object.entries(base)) {
  expect(table[char] && table[char].o === g.o && table[char].ha === g.ha, `the second font changed ${JSON.stringify(char)}`)
}
for (const key of ['familyName', 'ascender', 'descender', 'resolution', 'underlinePosition', 'underlineThickness']) {
  expect(accentFont.data[key] === font.data[key], `the second font's ${key} differs`)
}
expect(JSON.stringify(accentFont.data.boundingBox) === JSON.stringify(font.data.boundingBox), "the second font's bounding box differs")

/* 2. */
const contours = (char) => (table[char].o ?? '').split(' ').filter(op => op === 'm').length
const kept = (char) => accentFont.generateShapes(char, 1000).reduce((n, shape) => n + 1 + shape.holes.length, 0)
// a letter built on one of the wing's own (с on c, ç on c) loses what that one
// loses, so the two look alike; its own strokes lose nothing
const lost = (o) => {
  const from = Object.keys(base).filter(b => base[b].o && (o === base[b].o || o.startsWith(base[b].o + ' '))).sort((a, b) => base[b].o.length - base[a].o.length)[0]
  return from ? contours(from) - kept(from) : 0
}
for (const char of ADDED_LETTERS) {
  expect(!base[char], `${JSON.stringify(char)} is already the wing's own`)
  const owed = contours(char) - lost(table[char].o ?? '')
  expect(kept(char) === owed, `${JSON.stringify(char)}: three keeps ${kept(char)} of the ${owed} contours it should`)
}

/* 3. */
const NEEDED = {
  fr: 'àâæçéèêëîïôœùûüÿÀÂÇÉÈÊËÎÏÔŒÙÛÜŸ«»’\u202f\u00a0',
  it: 'àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ«»’',
  es: 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»ºª',
  'pt-BR': 'áâãàçéêíóôõúüÁÂÃÀÇÉÊÍÓÔÕÚºª',
  bg: 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯЍабвгдежзийклмнопрстуфхцчшщъьюяѝ„“',
}
for (const [language, letters] of Object.entries(NEEDED)) {
  // æ: not written in these words; it stays the one French letter the font lacks
  const missing = [...letters].filter(ch => ch !== 'æ' && missingLetter(ch) !== undefined)
  expect(!missing.length, `${language}: no letter for ${missing.join(' ')}`)
}

/* 4. */
const bytes = (run) => run.contours.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength).toString('base64')).join('|')
for (const language of ['en', 'de']) {
  const own = pictureWords(language), set = pictureWords('fr', pair => pair[language])
  expect(own.map(r => r.id).join() === set.map(r => r.id).join(), `${language}: the catalog path sets other runs`)
  for (const [i, run] of own.entries()) {
    const twin = set[i]
    if (!twin) continue
    const same = bytes(run) === bytes(twin) && run.finish === twin.finish && run.stations.join() === twin.stations.join() &&
      (run.behind ?? []).map(f => [...f].join()).join() === (twin.behind ?? []).map(f => [...f].join()).join()
    if (language === 'de' && run.id === 'grave-presumption') {
      // the plaque keeps the English line's width; the German was set by hand to about the same
      const width = r => { let lo = Infinity, hi = -Infinity; for (const c of r.contours) for (let k = 0; k < c.length; k += 3) { lo = Math.min(lo, c[k + 2]); hi = Math.max(hi, c[k + 2]) } return hi - lo }
      expect(Math.abs(width(twin) / width(run) - 1) < .01, `de grave-presumption: the catalog rule sets it ${(width(twin) / width(run) * 100).toFixed(2)} % of the German's width`)
      continue
    }
    expect(same, `${language} ${run.id}: the catalog path does not set it as the lettering does`)
  }
}
for (const text of ['documented', 'belegt', 'Überlieferung', 'mutmaßliche Überreste', 'GEWÄHLTES LICHT · EIN MODELL', 'The identification is not proven.', 'Die Identifizierung bleibt unbewiesen.']) {
  for (const opts of [{ size: .1 }, { size: .07, maxWidth: 1.4, lineHeight: 1.45 }]) {
    const a = accentOutline(text, opts), b = textOutline(text, opts)
    expect(JSON.stringify(a) === JSON.stringify(b), `"${text}": the second font's setting differs from outline.ts`)
  }
}

/* 5. */
// the letters themselves stand in for words: the real words come from the catalogs
const lettersAsWords = (letters) => ({ documented: letters.toLowerCase(), inferred: letters.toLowerCase().slice(0, 9), tradition: letters.slice(0, 7),
  'presumed remains': letters.toLowerCase(), 'CHOSEN LIGHT · A MODEL': letters.toUpperCase() })
const SETS = { fr: lettersAsWords('ÀÂÇÉÈÊËÎÏÔŒÙÛÜŸ'), bg: lettersAsWords('АБВГДЕЖЗИЙКЛМНОП РСТУФХЦЧШЩЪЬЮЯЍ') }
const floorY = (await load(path.join(VINCI, 'collection/layout.ts'))).LINE_FLOOR_AT[1] + .0010
for (const [language, words] of Object.entries(SETS)) {
  const runs = pictureWords(language, pair => words[pair.en] ?? pair.en)
  expect(runs.length === pictureWords('en').length, `${language}: ${runs.length} runs`)
  for (const run of runs) {
    const points = run.contours.flatMap(c => Array.from({ length: c.length / 3 }, (_, k) => [c[k * 3], c[k * 3 + 1], c[k * 3 + 2]]))
    expect(points.length > 0 && points.every(p => p.every(Number.isFinite)), `${language} ${run.id}: empty or not finite`)
    if (run.id.startsWith('line/')) expect(points.every(p => Math.abs(p[1] - floorY) < 1e-5), `${language} ${run.id}: off the floor`)
  }
}

const report = { checker: 'vinci-accents', added: ADDED_LETTERS.length, letters: ADDED_LETTERS.join(''), failures, ok: failures.length === 0 }
console.log(JSON.stringify(report, null, 1))
if (!report.ok) process.exitCode = 1
